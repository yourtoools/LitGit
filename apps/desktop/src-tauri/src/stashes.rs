use crate::git_support::{git_command, git_error_message, validate_git_repo};
use serde::Serialize;
use std::path::Path;
use thiserror::Error;

/// Error type for stash operations.
#[derive(Debug, Error)]
pub(crate) enum StashError {
    #[error("{0}")]
    Message(String),
    #[error("Failed to {action}: {source}")]
    GitCommand {
        action: &'static str,
        source: std::io::Error,
    },
}

impl From<StashError> for String {
    fn from(error: StashError) -> Self {
        error.to_string()
    }
}

/// A stash entry mapped from `git stash list`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryStash {
    anchor_commit_hash: String,
    message: String,
    r#ref: String,
    short_hash: String,
}

fn parse_stash_row(row: &str) -> Result<Option<RepositoryStash>, StashError> {
    let trimmed = row.trim();

    if trimmed.is_empty() {
        return Ok(None);
    }

    let mut parts = trimmed.split('\x1f');
    let stash_ref = parts
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            StashError::Message("Encountered stash entry without a reference".to_string())
        })?;
    let message = parts.next().map(str::trim).ok_or_else(|| {
        StashError::Message(format!("Failed to parse message for stash {stash_ref}"))
    })?;
    let short_hash = parts
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            StashError::Message(format!("Failed to parse short hash for stash {stash_ref}"))
        })?;
    let anchor_commit_hash = parts
        .next()
        .map(str::trim)
        .and_then(|value| value.split_whitespace().next())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            StashError::Message(format!(
                "Failed to resolve anchor commit for stash {stash_ref}"
            ))
        })?;

    Ok(Some(RepositoryStash {
        anchor_commit_hash: anchor_commit_hash.to_string(),
        message: message.to_string(),
        r#ref: stash_ref.to_string(),
        short_hash: short_hash.to_string(),
    }))
}

/// Returns all stash entries for the repository.
#[tauri::command]
pub(crate) fn get_repository_stashes(repo_path: String) -> Result<Vec<RepositoryStash>, String> {
    get_repository_stashes_inner(repo_path).map_err(|e| e.to_string())
}

