use crate::commit_messages::{resolve_commit_identity_for_history, GitHubIdentity};
use crate::git_support::{git_command, git_error_message, validate_git_repo};
use crate::settings::SettingsState;
use serde::Serialize;
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// Commit history payload returned to the frontend.
pub(crate) struct RepositoryHistoryPayload {
    commits: Vec<RepositoryCommit>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// Latest commit message split into summary and description.
pub(crate) struct LatestRepositoryCommitMessage {
    summary: String,
    description: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
/// A single file touched by a commit, including rename and line stats.
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
    let parents_output = git_command()
        .args([
            "-C",
            repo_path,
            "rev-list",
            "--parents",
            "-n",
            "1",
            commit_hash,
        ])
        .output()
        .map_err(|error| HistoryError::io("inspect commit parents", error))?;

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
) -> Result<Vec<RepositoryCommit>, HistoryError> {
    let mut command = git_command();
    command.args([
        "-C",
        repo_path,
        "log",
        "--decorate=short",
        "--date=iso-strict",
        "--topo-order",
        "--max-count=150",
        "--pretty=format:%H%x1f%h%x1f%P%x1f%s%x1f%b%x1f%B%x1f%an%x1f%ae%x1f%ad%x1f%D%x1e",
    ]);
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
    let output = git_command()
        .args([
            "-C",
            repo_path,
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ])
        .output()
        .map_err(|error| HistoryError::io("resolve branch upstream", error))?;

    if !output.status.success() {
        return Ok(None);
    }

    let upstream_ref = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if upstream_ref.is_empty() {
        return Ok(None);
    }

    Ok(Some(upstream_ref))
}

// Tauri command arguments mirror the frontend invoke payload.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Returns local history plus pullable upstream commits for the current repository.
pub(crate) fn get_repository_history(
    repo_path: String,
    state: State<'_, SettingsState>,
) -> Result<RepositoryHistoryPayload, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let mut commit_identity_cache = HashMap::new();
    let local_commits = load_repository_history_segment(
        &repo_path,
        &state,
        &mut commit_identity_cache,
        "normal",
        &["HEAD"],
    )
    .map_err(|error| error.to_string())?;
    let pullable_commits = if let Some(upstream_ref) =
        resolve_repository_upstream_ref(&repo_path).map_err(|error| error.to_string())?
    {
        load_repository_history_segment(
            &repo_path,
            &state,
            &mut commit_identity_cache,
            "pullable",
            &[upstream_ref.as_str(), "--not", "HEAD"],
        )
        .map_err(|error| error.to_string())?
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

    Ok(RepositoryHistoryPayload { commits })
}

// Tauri command arguments mirror the frontend invoke payload.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Returns the latest commit message for the current repository HEAD.
pub(crate) fn get_latest_repository_commit_message(
    repo_path: String,
) -> Result<LatestRepositoryCommitMessage, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = git_command()
        .args(["-C", &repo_path, "log", "-1", "--pretty=format:%s%x1f%b"])
        .output()
        .map_err(|error| format!("Failed to run git log: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to read latest commit message",
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut parts = stdout.splitn(2, '\x1f');
    let summary = parts.next().unwrap_or("").trim().to_string();

    if summary.is_empty() {
        return Err("No commit message available".to_string());
    }

    let description = parts.next().unwrap_or("").trim().to_string();

    Ok(LatestRepositoryCommitMessage {
        summary,
        description,
    })
}

// Tauri command arguments mirror the frontend invoke payload.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Returns changed files for a commit, including status and line-level change counts.
pub(crate) fn get_repository_commit_files(
    repo_path: String,
    commit_hash: String,
) -> Result<Vec<RepositoryCommitFile>, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let (first_parent, is_merge_commit) =
        inspect_commit_parents(&repo_path, &commit_hash).map_err(|error| error.to_string())?;
    let name_status_output = load_commit_file_change_output(
        &repo_path,
        &commit_hash,
        if is_merge_commit {
            first_parent.as_deref()
        } else {
            None
        },
        "--name-status",
    )
    .map_err(|error| error.to_string())?;

    if !name_status_output.status.success() {
        return Err(git_error_message(
            &name_status_output.stderr,
            "Failed to load commit file list",
        ));
    }

    let numstat_output = load_commit_file_change_output(
        &repo_path,
        &commit_hash,
        if is_merge_commit {
            first_parent.as_deref()
        } else {
            None
        },
        "--numstat",
    )
    .map_err(|error| error.to_string())?;

    if !numstat_output.status.success() {
        return Err(git_error_message(
            &numstat_output.stderr,
            "Failed to load commit file statistics",
        ));
    }

    let numstat_by_path = parse_numstat_output(&numstat_output.stdout);
    parse_name_status_output(&name_status_output.stdout, &numstat_by_path)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        parse_name_status_output, parse_numstat_output, parse_repository_history_stdout,
        resolve_repository_upstream_ref, HistoryError,
    };
    use crate::settings::SettingsState;
    use std::collections::HashMap;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::{Command, Output};
    use std::time::{SystemTime, UNIX_EPOCH};

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
    fn get_latest_repository_commit_message_parses_summary_and_description() {
        let repo = create_temp_git_repo_with_commit(
            "notes.txt",
            "hello\nworld\n",
            "Add detailed notes",
            Some("Wrap the body line.\n\nInclude follow-up context."),
        );

        let latest_message =
            super::get_latest_repository_commit_message(repo.path().to_string_lossy().to_string())
                .expect("latest commit message");

        assert_eq!(latest_message.summary, "Add detailed notes");
        assert_eq!(
            latest_message.description,
            "Wrap the body line.\n\nInclude follow-up context."
        );
    }

    #[test]
    fn get_repository_commit_files_returns_rename_with_previous_path_and_stats() {
        let repo = create_temp_git_repo_with_renamed_file();
        let commit_hash = head_commit_hash(repo.path());

        let files = super::get_repository_commit_files(
            repo.path().to_string_lossy().to_string(),
            commit_hash,
        )
        .expect("commit files");

        assert_eq!(files.len(), 1);
        assert_eq!(files[0].status, "R");
        assert_eq!(files[0].path, "renamed.txt");
        assert_eq!(files[0].previous_path.as_deref(), Some("hello.txt"));
        assert_eq!(files[0].additions, 0);
        assert_eq!(files[0].deletions, 0);
    }

    #[test]
    fn get_repository_commit_files_uses_first_parent_diff_for_merge_commits() {
        let repo = create_temp_git_repo_with_merge_commit();
        let commit_hash = head_commit_hash(repo.path());

        let files = super::get_repository_commit_files(
            repo.path().to_string_lossy().to_string(),
            commit_hash,
        )
        .expect("merge commit files");

        assert_eq!(files.len(), 1);
        assert_eq!(files[0].status, "A");
        assert_eq!(files[0].path, "feature.txt");
        assert_eq!(files[0].previous_path, None);
        assert_eq!(files[0].additions, 1);
        assert_eq!(files[0].deletions, 0);
    }
}
