use crate::git_support::{
    ensure_git_output_success, run_git_output as git_support_run_git_output, validate_git_repo,
    validate_repo_relative_file_path, GitSupportError,
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

/// Aggregated counters for the repository working tree state.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryWorkingTreeStatus {
    has_changes: bool,
    staged_count: usize,
    unstaged_count: usize,
    untracked_count: usize,
}

/// A single porcelain status row mapped for frontend rendering.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryWorkingTreeItem {
    path: String,
    staged_status: String,
    unstaged_status: String,
    is_untracked: bool,
}

/// A repository file path entry returned by file listing commands.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
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
    validate_git_repo(Path::new(repo_path)).map_err(map_git_support_error)
}

fn ensure_repo_file(file_path: &str) -> WorkingTreeResult<()> {
    validate_repo_relative_file_path(file_path).map_err(map_git_support_error)
}

fn run_git_output(
    repo_path: &str,
    args: &[&str],
    action: &'static str,
) -> WorkingTreeResult<Output> {
    git_support_run_git_output(repo_path, args, action).map_err(map_git_support_error)
}

fn ensure_output_success(output: &Output, fallback: &str) -> WorkingTreeResult<()> {
    ensure_git_output_success(output, fallback).map_err(map_git_support_error)
}

fn map_git_support_error(error: GitSupportError) -> WorkingTreeError {
    match error {
        GitSupportError::Message(message) => WorkingTreeError::Message(message),
        GitSupportError::Io { action, source } => WorkingTreeError::Io { action, source },
    }
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

/// Stages all tracked, modified, and untracked changes in the repository.
// Tauri command arguments mirror the frontend invoke payload.
#[tauri::command]
pub(crate) async fn stage_all_repository_changes(repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        stage_all_repository_changes_inner(repo_path).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to stage all changes: {error}"))?
}

/// Unstages all currently staged paths and keeps worktree changes intact.
// Tauri command arguments mirror the frontend invoke payload.
#[tauri::command]
pub(crate) async fn unstage_all_repository_changes(repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        unstage_all_repository_changes_inner(repo_path).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to unstage all changes: {error}"))?
}

/// Stages a single repository path after validating it is repo-relative.
// Tauri command arguments mirror the frontend invoke payload.
#[tauri::command]
pub(crate) async fn stage_repository_file(
    repo_path: String,
    file_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        stage_repository_file_inner(repo_path, file_path).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to stage file: {error}"))?
}

/// Unstages a single repository path after validating it is repo-relative.
// Tauri command arguments mirror the frontend invoke payload.
#[tauri::command]
pub(crate) async fn unstage_repository_file(
    repo_path: String,
    file_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        unstage_repository_file_inner(repo_path, file_path).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to unstage file: {error}"))?
}

/// Appends an ignore pattern to `.gitignore` when the rule is not already present.
// Tauri command arguments mirror the frontend invoke payload.
#[tauri::command]
pub(crate) async fn add_repository_ignore_rule(
    repo_path: String,
    pattern: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        add_repository_ignore_rule_inner(repo_path, pattern).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to update .gitignore: {error}"))?
}

/// Discards staged and worktree changes for a specific path.
// Tauri command arguments mirror the frontend invoke payload.
#[tauri::command]
pub(crate) async fn discard_repository_path_changes(
    repo_path: String,
    file_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        discard_repository_path_changes_inner(repo_path, file_path)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to discard path changes: {error}"))?
}

/// Discards all tracked and untracked changes in the repository.
// Tauri command arguments mirror the frontend invoke payload.
#[tauri::command]
pub(crate) async fn discard_all_repository_changes(repo_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        discard_all_repository_changes_inner(repo_path).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to discard all repository changes: {error}"))?
}

/// Resets repository state to a target revision using soft, mixed, or hard mode.
// Tauri command arguments mirror the frontend invoke payload.
#[tauri::command]
pub(crate) async fn reset_repository_to_reference(
    repo_path: String,
    target: String,
    mode: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        reset_repository_to_reference_inner(repo_path, target, mode)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to reset repository: {error}"))?
}

fn stage_all_repository_changes_inner(repo_path: String) -> WorkingTreeResult<()> {
    ensure_repo(&repo_path)?;

    let output = run_git_output(&repo_path, &["add", "-A"], "run git add")?;
    ensure_output_success(&output, "Failed to stage all changes")
}

fn unstage_all_repository_changes_inner(repo_path: String) -> WorkingTreeResult<()> {
    ensure_repo(&repo_path)?;

    let output = run_git_output(&repo_path, &["reset", "HEAD", "--", "."], "run git reset")?;
    ensure_output_success(&output, "Failed to unstage all changes")
}

fn stage_repository_file_inner(repo_path: String, file_path: String) -> WorkingTreeResult<()> {
    ensure_repo(&repo_path)?;
    ensure_repo_file(&file_path)?;

    let output = run_git_output(&repo_path, &["add", "-A", "--", &file_path], "run git add")?;
    ensure_output_success(&output, "Failed to stage file")
}

fn unstage_repository_file_inner(repo_path: String, file_path: String) -> WorkingTreeResult<()> {
    ensure_repo(&repo_path)?;
    ensure_repo_file(&file_path)?;

    let output = run_git_output(
        &repo_path,
        &["reset", "HEAD", "--", &file_path],
        "run git reset",
    )?;
    ensure_output_success(&output, "Failed to unstage file")
}

fn add_repository_ignore_rule_inner(repo_path: String, pattern: String) -> WorkingTreeResult<()> {
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
}

fn discard_repository_path_changes_inner(
    repo_path: String,
    file_path: String,
) -> WorkingTreeResult<()> {
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
}

fn discard_all_repository_changes_inner(repo_path: String) -> WorkingTreeResult<()> {
    ensure_repo(&repo_path)?;

    let reset_output = run_git_output(
        &repo_path,
        &["reset", "--hard", "HEAD"],
        "run git reset --hard",
    )?;
    ensure_output_success(&reset_output, "Failed to discard tracked changes")?;

    let clean_output = run_git_output(&repo_path, &["clean", "-fd"], "run git clean")?;
    ensure_output_success(&clean_output, "Failed to discard untracked changes")
}

fn reset_repository_to_reference_inner(
    repo_path: String,
    target: String,
    mode: Option<String>,
) -> WorkingTreeResult<()> {
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
}

/// Returns high-level working tree counters derived from porcelain status output.
// Tauri command arguments mirror the frontend invoke payload.
fn get_repository_working_tree_status_inner(
    repo_path: &str,
) -> WorkingTreeResult<RepositoryWorkingTreeStatus> {
    ensure_repo(repo_path)?;

    let output = run_git_output(
        repo_path,
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
}

#[tauri::command]
pub(crate) async fn get_repository_working_tree_status(
    repo_path: String,
) -> Result<RepositoryWorkingTreeStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        get_repository_working_tree_status_inner(&repo_path).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to read repository status: {error}"))?
}

/// Returns detailed working tree rows for staged, unstaged, and untracked paths.
// Tauri command arguments mirror the frontend invoke payload.
fn get_repository_working_tree_items_inner(
    repo_path: &str,
) -> WorkingTreeResult<Vec<RepositoryWorkingTreeItem>> {
    ensure_repo(repo_path)?;

    let output = run_git_output(
        repo_path,
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
}

#[tauri::command]
pub(crate) async fn get_repository_working_tree_items(
    repo_path: String,
) -> Result<Vec<RepositoryWorkingTreeItem>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        get_repository_working_tree_items_inner(&repo_path).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to read repository status items: {error}"))?
}

/// Lists cached and untracked repository files without duplicates.
// Tauri command arguments mirror the frontend invoke payload.
fn get_repository_files_inner(repo_path: &str) -> WorkingTreeResult<Vec<RepositoryFileEntry>> {
    ensure_repo(repo_path)?;

    let output = run_git_output(
        repo_path,
        &[
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ],
        "run git ls-files",
    )?;
    ensure_output_success(&output, "Failed to list repository files")?;

    parse_ls_files_output(&output.stdout)
}

#[tauri::command]
pub(crate) async fn get_repository_files(
    repo_path: String,
) -> Result<Vec<RepositoryFileEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        get_repository_files_inner(&repo_path).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to list repository files: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{
        add_repository_ignore_rule, discard_all_repository_changes,
        discard_repository_path_changes, parse_ls_files_output, parse_porcelain_status_entries,
        reset_repository_to_reference, stage_all_repository_changes, stage_repository_file,
        unstage_all_repository_changes, unstage_repository_file, WorkingTreeError,
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

    fn git_status_short(repo_path: &Path) -> String {
        let output = run_git_output(repo_path, &["status", "--short"]);
        assert!(output.status.success(), "git status should succeed");
        String::from_utf8_lossy(&output.stdout).to_string()
    }

    fn git_rev_parse(repo_path: &Path, revision: &str) -> String {
        let output = run_git_output(repo_path, &["rev-parse", revision]);
        assert!(
            output.status.success(),
            "git rev-parse should succeed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    #[tokio::test]
    async fn stage_all_repository_changes_stages_new_file() {
        let repo = create_temp_git_repo();
        fs::write(repo.path().join("notes.txt"), "draft").expect("write");

        stage_all_repository_changes(repo.path().display().to_string())
            .await
            .expect("stage all");

        assert_eq!(git_status_short(repo.path()), "A  notes.txt\n");
    }

    #[tokio::test]
    async fn unstage_all_repository_changes_keeps_worktree_changes() {
        let repo = create_temp_git_repo_with_commit("tracked.txt", "tracked\n");
        fs::write(repo.path().join("tracked.txt"), "updated\n").expect("write");
        fs::write(repo.path().join("draft.txt"), "draft\n").expect("write");
        run_git(repo.path(), &["add", "-A"]);

        unstage_all_repository_changes(repo.path().display().to_string())
            .await
            .expect("unstage all");

        let status = git_status_short(repo.path());
        assert!(
            status.contains(" M tracked.txt"),
            "unexpected status: {status}"
        );
        assert!(
            status.contains("?? draft.txt"),
            "unexpected status: {status}"
        );
    }

    #[tokio::test]
    async fn stage_repository_file_stages_only_requested_path() {
        let repo = create_temp_git_repo_with_commit("tracked.txt", "tracked\n");
        fs::write(repo.path().join("tracked.txt"), "updated\n").expect("write");
        fs::write(repo.path().join("other.txt"), "other\n").expect("write");
        run_git(repo.path(), &["add", "other.txt"]);
        run_git(repo.path(), &["reset", "HEAD", "--", "other.txt"]);

        stage_repository_file(repo.path().display().to_string(), "tracked.txt".to_string())
            .await
            .expect("stage file");

        let status = git_status_short(repo.path());
        assert!(
            status.contains("M  tracked.txt"),
            "unexpected status: {status}"
        );
        assert!(
            status.contains("?? other.txt"),
            "unexpected status: {status}"
        );
    }

    #[tokio::test]
    async fn unstage_repository_file_restores_path_to_unstaged_state() {
        let repo = create_temp_git_repo_with_commit("tracked.txt", "tracked\n");
        fs::write(repo.path().join("tracked.txt"), "updated\n").expect("write");
        run_git(repo.path(), &["add", "tracked.txt"]);

        unstage_repository_file(repo.path().display().to_string(), "tracked.txt".to_string())
            .await
            .expect("unstage file");

        assert_eq!(git_status_short(repo.path()), " M tracked.txt\n");
    }

    #[tokio::test]
    async fn add_repository_ignore_rule_appends_pattern_once() {
        let repo = create_temp_git_repo();

        add_repository_ignore_rule(repo.path().display().to_string(), "dist/".to_string())
            .await
            .expect("first ignore rule write");
        add_repository_ignore_rule(repo.path().display().to_string(), "dist/".to_string())
            .await
            .expect("second ignore rule write");

        assert_eq!(
            fs::read_to_string(repo.path().join(".gitignore")).expect("read gitignore"),
            "dist/\n"
        );
    }

    #[tokio::test]
    async fn discard_repository_path_changes_removes_untracked_file() {
        let repo = create_temp_git_repo_with_commit("tracked.txt", "tracked\n");
        let draft_path = repo.path().join("draft.txt");
        fs::write(&draft_path, "draft\n").expect("write");

        discard_repository_path_changes(repo.path().display().to_string(), "draft.txt".to_string())
            .await
            .expect("discard path");

        assert!(!draft_path.exists(), "untracked file should be removed");
        assert_eq!(git_status_short(repo.path()), "");
    }

    #[tokio::test]
    async fn discard_all_repository_changes_removes_tracked_and_untracked_changes() {
        let repo = create_temp_git_repo_with_commit("tracked.txt", "tracked\n");
        let tracked_path = repo.path().join("tracked.txt");
        let draft_dir = repo.path().join("drafts");
        let draft_path = draft_dir.join("note.txt");
        fs::write(&tracked_path, "updated\n").expect("write tracked");
        fs::create_dir_all(&draft_dir).expect("create draft dir");
        fs::write(&draft_path, "draft\n").expect("write draft");

        discard_all_repository_changes(repo.path().display().to_string())
            .await
            .expect("discard all");

        assert_eq!(
            fs::read_to_string(&tracked_path).expect("read tracked"),
            "tracked\n"
        );
        assert!(!draft_path.exists(), "untracked file should be removed");
        assert_eq!(git_status_short(repo.path()), "");
    }

    #[tokio::test]
    async fn reset_repository_to_reference_hard_restores_head_and_worktree() {
        let repo = create_temp_git_repo_with_commit("tracked.txt", "tracked\n");
        fs::write(repo.path().join("tracked.txt"), "updated\n").expect("write");
        run_git(repo.path(), &["add", "tracked.txt"]);
        run_git(repo.path(), &["commit", "-m", "Second commit"]);
        let first_commit = git_rev_parse(repo.path(), "HEAD~1");

        reset_repository_to_reference(
            repo.path().display().to_string(),
            first_commit.clone(),
            Some("hard".to_string()),
        )
        .await
        .expect("reset repository");

        assert_eq!(git_rev_parse(repo.path(), "HEAD"), first_commit);
        assert_eq!(
            fs::read_to_string(repo.path().join("tracked.txt")).expect("read tracked"),
            "tracked\n"
        );
        assert_eq!(git_status_short(repo.path()), "");
    }

    #[tokio::test]
    async fn get_repository_working_tree_status_returns_one_untracked_file_when_repo_has_new_file()
    {
        let repo = create_temp_git_repo();
        fs::write(repo.path().join("notes.txt"), "draft").expect("write");

        let status = super::get_repository_working_tree_status(repo.path().display().to_string())
            .await
            .expect("status");

        assert!(status.has_changes);
        assert_eq!(status.untracked_count, 1);
        assert_eq!(status.staged_count, 0);
        assert_eq!(status.unstaged_count, 0);
    }

    #[tokio::test]
    async fn get_repository_working_tree_items_returns_modified_tracked_file() {
        let repo = create_temp_git_repo_with_commit("notes.txt", "original\n");
        fs::write(repo.path().join("notes.txt"), "updated\n").expect("write");

        let items = super::get_repository_working_tree_items(repo.path().display().to_string())
            .await
            .expect("items");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].path, "notes.txt");
        assert_eq!(items[0].staged_status, " ");
        assert_eq!(items[0].unstaged_status, "M");
        assert!(!items[0].is_untracked);
    }

    #[tokio::test]
    async fn get_repository_files_includes_tracked_and_untracked_entries_without_duplicates() {
        let repo = create_temp_git_repo_with_commit("tracked.txt", "tracked\n");
        fs::write(repo.path().join("draft.txt"), "draft\n").expect("write");

        let files = super::get_repository_files(repo.path().display().to_string())
            .await
            .expect("files");
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

    #[tokio::test]
    async fn stage_repository_file_rejects_parent_directory_traversal() {
        let repo = create_temp_git_repo_with_commit("tracked.txt", "tracked\n");

        let result = stage_repository_file(
            repo.path().display().to_string(),
            "../outside.txt".to_string(),
        )
        .await;

        assert_eq!(
            result,
            Err("File path must not contain parent-directory traversal".to_string())
        );
    }

    #[tokio::test]
    async fn unstage_repository_file_rejects_absolute_paths() {
        let repo = create_temp_git_repo_with_commit("tracked.txt", "tracked\n");
        let absolute_path = repo.path().join("tracked.txt");

        let result = unstage_repository_file(
            repo.path().display().to_string(),
            absolute_path.display().to_string(),
        )
        .await;

        assert_eq!(
            result,
            Err("File path must be relative to repository root".to_string())
        );
    }

    #[tokio::test]
    async fn discard_repository_path_changes_rejects_parent_directory_traversal() {
        let repo = create_temp_git_repo_with_commit("tracked.txt", "tracked\n");

        let result = discard_repository_path_changes(
            repo.path().display().to_string(),
            "../outside.txt".to_string(),
        )
        .await;

        assert_eq!(
            result,
            Err("File path must not contain parent-directory traversal".to_string())
        );
    }

    #[tokio::test]
    async fn add_repository_ignore_rule_returns_error_when_existing_gitignore_is_not_utf8() {
        let repo = create_temp_git_repo();
        let gitignore_path = repo.path().join(".gitignore");
        fs::write(&gitignore_path, [0xFF, 0xFE, 0x00]).expect("gitignore should be written");

        let result =
            add_repository_ignore_rule(repo.path().display().to_string(), "dist/".to_string())
                .await;

        assert!(result
            .expect_err("expected invalid utf-8 gitignore to fail")
            .starts_with("Failed to read .gitignore:"),);
    }

    #[tokio::test]
    async fn discard_repository_path_changes_returns_error_for_missing_path() {
        let repo = create_temp_git_repo_with_commit("tracked.txt", "tracked\n");

        let result = discard_repository_path_changes(
            repo.path().display().to_string(),
            "missing.txt".to_string(),
        )
        .await;

        assert!(result.is_err(), "expected missing path discard to fail");
    }

    #[test]
    fn working_tree_error_message_variant_preserves_display_text() {
        let error = WorkingTreeError::Message("working tree failed".to_string());

        assert_eq!(error.to_string(), "working tree failed");
    }
}
