use crate::commit_messages::{resolve_commit_identity_for_history, GitHubIdentity};
use crate::git_support::{
    ensure_git_output_success, git_command, git_error_message, run_git_output, validate_git_repo,
    GitSupportError,
};
use crate::settings::{GitHubIdentityCacheRecord, SettingsState};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::process::Output;
use tauri::State;
use thiserror::Error;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryCommit {
    hash: String,
    short_hash: String,
    parent_hashes: Vec<String>,
    message: String,
    message_summary: String,
    message_description: String,
    author: String,
    author_email: Option<String>,
    author_username: Option<String>,
    author_avatar_url: Option<String>,
    date: String,
    refs: Vec<String>,
    sync_state: String,
}

/// Commit history payload returned to the frontend.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryHistoryPayload {
    commits: Vec<RepositoryCommit>,
    has_more: bool,
    next_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryHistoryRequest {
    repo_path: String,
    limit: Option<usize>,
    cursor: Option<String>,
}

/// Latest commit message split into summary and description.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LatestRepositoryCommitMessage {
    summary: String,
    description: String,
}

/// A single file touched by a commit, including rename and line stats.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryCommitFile {
    status: String,
    path: String,
    previous_path: Option<String>,
    additions: usize,
    deletions: usize,
}

#[derive(Debug, Error)]
enum HistoryError {
    #[error("{0}")]
    Message(String),
    #[error("Failed to {action}: {source}")]
    Io {
        action: &'static str,
        #[source]
        source: std::io::Error,
    },
}

const DEFAULT_HISTORY_PAGE_SIZE: usize = 400;
const MAX_HISTORY_PAGE_SIZE: usize = 2_000;

fn normalize_history_limit(limit: Option<usize>) -> usize {
    limit
        .unwrap_or(DEFAULT_HISTORY_PAGE_SIZE)
        .clamp(1, MAX_HISTORY_PAGE_SIZE)
}

impl HistoryError {
    fn io(action: &'static str, source: std::io::Error) -> Self {
        Self::Io { action, source }
    }

    fn message(message: impl Into<String>) -> Self {
        Self::Message(message.into())
    }
}

fn parse_numstat_count(bytes: &[u8]) -> usize {
    String::from_utf8_lossy(bytes).parse::<usize>().unwrap_or(0)
}

fn read_nul_terminated_field(bytes: &[u8], cursor: &mut usize) -> Option<String> {
    let field_end = bytes[*cursor..]
        .iter()
        .position(|byte| *byte == b'\0')
        .map(|offset| *cursor + offset)?;
    let field = String::from_utf8_lossy(&bytes[*cursor..field_end]).to_string();
    *cursor = field_end + 1;
    Some(field)
}

fn parse_numstat_output(numstat_bytes: &[u8]) -> HashMap<String, (usize, usize)> {
    let mut numstat_by_path = HashMap::new();
    let mut cursor = 0usize;

    while cursor < numstat_bytes.len() {
        let Some(additions_end) = numstat_bytes[cursor..]
            .iter()
            .position(|byte| *byte == b'\t')
            .map(|offset| cursor + offset)
        else {
            break;
        };

        let additions = parse_numstat_count(&numstat_bytes[cursor..additions_end]);
        cursor = additions_end + 1;

        let Some(deletions_end) = numstat_bytes[cursor..]
            .iter()
            .position(|byte| *byte == b'\t')
            .map(|offset| cursor + offset)
        else {
            break;
        };

        let deletions = parse_numstat_count(&numstat_bytes[cursor..deletions_end]);
        cursor = deletions_end + 1;

        if cursor >= numstat_bytes.len() {
            break;
        }

        if numstat_bytes[cursor] == b'\0' {
            cursor += 1;

            let Some(previous_path) = read_nul_terminated_field(numstat_bytes, &mut cursor) else {
                break;
            };
            let Some(path) = read_nul_terminated_field(numstat_bytes, &mut cursor) else {
                break;
            };

            numstat_by_path.insert(previous_path, (additions, deletions));
            numstat_by_path.insert(path, (additions, deletions));
            continue;
        }

        let Some(path) = read_nul_terminated_field(numstat_bytes, &mut cursor) else {
            break;
        };
        numstat_by_path.insert(path, (additions, deletions));
    }

    numstat_by_path
}

