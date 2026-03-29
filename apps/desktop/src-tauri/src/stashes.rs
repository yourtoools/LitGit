use crate::git_support::{git_command, git_error_message, validate_git_repo};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryStash {
    anchor_commit_hash: String,
    message: String,
    r#ref: String,
    short_hash: String,
}

#[tauri::command]
pub(crate) fn get_repository_stashes(repo_path: String) -> Result<Vec<RepositoryStash>, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = git_command()
        .args([
            "-C",
            &repo_path,
            "stash",
            "list",
            "--format=%gd%x1f%gs%x1f%h%x1f%H%x1e",
        ])
        .output()
        .map_err(|error| format!("Failed to run git stash list: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to read repository stashes",
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    let stashes = stdout
        .split('\x1e')
        .filter_map(|row| {
            let trimmed = row.trim();

            if trimmed.is_empty() {
                return None;
            }

            let mut parts = trimmed.split('\x1f');
            let stash_ref = parts.next().unwrap_or("").trim().to_string();
            let message = parts.next().unwrap_or("").trim().to_string();
            let short_hash = parts.next().unwrap_or("").trim().to_string();
            let stash_hash = parts.next().unwrap_or("").trim().to_string();

            if stash_ref.is_empty() || stash_hash.is_empty() {
                return None;
            }

            let anchor_commit_output = git_command()
                .args(["-C", &repo_path, "rev-parse", &format!("{stash_hash}^1")])
                .output()
                .ok()?;

            if !anchor_commit_output.status.success() {
                return None;
            }

            let anchor_commit_hash = String::from_utf8_lossy(&anchor_commit_output.stdout)
                .trim()
                .to_string();

            if anchor_commit_hash.is_empty() {
                return None;
            }

            Some(RepositoryStash {
                anchor_commit_hash,
                message,
                r#ref: stash_ref,
                short_hash,
            })
        })
        .collect();

    Ok(stashes)
}

#[tauri::command]
pub(crate) fn apply_repository_stash(repo_path: String, stash_ref: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = git_command()
        .args(["-C", &repo_path, "stash", "apply", &stash_ref])
        .output()
        .map_err(|error| format!("Failed to run git stash apply: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(&output.stderr, "Failed to apply stash"));
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn pop_repository_stash(repo_path: String, stash_ref: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = git_command()
        .args(["-C", &repo_path, "stash", "pop", &stash_ref])
        .output()
        .map_err(|error| format!("Failed to run git stash pop: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(&output.stderr, "Failed to pop stash"));
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn drop_repository_stash(repo_path: String, stash_ref: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = git_command()
        .args(["-C", &repo_path, "stash", "drop", &stash_ref])
        .output()
        .map_err(|error| format!("Failed to run git stash drop: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(&output.stderr, "Failed to delete stash"));
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn create_repository_stash(
    repo_path: String,
    stash_message: Option<String>,
    include_untracked: bool,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let message_to_use = stash_message
        .as_deref()
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .map(ToOwned::to_owned)
        .map(Ok)
        .unwrap_or_else(|| {
            let branch_output = git_command()
                .args(["-C", &repo_path, "rev-parse", "--abbrev-ref", "HEAD"])
                .output()
                .map_err(|error| format!("Failed to resolve current branch: {error}"))?;

            if !branch_output.status.success() {
                return Err(git_error_message(
                    &branch_output.stderr,
                    "Failed to resolve current branch",
                ));
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
        })?;

    let mut stash_command = git_command();
    stash_command.args(["-C", &repo_path, "stash", "push"]);

    if include_untracked {
        stash_command.arg("--include-untracked");
    }

    stash_command.args(["-m", &message_to_use]);

    let output = stash_command
        .output()
        .map_err(|error| format!("Failed to run git stash push: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(&output.stderr, "Failed to create stash"));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{create_repository_stash, get_repository_stashes};
    use crate::git_support::git_command;
    use std::env;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

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
