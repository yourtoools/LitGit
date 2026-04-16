use chardetng::EncodingDetector;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use tauri::State;

use crate::commit_messages::{resolve_commit_identity_for_history, CommitAuthorIdentity};
use crate::git_support::{
    decode_text_content_with_encoding, encode_text_with_encoding, git_command,
    load_commit_contents, load_working_tree_contents, validate_git_repo,
    validate_repo_relative_file_path, write_temp_bytes, GitSupportError,
};
use crate::integrations_store::load_integrations_config;
use crate::settings::SettingsState;

const DEFAULT_HISTORY_LIMIT: usize = 200;
const MAX_HISTORY_LIMIT: usize = 1_000;
const HISTORY_CACHE_LIMIT: usize = 128;
const BLAME_CACHE_LIMIT: usize = 128;

type CachedPayloadMap<T> = Mutex<LimitedPayloadCache<T>>;

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

/// A parsed unified-diff hunk with line ranges and hunk body lines.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryFileHunk {
    header: String,
    index: usize,
    lines: Vec<String>,
    new_lines: usize,
    new_start: usize,
    old_lines: usize,
    old_start: usize,
}

/// Hunk payload for a working-tree file.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryFileHunks {
    hunks: Vec<RepositoryFileHunk>,
    path: String,
}

/// Hunk payload for a file from a specific commit.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryCommitFileHunks {
    commit_hash: String,
    hunks: Vec<RepositoryFileHunk>,
    path: String,
}

/// A history entry for one file revision.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryFileHistoryEntry {
    author: String,
    author_avatar_url: Option<String>,
    author_email: String,
    author_username: Option<String>,
    commit_hash: String,
    date: String,
    message_summary: String,
    short_hash: String,
}

/// File history payload returned by `git log --follow`.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryFileHistoryPayload {
    entries: Vec<RepositoryFileHistoryEntry>,
    path: String,
}

/// A single line in blame output with author and commit metadata.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryFileBlameLine {
    author: String,
    author_avatar_url: Option<String>,
    author_email: String,
    author_time: Option<i64>,
    author_username: Option<String>,
    commit_hash: String,
    line_number: usize,
    summary: String,
    text: String,
}

/// Blame payload for a file at a revision.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryFileBlamePayload {
    lines: Vec<RepositoryFileBlameLine>,
    path: String,
    revision: String,
}

/// Detected text encoding label for a repository file.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
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

fn resolve_cached_commit_identity(
    commit_identity_cache: &mut HashMap<String, CommitAuthorIdentity>,
    settings_state: &SettingsState,
    author_email: &str,
    author: &str,
) -> CommitAuthorIdentity {
    let cache_key = format!("{}\x1f{}", author_email.trim(), author.trim());

    commit_identity_cache
        .entry(cache_key)
        .or_insert_with(|| {
            resolve_commit_identity_for_history(settings_state, author_email, author)
        })
        .clone()
}

fn update_identity_state_hasher_with_optional_value(
    hasher: &mut Sha256,
    field_name: &str,
    value: Option<&str>,
) {
    hasher.update(field_name.as_bytes());
    hasher.update(b":");
    if let Some(value) = value {
        hasher.update(value.trim().as_bytes());
    }
    hasher.update(b"\n");
}

