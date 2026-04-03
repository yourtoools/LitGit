use crate::git_support::{
    git_command, git_error_message, validate_git_repo, validate_repo_relative_file_path,
};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::process::Output;
use thiserror::Error;

const MIN_PORCELAIN_ENTRY_BYTES: usize = 4;

#[derive(Debug, PartialEq, Eq)]
struct ParsedWorkingTreeEntry {
    path: String,
    previous_path: Option<String>,
    staged_status: char,
    unstaged_status: char,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// Aggregated counters for the repository working tree state.
pub(crate) struct RepositoryWorkingTreeStatus {
    has_changes: bool,
    staged_count: usize,
    unstaged_count: usize,
    untracked_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// A single porcelain status row mapped for frontend rendering.
pub(crate) struct RepositoryWorkingTreeItem {
    path: String,
    staged_status: String,
    unstaged_status: String,
    is_untracked: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// A repository file path entry returned by file listing commands.
pub(crate) struct RepositoryFileEntry {
    path: String,
}

type WorkingTreeResult<T> = Result<T, WorkingTreeError>;

#[derive(Debug, Error)]
enum WorkingTreeError {
    #[error("{0}")]
    Message(String),
    #[error("Failed to {action}: {source}")]
    Io {
        action: &'static str,
        #[source]
        source: std::io::Error,
    },
}

impl WorkingTreeError {
    fn io(action: &'static str, source: std::io::Error) -> Self {
        Self::Io { action, source }
    }