fn parse_name_status_output(
    name_status_bytes: &[u8],
    numstat_by_path: &HashMap<String, (usize, usize)>,
) -> Result<Vec<RepositoryCommitFile>, HistoryError> {
    let mut files = Vec::new();
    let mut name_status_fields = name_status_bytes
        .split(|byte| *byte == b'\0')
        .filter(|field| !field.is_empty());

    while let Some(status_field) = name_status_fields.next() {
        let status_token = String::from_utf8_lossy(status_field);
        let status_char = status_token.chars().next().unwrap_or('M');
        let status = status_char.to_string();

        let (path, previous_path) = if matches!(status_char, 'R' | 'C') {
            let Some(previous_path_field) = name_status_fields.next() else {
                return Err(HistoryError::message(format!(
                    "Failed to parse commit file list: incomplete {status} rename/copy row"
                )));
            };
            let Some(path_field) = name_status_fields.next() else {
                return Err(HistoryError::message(format!(
                    "Failed to parse commit file list: incomplete {status} rename/copy row"
                )));
            };

            (
                String::from_utf8_lossy(path_field).to_string(),
                Some(String::from_utf8_lossy(previous_path_field).to_string()),
            )
        } else {
            let Some(path_field) = name_status_fields.next() else {
                return Err(HistoryError::message(format!(
                    "Failed to parse commit file list: missing path for status {status}"
                )));
            };

            (String::from_utf8_lossy(path_field).to_string(), None)
        };

        let (additions, deletions) = numstat_by_path
            .get(&path)
            .copied()
            .or_else(|| {
                previous_path
                    .as_ref()
                    .and_then(|source_path| numstat_by_path.get(source_path).copied())
            })
            .unwrap_or((0, 0));

        files.push(RepositoryCommitFile {
            status,
            path,
            previous_path,
            additions,
            deletions,
        });
    }

    Ok(files)
}

fn parse_repository_history_stdout(
    stdout: &str,
    state: &SettingsState,
    commit_identity_cache: &mut HashMap<String, GitHubIdentity>,
    sync_state: &str,
) -> Result<Vec<RepositoryCommit>, HistoryError> {
    let mut commits = Vec::new();

    for row in stdout.split('\x1e') {
        let trimmed = row.trim();

        if trimmed.is_empty() {
            continue;
        }

        let mut parts = trimmed.split('\x1f');

        let hash = parts
            .next()
            .ok_or_else(|| {
                HistoryError::message("Failed to parse repository history row: missing commit hash")
            })?
            .to_string();
        let short_hash = parts
            .next()
            .ok_or_else(|| {
                HistoryError::message(format!(
                    "Failed to parse repository history row for {hash}: missing short hash"
                ))
            })?
            .to_string();
        let parents_raw = parts
            .next()
            .ok_or_else(|| {
                HistoryError::message(format!(
                    "Failed to parse repository history row for {hash}: missing parent list"
                ))
            })?
            .to_string();
        let message_summary = parts.next().unwrap_or("").trim().to_string();
        let message_description = parts.next().unwrap_or("").trim().to_string();
        let message = parts
            .next()
            .ok_or_else(|| {
                HistoryError::message(format!(
                    "Failed to parse repository history row for {hash}: missing message"
                ))
            })?
            .to_string();
        let author = parts
            .next()
            .ok_or_else(|| {
                HistoryError::message(format!(
                    "Failed to parse repository history row for {hash}: missing author"
                ))
            })?
            .to_string();
        let author_email_raw = parts.next().unwrap_or("").trim().to_string();
        let author_email = if author_email_raw.is_empty() {
            None
        } else {
            Some(author_email_raw)
        };
        let github_identity = match author_email.as_deref() {
            Some(email) => commit_identity_cache
                .entry(email.to_string())
                .or_insert_with(|| resolve_commit_identity_for_history(state, email, &author))
                .clone(),
            None => {
                if author.trim().is_empty() {
                    GitHubIdentity::default()
                } else {
                    commit_identity_cache
                        .entry(author.clone())
                        .or_insert_with(|| resolve_commit_identity_for_history(state, "", &author))
                        .clone()
                }
            }
        };
        let date = parts
            .next()
            .ok_or_else(|| {
                HistoryError::message(format!(
                    "Failed to parse repository history row for {hash}: missing date"
                ))
            })?
            .to_string();
        let refs_raw = parts.next().unwrap_or("").to_string();

        let parent_hashes = if parents_raw.trim().is_empty() {
            Vec::new()
        } else {
            parents_raw
                .split_whitespace()
                .map(std::string::ToString::to_string)
                .collect()
        };

        let refs = refs_raw
            .split(", ")
            .filter(|reference| !reference.trim().is_empty())
            .map(std::string::ToString::to_string)
            .collect();

        commits.push(RepositoryCommit {
            hash,
            short_hash,
            parent_hashes,
            message,
            message_summary,
            message_description,
            author,
            author_email,
            author_username: github_identity.username,
            author_avatar_url: github_identity.avatar_url,
            date,
            refs,
            sync_state: sync_state.to_string(),
        });
    }

    Ok(commits)
}

fn inspect_commit_parents(
    repo_path: &str,
    commit_hash: &str,
) -> Result<(Option<String>, bool), HistoryError> {
    let parents_output = run_git_output(
        repo_path,
        &["rev-list", "--parents", "-n", "1", commit_hash],
        "inspect commit parents",
    )
    .map_err(|error: GitSupportError| HistoryError::message(error.to_string()))?;

    if !parents_output.status.success() {
        return Err(HistoryError::message(git_error_message(
            &parents_output.stderr,
            "Failed to inspect commit parents",
        )));
    }

    let parents_stdout = String::from_utf8_lossy(&parents_output.stdout);
    let parent_tokens = parents_stdout.split_whitespace().collect::<Vec<_>>();

    Ok((
        parent_tokens.get(1).map(|parent| (*parent).to_string()),
        parent_tokens.len() > 2,
    ))
}