fn get_repository_stashes_inner(repo_path: String) -> Result<Vec<RepositoryStash>, StashError> {
    validate_git_repo(Path::new(&repo_path)).map_err(|e| StashError::Message(e.to_string()))?;

    let output = git_command()
        .args([
            "-C",
            &repo_path,
            "stash",
            "list",
            "--format=%gd%x1f%gs%x1f%h%x1f%P%x1e",
        ])
        .output()
        .map_err(|error| StashError::GitCommand {
            action: "run git stash list",
            source: error,
        })?;

    if !output.status.success() {
        return Err(StashError::Message(git_error_message(
            &output.stderr,
            "Failed to read repository stashes",
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut stashes = Vec::new();
    for row in stdout.split('\x1e') {
        if let Some(stash) = parse_stash_row(row)? {
            stashes.push(stash);
        }
    }

    Ok(stashes)
}

/// Applies a stash entry without removing it from the stash stack.
#[tauri::command]
pub(crate) fn apply_repository_stash(repo_path: String, stash_ref: String) -> Result<(), String> {
    apply_repository_stash_inner(repo_path, stash_ref).map_err(|e| e.to_string())
}

fn apply_repository_stash_inner(repo_path: String, stash_ref: String) -> Result<(), StashError> {
    validate_git_repo(Path::new(&repo_path)).map_err(|e| StashError::Message(e.to_string()))?;

    let output = git_command()
        .args(["-C", &repo_path, "stash", "apply", &stash_ref])
        .output()
        .map_err(|error| StashError::GitCommand {
            action: "run git stash apply",
            source: error,
        })?;

    if !output.status.success() {
        return Err(StashError::Message(git_error_message(
            &output.stderr,
            "Failed to apply stash",
        )));
    }

    Ok(())
}

/// Applies a stash entry and removes it from the stash stack.
#[tauri::command]
pub(crate) fn pop_repository_stash(repo_path: String, stash_ref: String) -> Result<(), String> {
    pop_repository_stash_inner(repo_path, stash_ref).map_err(|e| e.to_string())
}

fn pop_repository_stash_inner(repo_path: String, stash_ref: String) -> Result<(), StashError> {
    validate_git_repo(Path::new(&repo_path)).map_err(|e| StashError::Message(e.to_string()))?;

    let output = git_command()
        .args(["-C", &repo_path, "stash", "pop", &stash_ref])
        .output()
        .map_err(|error| StashError::GitCommand {
            action: "run git stash pop",
            source: error,
        })?;

    if !output.status.success() {
        return Err(StashError::Message(git_error_message(
            &output.stderr,
            "Failed to pop stash",
        )));
    }

    Ok(())
}

/// Removes a stash entry from the stash stack.
#[tauri::command]
pub(crate) fn drop_repository_stash(repo_path: String, stash_ref: String) -> Result<(), String> {
    drop_repository_stash_inner(repo_path, stash_ref).map_err(|e| e.to_string())
}

fn drop_repository_stash_inner(repo_path: String, stash_ref: String) -> Result<(), StashError> {
    validate_git_repo(Path::new(&repo_path)).map_err(|e| StashError::Message(e.to_string()))?;

    let output = git_command()
        .args(["-C", &repo_path, "stash", "drop", &stash_ref])
        .output()
        .map_err(|error| StashError::GitCommand {
            action: "run git stash drop",
            source: error,
        })?;

    if !output.status.success() {
        return Err(StashError::Message(git_error_message(
            &output.stderr,
            "Failed to delete stash",
        )));
    }

    Ok(())
}

/// Creates a new stash entry, optionally including untracked files.
#[tauri::command]
pub(crate) fn create_repository_stash(
    repo_path: String,
    stash_message: Option<String>,
    include_untracked: bool,
) -> Result<(), String> {
    create_repository_stash_inner(repo_path, stash_message, include_untracked)
        .map_err(|error| error.to_string())
}

fn create_repository_stash_inner(
    repo_path: String,
    stash_message: Option<String>,
    include_untracked: bool,
) -> Result<(), StashError> {
    validate_git_repo(Path::new(&repo_path)).map_err(|e| StashError::Message(e.to_string()))?;

    let message_to_use = stash_message
        .as_deref()
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .map(ToOwned::to_owned)
        .map_or_else(
            || {
                let branch_output = git_command()
                    .args(["-C", &repo_path, "rev-parse", "--abbrev-ref", "HEAD"])
                    .output()
                    .map_err(|error| StashError::GitCommand {
                        action: "resolve current branch",
                        source: error,
                    })?;

                if !branch_output.status.success() {
                    return Err(StashError::Message(git_error_message(
                        &branch_output.stderr,
                        "Failed to resolve current branch",
                    )));
                }

                let branch_name = String::from_utf8_lossy(&branch_output.stdout)
                    .trim()
                    .to_string();

                let safe_branch_name = if branch_name.is_empty() {
                    "HEAD"
                } else {
                    branch_name.as_str()
                };

                Ok(format!("WIP on {safe_branch_name}"))
            },
            Ok,
        )?;

    let mut stash_command = git_command();
    stash_command.args(["-C", &repo_path, "stash", "push"]);

    if include_untracked {
        stash_command.arg("--include-untracked");
    }

    stash_command.args(["-m", &message_to_use]);

    let output = stash_command
        .output()
        .map_err(|error| StashError::GitCommand {
            action: "run git stash push",
            source: error,
        })?;

    if !output.status.success() {
        return Err(StashError::Message(git_error_message(
            &output.stderr,
            "Failed to create stash",
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{create_repository_stash, get_repository_stashes, parse_stash_row, StashError};
    use crate::git_support::git_command;
    use std::env;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn parse_stash_row_returns_error_when_reference_is_missing() {
        let Err(error) = parse_stash_row("\x1fExample stash\x1fabc123\x1fdeadbeef") else {
            panic!("stash rows without a reference should fail");
        };

        assert!(
            matches!(error, StashError::Message(msg) if msg == "Encountered stash entry without a reference")
        );
    }

    #[test]
    fn create_repository_stash_uses_default_branch_message_when_message_is_blank() {
        let repo_path = create_temp_repository();

        write_repo_file(&repo_path.path, "tracked.txt", "first version");
        git_in(&repo_path.path, &["add", "tracked.txt"]);
        git_in(&repo_path.path, &["commit", "-m", "Initial commit"]);

        write_repo_file(&repo_path.path, "tracked.txt", "updated version");

        create_repository_stash(
            repo_path.path.to_string_lossy().to_string(),
            Some("   ".to_string()),
            false,
        )
        .expect("stash should be created");

        let stashes = get_repository_stashes(repo_path.path.to_string_lossy().to_string())
            .expect("stash list");

        assert_eq!(stashes.len(), 1);
        assert_eq!(stashes[0].message, "On main: WIP on main");
        assert_eq!(stashes[0].r#ref, "stash@{0}");
        assert!(!stashes[0].anchor_commit_hash.is_empty());
        assert!(!stashes[0].short_hash.is_empty());
    }

    #[test]
    fn get_repository_stashes_returns_created_entry_after_stash_is_saved() {
        let repo_path = create_temp_repository();

        write_repo_file(&repo_path.path, "tracked.txt", "first version");
        git_in(&repo_path.path, &["add", "tracked.txt"]);
        git_in(&repo_path.path, &["commit", "-m", "Initial commit"]);

        write_repo_file(&repo_path.path, "tracked.txt", "updated version");

        create_repository_stash(
            repo_path.path.to_string_lossy().to_string(),
            Some("Example stash".to_string()),
            false,
        )
        .expect("stash should be created");

        let stashes = get_repository_stashes(repo_path.path.to_string_lossy().to_string())
            .expect("stash list");

        assert_eq!(stashes.len(), 1);
        assert_eq!(stashes[0].message, "On main: Example stash");
        assert_eq!(stashes[0].r#ref, "stash@{0}");
        assert!(!stashes[0].anchor_commit_hash.is_empty());
        assert!(!stashes[0].short_hash.is_empty());
    }

    fn create_temp_repository() -> TempRepository {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after unix epoch")
            .as_nanos();
        let repo_path = env::temp_dir().join(format!("litgit-stashes-test-{unique_suffix}"));

        fs::create_dir_all(&repo_path).expect("temp repo directory should be created");
        git_in(&repo_path, &["init", "-b", "main"]);
        git_in(&repo_path, &["config", "user.name", "LitGit Tests"]);
        git_in(&repo_path, &["config", "user.email", "tests@example.com"]);

        TempRepository { path: repo_path }
    }

    fn write_repo_file(repo_path: &Path, relative_path: &str, contents: &str) {
        let file_path = repo_path.join(relative_path);
        fs::write(file_path, contents).expect("repo file should be written");
    }

    fn git_in(repo_path: &Path, args: &[&str]) {
        let output = git_command()
            .args(["-C", repo_path.to_string_lossy().as_ref()])
            .args(args)
            .output()
            .expect("git command should run");

        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    struct TempRepository {
        path: PathBuf,
    }

    impl Drop for TempRepository {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}
