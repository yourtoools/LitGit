use crate::git_support::{
    ensure_git_output_success, git_command, git_error_message, run_git_output, validate_git_repo,
    GitSupportError,
};
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

fn map_git_support_error(error: GitSupportError) -> StashError {
    match error {
        GitSupportError::Io { action, source } => StashError::GitCommand { action, source },
        GitSupportError::Message(message) => StashError::Message(message),
    }
}

fn run_repo_git_output(
    repo_path: &str,
    args: &[&str],
    action: &'static str,
) -> Result<std::process::Output, StashError> {
    run_git_output(repo_path, args, action).map_err(map_git_support_error)
}

fn ensure_output_success(output: &std::process::Output, fallback: &str) -> Result<(), StashError> {
    ensure_git_output_success(output, fallback).map_err(map_git_support_error)
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
pub(crate) async fn get_repository_stashes(
    repo_path: String,
) -> Result<Vec<RepositoryStash>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        get_repository_stashes_inner(repo_path).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to read repository stashes: {error}"))?
}

fn get_repository_stashes_inner(repo_path: String) -> Result<Vec<RepositoryStash>, StashError> {
    validate_git_repo(Path::new(&repo_path)).map_err(|e| StashError::Message(e.to_string()))?;

    let output = run_repo_git_output(
        &repo_path,
        &["stash", "list", "--format=%gd%x1f%gs%x1f%h%x1f%P%x1e"],
        "run git stash list",
    )?;
    ensure_output_success(&output, "Failed to read repository stashes")?;

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
pub(crate) async fn apply_repository_stash(
    repo_path: String,
    stash_ref: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        apply_repository_stash_inner(repo_path, stash_ref).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to apply stash: {error}"))?
}

fn apply_repository_stash_inner(repo_path: String, stash_ref: String) -> Result<(), StashError> {
    validate_git_repo(Path::new(&repo_path)).map_err(|e| StashError::Message(e.to_string()))?;

    let output = run_repo_git_output(
        &repo_path,
        &["stash", "apply", &stash_ref],
        "run git stash apply",
    )?;
    ensure_output_success(&output, "Failed to apply stash")?;

    Ok(())
}

/// Applies a stash entry and removes it from the stash stack.
#[tauri::command]
pub(crate) async fn pop_repository_stash(
    repo_path: String,
    stash_ref: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        pop_repository_stash_inner(repo_path, stash_ref).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to pop stash: {error}"))?
}

fn pop_repository_stash_inner(repo_path: String, stash_ref: String) -> Result<(), StashError> {
    validate_git_repo(Path::new(&repo_path)).map_err(|e| StashError::Message(e.to_string()))?;

    let output = run_repo_git_output(
        &repo_path,
        &["stash", "pop", &stash_ref],
        "run git stash pop",
    )?;
    ensure_output_success(&output, "Failed to pop stash")?;

    Ok(())
}

/// Removes a stash entry from the stash stack.
#[tauri::command]
pub(crate) async fn drop_repository_stash(
    repo_path: String,
    stash_ref: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        drop_repository_stash_inner(repo_path, stash_ref).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to drop stash: {error}"))?
}

fn drop_repository_stash_inner(repo_path: String, stash_ref: String) -> Result<(), StashError> {
    validate_git_repo(Path::new(&repo_path)).map_err(|e| StashError::Message(e.to_string()))?;

    let output = run_repo_git_output(
        &repo_path,
        &["stash", "drop", &stash_ref],
        "run git stash drop",
    )?;
    ensure_output_success(&output, "Failed to delete stash")?;

    Ok(())
}

/// Creates a new stash entry, optionally including untracked files.
#[tauri::command]
pub(crate) async fn create_repository_stash(
    repo_path: String,
    stash_message: Option<String>,
    include_untracked: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        create_repository_stash_inner(repo_path, stash_message, include_untracked)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to create stash: {error}"))?
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
                let branch_output = run_repo_git_output(
                    &repo_path,
                    &["rev-parse", "--abbrev-ref", "HEAD"],
                    "resolve current branch",
                )?;

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
    use super::{
        apply_repository_stash, create_repository_stash, drop_repository_stash,
        get_repository_stashes, parse_stash_row, pop_repository_stash, StashError,
    };
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

    #[tokio::test]
    async fn create_repository_stash_uses_default_branch_message_when_message_is_blank() {
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
        .await
        .expect("stash should be created");

        let stashes = get_repository_stashes(repo_path.path.to_string_lossy().to_string())
            .await
            .expect("stash list");

        assert_eq!(stashes.len(), 1);
        assert_eq!(stashes[0].message, "On main: WIP on main");
        assert_eq!(stashes[0].r#ref, "stash@{0}");
        assert!(!stashes[0].anchor_commit_hash.is_empty());
        assert!(!stashes[0].short_hash.is_empty());
    }

    #[tokio::test]
    async fn get_repository_stashes_returns_created_entry_after_stash_is_saved() {
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
        .await
        .expect("stash should be created");

        let stashes = get_repository_stashes(repo_path.path.to_string_lossy().to_string())
            .await
            .expect("stash list");

        assert_eq!(stashes.len(), 1);
        assert_eq!(stashes[0].message, "On main: Example stash");
        assert_eq!(stashes[0].r#ref, "stash@{0}");
        assert!(!stashes[0].anchor_commit_hash.is_empty());
        assert!(!stashes[0].short_hash.is_empty());
    }

    #[tokio::test]
    async fn apply_repository_stash_restores_changes_without_dropping_entry() {
        let repo_path = create_temp_repository();
        write_repo_file(&repo_path.path, "tracked.txt", "first version");
        git_in(&repo_path.path, &["add", "tracked.txt"]);
        git_in(&repo_path.path, &["commit", "-m", "Initial commit"]);
        write_repo_file(&repo_path.path, "tracked.txt", "updated version");

        create_repository_stash(
            repo_path.path.to_string_lossy().to_string(),
            Some("Apply stash".to_string()),
            false,
        )
        .await
        .expect("stash should be created");

        apply_repository_stash(
            repo_path.path.to_string_lossy().to_string(),
            "stash@{0}".to_string(),
        )
        .await
        .expect("stash should apply");

        let stashes = get_repository_stashes(repo_path.path.to_string_lossy().to_string())
            .await
            .expect("stash list");

        assert_eq!(
            fs::read_to_string(repo_path.path.join("tracked.txt")).expect("read tracked"),
            "updated version"
        );
        assert_eq!(stashes.len(), 1);
        assert_eq!(stashes[0].r#ref, "stash@{0}");
    }

    #[tokio::test]
    async fn pop_repository_stash_restores_changes_and_removes_entry() {
        let repo_path = create_temp_repository();
        write_repo_file(&repo_path.path, "tracked.txt", "first version");
        git_in(&repo_path.path, &["add", "tracked.txt"]);
        git_in(&repo_path.path, &["commit", "-m", "Initial commit"]);
        write_repo_file(&repo_path.path, "tracked.txt", "updated version");

        create_repository_stash(
            repo_path.path.to_string_lossy().to_string(),
            Some("Pop stash".to_string()),
            false,
        )
        .await
        .expect("stash should be created");

        pop_repository_stash(
            repo_path.path.to_string_lossy().to_string(),
            "stash@{0}".to_string(),
        )
        .await
        .expect("stash should pop");

        let stashes = get_repository_stashes(repo_path.path.to_string_lossy().to_string())
            .await
            .expect("stash list");

        assert_eq!(
            fs::read_to_string(repo_path.path.join("tracked.txt")).expect("read tracked"),
            "updated version"
        );
        assert!(stashes.is_empty(), "stash should be removed");
    }

    #[tokio::test]
    async fn drop_repository_stash_removes_entry_without_applying_changes() {
        let repo_path = create_temp_repository();
        write_repo_file(&repo_path.path, "tracked.txt", "first version");
        git_in(&repo_path.path, &["add", "tracked.txt"]);
        git_in(&repo_path.path, &["commit", "-m", "Initial commit"]);
        write_repo_file(&repo_path.path, "tracked.txt", "updated version");

        create_repository_stash(
            repo_path.path.to_string_lossy().to_string(),
            Some("Drop stash".to_string()),
            false,
        )
        .await
        .expect("stash should be created");

        drop_repository_stash(
            repo_path.path.to_string_lossy().to_string(),
            "stash@{0}".to_string(),
        )
        .await
        .expect("stash should drop");

        let stashes = get_repository_stashes(repo_path.path.to_string_lossy().to_string())
            .await
            .expect("stash list");

        assert_eq!(
            fs::read_to_string(repo_path.path.join("tracked.txt")).expect("read tracked"),
            "first version"
        );
        assert!(stashes.is_empty(), "stash should be removed");
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