fn load_commit_file_change_output(
    repo_path: &str,
    commit_hash: &str,
    first_parent: Option<&str>,
    output_kind: &str,
) -> Result<Output, HistoryError> {
    let mut command = git_command();
    command.args(["-C", repo_path]);

    if let Some(parent_hash) = first_parent {
        let error_context = if output_kind == "--numstat" {
            "Failed to run git diff --numstat"
        } else {
            "Failed to run git diff for commit files"
        };

        command
            .args([
                "diff",
                output_kind,
                "--find-renames",
                "--find-copies",
                "-z",
                parent_hash,
                commit_hash,
            ])
            .output()
            .map_err(|error| HistoryError::message(format!("{error_context}: {error}")))
    } else {
        let error_context = if output_kind == "--numstat" {
            "Failed to run git show --numstat"
        } else {
            "Failed to run git show for commit files"
        };

        command
            .args([
                "show",
                "--pretty=format:",
                output_kind,
                "--find-renames",
                "--find-copies",
                "-z",
                commit_hash,
            ])
            .output()
            .map_err(|error| HistoryError::message(format!("{error_context}: {error}")))
    }
}

fn load_repository_history_segment(
    repo_path: &str,
    state: &SettingsState,
    commit_identity_cache: &mut HashMap<String, GitHubIdentity>,
    sync_state: &str,
    revision_args: &[&str],
    limit: Option<usize>,
) -> Result<Vec<RepositoryCommit>, HistoryError> {
    let mut command = git_command();
    command.args([
        "-C",
        repo_path,
        "log",
        "--decorate=short",
        "--date=iso-strict",
        "--topo-order",
        "--pretty=format:%H%x1f%h%x1f%P%x1f%s%x1f%b%x1f%B%x1f%an%x1f%ae%x1f%ad%x1f%D%x1e",
    ]);
    if let Some(limit) = limit {
        command.arg(format!("--max-count={limit}"));
    }
    command.args(revision_args);

    let output = command
        .output()
        .map_err(|error| HistoryError::io("run git log", error))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(HistoryError::message(if stderr.is_empty() {
            "Failed to read repository history".to_string()
        } else {
            stderr
        }));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    parse_repository_history_stdout(&stdout, state, commit_identity_cache, sync_state)
}

fn resolve_repository_upstream_ref(repo_path: &str) -> Result<Option<String>, HistoryError> {
    let output = run_git_output(
        repo_path,
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
        "resolve branch upstream",
    )
    .map_err(|error: GitSupportError| HistoryError::message(error.to_string()))?;

    if !output.status.success() {
        return Ok(None);
    }

    let upstream_ref = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if upstream_ref.is_empty() {
        return Ok(None);
    }

    Ok(Some(upstream_ref))
}

fn clone_history_settings_state(state: &SettingsState) -> Result<SettingsState, HistoryError> {
    let github_identity_cache = state
        .mutate_github_identity_cache(|cache| cache.clone())
        .map_err(HistoryError::message)?;
    let cloned_state = SettingsState::default();
    cloned_state.set_github_identity_cache_file_path(state.github_identity_cache_file_path());
    cloned_state
        .mutate_github_identity_cache(|cache| *cache = github_identity_cache)
        .map_err(HistoryError::message)?;
    Ok(cloned_state)
}