fn identity_state_cache_key_component(settings_state: &SettingsState) -> String {
    let mut hasher = Sha256::new();

    match load_integrations_config() {
        Ok(config) => {
            hasher.update(b"profile_id:");
            hasher.update(config.profile_id.trim().as_bytes());
            hasher.update(b"\n");

            let mut providers = config.providers.into_iter().collect::<Vec<_>>();
            providers.sort_by(|left, right| left.0.cmp(&right.0));

            for (provider_name, provider_config) in providers {
                hasher.update(b"provider:");
                hasher.update(provider_name.as_bytes());
                hasher.update(b"\n");

                if let Some(profile) = provider_config.profile {
                    update_identity_state_hasher_with_optional_value(
                        &mut hasher,
                        "username",
                        profile.username.as_deref(),
                    );
                    update_identity_state_hasher_with_optional_value(
                        &mut hasher,
                        "display_name",
                        profile.display_name.as_deref(),
                    );
                    update_identity_state_hasher_with_optional_value(
                        &mut hasher,
                        "avatar_url",
                        profile.avatar_url.as_deref(),
                    );
                } else {
                    hasher.update(b"profile:none\n");
                }
            }
        }
        Err(error) => {
            hasher.update(b"integrations:error:");
            hasher.update(error.to_string().as_bytes());
            hasher.update(b"\n");
        }
    }

    let github_identity_snapshot = settings_state
        .mutate_github_identity_cache(|cache| {
            let mut entries = cache
                .iter()
                .map(|(key, value)| {
                    (
                        key.clone(),
                        value.username.clone(),
                        value.avatar_url.clone(),
                    )
                })
                .collect::<Vec<_>>();
            entries.sort_by(|left, right| left.0.cmp(&right.0));
            entries
        })
        .unwrap_or_default();

    for (cache_key, username, avatar_url) in github_identity_snapshot {
        hasher.update(b"github_cache_key:");
        hasher.update(cache_key.as_bytes());
        hasher.update(b"\n");
        update_identity_state_hasher_with_optional_value(
            &mut hasher,
            "cached_username",
            username.as_deref(),
        );
        update_identity_state_hasher_with_optional_value(
            &mut hasher,
            "cached_avatar_url",
            avatar_url.as_deref(),
        );
    }

    format!("{:x}", hasher.finalize())
}

fn build_file_history_cache_key(
    repo_path: &str,
    resolved_head_revision: &str,
    file_path: &str,
    resolved_limit: usize,
    identity_state_fingerprint: &str,
) -> String {
    format!(
        "{repo_path}\x1f{resolved_head_revision}\x1f{file_path}\x1f{resolved_limit}\x1f{identity_state_fingerprint}"
    )
}

