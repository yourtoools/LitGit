use crate::commit_messages::{resolve_commit_identity, GitHubIdentity};
use crate::git_support::{git_command, git_error_message, validate_git_repo};
use crate::settings::SettingsState;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use tauri::State;

#[derive(Serialize)]
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
pub(crate) struct RepositoryHistoryPayload {
    commits: Vec<RepositoryCommit>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LatestRepositoryCommitMessage {
    summary: String,
    description: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryCommitFile {
    status: String,
    path: String,
    previous_path: Option<String>,
    additions: usize,
    deletions: usize,
}

fn load_repository_history_segment(
    repo_path: &str,
    state: &SettingsState,
    commit_identity_cache: &mut HashMap<String, GitHubIdentity>,
    sync_state: &str,
    revision_args: &[&str],
) -> Result<Vec<RepositoryCommit>, String> {
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
        .map_err(|error| format!("Failed to run git log: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to read repository history".to_string()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    Ok(stdout
        .split('\x1e')
        .filter_map(|row| {
            let trimmed = row.trim();

            if trimmed.is_empty() {
                return None;
            }

            let mut parts = trimmed.split('\x1f');

            let hash = parts.next()?.to_string();
            let short_hash = parts.next()?.to_string();
            let parents_raw = parts.next()?.to_string();
            let message_summary = parts.next().unwrap_or("").trim().to_string();
            let message_description = parts.next().unwrap_or("").trim().to_string();
            let message = parts.next()?.to_string();
            let author = parts.next()?.to_string();
            let author_email_raw = parts.next().unwrap_or("").trim().to_string();
            let author_email = if author_email_raw.is_empty() {
                None
            } else {
                Some(author_email_raw)
            };
            let github_identity = match author_email.as_deref() {
                Some(email) => commit_identity_cache
                    .entry(email.to_string())
                    .or_insert_with(|| resolve_commit_identity(state, email, &author))
                    .clone(),
                None => {
                    if !author.trim().is_empty() {
                        commit_identity_cache
                            .entry(author.clone())
                            .or_insert_with(|| resolve_commit_identity(state, "", &author))
                            .clone()
                    } else {
                        GitHubIdentity::default()
                    }
                }
            };
            let date = parts.next()?.to_string();
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

            Some(RepositoryCommit {
                hash,
                short_hash,
                parent_hashes,
                message,
                message_summary,
                message_description,
                author,
                author_email: author_email.clone(),
                author_username: github_identity.username,
                author_avatar_url: github_identity.avatar_url,
                date,
                refs,
                sync_state: sync_state.to_string(),
            })
        })
        .collect())
}

fn resolve_repository_upstream_ref(repo_path: &str) -> Result<Option<String>, String> {
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
        .map_err(|error| format!("Failed to resolve branch upstream: {error}"))?;

    if !output.status.success() {
        return Ok(None);
    }

    let upstream_ref = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if upstream_ref.is_empty() {
        return Ok(None);
    }

    Ok(Some(upstream_ref))
}

#[tauri::command]
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
    )?;
    let pullable_commits = if let Some(upstream_ref) = resolve_repository_upstream_ref(&repo_path)?
    {
        load_repository_history_segment(
            &repo_path,
            &state,
            &mut commit_identity_cache,
            "pullable",
            &[upstream_ref.as_str(), "--not", "HEAD"],
        )?
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

#[tauri::command]
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

#[tauri::command]
pub(crate) fn get_repository_commit_files(
    repo_path: String,
    commit_hash: String,
) -> Result<Vec<RepositoryCommitFile>, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let parents_output = git_command()
        .args([
            "-C",
            &repo_path,
            "rev-list",
            "--parents",
            "-n",
            "1",
            &commit_hash,
        ])
        .output()
        .map_err(|error| format!("Failed to inspect commit parents: {error}"))?;

    if !parents_output.status.success() {
        return Err(git_error_message(
            &parents_output.stderr,
            "Failed to inspect commit parents",
        ));
    }

    let parents_stdout = String::from_utf8_lossy(&parents_output.stdout);
    let parent_tokens: Vec<&str> = parents_stdout.split_whitespace().collect();
    let first_parent = parent_tokens.get(1).map(|parent| (*parent).to_string());
    let is_merge_commit = parent_tokens.len() > 2;

    let name_status_output = if is_merge_commit {
        let parent_hash = first_parent
            .clone()
            .ok_or_else(|| "Failed to resolve first parent for merge commit".to_string())?;

        git_command()
            .args([
                "-C",
                &repo_path,
                "diff",
                "--name-status",
                "--find-renames",
                "--find-copies",
                "-z",
                &parent_hash,
                &commit_hash,
            ])
            .output()
            .map_err(|error| format!("Failed to run git diff for commit files: {error}"))?
    } else {
        git_command()
            .args([
                "-C",
                &repo_path,
                "show",
                "--pretty=format:",
                "--name-status",
                "--find-renames",
                "--find-copies",
                "-z",
                &commit_hash,
            ])
            .output()
            .map_err(|error| format!("Failed to run git show for commit files: {error}"))?
    };

    if !name_status_output.status.success() {
        return Err(git_error_message(
            &name_status_output.stderr,
            "Failed to load commit file list",
        ));
    }

    let numstat_output = if is_merge_commit {
        let parent_hash = first_parent
            .clone()
            .ok_or_else(|| "Failed to resolve first parent for merge commit".to_string())?;

        git_command()
            .args([
                "-C",
                &repo_path,
                "diff",
                "--numstat",
                "--find-renames",
                "--find-copies",
                "-z",
                &parent_hash,
                &commit_hash,
            ])
            .output()
            .map_err(|error| format!("Failed to run git diff --numstat: {error}"))?
    } else {
        git_command()
            .args([
                "-C",
                &repo_path,
                "show",
                "--pretty=format:",
                "--numstat",
                "--find-renames",
                "--find-copies",
                "-z",
                &commit_hash,
            ])
            .output()
            .map_err(|error| format!("Failed to run git show --numstat: {error}"))?
    };

    if !numstat_output.status.success() {
        return Err(git_error_message(
            &numstat_output.stderr,
            "Failed to load commit file statistics",
        ));
    }

    let parse_numstat_count =
        |bytes: &[u8]| -> usize { String::from_utf8_lossy(bytes).parse::<usize>().unwrap_or(0) };

    let mut numstat_by_path: HashMap<String, (usize, usize)> = HashMap::new();
    let numstat_bytes = &numstat_output.stdout;
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

            let Some(previous_path_end) = numstat_bytes[cursor..]
                .iter()
                .position(|byte| *byte == b'\0')
                .map(|offset| cursor + offset)
            else {
                break;
            };
            let previous_path =
                String::from_utf8_lossy(&numstat_bytes[cursor..previous_path_end]).to_string();
            cursor = previous_path_end + 1;

            let Some(path_end) = numstat_bytes[cursor..]
                .iter()
                .position(|byte| *byte == b'\0')
                .map(|offset| cursor + offset)
            else {
                break;
            };
            let path = String::from_utf8_lossy(&numstat_bytes[cursor..path_end]).to_string();
            cursor = path_end + 1;

            numstat_by_path.insert(previous_path, (additions, deletions));
            numstat_by_path.insert(path, (additions, deletions));
            continue;
        }

        let Some(path_end) = numstat_bytes[cursor..]
            .iter()
            .position(|byte| *byte == b'\0')
            .map(|offset| cursor + offset)
        else {
            break;
        };
        let path = String::from_utf8_lossy(&numstat_bytes[cursor..path_end]).to_string();
        cursor = path_end + 1;

        numstat_by_path.insert(path, (additions, deletions));
    }

    let mut files = Vec::new();
    let mut name_status_fields = name_status_output
        .stdout
        .split(|byte| *byte == b'\0')
        .filter(|field| !field.is_empty());

    while let Some(status_field) = name_status_fields.next() {
        let status_token = String::from_utf8_lossy(status_field);
        let status_char = status_token.chars().next().unwrap_or('M');
        let status = status_char.to_string();

        let (path, previous_path) = if status_char == 'R' || status_char == 'C' {
            let Some(previous_path_field) = name_status_fields.next() else {
                break;
            };
            let Some(path_field) = name_status_fields.next() else {
                break;
            };

            (
                String::from_utf8_lossy(path_field).to_string(),
                Some(String::from_utf8_lossy(previous_path_field).to_string()),
            )
        } else {
            let Some(path_field) = name_status_fields.next() else {
                break;
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

#[cfg(test)]
mod tests {
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

        run_git(&repo_path, &["add", file_name]);

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
        assert!(!commits[0].message_summary.is_empty());
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
}