fn get_repository_history_inner(
    repo_path: &str,
    state: &SettingsState,
    limit: Option<usize>,
    cursor: Option<&str>,
) -> Result<RepositoryHistoryPayload, HistoryError> {
    validate_git_repo(Path::new(repo_path)).map_err(HistoryError::message)?;
    let page_limit = normalize_history_limit(limit);
    let query_limit = page_limit + 1;
    let mut commit_identity_cache = HashMap::new();
    let cursor_revision = cursor.map(|cursor_hash| format!("{cursor_hash}^@"));
    let revision_args = match cursor_revision.as_deref() {
        Some(cursor_parent_revision) => vec![cursor_parent_revision],
        None => vec!["HEAD"],
    };
    let mut local_commits = load_repository_history_segment(
        repo_path,
        state,
        &mut commit_identity_cache,
        "normal",
        &revision_args,
        Some(query_limit),
    )?;
    let has_more = local_commits.len() > page_limit;

    if has_more {
        local_commits.truncate(page_limit);
    }

    let next_cursor = if has_more {
        local_commits.last().map(|commit| commit.hash.clone())
    } else {
        None
    };
    let pullable_commits = if cursor.is_none() {
        if let Some(upstream_ref) = resolve_repository_upstream_ref(repo_path)? {
            load_repository_history_segment(
                repo_path,
                state,
                &mut commit_identity_cache,
                "pullable",
                &[upstream_ref.as_str(), "--not", "HEAD"],
                Some(page_limit),
            )?
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };
    let mut seen_hashes = HashSet::new();
    let mut commits = Vec::with_capacity(pullable_commits.len() + local_commits.len());

    for commit in pullable_commits.into_iter().chain(local_commits) {
        if !seen_hashes.insert(commit.hash.clone()) {
            continue;
        }

        commits.push(commit);
    }

    Ok(RepositoryHistoryPayload {
        commits,
        has_more,
        next_cursor,
    })
}

fn sync_history_settings_state_cache(
    state: &SettingsState,
    github_identity_cache: HashMap<String, GitHubIdentityCacheRecord>,
) -> Result<(), HistoryError> {
    state
        .mutate_github_identity_cache(|cache| {
            for (key, snapshot_record) in github_identity_cache {
                match cache.get(&key) {
                    Some(live_record)
                        if live_record.stored_at_unix_seconds
                            >= snapshot_record.stored_at_unix_seconds => {}
                    _ => {
                        cache.insert(key, snapshot_record);
                    }
                }
            }
        })
        .map_err(HistoryError::message)
}

async fn get_repository_history_with_state(
    request: RepositoryHistoryRequest,
    state: &SettingsState,
) -> Result<RepositoryHistoryPayload, String> {
    let history_state = clone_history_settings_state(state).map_err(|error| error.to_string())?;

    let (payload, github_identity_cache) = tauri::async_runtime::spawn_blocking(move || {
        let payload = get_repository_history_inner(
            &request.repo_path,
            &history_state,
            request.limit,
            request.cursor.as_deref(),
        )?;
        let github_identity_cache = history_state
            .mutate_github_identity_cache(|cache| cache.clone())
            .map_err(HistoryError::message)?;

        Ok::<_, HistoryError>((payload, github_identity_cache))
    })
    .await
    .map_err(|error| format!("Failed to read repository history: {error}"))?
    .map_err(|error| error.to_string())?;

    sync_history_settings_state_cache(state, github_identity_cache)
        .map_err(|error| error.to_string())?;

    Ok(payload)
}

/// Returns local history plus pullable upstream commits for the current repository.
// Tauri command arguments mirror the frontend invoke payload.
#[tauri::command]
pub(crate) async fn get_repository_history(
    request: RepositoryHistoryRequest,
    state: State<'_, SettingsState>,
) -> Result<RepositoryHistoryPayload, String> {
    get_repository_history_with_state(request, state.inner()).await
}

fn get_latest_repository_commit_message_inner(
    repo_path: &str,
) -> Result<LatestRepositoryCommitMessage, HistoryError> {
    validate_git_repo(Path::new(repo_path)).map_err(HistoryError::message)?;

    let output = run_git_output(
        repo_path,
        &["log", "-1", "--pretty=format:%s%x1f%b"],
        "run git log",
    )
    .map_err(|error: GitSupportError| HistoryError::message(error.to_string()))?;
    ensure_git_output_success(&output, "Failed to read latest commit message")
        .map_err(|error: GitSupportError| HistoryError::message(error.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut parts = stdout.splitn(2, '\x1f');
    let summary = parts.next().unwrap_or("").trim().to_string();

    if summary.is_empty() {
        return Err(HistoryError::message("No commit message available"));
    }

    let description = parts.next().unwrap_or("").trim().to_string();

    Ok(LatestRepositoryCommitMessage {
        summary,
        description,
    })
}

/// Returns the latest commit message for the current repository HEAD.
// Tauri command arguments mirror the frontend invoke payload.
#[tauri::command]
pub(crate) async fn get_latest_repository_commit_message(
    repo_path: String,
) -> Result<LatestRepositoryCommitMessage, String> {
    tauri::async_runtime::spawn_blocking(move || {
        get_latest_repository_commit_message_inner(&repo_path).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to read latest commit message: {error}"))?
}

fn get_repository_commit_files_inner(
    repo_path: &str,
    commit_hash: &str,
) -> Result<Vec<RepositoryCommitFile>, HistoryError> {
    validate_git_repo(Path::new(repo_path)).map_err(HistoryError::message)?;

    let (first_parent, is_merge_commit) = inspect_commit_parents(repo_path, commit_hash)?;
    let name_status_output = load_commit_file_change_output(
        repo_path,
        commit_hash,
        if is_merge_commit {
            first_parent.as_deref()
        } else {
            None
        },
        "--name-status",
    )?;

    if !name_status_output.status.success() {
        return Err(HistoryError::message(git_error_message(
            &name_status_output.stderr,
            "Failed to load commit file list",
        )));
    }

    let numstat_output = load_commit_file_change_output(
        repo_path,
        commit_hash,
        if is_merge_commit {
            first_parent.as_deref()
        } else {
            None
        },
        "--numstat",
    )?;

    if !numstat_output.status.success() {
        return Err(HistoryError::message(git_error_message(
            &numstat_output.stderr,
            "Failed to load commit file statistics",
        )));
    }

    let numstat_by_path = parse_numstat_output(&numstat_output.stdout);
    parse_name_status_output(&name_status_output.stdout, &numstat_by_path)
}

/// Returns changed files for a commit, including status and line-level change counts.
// Tauri command arguments mirror the frontend invoke payload.
#[tauri::command]
pub(crate) async fn get_repository_commit_files(
    repo_path: String,
    commit_hash: String,
) -> Result<Vec<RepositoryCommitFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        get_repository_commit_files_inner(&repo_path, &commit_hash)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to load commit file list: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{
        parse_name_status_output, parse_numstat_output, parse_repository_history_stdout,
        resolve_repository_upstream_ref, HistoryError,
    };
    use crate::settings::SettingsState;
    use serde_json::json;
    use std::collections::HashMap;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::{Command, Output};
    use std::time::{SystemTime, UNIX_EPOCH};
    use tauri::Manager;

    struct TempGitRepo {
        path: PathBuf,
    }

    impl TempGitRepo {
        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TempGitRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn run_git(repo_path: &Path, args: &[&str]) {
        let status = run_git_output(repo_path, args).status;

        assert!(
            status.success(),
            "git command failed: git -C {repo_path:?} {args:?}"
        );
    }

    fn run_git_output(repo_path: &Path, args: &[&str]) -> Output {
        Command::new("git")
            .args(["-C", repo_path.to_string_lossy().as_ref()])
            .args(args)
            .output()
            .expect("git command should start")
    }

    fn create_temp_git_repo() -> TempGitRepo {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time should move forward")
            .as_nanos();
        let repo_path = std::env::temp_dir().join(format!("litgit-history-test-{unique_suffix}"));

        fs::create_dir_all(&repo_path).expect("temp repo directory should be created");

        run_git(&repo_path, &["init"]);
        run_git(&repo_path, &["config", "user.name", "LitGit Tests"]);
        run_git(
            &repo_path,
            &[
                "config",
                "user.email",
                "12345+litgit-tests@users.noreply.github.com",
            ],
        );

        TempGitRepo { path: repo_path }
    }

    fn create_temp_git_repo_with_commit(
        file_name: &str,
        file_contents: &str,
        commit_subject: &str,
        commit_body: Option<&str>,
    ) -> TempGitRepo {
        let repo = create_temp_git_repo();
        let repo_path = repo.path();

        fs::write(repo_path.join(file_name), file_contents).expect("test file should be written");

        run_git(repo_path, &["add", file_name]);

        let mut commit_args = vec!["commit", "-m", commit_subject];

        if let Some(body) = commit_body {
            commit_args.extend(["-m", body]);
        }

        run_git(repo_path, &commit_args);

        repo
    }

    fn head_commit_hash(repo_path: &Path) -> String {
        let output = run_git_output(repo_path, &["rev-parse", "HEAD"]);
        assert!(output.status.success(), "HEAD hash should resolve");

        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    fn create_temp_git_repo_with_renamed_file() -> TempGitRepo {
        let repo = create_temp_git_repo_with_commit(
            "hello.txt",
            "hello\n",
            "Initial history commit",
            None,
        );
        let repo_path = repo.path();

        run_git(repo_path, &["mv", "hello.txt", "renamed.txt"]);
        fs::write(repo_path.join("renamed.txt"), "hello\nupdated\n")
            .expect("renamed file should be rewritten");
        run_git(repo_path, &["commit", "-m", "Rename tracked file"]);

        repo
    }

    fn create_temp_git_repo_with_merge_commit() -> TempGitRepo {
        let repo =
            create_temp_git_repo_with_commit("base.txt", "base\n", "Initial history commit", None);
        let repo_path = repo.path();
        let default_branch = run_git_output(repo_path, &["rev-parse", "--abbrev-ref", "HEAD"]);
        assert!(
            default_branch.status.success(),
            "default branch should resolve"
        );
        let default_branch_name = String::from_utf8_lossy(&default_branch.stdout)
            .trim()
            .to_string();

        run_git(repo_path, &["switch", "-c", "feature"]);
        fs::write(repo_path.join("feature.txt"), "feature\n").expect("feature file should exist");
        run_git(repo_path, &["add", "feature.txt"]);
        run_git(repo_path, &["commit", "-m", "Add feature file"]);

        run_git(repo_path, &["switch", &default_branch_name]);
        run_git(
            repo_path,
            &["merge", "--no-ff", "feature", "-m", "Merge feature branch"],
        );

        repo
    }

    #[test]
    fn parse_numstat_output_tracks_counts_for_both_sides_of_rename_entries() {
        let counts = parse_numstat_output(b"4\t1\t\0old.txt\0new.txt\0");

        assert_eq!(counts.get("old.txt"), Some(&(4, 1)));
        assert_eq!(counts.get("new.txt"), Some(&(4, 1)));
    }

    #[test]
    fn parse_numstat_output_tracks_counts_for_regular_entries() {
        let counts = parse_numstat_output(b"3\t2\tsrc/history.rs\0");

        assert_eq!(counts.get("src/history.rs"), Some(&(3, 2)));
    }

    #[test]
    fn parse_name_status_output_uses_previous_path_counts_for_renames() {
        let mut counts = HashMap::new();
        counts.insert("old.txt".to_string(), (7, 2));

        let files =
            parse_name_status_output(b"R100\0old.txt\0new.txt\0", &counts).expect("valid rename");

        assert_eq!(files.len(), 1);
        assert_eq!(files[0].status, "R");
        assert_eq!(files[0].path, "new.txt");
        assert_eq!(files[0].previous_path.as_deref(), Some("old.txt"));
        assert_eq!(files[0].additions, 7);
        assert_eq!(files[0].deletions, 2);
    }

    #[test]
    fn parse_name_status_output_returns_error_when_rename_row_is_incomplete() {
        let counts = HashMap::new();

        let result = parse_name_status_output(b"R100\0old.txt\0", &counts);

        assert_eq!(
            result
                .expect_err("expected incomplete rename row to fail")
                .to_string(),
            "Failed to parse commit file list: incomplete R rename/copy row"
        );
    }

    #[test]
    fn parse_repository_history_stdout_returns_error_when_row_is_incomplete() {
        let state = SettingsState::default();
        let mut commit_identity_cache = HashMap::new();

        let result = parse_repository_history_stdout(
            "abc123\x1fshort\x1fparent\x1fsummary\x1fdescription\x1efinal-separator",
            &state,
            &mut commit_identity_cache,
            "normal",
        );

        assert_eq!(
            result
                .expect_err("expected incomplete history row to fail")
                .to_string(),
            "Failed to parse repository history row for abc123: missing message"
        );
    }

    #[test]
    fn history_error_message_variant_preserves_display_text() {
        let error = HistoryError::Message("history parser failed".to_string());

        assert_eq!(error.to_string(), "history parser failed");
    }

    #[test]
    fn resolve_repository_upstream_ref_returns_none_without_tracking_branch() {
        let repo =
            create_temp_git_repo_with_commit("hello.txt", "hello", "Initial history commit", None);

        let upstream_ref = resolve_repository_upstream_ref(repo.path().to_string_lossy().as_ref())
            .expect("upstream resolution should succeed");

        assert_eq!(upstream_ref, None);
    }

    #[test]
    fn load_repository_history_segment_returns_commit_summary_for_single_commit_repo() {
        let repo =
            create_temp_git_repo_with_commit("hello.txt", "hello", "Initial history commit", None);
        let mut commit_identity_cache = HashMap::new();

        let commits = super::load_repository_history_segment(
            repo.path().to_string_lossy().as_ref(),
            &SettingsState::default(),
            &mut commit_identity_cache,
            "normal",
            &["HEAD"],
            None,
        )
        .expect("history");

        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].message_summary, "Initial history commit");
        assert_eq!(
            commits[0].author_email.as_deref(),
            Some("12345+litgit-tests@users.noreply.github.com")
        );
        assert_eq!(commits[0].author_username.as_deref(), Some("litgit-tests"));
        assert_eq!(commits[0].sync_state, "normal");
    }

    #[test]
    fn load_repository_history_segment_returns_more_than_legacy_graph_limit() {
        let repo = create_temp_git_repo();
        let repo_path = repo.path();

        for index in 0..160 {
            fs::write(repo_path.join("history.txt"), format!("commit {index}\n"))
                .expect("history file should be written");
            run_git(repo_path, &["add", "history.txt"]);
            run_git(
                repo_path,
                &["commit", "-m", &format!("History commit {index}")],
            );
        }

        let mut commit_identity_cache = HashMap::new();
        let commits = super::load_repository_history_segment(
            repo_path.to_string_lossy().as_ref(),
            &SettingsState::default(),
            &mut commit_identity_cache,
            "normal",
            &["HEAD"],
            None,
        )
        .expect("history");

        assert_eq!(commits.len(), 160);
    }

    #[test]
    fn get_repository_history_inner_returns_commit_payload_for_single_commit_repo() {
        let repo = create_temp_git_repo_with_commit(
            "notes.txt",
            "hello\nworld\n",
            "Add detailed notes",
            Some("Wrap the body line.\n\nInclude follow-up context."),
        );
        let payload = super::get_repository_history_inner(
            repo.path().to_string_lossy().as_ref(),
            &SettingsState::default(),
            None,
            None,
        )
        .expect("history payload");

        assert_eq!(payload.commits.len(), 1);
        assert_eq!(payload.commits[0].message_summary, "Add detailed notes");
        assert_eq!(
            payload.commits[0].message_description,
            "Wrap the body line.\n\nInclude follow-up context."
        );
        assert_eq!(payload.commits[0].sync_state, "normal");
    }

    #[test]
    fn get_repository_history_inner_returns_paginated_history_pages() {
        let repo = create_temp_git_repo();
        let repo_path = repo.path();

        for index in 0..5 {
            fs::write(repo_path.join("history.txt"), format!("commit {index}\n"))
                .expect("history file should be written");
            run_git(repo_path, &["add", "history.txt"]);
            run_git(
                repo_path,
                &["commit", "-m", &format!("History commit {index}")],
            );
        }

        let first_page = super::get_repository_history_inner(
            repo_path.to_string_lossy().as_ref(),
            &SettingsState::default(),
            Some(2),
            None,
        )
        .expect("first history page");
        let second_page = super::get_repository_history_inner(
            repo_path.to_string_lossy().as_ref(),
            &SettingsState::default(),
            Some(2),
            first_page.next_cursor.as_deref(),
        )
        .expect("second history page");

        assert_eq!(first_page.commits.len(), 2);
        assert!(first_page.has_more);
        assert_eq!(
            first_page.next_cursor.as_deref(),
            Some(first_page.commits[1].hash.as_str())
        );
        assert_eq!(second_page.commits.len(), 2);
        assert!(second_page.has_more);
        assert_ne!(first_page.commits[0].hash, second_page.commits[0].hash);
    }

    #[test]
    fn get_repository_history_inner_caps_pullable_upstream_commits() {
        let repo = create_temp_git_repo();
        let repo_path = repo.path();

        fs::write(repo_path.join("history.txt"), "local\n")
            .expect("history file should be written");
        run_git(repo_path, &["add", "history.txt"]);
        run_git(repo_path, &["commit", "-m", "Local commit"]);
        run_git(repo_path, &["branch", "origin/main"]);
        run_git(repo_path, &["branch", "--set-upstream-to=origin/main"]);

        for index in 0..5 {
            fs::write(repo_path.join("remote.txt"), format!("remote {index}\n"))
                .expect("remote file should be written");
            run_git(repo_path, &["add", "remote.txt"]);
            run_git(
                repo_path,
                &["commit", "-m", &format!("Remote commit {index}")],
            );
        }

        run_git(repo_path, &["branch", "-f", "origin/main", "HEAD"]);
        run_git(repo_path, &["reset", "--hard", "HEAD~5"]);

        let payload = super::get_repository_history_inner(
            repo_path.to_string_lossy().as_ref(),
            &SettingsState::default(),
            Some(2),
            None,
        )
        .expect("history payload");
        let pullable_count = payload
            .commits
            .iter()
            .filter(|commit| commit.sync_state == "pullable")
            .count();

        assert_eq!(pullable_count, 2);
    }

    #[test]
    fn sync_history_settings_state_cache_preserves_fresher_live_entry_for_same_key() {
        let state = SettingsState::default();
        let mut snapshot_cache = HashMap::new();

        state
            .mutate_github_identity_cache(|cache| {
                cache.insert(
                    "email:conflict@example.com".to_string(),
                    crate::settings::GitHubIdentityCacheRecord {
                        avatar_url: Some("https://example.com/live.png".to_string()),
                        stored_at_unix_seconds: 20,
                        username: Some("live-user".to_string()),
                    },
                );
            })
            .expect("seed live cache");
        snapshot_cache.insert(
            "email:conflict@example.com".to_string(),
            crate::settings::GitHubIdentityCacheRecord {
                avatar_url: Some("https://example.com/snapshot.png".to_string()),
                stored_at_unix_seconds: 10,
                username: Some("snapshot-user".to_string()),
            },
        );
        snapshot_cache.insert(
            "email:new@example.com".to_string(),
            crate::settings::GitHubIdentityCacheRecord {
                avatar_url: Some("https://example.com/new.png".to_string()),
                stored_at_unix_seconds: 15,
                username: Some("new-user".to_string()),
            },
        );

        super::sync_history_settings_state_cache(&state, snapshot_cache)
            .expect("sync should succeed");

        let cache = state
            .mutate_github_identity_cache(|cache| cache.clone())
            .expect("read merged cache");
        let conflict_entry = cache
            .get("email:conflict@example.com")
            .expect("conflict entry should exist");
        let new_entry = cache
            .get("email:new@example.com")
            .expect("new entry should exist");

        assert_eq!(conflict_entry.stored_at_unix_seconds, 20);
        assert_eq!(
            conflict_entry.avatar_url.as_deref(),
            Some("https://example.com/live.png")
        );
        assert_eq!(new_entry.stored_at_unix_seconds, 15);
        assert_eq!(new_entry.username.as_deref(), Some("new-user"));
    }

    #[tokio::test]
    async fn get_repository_history_with_state_updates_live_identity_cache_after_snapshot_work() {
        let repo = create_temp_git_repo_with_commit(
            "notes.txt",
            "hello\nworld\n",
            "Add detailed notes",
            Some("Wrap the body line.\n\nInclude follow-up context."),
        );
        let state = SettingsState::default();

        state
            .mutate_github_identity_cache(|cache| {
                cache.insert(
                    "seed@example.com".to_string(),
                    crate::settings::GitHubIdentityCacheRecord {
                        avatar_url: Some("https://example.com/avatar.png".to_string()),
                        stored_at_unix_seconds: 1,
                        username: Some("seed-user".to_string()),
                    },
                );
            })
            .expect("seed cache");

        let payload = super::get_repository_history_with_state(
            super::RepositoryHistoryRequest {
                repo_path: repo.path().to_string_lossy().to_string(),
                limit: None,
                cursor: None,
            },
            &state,
        )
        .await
        .expect("history payload");
        let cache = state
            .mutate_github_identity_cache(|cache| cache.clone())
            .expect("read synced cache");

        assert_eq!(payload.commits.len(), 1);
        assert_eq!(payload.commits[0].message_summary, "Add detailed notes");
        assert!(cache.contains_key("seed@example.com"));
        assert!(cache.contains_key("email:12345+litgit-tests@users.noreply.github.com"));
    }

    #[test]
    fn get_repository_history_tauri_command_updates_managed_state_cache() {
        let repo = create_temp_git_repo_with_commit(
            "notes.txt",
            "hello\nworld\n",
            "Add detailed notes",
            Some("Wrap the body line.\n\nInclude follow-up context."),
        );
        let app = tauri::test::mock_builder()
            .manage(SettingsState::default())
            .invoke_handler(tauri::generate_handler![super::get_repository_history])
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("history test app should build");
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .expect("history test webview should build");
        let managed_state = app.state::<SettingsState>();

        managed_state
            .mutate_github_identity_cache(
                |cache: &mut HashMap<String, crate::settings::GitHubIdentityCacheRecord>| {
                    cache.insert(
                        "seed@example.com".to_string(),
                        crate::settings::GitHubIdentityCacheRecord {
                            avatar_url: Some("https://example.com/avatar.png".to_string()),
                            stored_at_unix_seconds: 1,
                            username: Some("seed-user".to_string()),
                        },
                    );
                },
            )
            .expect("seed cache");

        let payload = tauri::test::get_ipc_response(
            &webview,
            tauri::webview::InvokeRequest {
                cmd: "get_repository_history".into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "http://tauri.localhost"
                    .parse()
                    .expect("valid tauri test URL"),
                body: tauri::ipc::InvokeBody::Json(json!({
                    "request": {
                        "repoPath": repo.path().to_string_lossy().to_string()
                    }
                })),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.to_string(),
            },
        )
        .expect("history IPC response")
        .deserialize::<serde_json::Value>()
        .expect("history payload JSON");
        let cache = managed_state
            .mutate_github_identity_cache(
                |cache: &mut HashMap<String, crate::settings::GitHubIdentityCacheRecord>| {
                    cache.clone()
                },
            )
            .expect("read synced cache");

        assert_eq!(payload["commits"].as_array().map(Vec::len), Some(1));
        assert_eq!(payload["hasMore"], false);
        assert_eq!(payload["nextCursor"], serde_json::Value::Null);
        assert_eq!(
            payload["commits"][0]["messageSummary"],
            "Add detailed notes"
        );
        assert!(cache.contains_key("seed@example.com"));
        assert!(cache.contains_key("email:12345+litgit-tests@users.noreply.github.com"));
    }

    #[tokio::test]
    async fn get_latest_repository_commit_message_parses_summary_and_description() {
        let repo = create_temp_git_repo_with_commit(
            "notes.txt",
            "hello\nworld\n",
            "Add detailed notes",
            Some("Wrap the body line.\n\nInclude follow-up context."),
        );

        let latest_message =
            super::get_latest_repository_commit_message(repo.path().to_string_lossy().to_string())
                .await
                .expect("latest commit message");

        assert_eq!(latest_message.summary, "Add detailed notes");
        assert_eq!(
            latest_message.description,
            "Wrap the body line.\n\nInclude follow-up context."
        );
    }

    #[tokio::test]
    async fn get_repository_commit_files_returns_rename_with_previous_path_and_stats() {
        let repo = create_temp_git_repo_with_renamed_file();
        let commit_hash = head_commit_hash(repo.path());

        let files = super::get_repository_commit_files(
            repo.path().to_string_lossy().to_string(),
            commit_hash,
        )
        .await
        .expect("commit files");

        assert_eq!(files.len(), 1);
        assert_eq!(files[0].status, "R");
        assert_eq!(files[0].path, "renamed.txt");
        assert_eq!(files[0].previous_path.as_deref(), Some("hello.txt"));
        assert_eq!(files[0].additions, 0);
        assert_eq!(files[0].deletions, 0);
    }

    #[tokio::test]
    async fn get_repository_commit_files_uses_first_parent_diff_for_merge_commits() {
        let repo = create_temp_git_repo_with_merge_commit();
        let commit_hash = head_commit_hash(repo.path());

        let files = super::get_repository_commit_files(
            repo.path().to_string_lossy().to_string(),
            commit_hash,
        )
        .await
        .expect("merge commit files");

        assert_eq!(files.len(), 1);
        assert_eq!(files[0].status, "A");
        assert_eq!(files[0].path, "feature.txt");
        assert_eq!(files[0].previous_path, None);
        assert_eq!(files[0].additions, 1);
        assert_eq!(files[0].deletions, 0);
    }
}