fn build_file_blame_cache_key(
    repo_path: &str,
    cache_revision: &str,
    file_path: &str,
    identity_state_fingerprint: &str,
) -> String {
    format!("{repo_path}\x1f{cache_revision}\x1f{file_path}\x1f{identity_state_fingerprint}")
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
            let author_avatar_url = fields
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(std::string::ToString::to_string);
            let author_username = fields
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(std::string::ToString::to_string);

            Some(RepositoryFileHistoryEntry {
                author,
                author_avatar_url,
                author_email,
                author_username,
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

fn parse_blame_output_with_resolver<F>(
    raw_output: &str,
    mut resolve_identity: F,
) -> Vec<RepositoryFileBlameLine>
where
    F: FnMut(&str, &str) -> CommitAuthorIdentity,
{
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
            let identity = resolve_identity(&current_line.author_email, &current_line.author);
            parsed_lines.push(RepositoryFileBlameLine {
                author: current_line.author.clone(),
                author_avatar_url: identity.avatar_url,
                author_email: current_line.author_email.clone(),
                author_time: current_line.author_time,
                author_username: identity.username,
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
) -> Result<String, GitSupportError> {
    validate_repo_relative_file_path(file_path)?;

    let target_path = Path::new(repo_path).join(file_path);
    let raw_content = fs::read(target_path).map_err(|error| GitSupportError::Io {
        action: "read file",
        source: error,
    })?;
    decode_text_content_with_encoding(Some(&raw_content), encoding)
}

fn detect_text_encoding_label(content: &[u8]) -> Result<String, GitSupportError> {
    if content.is_empty() {
        return Ok("utf-8".to_string());
    }

    if content.contains(&0) {
        return Err(GitSupportError::Message(
            "Binary file not supported".to_string(),
        ));
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

/// Returns parsed unified-diff hunks for a working-tree file.
// Tauri command arguments are owned because the IPC boundary deserializes them.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
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

/// Returns parsed unified-diff hunks for a file in a specific commit.
// Tauri command arguments are owned because the IPC boundary deserializes them.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
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

/// Returns revision history for a file, following renames.
// Tauri command arguments are owned because the IPC boundary deserializes them.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
pub(crate) fn get_repository_file_history(
    repo_path: String,
    file_path: String,
    limit: Option<usize>,
    state: State<'_, SettingsState>,
) -> Result<RepositoryFileHistoryPayload, String> {
    validate_git_repo(Path::new(&repo_path))?;
    validate_repo_relative_file_path(&file_path)?;
    let resolved_limit = limit
        .unwrap_or(DEFAULT_HISTORY_LIMIT)
        .clamp(1, MAX_HISTORY_LIMIT);
    let resolved_head_revision =
        resolve_head_revision(&repo_path).unwrap_or_else(|| "NO_HEAD".to_string());
    let identity_state_fingerprint = identity_state_cache_key_component(state.inner());
    let cache_key = build_file_history_cache_key(
        &repo_path,
        &resolved_head_revision,
        &file_path,
        resolved_limit,
        &identity_state_fingerprint,
    );

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

    let mut commit_identity_cache = HashMap::new();
    let entries = parse_history_entries(&String::from_utf8_lossy(&output.stdout))
        .into_iter()
        .map(|entry| {
            let identity = resolve_cached_commit_identity(
                &mut commit_identity_cache,
                state.inner(),
                &entry.author_email,
                &entry.author,
            );

            RepositoryFileHistoryEntry {
                author: entry.author,
                author_avatar_url: identity.avatar_url.or(entry.author_avatar_url),
                author_email: entry.author_email,
                author_username: identity.username.or(entry.author_username),
                commit_hash: entry.commit_hash,
                date: entry.date,
                message_summary: entry.message_summary,
                short_hash: entry.short_hash,
            }
        })
        .collect();

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

/// Returns line-by-line blame metadata for a file at a revision.
// Tauri command arguments are owned because the IPC boundary deserializes them.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
pub(crate) fn get_repository_file_blame(
    repo_path: String,
    file_path: String,
    revision: Option<String>,
    state: State<'_, SettingsState>,
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
    let identity_state_fingerprint = identity_state_cache_key_component(state.inner());
    let cache_key = build_file_blame_cache_key(
        &repo_path,
        &cache_revision,
        &file_path,
        &identity_state_fingerprint,
    );

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

    let mut commit_identity_cache = HashMap::new();
    let lines = parse_blame_output_with_resolver(
        &String::from_utf8_lossy(&output.stdout),
        |email, author| {
            resolve_cached_commit_identity(&mut commit_identity_cache, state.inner(), email, author)
        },
    );

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

/// Saves text to a repository file using the requested encoding.
// Tauri command arguments are owned because the IPC boundary deserializes them.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
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

/// Reads repository file text using the requested encoding.
// Tauri command arguments are owned because the IPC boundary deserializes them.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
pub(crate) fn get_repository_file_text(
    repo_path: String,
    file_path: String,
    encoding: Option<String>,
) -> Result<String, String> {
    validate_git_repo(Path::new(&repo_path)).map_err(|e| e.to_string())?;
    validate_repo_relative_file_path(&file_path).map_err(|e| e.to_string())?;
    read_file_text_with_encoding(&repo_path, &file_path, encoding.as_deref())
        .map_err(|e| e.to_string())
}

/// Detects the text encoding of a repository file or file revision.
// Tauri command arguments are owned because the IPC boundary deserializes them.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
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
    use crate::commit_messages::CommitAuthorIdentity;
    use crate::integrations_store::{
        save_integrations_config, IntegrationsConfig, ProviderConfig, ProviderProfile,
    };
    use crate::settings::SettingsState;
    use std::collections::HashMap;
    use std::path::{Path, PathBuf};
    use std::sync::{Mutex, OnceLock};

    use super::{
        build_file_history_cache_key, identity_state_cache_key_component,
        parse_blame_output_with_resolver, parse_history_entries, parse_hunks_from_patch,
    };

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
            "0123456789abcdef\x1f0123456\x1fJane Doe\x1fjane@example.com\x1f2026-03-15T12:00:00+00:00\x1ffeat: first\x1e",
            "fedcba9876543210\x1ffedcba9\x1fJohn Doe\x1fjohn@example.com\x1f2026-03-14T12:00:00+00:00\x1ffix: second\x1e",
        );

        let entries = parse_history_entries(raw);

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].author, "Jane Doe");
        assert_eq!(entries[1].short_hash, "fedcba9");
    }

    #[test]
    fn parse_history_entries_reads_avatar_and_username_fields() {
        let raw = "abc123\x1fabc1234\x1fDeri Kurniawan\x1fderi@example.com\x1f2026-04-10T10:00:00Z\x1ffix avatar\x1fhttps://github.com/Deri-Kurniawan.png\x1fDeri-Kurniawan\x1e";

        let entries = parse_history_entries(raw);

        assert_eq!(
            entries[0].author_avatar_url.as_deref(),
            Some("https://github.com/Deri-Kurniawan.png")
        );
        assert_eq!(
            entries[0].author_username.as_deref(),
            Some("Deri-Kurniawan")
        );
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

        let lines = parse_blame_output_with_resolver(raw, |_, _| CommitAuthorIdentity::default());

        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].line_number, 1);
        assert_eq!(lines[0].author, "Jane Doe");
        assert_eq!(lines[1].line_number, 2);
        assert_eq!(lines[1].author_email, "john@example.com");
    }

    #[test]
    fn parse_blame_output_sets_avatar_and_username_from_resolved_identity() {
        let raw = concat!(
            "abc123 1 1 1\n",
            "author Deri Kurniawan\n",
            "author-mail <12345+Deri-Kurniawan@users.noreply.github.com>\n",
            "author-time 1712743200\n",
            "summary fix avatar\n",
            "\tlet avatar = true;\n",
        );

        let lines = parse_blame_output_with_resolver(raw, |email, author| {
            assert_eq!(email, "12345+Deri-Kurniawan@users.noreply.github.com");
            assert_eq!(author, "Deri Kurniawan");

            CommitAuthorIdentity {
                avatar_url: Some("https://github.com/Deri-Kurniawan.png".to_string()),
                username: Some("Deri-Kurniawan".to_string()),
            }
        });

        assert_eq!(
            lines[0].author_avatar_url.as_deref(),
            Some("https://github.com/Deri-Kurniawan.png")
        );
        assert_eq!(lines[0].author_username.as_deref(), Some("Deri-Kurniawan"));
    }

    #[test]
    fn file_history_cache_key_changes_when_connected_github_profile_changes() {
        run_with_temp_home("diff-workspace-cache-key", || {
            let state = SettingsState::default();
            let repo_path = "/tmp/repo";
            let revision = "abc123";
            let file_path = "src/main.rs";
            let limit = 25;

            save_integrations_config(&github_test_config(
                "litgit-tests",
                Some("https://avatars.githubusercontent.com/u/1?v=4"),
            ))
            .expect("should save initial integrations config");
            let initial_fingerprint = identity_state_cache_key_component(&state);
            let initial_key = build_file_history_cache_key(
                repo_path,
                revision,
                file_path,
                limit,
                &initial_fingerprint,
            );

            save_integrations_config(&github_test_config(
                "litgit-tests",
                Some("https://avatars.githubusercontent.com/u/2?v=4"),
            ))
            .expect("should save updated integrations config");
            let updated_fingerprint = identity_state_cache_key_component(&state);
            let updated_key = build_file_history_cache_key(
                repo_path,
                revision,
                file_path,
                limit,
                &updated_fingerprint,
            );

            assert_ne!(initial_fingerprint, updated_fingerprint);
            assert_ne!(initial_key, updated_key);
        });
    }

    fn test_environment_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn create_temp_dir(label: &str) -> PathBuf {
        let unique_suffix = uuid::Uuid::new_v4();
        let path =
            std::env::temp_dir().join(format!("litgit-diff-workspace-{label}-{unique_suffix}"));
        std::fs::create_dir_all(&path).expect("should create temporary home directory");
        path
    }

    fn run_with_temp_home<T>(label: &str, callback: impl FnOnce() -> T) -> T {
        let _guard = test_environment_lock()
            .lock()
            .expect("test environment lock should not be poisoned");
        let temp_home = create_temp_dir(label);
        let previous_home = std::env::var_os("HOME");

        unsafe {
            std::env::set_var("HOME", &temp_home);
        }

        let result = callback();

        if let Some(home) = previous_home {
            unsafe {
                std::env::set_var("HOME", home);
            }
        } else {
            unsafe {
                std::env::remove_var("HOME");
            }
        }

        remove_temp_path(&temp_home);
        result
    }

    fn remove_temp_path(path: &Path) {
        if path.exists() {
            std::fs::remove_dir_all(path).expect("should remove temporary home directory");
        }
    }

    fn github_test_config(username: &str, avatar_url: Option<&str>) -> IntegrationsConfig {
        IntegrationsConfig {
            profile_id: "profile_test".to_string(),
            providers: HashMap::from([(
                "github".to_string(),
                ProviderConfig {
                    oauth_token: None,
                    profile: Some(ProviderProfile {
                        username: Some(username.to_string()),
                        display_name: Some("Lit Git Tests".to_string()),
                        avatar_url: avatar_url.map(std::string::ToString::to_string),
                        emails: Vec::new(),
                    }),
                    ssh_key: None,
                    use_system_agent: true,
                },
            )]),
        }
    }
}
