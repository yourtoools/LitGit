use chardetng::EncodingDetector;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::git_support::{
    decode_text_content_with_encoding, encode_text_with_encoding, git_command, validate_git_repo,
    validate_repo_relative_file_path,
};

const DEFAULT_HISTORY_LIMIT: usize = 200;
const MAX_HISTORY_LIMIT: usize = 1_000;
const HISTORY_CACHE_LIMIT: usize = 128;
const BLAME_CACHE_LIMIT: usize = 128;

type CachedPayloadMap<T> = Mutex<LimitedPayloadCache<T>>;
type FileContentPair = (Option<Vec<u8>>, Option<Vec<u8>>);

struct LimitedPayloadCache<T> {
    entries: HashMap<String, CachedPayloadEntry<T>>,
    next_sequence: usize,
}

struct CachedPayloadEntry<T> {
    sequence: usize,
    value: T,
}

impl<T> Default for LimitedPayloadCache<T> {
    fn default() -> Self {
        Self {
            entries: HashMap::new(),
            next_sequence: 0,
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
/// A parsed unified-diff hunk with line ranges and hunk body lines.
pub(crate) struct RepositoryFileHunk {
    header: String,
    index: usize,
    lines: Vec<String>,
    new_lines: usize,
    new_start: usize,
    old_lines: usize,
    old_start: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// Hunk payload for a working-tree file.
pub(crate) struct RepositoryFileHunks {
    hunks: Vec<RepositoryFileHunk>,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// Hunk payload for a file from a specific commit.
pub(crate) struct RepositoryCommitFileHunks {
    commit_hash: String,
    hunks: Vec<RepositoryFileHunk>,
    path: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
/// A history entry for one file revision.
pub(crate) struct RepositoryFileHistoryEntry {
    author: String,
    author_email: String,
    commit_hash: String,
    date: String,
    message_summary: String,
    short_hash: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
/// File history payload returned by `git log --follow`.
pub(crate) struct RepositoryFileHistoryPayload {
    entries: Vec<RepositoryFileHistoryEntry>,
    path: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
/// A single line in blame output with author and commit metadata.
pub(crate) struct RepositoryFileBlameLine {
    author: String,
    author_email: String,
    author_time: Option<i64>,
    commit_hash: String,
    line_number: usize,
    summary: String,
    text: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
/// Blame payload for a file at a revision.
pub(crate) struct RepositoryFileBlamePayload {
    lines: Vec<RepositoryFileBlameLine>,
    path: String,
    revision: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// Detected text encoding label for a repository file.
pub(crate) struct RepositoryFileDetectedEncoding {
    encoding: String,
}

static FILE_HISTORY_CACHE: OnceLock<CachedPayloadMap<RepositoryFileHistoryPayload>> =
    OnceLock::new();
static FILE_BLAME_CACHE: OnceLock<CachedPayloadMap<RepositoryFileBlamePayload>> = OnceLock::new();

fn file_history_cache() -> &'static CachedPayloadMap<RepositoryFileHistoryPayload> {
    FILE_HISTORY_CACHE.get_or_init(|| Mutex::new(LimitedPayloadCache::default()))
}

fn file_blame_cache() -> &'static CachedPayloadMap<RepositoryFileBlamePayload> {
    FILE_BLAME_CACHE.get_or_init(|| Mutex::new(LimitedPayloadCache::default()))
}

fn read_cached_payload<T: Clone>(cache: &CachedPayloadMap<T>, key: &str) -> Option<T> {
    let Ok(cache_guard) = cache.lock() else {
        log::warn!("Failed to read cached repository payload because the cache lock is poisoned");
        return None;
    };

    cache_guard
        .entries
        .get(key)
        .map(|cached_entry| cached_entry.value.clone())
}

fn write_cached_payload<T: Clone>(
    cache: &CachedPayloadMap<T>,
    key: String,
    value: T,
    limit: usize,
) {
    let Ok(mut cache_guard) = cache.lock() else {
        log::warn!("Failed to update cached repository payload because the cache lock is poisoned");
        return;
    };

    let sequence = cache_guard.next_sequence;
    cache_guard.next_sequence = cache_guard.next_sequence.wrapping_add(1);

    if !cache_guard.entries.contains_key(&key) && cache_guard.entries.len() >= limit {
        let oldest_key = cache_guard
            .entries
            .iter()
            .min_by_key(|(_, cached_entry)| cached_entry.sequence)
            .map(|(cached_key, _)| cached_key.clone());

        if let Some(oldest_key) = oldest_key {
            cache_guard.entries.remove(&oldest_key);
        }
    }

    cache_guard
        .entries
        .insert(key, CachedPayloadEntry { sequence, value });
}

fn resolve_head_revision(repo_path: &str) -> Option<String> {
    let output = git_command()
        .args(["-C", repo_path, "rev-parse", "HEAD"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let revision = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if revision.is_empty() {
        return None;
    }

    Some(revision)
}

#[derive(Default)]
struct BlameLineBuilder {
    author: String,
    author_email: String,
    author_time: Option<i64>,
    commit_hash: String,
    final_line_number: Option<usize>,
    summary: String,
}

fn write_temp_bytes(prefix: &str, content: &[u8]) -> Option<std::path::PathBuf> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).ok()?;
    let path = std::env::temp_dir().join(format!(
        "litgit-workspace-{prefix}-{}-{}.tmp",
        std::process::id(),
        now.as_nanos()
    ));
    fs::write(&path, content).ok()?;
    Some(path)
}

fn load_working_tree_contents(repo_path: &str, file_path: &str) -> Result<FileContentPair, String> {
    validate_repo_relative_file_path(file_path)?;

    let old_output = git_command()
        .args(["-C", repo_path, "show", &format!("HEAD:{file_path}")])
        .output()
        .map_err(|error| format!("Failed to run git show: {error}"))?;
    let old_content = old_output.status.success().then_some(old_output.stdout);

    let new_content = fs::read(Path::new(repo_path).join(file_path)).ok();
    Ok((old_content, new_content))
}

fn load_commit_contents(
    repo_path: &str,
    commit_hash: &str,
    file_path: &str,
) -> Result<FileContentPair, String> {
    validate_repo_relative_file_path(file_path)?;

    let old_output = git_command()
        .args([
            "-C",
            repo_path,
            "show",
            &format!("{commit_hash}^:{file_path}"),
        ])
        .output()
        .map_err(|error| format!("Failed to run git show for previous commit file: {error}"))?;
    let old_content = old_output.status.success().then_some(old_output.stdout);

    let new_output = git_command()
        .args([
            "-C",
            repo_path,
            "show",
            &format!("{commit_hash}:{file_path}"),
        ])
        .output()
        .map_err(|error| format!("Failed to run git show for commit file: {error}"))?;
    let new_content = new_output.status.success().then_some(new_output.stdout);

    Ok((old_content, new_content))
}

fn parse_hunk_range(token: &str) -> Option<(usize, usize)> {
    if token.len() < 2 {
        return None;
    }

    let value = &token[1..];
    let (start, lines) = if let Some((parsed_start, parsed_lines)) = value.split_once(',') {
        (parsed_start, parsed_lines)
    } else {
        (value, "1")
    };
    let parsed_start = start.parse::<usize>().ok()?;
    let parsed_lines = lines.parse::<usize>().ok()?;

    Some((parsed_start, parsed_lines))
}

fn parse_hunk_header(line: &str) -> Option<(usize, usize, usize, usize)> {
    let mut fields = line.split_whitespace();
    let open_marker = fields.next()?;

    if open_marker != "@@" {
        return None;
    }

    let old_token = fields.next()?;
    let new_token = fields.next()?;

    let (old_start, old_lines) = parse_hunk_range(old_token)?;
    let (new_start, new_lines) = parse_hunk_range(new_token)?;

    Some((old_start, old_lines, new_start, new_lines))
}

fn parse_hunks_from_patch(patch: &str) -> Vec<RepositoryFileHunk> {
    let mut hunks: Vec<RepositoryFileHunk> = Vec::new();
    let mut current_hunk: Option<RepositoryFileHunk> = None;

    for line in patch.lines() {
        if line.starts_with("@@") {
            if let Some(existing_hunk) = current_hunk.take() {
                hunks.push(existing_hunk);
            }

            if let Some((old_start, old_lines, new_start, new_lines)) = parse_hunk_header(line) {
                current_hunk = Some(RepositoryFileHunk {
                    header: line.to_string(),
                    index: hunks.len() + 1,
                    lines: Vec::new(),
                    new_lines,
                    new_start,
                    old_lines,
                    old_start,
                });
            }

            continue;
        }

        if let Some(hunk) = current_hunk.as_mut() {
            hunk.lines.push(line.to_string());
        }
    }

    if let Some(existing_hunk) = current_hunk.take() {
        hunks.push(existing_hunk);
    }

    hunks
}

fn build_hunks_from_content(
    old_content: Option<&[u8]>,
    new_content: Option<&[u8]>,
    ignore_trim_whitespace: bool,
) -> Result<Vec<RepositoryFileHunk>, String> {
    if old_content.is_none() && new_content.is_none() {
        return Ok(Vec::new());
    }

    let old_temp_path = write_temp_bytes("old", old_content.unwrap_or(&[]))
        .ok_or_else(|| "Failed to create temporary file for old content".to_string())?;
    let new_temp_path = write_temp_bytes("new", new_content.unwrap_or(&[]))
        .ok_or_else(|| "Failed to create temporary file for new content".to_string())?;

    let old_path = old_temp_path.to_string_lossy().to_string();
    let new_path = new_temp_path.to_string_lossy().to_string();

    let mut args = vec!["diff", "--no-index", "--unified=3"];

    if ignore_trim_whitespace {
        args.push("--ignore-space-at-eol");
    }

    args.push("--");
    args.push(old_path.as_str());
    args.push(new_path.as_str());

    let output = git_command()
        .args(args)
        .output()
        .map_err(|error| format!("Failed to run git diff for hunk generation: {error}"))?;

    let _ = fs::remove_file(&old_temp_path);
    let _ = fs::remove_file(&new_temp_path);

    if !(output.status.success() || output.status.code() == Some(1)) {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to generate diff hunks".to_string()
        } else {
            stderr
        });
    }

    let patch_output = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(parse_hunks_from_patch(&patch_output))
}

fn parse_history_entries(raw_output: &str) -> Vec<RepositoryFileHistoryEntry> {
    raw_output
        .split('\x1e')
        .filter_map(|row| {
            let trimmed_row = row.trim();

            if trimmed_row.is_empty() {
                return None;
            }

            let mut fields = trimmed_row.split('\x1f');
            let commit_hash = fields.next()?.to_string();
            let short_hash = fields.next()?.to_string();
            let author = fields.next()?.to_string();
            let author_email = fields.next()?.to_string();
            let date = fields.next()?.to_string();
            let message_summary = fields.next()?.to_string();

            Some(RepositoryFileHistoryEntry {
                author,
                author_email,
                commit_hash,
                date,
                message_summary,
                short_hash,
            })
        })
        .collect()
}

fn parse_blame_header(line: &str) -> Option<(String, usize)> {
    let mut fields = line.split_whitespace();
    let commit_hash = fields.next()?;
    let _old_line_number = fields.next()?;
    let new_line_number = fields.next()?;

    let is_hash_like = commit_hash.len() >= 7
        && commit_hash
            .chars()
            .all(|character| character.is_ascii_hexdigit());
    if !is_hash_like {
        return None;
    }

    let parsed_line = new_line_number.parse::<usize>().ok()?;
    Some((commit_hash.to_string(), parsed_line))
}

fn parse_blame_output(raw_output: &str) -> Vec<RepositoryFileBlameLine> {
    let mut parsed_lines: Vec<RepositoryFileBlameLine> = Vec::new();
    let mut current_line = BlameLineBuilder::default();

    for line in raw_output.lines() {
        if let Some((commit_hash, new_line_number)) = parse_blame_header(line) {
            current_line.commit_hash = commit_hash;
            current_line.final_line_number = Some(new_line_number);
            continue;
        }

        if let Some(author) = line.strip_prefix("author ") {
            current_line.author = author.to_string();
            continue;
        }

        if let Some(author_email) = line.strip_prefix("author-mail ") {
            current_line.author_email = author_email
                .trim()
                .trim_start_matches('<')
                .trim_end_matches('>')
                .to_string();
            continue;
        }

        if let Some(author_time) = line.strip_prefix("author-time ") {
            current_line.author_time = author_time.parse::<i64>().ok();
            continue;
        }

        if let Some(summary) = line.strip_prefix("summary ") {
            current_line.summary = summary.to_string();
            continue;
        }

        if let Some(text_content) = line.strip_prefix('\t') {
            let resolved_line_number = current_line
                .final_line_number
                .unwrap_or(parsed_lines.len() + 1);
            parsed_lines.push(RepositoryFileBlameLine {
                author: current_line.author.clone(),
                author_email: current_line.author_email.clone(),
                author_time: current_line.author_time,
                commit_hash: current_line.commit_hash.clone(),
                line_number: resolved_line_number,
                summary: current_line.summary.clone(),
                text: text_content.to_string(),
            });

            if let Some(current_line_number) = current_line.final_line_number.as_mut() {
                *current_line_number += 1;
            }
        }
    }

    parsed_lines
}

fn read_file_text_with_encoding(
    repo_path: &str,
    file_path: &str,
    encoding: Option<&str>,
) -> Result<String, String> {
    validate_repo_relative_file_path(file_path)?;

    let target_path = Path::new(repo_path).join(file_path);
    let raw_content =
        fs::read(target_path).map_err(|error| format!("Failed to read file: {error}"))?;
    decode_text_content_with_encoding(Some(&raw_content), encoding)
}

fn detect_text_encoding_label(content: &[u8]) -> Result<String, String> {
    if content.is_empty() {
        return Ok("utf-8".to_string());
    }

    if content.contains(&0) {
        return Err("Binary file not supported".to_string());
    }

    if content.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return Ok("utf-8".to_string());
    }

    if content.starts_with(&[0xFF, 0xFE]) {
        return Ok("utf-16le".to_string());
    }

    if content.starts_with(&[0xFE, 0xFF]) {
        return Ok("utf-16be".to_string());
    }

    let mut detector = EncodingDetector::new();
    detector.feed(content, true);
    let detected_encoding = detector.guess(None, true);

    Ok(detected_encoding.name().to_ascii_lowercase())
}

fn read_file_bytes_for_encoding_detection(
    repo_path: &str,
    file_path: &str,
    revision: Option<&str>,
) -> Result<Vec<u8>, String> {
    if let Some(commit_hash) = revision.map(str::trim).filter(|value| !value.is_empty()) {
        let (old_content, new_content) = load_commit_contents(repo_path, commit_hash, file_path)?;

        if let Some(content) = new_content.or(old_content) {
            return Ok(content);
        }

        return Err("Failed to detect file encoding".to_string());
    }

    let (old_content, new_content) = load_working_tree_contents(repo_path, file_path)?;

    if let Some(content) = new_content.or(old_content) {
        return Ok(content);
    }

    Err("Failed to detect file encoding".to_string())
}

// Tauri command arguments are owned because the IPC boundary deserializes them.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Returns parsed unified-diff hunks for a working-tree file.
pub(crate) fn get_repository_file_hunks(
    repo_path: String,
    file_path: String,
    ignore_trim_whitespace: bool,
) -> Result<RepositoryFileHunks, String> {
    validate_git_repo(Path::new(&repo_path))?;
    let (old_content, new_content) = load_working_tree_contents(&repo_path, &file_path)?;
    let hunks = build_hunks_from_content(
        old_content.as_deref(),
        new_content.as_deref(),
        ignore_trim_whitespace,
    )?;

    Ok(RepositoryFileHunks {
        hunks,
        path: file_path,
    })
}

// Tauri command arguments are owned because the IPC boundary deserializes them.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Returns parsed unified-diff hunks for a file in a specific commit.
pub(crate) fn get_repository_commit_file_hunks(
    repo_path: String,
    commit_hash: String,
    file_path: String,
    ignore_trim_whitespace: bool,
) -> Result<RepositoryCommitFileHunks, String> {
    validate_git_repo(Path::new(&repo_path))?;
    let (old_content, new_content) = load_commit_contents(&repo_path, &commit_hash, &file_path)?;
    let hunks = build_hunks_from_content(
        old_content.as_deref(),
        new_content.as_deref(),
        ignore_trim_whitespace,
    )?;

    Ok(RepositoryCommitFileHunks {
        commit_hash,
        hunks,
        path: file_path,
    })
}

// Tauri command arguments are owned because the IPC boundary deserializes them.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Returns revision history for a file, following renames.
pub(crate) fn get_repository_file_history(
    repo_path: String,
    file_path: String,
    limit: Option<usize>,
) -> Result<RepositoryFileHistoryPayload, String> {
    validate_git_repo(Path::new(&repo_path))?;
    validate_repo_relative_file_path(&file_path)?;
    let resolved_limit = limit
        .unwrap_or(DEFAULT_HISTORY_LIMIT)
        .clamp(1, MAX_HISTORY_LIMIT);
    let resolved_head_revision =
        resolve_head_revision(&repo_path).unwrap_or_else(|| "NO_HEAD".to_string());
    let cache_key =
        format!("{repo_path}\x1f{resolved_head_revision}\x1f{file_path}\x1f{resolved_limit}");

    if let Some(cached_payload) = read_cached_payload(file_history_cache(), &cache_key) {
        return Ok(cached_payload);
    }

    let output = git_command()
        .args([
            "-C",
            &repo_path,
            "log",
            "--follow",
            "--date=iso-strict",
            "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%s%x1e",
            "-n",
            &resolved_limit.to_string(),
            "--",
            &file_path,
        ])
        .output()
        .map_err(|error| format!("Failed to run git log for file history: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to load file history".to_string()
        } else {
            stderr
        });
    }

    let entries = parse_history_entries(&String::from_utf8_lossy(&output.stdout));

    let payload = RepositoryFileHistoryPayload {
        entries,
        path: file_path,
    };

    write_cached_payload(
        file_history_cache(),
        cache_key,
        payload.clone(),
        HISTORY_CACHE_LIMIT,
    );

    Ok(payload)
}

// Tauri command arguments are owned because the IPC boundary deserializes them.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Returns line-by-line blame metadata for a file at a revision.
pub(crate) fn get_repository_file_blame(
    repo_path: String,
    file_path: String,
    revision: Option<String>,
) -> Result<RepositoryFileBlamePayload, String> {
    validate_git_repo(Path::new(&repo_path))?;
    validate_repo_relative_file_path(&file_path)?;
    let resolved_revision = revision
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("HEAD");
    let cache_revision = if resolved_revision == "HEAD" {
        resolve_head_revision(&repo_path).unwrap_or_else(|| "HEAD".to_string())
    } else {
        resolved_revision.to_string()
    };
    let cache_key = format!("{repo_path}\x1f{cache_revision}\x1f{file_path}");

    if let Some(cached_payload) = read_cached_payload(file_blame_cache(), &cache_key) {
        return Ok(cached_payload);
    }

    let output = git_command()
        .args([
            "-C",
            &repo_path,
            "blame",
            "--line-porcelain",
            resolved_revision,
            "--",
            &file_path,
        ])
        .output()
        .map_err(|error| format!("Failed to run git blame: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to load file blame".to_string()
        } else {
            stderr
        });
    }

    let lines = parse_blame_output(&String::from_utf8_lossy(&output.stdout));

    let payload = RepositoryFileBlamePayload {
        lines,
        path: file_path,
        revision: resolved_revision.to_string(),
    };

    write_cached_payload(
        file_blame_cache(),
        cache_key,
        payload.clone(),
        BLAME_CACHE_LIMIT,
    );

    Ok(payload)
}

// Tauri command arguments are owned because the IPC boundary deserializes them.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Saves text to a repository file using the requested encoding.
pub(crate) fn save_repository_file_text(
    repo_path: String,
    file_path: String,
    text: String,
    encoding: Option<String>,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;
    validate_repo_relative_file_path(&file_path)?;

    let target_path = Path::new(&repo_path).join(&file_path);
    let encoded_content = encode_text_with_encoding(&text, encoding.as_deref())?;

    if let Some(parent_path) = target_path.parent() {
        fs::create_dir_all(parent_path)
            .map_err(|error| format!("Failed to create parent directories: {error}"))?;
    }

    fs::write(&target_path, encoded_content)
        .map_err(|error| format!("Failed to save file content: {error}"))?;

    Ok(())
}

// Tauri command arguments are owned because the IPC boundary deserializes them.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Reads repository file text using the requested encoding.
pub(crate) fn get_repository_file_text(
    repo_path: String,
    file_path: String,
    encoding: Option<String>,
) -> Result<String, String> {
    validate_git_repo(Path::new(&repo_path))?;
    validate_repo_relative_file_path(&file_path)?;
    read_file_text_with_encoding(&repo_path, &file_path, encoding.as_deref())
}

// Tauri command arguments are owned because the IPC boundary deserializes them.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Detects the text encoding of a repository file or file revision.
pub(crate) fn detect_repository_file_encoding(
    repo_path: String,
    file_path: String,
    revision: Option<String>,
) -> Result<RepositoryFileDetectedEncoding, String> {
    validate_git_repo(Path::new(&repo_path))?;
    validate_repo_relative_file_path(&file_path)?;

    let content =
        read_file_bytes_for_encoding_detection(&repo_path, &file_path, revision.as_deref())?;
    let encoding = detect_text_encoding_label(&content)?;

    Ok(RepositoryFileDetectedEncoding { encoding })
}

#[cfg(test)]
mod tests {
    use super::{parse_blame_output, parse_history_entries, parse_hunks_from_patch};

    #[test]
    fn hunk_parser_returns_changed_blocks() {
        let patch = r"diff --git a/file.ts b/file.ts
index 1111111..2222222 100644
--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,2 @@
-const value = 1;
+const value = 2;
 const stable = true;
@@ -9 +9,2 @@
 const second = true;
+const third = true;
";

        let hunks = parse_hunks_from_patch(patch);

        assert_eq!(hunks.len(), 2);
        assert_eq!(hunks[0].old_start, 1);
        assert_eq!(hunks[0].new_start, 1);
        assert_eq!(hunks[1].old_start, 9);
        assert_eq!(hunks[1].new_lines, 2);
    }

    #[test]
    fn file_history_parser_maps_log_rows() {
        let raw = concat!(
            "0123456789abcdef\\x1f0123456\\x1fJane Doe\\x1fjane@example.com\\x1f2026-03-15T12:00:00+00:00\\x1ffeat: first\\x1e",
            "fedcba9876543210\\x1ffedcba9\\x1fJohn Doe\\x1fjohn@example.com\\x1f2026-03-14T12:00:00+00:00\\x1ffix: second\\x1e",
        )
        .replace("\\x1f", "\x1f")
        .replace("\\x1e", "\x1e");

        let entries = parse_history_entries(&raw);

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].author, "Jane Doe");
        assert_eq!(entries[1].short_hash, "fedcba9");
    }

    #[test]
    fn blame_parser_maps_line_porcelain_rows() {
        let raw = concat!(
            "deadbeef 1 1 1\n",
            "author Jane Doe\n",
            "author-mail <jane@example.com>\n",
            "author-time 1700000000\n",
            "summary initial\n",
            "filename file.ts\n",
            "\tconst first = 1;\n",
            "feedface 2 2 1\n",
            "author John Doe\n",
            "author-mail <john@example.com>\n",
            "author-time 1700000100\n",
            "summary follow up\n",
            "filename file.ts\n",
            "\tconst second = 2;\n",
        );

        let lines = parse_blame_output(raw);

        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].line_number, 1);
        assert_eq!(lines[0].author, "Jane Doe");
        assert_eq!(lines[1].line_number, 2);
        assert_eq!(lines[1].author_email, "john@example.com");
    }
}