    fn message(message: impl Into<String>) -> Self {
        Self::Message(message.into())
    }
}

fn ensure_repo(repo_path: &str) -> WorkingTreeResult<()> {
    validate_git_repo(Path::new(repo_path)).map_err(WorkingTreeError::message)
}

fn ensure_repo_file(file_path: &str) -> WorkingTreeResult<()> {
    validate_repo_relative_file_path(file_path).map_err(WorkingTreeError::message)
}

fn run_git_output(
    repo_path: &str,
    args: &[&str],
    action: &'static str,
) -> WorkingTreeResult<Output> {
    git_command()
        .args(["-C", repo_path])
        .args(args)
        .output()
        .map_err(|error| WorkingTreeError::io(action, error))
}

fn ensure_output_success(output: &Output, fallback: &str) -> WorkingTreeResult<()> {
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(WorkingTreeError::message(if stderr.is_empty() {
        fallback.to_string()
    } else {
        stderr
    }))
}

fn ensure_output_success_with_git_error(output: &Output, fallback: &str) -> WorkingTreeResult<()> {
    if output.status.success() {
        return Ok(());
    }

    Err(WorkingTreeError::message(git_error_message(
        &output.stderr,
        fallback,
    )))
}

fn read_nul_terminated_path(bytes: &[u8], cursor: &mut usize) -> WorkingTreeResult<String> {
    let Some(field_length) = bytes[*cursor..].iter().position(|byte| *byte == b'\0') else {
        return Err(WorkingTreeError::message(
            "Failed to parse repository status output",
        ));
    };
    let end = *cursor + field_length;
    let path = String::from_utf8_lossy(&bytes[*cursor..end]).into_owned();
    *cursor = end + 1;
    Ok(path)
}

fn parse_porcelain_status_entries(bytes: &[u8]) -> WorkingTreeResult<Vec<ParsedWorkingTreeEntry>> {
    let mut entries = Vec::new();
    let mut cursor = 0;

    while cursor < bytes.len() {
        if bytes.len().saturating_sub(cursor) < MIN_PORCELAIN_ENTRY_BYTES {
            return Err(WorkingTreeError::message(
                "Failed to parse repository status output",
            ));
        }

        let staged_status = char::from(bytes[cursor]);
        let unstaged_status = char::from(bytes[cursor + 1]);
        cursor += 3;

        let path = read_nul_terminated_path(bytes, &mut cursor)?;
        let previous_path =
            if matches!(staged_status, 'R' | 'C') || matches!(unstaged_status, 'R' | 'C') {
                Some(read_nul_terminated_path(bytes, &mut cursor)?)
            } else {
                None
            };

        entries.push(ParsedWorkingTreeEntry {
            path,
            previous_path,
            staged_status,
            unstaged_status,
        });
    }

    Ok(entries)
}

fn parse_ls_files_output(bytes: &[u8]) -> WorkingTreeResult<Vec<RepositoryFileEntry>> {
    let mut seen_paths = HashSet::new();
    let mut entries = Vec::new();
    let mut cursor = 0;

    while cursor < bytes.len() {
        let path = read_nul_terminated_path(bytes, &mut cursor)?;

        if path.is_empty() || !seen_paths.insert(path.clone()) {
            continue;
        }

        entries.push(RepositoryFileEntry { path });
    }

    Ok(entries)
}

// Tauri command arguments mirror the frontend invoke payload.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Stages all tracked, modified, and untracked changes in the repository.
pub(crate) fn stage_all_repository_changes(repo_path: String) -> Result<(), String> {
    (|| -> WorkingTreeResult<()> {
        ensure_repo(&repo_path)?;

        let output = run_git_output(&repo_path, &["add", "-A"], "run git add")?;
        ensure_output_success(&output, "Failed to stage all changes")
    })()
    .map_err(|error| error.to_string())
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Unstages all currently staged paths and keeps worktree changes intact.
pub(crate) fn unstage_all_repository_changes(repo_path: String) -> Result<(), String> {
    (|| -> WorkingTreeResult<()> {
        ensure_repo(&repo_path)?;

        let output = run_git_output(&repo_path, &["reset", "HEAD", "--", "."], "run git reset")?;
        ensure_output_success(&output, "Failed to unstage all changes")
    })()
    .map_err(|error| error.to_string())
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Stages a single repository path after validating it is repo-relative.
pub(crate) fn stage_repository_file(repo_path: String, file_path: String) -> Result<(), String> {
    (|| -> WorkingTreeResult<()> {
        ensure_repo(&repo_path)?;
        ensure_repo_file(&file_path)?;

        let output = run_git_output(&repo_path, &["add", "-A", "--", &file_path], "run git add")?;
        ensure_output_success(&output, "Failed to stage file")
    })()
    .map_err(|error| error.to_string())
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Unstages a single repository path after validating it is repo-relative.
pub(crate) fn unstage_repository_file(repo_path: String, file_path: String) -> Result<(), String> {
    (|| -> WorkingTreeResult<()> {
        ensure_repo(&repo_path)?;
        ensure_repo_file(&file_path)?;

        let output = run_git_output(
            &repo_path,
            &["reset", "HEAD", "--", &file_path],
            "run git reset",
        )?;
        ensure_output_success(&output, "Failed to unstage file")
    })()
    .map_err(|error| error.to_string())
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Appends an ignore pattern to `.gitignore` when the rule is not already present.
pub(crate) fn add_repository_ignore_rule(repo_path: String, pattern: String) -> Result<(), String> {
    (|| -> WorkingTreeResult<()> {
        ensure_repo(&repo_path)?;

        let trimmed_pattern = pattern.trim();
        if trimmed_pattern.is_empty() {
            return Err(WorkingTreeError::message("Ignore rule cannot be empty"));
        }

        let gitignore_path = Path::new(&repo_path).join(".gitignore");
        let mut existing_contents = match fs::read_to_string(&gitignore_path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(error) => return Err(WorkingTreeError::io("read .gitignore", error)),
        };

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
            .map_err(|error| WorkingTreeError::io("update .gitignore", error))?;

        Ok(())
    })()
    .map_err(|error| error.to_string())
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Discards staged and worktree changes for a specific path.
pub(crate) fn discard_repository_path_changes(
    repo_path: String,
    file_path: String,
) -> Result<(), String> {
    (|| -> WorkingTreeResult<()> {
        ensure_repo(&repo_path)?;
        ensure_repo_file(&file_path)?;

        let restore_output = run_git_output(
            &repo_path,
            &[
                "restore",
                "--source=HEAD",
                "--staged",
                "--worktree",
                "--",
                &file_path,
            ],
            "run git restore",
        )?;

        if restore_output.status.success() {
            return Ok(());
        }

        let restore_stderr = String::from_utf8_lossy(&restore_output.stderr)
            .trim()
            .to_string();

        let untracked_output = run_git_output(
            &repo_path,
            &[
                "ls-files",
                "--others",
                "--exclude-standard",
                "--error-unmatch",
                "--",
                &file_path,
            ],
            "inspect repository path state",
        )?;

        if !untracked_output.status.success() {
            return Err(WorkingTreeError::message(if restore_stderr.is_empty() {
                "Failed to discard changes".to_string()
            } else {
                restore_stderr
            }));
        }

        let clean_output = run_git_output(
            &repo_path,
            &["clean", "-fd", "--", &file_path],
            "run git clean",
        )?;

        if clean_output.status.success() {
            return Ok(());
        }
        if !restore_stderr.is_empty() {
            return Err(WorkingTreeError::message(restore_stderr));
        }

        let clean_stderr = String::from_utf8_lossy(&clean_output.stderr)
            .trim()
            .to_string();
        if !clean_stderr.is_empty() {
            return Err(WorkingTreeError::message(clean_stderr));
        }

        Err(WorkingTreeError::message("Failed to discard changes"))
    })()
    .map_err(|error| error.to_string())
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Discards all tracked and untracked changes in the repository.
pub(crate) fn discard_all_repository_changes(repo_path: String) -> Result<(), String> {
    (|| -> WorkingTreeResult<()> {
        ensure_repo(&repo_path)?;

        let reset_output = run_git_output(
            &repo_path,
            &["reset", "--hard", "HEAD"],
            "run git reset --hard",
        )?;
        ensure_output_success(&reset_output, "Failed to discard tracked changes")?;

        let clean_output = run_git_output(&repo_path, &["clean", "-fd"], "run git clean")?;
        ensure_output_success(&clean_output, "Failed to discard untracked changes")
    })()
    .map_err(|error| error.to_string())
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Resets repository state to a target revision using soft, mixed, or hard mode.
pub(crate) fn reset_repository_to_reference(
    repo_path: String,
    target: String,
    mode: Option<String>,
) -> Result<(), String> {
    (|| -> WorkingTreeResult<()> {
        ensure_repo(&repo_path)?;

        let target_trimmed = target.trim();

        if target_trimmed.is_empty() {
            return Err(WorkingTreeError::message("Reset target is required"));
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

        let output = run_git_output(
            &repo_path,
            &["reset", mode_flag, target_trimmed],
            "run git reset",
        )?;
        ensure_output_success(&output, "Failed to reset repository")
    })()
    .map_err(|error| error.to_string())
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Returns high-level working tree counters derived from porcelain status output.
pub(crate) fn get_repository_working_tree_status(
    repo_path: String,
) -> Result<RepositoryWorkingTreeStatus, String> {
    (|| -> WorkingTreeResult<RepositoryWorkingTreeStatus> {
        ensure_repo(&repo_path)?;

        let output = run_git_output(
            &repo_path,
            &["status", "--porcelain", "-z", "--untracked-files=all"],
            "run git status",
        )?;
        ensure_output_success(&output, "Failed to read repository status")?;

        let mut staged_count = 0;
        let mut unstaged_count = 0;
        let mut untracked_count = 0;

        for entry in parse_porcelain_status_entries(&output.stdout)? {
            let x = entry.staged_status;
            let y = entry.unstaged_status;

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
    })()
    .map_err(|error| error.to_string())
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Returns detailed working tree rows for staged, unstaged, and untracked paths.
pub(crate) fn get_repository_working_tree_items(
    repo_path: String,
) -> Result<Vec<RepositoryWorkingTreeItem>, String> {
    (|| -> WorkingTreeResult<Vec<RepositoryWorkingTreeItem>> {
        ensure_repo(&repo_path)?;

        let output = run_git_output(
            &repo_path,
            &["status", "--porcelain", "-z", "--untracked-files=all"],
            "run git status",
        )?;
        ensure_output_success(&output, "Failed to read repository status items")?;

        let items = parse_porcelain_status_entries(&output.stdout)?
            .into_iter()
            .map(|entry| RepositoryWorkingTreeItem {
                path: entry.path,
                staged_status: entry.staged_status.to_string(),
                unstaged_status: entry.unstaged_status.to_string(),
                is_untracked: entry.staged_status == '?' && entry.unstaged_status == '?',
            })
            .collect();

        Ok(items)
    })()
    .map_err(|error| error.to_string())
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Lists cached and untracked repository files without duplicates.
pub(crate) fn get_repository_files(repo_path: String) -> Result<Vec<RepositoryFileEntry>, String> {
    (|| -> WorkingTreeResult<Vec<RepositoryFileEntry>> {
        ensure_repo(&repo_path)?;

        let output = run_git_output(
            &repo_path,
            &[
                "ls-files",
                "--cached",
                "--others",
                "--exclude-standard",
                "-z",
            ],
            "run git ls-files",
        )?;
        ensure_output_success_with_git_error(&output, "Failed to list repository files")?;

        parse_ls_files_output(&output.stdout)
    })()
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        add_repository_ignore_rule, discard_repository_path_changes, parse_ls_files_output,
        parse_porcelain_status_entries, stage_repository_file, unstage_repository_file,
        WorkingTreeError,
    };
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

    #[test]
    fn parse_porcelain_status_entries_uses_target_path_for_renames() {
        let entries =
            parse_porcelain_status_entries(b"R  new.txt\0old.txt\0").expect("rename should parse");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "new.txt");
        assert_eq!(entries[0].staged_status, 'R');
        assert_eq!(entries[0].unstaged_status, ' ');
        assert_eq!(entries[0].previous_path.as_deref(), Some("old.txt"));
    }

    #[test]
    fn parse_ls_files_output_preserves_newlines_inside_file_names() {
        let files =
            parse_ls_files_output(b"line\nbreak.txt\0tracked.txt\0").expect("ls-files output");
        let mut paths = files
            .into_iter()
            .map(|entry| entry.path)
            .collect::<Vec<_>>();
        paths.sort();

        assert_eq!(paths, vec!["line\nbreak.txt", "tracked.txt"]);
    }

    #[test]
    fn stage_repository_file_rejects_parent_directory_traversal() {
        let repo = create_temp_git_repo_with_commit("tracked.txt", "tracked\n");

        let result = stage_repository_file(
            repo.path().display().to_string(),
            "../outside.txt".to_string(),
        );

        assert_eq!(
            result,
            Err("File path must not contain parent-directory traversal".to_string())
        );
    }

    #[test]
    fn unstage_repository_file_rejects_absolute_paths() {
        let repo = create_temp_git_repo_with_commit("tracked.txt", "tracked\n");
        let absolute_path = repo.path().join("tracked.txt");

        let result = unstage_repository_file(
            repo.path().display().to_string(),
            absolute_path.display().to_string(),
        );

        assert_eq!(
            result,
            Err("File path must be relative to repository root".to_string())
        );
    }

    #[test]
    fn discard_repository_path_changes_rejects_parent_directory_traversal() {
        let repo = create_temp_git_repo_with_commit("tracked.txt", "tracked\n");

        let result = discard_repository_path_changes(
            repo.path().display().to_string(),
            "../outside.txt".to_string(),
        );

        assert_eq!(
            result,
            Err("File path must not contain parent-directory traversal".to_string())
        );
    }

    #[test]
    fn add_repository_ignore_rule_returns_error_when_existing_gitignore_is_not_utf8() {
        let repo = create_temp_git_repo();
        let gitignore_path = repo.path().join(".gitignore");
        fs::write(&gitignore_path, [0xFF, 0xFE, 0x00]).expect("gitignore should be written");

        let result =
            add_repository_ignore_rule(repo.path().display().to_string(), "dist/".to_string());

        assert!(result
            .expect_err("expected invalid utf-8 gitignore to fail")
            .starts_with("Failed to read .gitignore:"),);
    }

    #[test]
    fn discard_repository_path_changes_returns_error_for_missing_path() {
        let repo = create_temp_git_repo_with_commit("tracked.txt", "tracked\n");

        let result = discard_repository_path_changes(
            repo.path().display().to_string(),
            "missing.txt".to_string(),
        );

        assert!(result.is_err(), "expected missing path discard to fail");
    }

    #[test]
    fn working_tree_error_message_variant_preserves_display_text() {
        let error = WorkingTreeError::Message("working tree failed".to_string());

        assert_eq!(error.to_string(), "working tree failed");
    }
}
