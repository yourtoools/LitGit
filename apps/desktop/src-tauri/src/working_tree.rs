use crate::git_support::{git_command, git_error_message, validate_git_repo};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryWorkingTreeStatus {
    has_changes: bool,
    staged_count: usize,
    unstaged_count: usize,
    untracked_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryWorkingTreeItem {
    path: String,
    staged_status: String,
    unstaged_status: String,
    is_untracked: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryFileEntry {
    path: String,
}

#[tauri::command]
pub(crate) fn stage_all_repository_changes(repo_path: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = git_command()
        .args(["-C", &repo_path, "add", "-A"])
        .output()
        .map_err(|error| format!("Failed to run git add: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to stage all changes".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn unstage_all_repository_changes(repo_path: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = git_command()
        .args(["-C", &repo_path, "reset", "HEAD", "--", "."])
        .output()
        .map_err(|error| format!("Failed to run git reset: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to unstage all changes".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn stage_repository_file(repo_path: String, file_path: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = git_command()
        .args(["-C", &repo_path, "add", "-A", "--", &file_path])
        .output()
        .map_err(|error| format!("Failed to run git add: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to stage file".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn unstage_repository_file(repo_path: String, file_path: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = git_command()
        .args(["-C", &repo_path, "reset", "HEAD", "--", &file_path])
        .output()
        .map_err(|error| format!("Failed to run git reset: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to unstage file".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn add_repository_ignore_rule(repo_path: String, pattern: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_pattern = pattern.trim();
    if trimmed_pattern.is_empty() {
        return Err("Ignore rule cannot be empty".to_string());
    }

    let gitignore_path = Path::new(&repo_path).join(".gitignore");
    let mut existing_contents = fs::read_to_string(&gitignore_path).unwrap_or_default();

    if existing_contents
        .lines()
        .any(|line| line.trim() == trimmed_pattern)
    {
        return Ok(());
    }

    if !existing_contents.is_empty() && !existing_contents.ends_with('\n') {
        existing_contents.push('\n');
    }

    existing_contents.push_str(trimmed_pattern);
    existing_contents.push('\n');

    fs::write(&gitignore_path, existing_contents)
        .map_err(|error| format!("Failed to update .gitignore: {error}"))?;

    Ok(())
}

#[tauri::command]
pub(crate) fn discard_repository_path_changes(
    repo_path: String,
    file_path: String,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let restore_output = git_command()
        .args([
            "-C",
            &repo_path,
            "restore",
            "--source=HEAD",
            "--staged",
            "--worktree",
            "--",
            &file_path,
        ])
        .output()
        .map_err(|error| format!("Failed to run git restore: {error}"))?;

    if restore_output.status.success() {
        return Ok(());
    }

    let clean_output = git_command()
        .args(["-C", &repo_path, "clean", "-fd", "--", &file_path])
        .output()
        .map_err(|error| format!("Failed to run git clean: {error}"))?;

    if clean_output.status.success() {
        return Ok(());
    }

    let restore_stderr = String::from_utf8_lossy(&restore_output.stderr)
        .trim()
        .to_string();
    if !restore_stderr.is_empty() {
        return Err(restore_stderr);
    }

    let clean_stderr = String::from_utf8_lossy(&clean_output.stderr)
        .trim()
        .to_string();
    if !clean_stderr.is_empty() {
        return Err(clean_stderr);
    }

    Err("Failed to discard changes".to_string())
}

#[tauri::command]
pub(crate) fn discard_all_repository_changes(repo_path: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let reset_output = git_command()
        .args(["-C", &repo_path, "reset", "--hard", "HEAD"])
        .output()
        .map_err(|error| format!("Failed to run git reset --hard: {error}"))?;

    if !reset_output.status.success() {
        let stderr = String::from_utf8_lossy(&reset_output.stderr)
            .trim()
            .to_string();

        if !stderr.is_empty() {
            return Err(stderr);
        }

        return Err("Failed to discard tracked changes".to_string());
    }

    let clean_output = git_command()
        .args(["-C", &repo_path, "clean", "-fd"])
        .output()
        .map_err(|error| format!("Failed to run git clean: {error}"))?;

    if !clean_output.status.success() {
        let stderr = String::from_utf8_lossy(&clean_output.stderr)
            .trim()
            .to_string();

        if !stderr.is_empty() {
            return Err(stderr);
        }

        return Err("Failed to discard untracked changes".to_string());
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn reset_repository_to_reference(
    repo_path: String,
    target: String,
    mode: Option<String>,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let target_trimmed = target.trim();

    if target_trimmed.is_empty() {
        return Err("Reset target is required".to_string());
    }

    let normalized_mode = mode
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("mixed");

    let mode_flag = match normalized_mode {
        "hard" => "--hard",
        "soft" => "--soft",
        _ => "--mixed",
    };

    let output = git_command()
        .args(["-C", &repo_path, "reset", mode_flag, target_trimmed])
        .output()
        .map_err(|error| format!("Failed to run git reset: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to reset repository".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn get_repository_working_tree_status(
    repo_path: String,
) -> Result<RepositoryWorkingTreeStatus, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = git_command()
        .args([
            "-C",
            &repo_path,
            "status",
            "--porcelain",
            "--untracked-files=all",
        ])
        .output()
        .map_err(|error| format!("Failed to run git status: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to read repository status".to_string()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut staged_count = 0;
    let mut unstaged_count = 0;
    let mut untracked_count = 0;

    for row in stdout.lines() {
        if row.len() < 2 {
            continue;
        }

        let mut chars = row.chars();
        let x = chars.next().unwrap_or(' ');
        let y = chars.next().unwrap_or(' ');

        if x == '?' && y == '?' {
            untracked_count += 1;
            continue;
        }

        if x != ' ' {
            staged_count += 1;
        }

        if y != ' ' {
            unstaged_count += 1;
        }
    }

    Ok(RepositoryWorkingTreeStatus {
        has_changes: staged_count + unstaged_count + untracked_count > 0,
        staged_count,
        unstaged_count,
        untracked_count,
    })
}

#[tauri::command]
pub(crate) fn get_repository_working_tree_items(
    repo_path: String,
) -> Result<Vec<RepositoryWorkingTreeItem>, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = git_command()
        .args([
            "-C",
            &repo_path,
            "status",
            "--porcelain",
            "--untracked-files=all",
        ])
        .output()
        .map_err(|error| format!("Failed to run git status: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to read repository status items".to_string()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    let items = stdout
        .lines()
        .filter_map(|row| {
            if row.len() < 3 {
                return None;
            }

            let mut chars = row.chars();
            let staged = chars.next().unwrap_or(' ');
            let unstaged = chars.next().unwrap_or(' ');
            let path = row.get(3..).unwrap_or("").trim().replace(" -> ", " -> ");

            if path.is_empty() {
                return None;
            }

            let is_untracked = staged == '?' && unstaged == '?';

            Some(RepositoryWorkingTreeItem {
                path,
                staged_status: staged.to_string(),
                unstaged_status: unstaged.to_string(),
                is_untracked,
            })
        })
        .collect();

    Ok(items)
}

#[tauri::command]
pub(crate) fn get_repository_files(repo_path: String) -> Result<Vec<RepositoryFileEntry>, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = git_command()
        .args([
            "-C",
            &repo_path,
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
        ])
        .output()
        .map_err(|error| format!("Failed to run git ls-files: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to list repository files",
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut seen_paths = HashSet::new();
    let mut entries = Vec::new();

    for line in stdout.lines() {
        let trimmed = line.trim();

        if trimmed.is_empty() || !seen_paths.insert(trimmed.to_string()) {
            continue;
        }

        entries.push(RepositoryFileEntry {
            path: trimmed.to_string(),
        });
    }

    Ok(entries)
}

#[cfg(test)]
mod tests {
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
        let output = run_git_output(repo_path, args);

        assert!(
            output.status.success(),
            "git command failed: git -C {repo_path:?} {args:?}\nstdout: {}\nstderr: {}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
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
        let repo_path =
            std::env::temp_dir().join(format!("litgit-working-tree-test-{unique_suffix}"));

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

    fn create_temp_git_repo_with_commit(file_name: &str, file_contents: &str) -> TempGitRepo {
        let repo = create_temp_git_repo();
        fs::write(repo.path().join(file_name), file_contents).expect("test file should be written");
        run_git(repo.path(), &["add", file_name]);
        run_git(repo.path(), &["commit", "-m", "Initial commit"]);
        repo
    }

    #[test]
    fn get_repository_working_tree_status_returns_one_untracked_file_when_repo_has_new_file() {
        let repo = create_temp_git_repo();
        fs::write(repo.path().join("notes.txt"), "draft").expect("write");

        let status = super::get_repository_working_tree_status(repo.path().display().to_string())
            .expect("status");

        assert!(status.has_changes);
        assert_eq!(status.untracked_count, 1);
        assert_eq!(status.staged_count, 0);
        assert_eq!(status.unstaged_count, 0);
    }

    #[test]
    fn get_repository_working_tree_items_returns_modified_tracked_file() {
        let repo = create_temp_git_repo_with_commit("notes.txt", "original\n");
        fs::write(repo.path().join("notes.txt"), "updated\n").expect("write");

        let items = super::get_repository_working_tree_items(repo.path().display().to_string())
            .expect("items");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].path, "notes.txt");
        assert_eq!(items[0].staged_status, " ");
        assert_eq!(items[0].unstaged_status, "M");
        assert!(!items[0].is_untracked);
    }

    #[test]
    fn get_repository_files_includes_tracked_and_untracked_entries_without_duplicates() {
        let repo = create_temp_git_repo_with_commit("tracked.txt", "tracked\n");
        fs::write(repo.path().join("draft.txt"), "draft\n").expect("write");

        let files = super::get_repository_files(repo.path().display().to_string()).expect("files");
        let mut paths = files
            .into_iter()
            .map(|entry| entry.path)
            .collect::<Vec<_>>();
        paths.sort();

        assert_eq!(
            paths,
            vec!["draft.txt".to_string(), "tracked.txt".to_string()]
        );
    }
}
