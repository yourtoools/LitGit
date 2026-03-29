use crate::git_support::{git_command, git_error_message, validate_repository_path};
use crate::settings::{
    apply_git_preferences, normalize_git_identity_scope, write_git_identity,
    GitIdentityWriteRequest, RepoCommandPreferences, SettingsState,
};
use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PickedRepository {
    has_initial_commit: bool,
    is_git_repository: bool,
    name: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PickedFilePath {
    pub(crate) path: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CloneRepositoryProgress {
    phase: String,
    message: String,
    percent: Option<u8>,
    received_objects: Option<usize>,
    resolved_objects: Option<usize>,
    total_objects: Option<usize>,
}

#[tauri::command]
pub(crate) fn pick_git_repository() -> Result<Option<PickedRepository>, String> {
    let folder = match rfd::FileDialog::new().pick_folder() {
        Some(folder) => folder,
        None => return Ok(None),
    };

    let path = folder.to_string_lossy().to_string();
    let name = folder_name(&folder).unwrap_or_else(|| "repository".to_string());
    let is_git_repository = folder.join(".git").exists();
    let has_initial_commit = if is_git_repository {
        repository_has_initial_commit(&path)?
    } else {
        false
    };

    Ok(Some(PickedRepository {
        has_initial_commit,
        is_git_repository,
        name,
        path,
    }))
}

#[tauri::command]
pub(crate) fn pick_clone_destination_folder() -> Result<Option<String>, String> {
    let folder = match rfd::FileDialog::new().pick_folder() {
        Some(folder) => folder,
        None => return Ok(None),
    };

    Ok(Some(folder.to_string_lossy().to_string()))
}

#[tauri::command]
pub(crate) fn pick_settings_file() -> Result<Option<PickedFilePath>, String> {
    let file = match rfd::FileDialog::new().pick_file() {
        Some(file) => file,
        None => return Ok(None),
    };

    Ok(Some(PickedFilePath {
        path: file.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
pub(crate) fn create_local_repository(
    name: String,
    destination_parent: String,
    default_branch: String,
    gitignore_template_key: Option<String>,
    gitignore_template_content: Option<String>,
    license_template_key: Option<String>,
    license_template_content: Option<String>,
    git_identity: Option<GitIdentityWriteRequest>,
) -> Result<PickedRepository, String> {
    let trimmed_name = name.trim();
    let trimmed_parent = destination_parent.trim();
    let trimmed_branch = default_branch.trim();

    if trimmed_name.is_empty() {
        return Err("Repository name is required".to_string());
    }

    if trimmed_parent.is_empty() {
        return Err("Initialize in folder is required".to_string());
    }

    if trimmed_branch.is_empty() {
        return Err("Default branch name is required".to_string());
    }

    validate_repository_name(trimmed_name)?;
    validate_branch_name(trimmed_branch)?;

    let destination_parent_path = Path::new(trimmed_parent);
    validate_repository_path(destination_parent_path)?;

    let repo_path = destination_parent_path.join(trimmed_name);

    if repo_path.exists() {
        return Err("A folder with that repository name already exists".to_string());
    }

    fs::create_dir(&repo_path)
        .map_err(|error| format!("Failed to create repository folder: {error}"))?;

    let creation_result = (|| -> Result<(), String> {
        initialize_git_repository(&repo_path, trimmed_branch)?;
        apply_git_identity_to_repository(&repo_path, git_identity.as_ref())?;
        write_repository_files(
            &repo_path,
            trimmed_name,
            gitignore_template_key.as_deref(),
            gitignore_template_content.as_deref(),
            license_template_key.as_deref(),
            license_template_content.as_deref(),
        )?;
        create_initial_commit(&repo_path)?;
        Ok(())
    })();

    if let Err(error) = creation_result {
        let _ = fs::remove_dir_all(&repo_path);
        return Err(error);
    }

    let path = repo_path.to_string_lossy().to_string();
    let name = folder_name(&repo_path).unwrap_or_else(|| trimmed_name.to_string());

    Ok(PickedRepository {
        has_initial_commit: true,
        is_git_repository: true,
        name,
        path,
    })
}

#[tauri::command]
pub(crate) async fn clone_git_repository(
    app: AppHandle,
    state: State<'_, SettingsState>,
    repository_url: String,
    destination_parent: String,
    destination_folder_name: String,
    recurse_submodules: bool,
    preferences: Option<RepoCommandPreferences>,
) -> Result<PickedRepository, String> {
    let trimmed_url = repository_url.trim();
    let trimmed_parent = destination_parent.trim();
    let trimmed_folder = destination_folder_name.trim();

    if trimmed_url.is_empty() {
        return Err("Repository URL is required".to_string());
    }

    if trimmed_parent.is_empty() {
        return Err("Destination folder is required".to_string());
    }

    if trimmed_folder.is_empty() {
        return Err("Repository folder name is required".to_string());
    }

    validate_clone_repository_url(trimmed_url)?;
    validate_clone_destination_folder_name(trimmed_folder)?;

    let destination_parent_path = Path::new(trimmed_parent);
    validate_repository_path(destination_parent_path)?;

    let destination_path = destination_parent_path.join(trimmed_folder);
    let command_preferences = preferences.unwrap_or_default();

    if destination_path.exists() {
        return Err("Destination folder already exists".to_string());
    }

    emit_clone_progress(
        &app,
        CloneRepositoryProgress {
            phase: "preparing".to_string(),
            message: format!("Preparing to clone into {}", destination_path.display()),
            percent: Some(2),
            received_objects: None,
            resolved_objects: None,
            total_objects: None,
        },
    );

    let mut clone_command = git_command();
    apply_git_preferences(&mut clone_command, &command_preferences, Some(&state))?;
    clone_command.args([
        "clone",
        "--progress",
        trimmed_url,
        destination_path.to_string_lossy().as_ref(),
    ]);

    if recurse_submodules {
        clone_command.arg("--recurse-submodules");
    }

    let mut child = clone_command
        .stderr(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to run git clone: {error}"))?;

    if let Some(stderr) = child.stderr.take() {
        let stderr_reader = BufReader::new(stderr);

        for line_result in stderr_reader.lines() {
            let line =
                line_result.map_err(|error| format!("Failed to read git clone output: {error}"))?;
            if let Some(progress) = parse_clone_progress(&line) {
                emit_clone_progress(&app, progress);
            }
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Failed to finalize git clone: {error}"))?;

    if !output.status.success() {
        remove_partial_clone_destination(&destination_path);
        return Err(git_error_message(
            &output.stderr,
            "Failed to clone repository",
        ));
    }

    let path = destination_path.to_string_lossy().to_string();
    let has_initial_commit = repository_has_initial_commit(&path)?;
    let name = folder_name(&destination_path).unwrap_or_else(|| "repository".to_string());

    emit_clone_progress(
        &app,
        CloneRepositoryProgress {
            phase: "complete".to_string(),
            message: format!("Clone complete: {}", destination_path.display()),
            percent: Some(100),
            received_objects: None,
            resolved_objects: None,
            total_objects: None,
        },
    );

    Ok(PickedRepository {
        has_initial_commit,
        is_git_repository: true,
        name,
        path,
    })
}

#[tauri::command]
pub(crate) fn validate_opened_repositories(repo_paths: Vec<String>) -> Result<Vec<String>, String> {
    let valid_paths = repo_paths
        .into_iter()
        .filter(|repo_path| {
            let path = Path::new(repo_path);
            path.exists() && path.join(".git").exists()
        })
        .collect();

    Ok(valid_paths)
}

#[tauri::command]
pub(crate) fn create_repository_initial_commit(
    repo_path: String,
    git_identity: Option<GitIdentityWriteRequest>,
) -> Result<(), String> {
    validate_repository_path(Path::new(&repo_path))?;

    if !Path::new(&repo_path).join(".git").exists() {
        let init_output = git_command()
            .args(["-C", &repo_path, "init"])
            .output()
            .map_err(|error| format!("Failed to run git init: {error}"))?;

        if !init_output.status.success() {
            return Err(git_error_message(
                &init_output.stderr,
                "Failed to initialize repository",
            ));
        }
    }

    if repository_has_initial_commit(&repo_path)? {
        return Ok(());
    }

    apply_git_identity_to_repository(Path::new(&repo_path), git_identity.as_ref())?;

    let repo_name = folder_name(Path::new(&repo_path)).unwrap_or_else(|| "repository".to_string());
    let readme_path = Path::new(&repo_path).join("README.md");

    if !readme_path.exists() {
        fs::write(&readme_path, format!("# {repo_name}\n"))
            .map_err(|error| format!("Failed to create README.md: {error}"))?;
    }

    let add_output = git_command()
        .args(["-C", &repo_path, "add", "--", "README.md"])
        .output()
        .map_err(|error| format!("Failed to run git add: {error}"))?;

    if !add_output.status.success() {
        return Err(git_error_message(
            &add_output.stderr,
            "Failed to stage README.md",
        ));
    }

    let commit_output = git_command()
        .args([
            "-C",
            &repo_path,
            "commit",
            "--allow-empty",
            "-m",
            "Initial commit",
        ])
        .output()
        .map_err(|error| format!("Failed to run git commit: {error}"))?;

    if !commit_output.status.success() {
        return Err(git_error_message(
            &commit_output.stderr,
            "Failed to create initial commit",
        ));
    }

    Ok(())
}

fn repository_has_initial_commit(repo_path: &str) -> Result<bool, String> {
    let output = git_command()
        .args(["-C", repo_path, "rev-parse", "--verify", "HEAD"])
        .output()
        .map_err(|error| format!("Failed to check repository history: {error}"))?;

    Ok(output.status.success())
}

fn emit_clone_progress(app: &AppHandle, payload: CloneRepositoryProgress) {
    let _ = app.emit("clone-repository-progress", payload);
}

fn parse_clone_progress(line: &str) -> Option<CloneRepositoryProgress> {
    let trimmed = line.trim();

    if trimmed.is_empty() {
        return None;
    }

    if let Some((percent, current, total)) = parse_progress_counts(trimmed, "Receiving objects:") {
        return Some(CloneRepositoryProgress {
            phase: "receiving".to_string(),
            message: trimmed.to_string(),
            percent: Some(percent),
            received_objects: Some(current),
            resolved_objects: None,
            total_objects: Some(total),
        });
    }

    if let Some((percent, current, total)) = parse_progress_counts(trimmed, "Resolving deltas:") {
        return Some(CloneRepositoryProgress {
            phase: "resolving".to_string(),
            message: trimmed.to_string(),
            percent: Some(percent),
            received_objects: None,
            resolved_objects: Some(current),
            total_objects: Some(total),
        });
    }

    if trimmed.starts_with("Cloning into") {
        return Some(CloneRepositoryProgress {
            phase: "preparing".to_string(),
            message: trimmed.to_string(),
            percent: Some(4),
            received_objects: None,
            resolved_objects: None,
            total_objects: None,
        });
    }

    None
}

fn parse_progress_counts(line: &str, prefix: &str) -> Option<(u8, usize, usize)> {
    let remainder = line.strip_prefix(prefix)?.trim();
    let percent = remainder.split('%').next()?.trim().parse::<u8>().ok()?;

    let start = remainder.find('(')?;
    let end = remainder[start..].find(')')? + start;
    let counts = &remainder[start + 1..end];
    let mut parts = counts.split('/');
    let current = parts.next()?.trim().parse::<usize>().ok()?;
    let total = parts.next()?.trim().parse::<usize>().ok()?;

    Some((percent, current, total))
}

pub(crate) fn validate_repository_name(name: &str) -> Result<(), String> {
    if name == "." || name == ".." {
        return Err("Repository name must be more specific".to_string());
    }

    if name.contains('/') || name.contains('\\') {
        return Err("Repository name cannot contain path separators".to_string());
    }

    if name.chars().any(is_invalid_path_character) {
        return Err("Repository name contains unsupported characters".to_string());
    }

    Ok(())
}

pub(crate) fn validate_branch_name(name: &str) -> Result<(), String> {
    let output = git_command()
        .args(["check-ref-format", "--branch", name])
        .output()
        .map_err(|error| format!("Failed to validate default branch name: {error}"))?;

    if !output.status.success() {
        return Err("Enter a valid Git branch name".to_string());
    }

    Ok(())
}

fn validate_clone_repository_url(repository_url: &str) -> Result<(), String> {
    if repository_url.starts_with("file://") {
        return Err("Local file clone URLs are not supported".to_string());
    }

    if repository_url.starts_with("https://")
        || repository_url.starts_with("ssh://")
        || is_scp_style_ssh_repository_url(repository_url)
    {
        return Ok(());
    }

    Err("Enter a valid HTTPS or SSH repository URL".to_string())
}

fn validate_clone_destination_folder_name(name: &str) -> Result<(), String> {
    validate_repository_name(name)?;

    if name.ends_with('.') || name.ends_with(' ') {
        return Err("Folder name cannot end with a dot or space".to_string());
    }

    Ok(())
}

fn is_invalid_path_character(character: char) -> bool {
    character.is_control() || matches!(character, '<' | '>' | ':' | '"' | '|' | '?' | '*')
}

fn is_scp_style_ssh_repository_url(repository_url: &str) -> bool {
    if repository_url.contains(char::is_whitespace) {
        return false;
    }

    let Some((user_host, repository_path)) = repository_url.split_once(':') else {
        return false;
    };

    let Some((user, host)) = user_host.split_once('@') else {
        return false;
    };

    !user.is_empty()
        && !host.is_empty()
        && !repository_path.is_empty()
        && !repository_path.starts_with('/')
}

fn remove_partial_clone_destination(path: &Path) {
    if path.exists() {
        let _ = fs::remove_dir_all(path);
    }
}

fn initialize_git_repository(repo_path: &Path, default_branch: &str) -> Result<(), String> {
    let init_output = git_command()
        .args(["-C", repo_path.to_string_lossy().as_ref(), "init"])
        .output()
        .map_err(|error| format!("Failed to run git init: {error}"))?;

    if !init_output.status.success() {
        return Err(git_error_message(
            &init_output.stderr,
            "Failed to initialize repository",
        ));
    }

    let default_head = format!("refs/heads/{default_branch}");
    let head_output = git_command()
        .args([
            "-C",
            repo_path.to_string_lossy().as_ref(),
            "symbolic-ref",
            "HEAD",
            &default_head,
        ])
        .output()
        .map_err(|error| format!("Failed to set default branch: {error}"))?;

    if !head_output.status.success() {
        return Err(git_error_message(
            &head_output.stderr,
            "Failed to set default branch",
        ));
    }

    Ok(())
}

fn write_repository_files(
    repo_path: &Path,
    repository_name: &str,
    gitignore_template_key: Option<&str>,
    gitignore_template_content: Option<&str>,
    license_template_key: Option<&str>,
    license_template_content: Option<&str>,
) -> Result<(), String> {
    let readme_path = repo_path.join("README.md");
    fs::write(&readme_path, format!("# {repository_name}\n"))
        .map_err(|error| format!("Failed to create README.md: {error}"))?;

    if let Some(gitignore_contents) =
        gitignore_template_content.filter(|value| !value.trim().is_empty())
    {
        fs::write(repo_path.join(".gitignore"), gitignore_contents)
            .map_err(|error| format!("Failed to create .gitignore: {error}"))?;
    } else if gitignore_template_key.is_some() {
        return Err("Selected .gitignore template content is empty".to_string());
    }

    if let Some(license_contents) =
        license_template_content.filter(|value| !value.trim().is_empty())
    {
        fs::write(repo_path.join("LICENSE"), license_contents)
            .map_err(|error| format!("Failed to create LICENSE: {error}"))?;
    } else if license_template_key.is_some() {
        return Err("Selected license template content is empty".to_string());
    }

    Ok(())
}

fn create_initial_commit(repo_path: &Path) -> Result<(), String> {
    let repo_path_string = repo_path.to_string_lossy().to_string();

    let add_output = git_command()
        .args(["-C", &repo_path_string, "add", "-A"])
        .output()
        .map_err(|error| format!("Failed to run git add: {error}"))?;

    if !add_output.status.success() {
        return Err(git_error_message(
            &add_output.stderr,
            "Failed to stage repository files",
        ));
    }

    let commit_output = git_command()
        .args(["-C", &repo_path_string, "commit", "-m", "Initial commit"])
        .output()
        .map_err(|error| format!("Failed to run git commit: {error}"))?;

    if !commit_output.status.success() {
        return Err(git_error_message(
            &commit_output.stderr,
            "Failed to create initial commit",
        ));
    }

    Ok(())
}

fn apply_git_identity_to_repository(
    repo_path: &Path,
    git_identity: Option<&GitIdentityWriteRequest>,
) -> Result<(), String> {
    let Some(git_identity) = git_identity else {
        return Ok(());
    };

    let scope = normalize_git_identity_scope(&git_identity.scope)?;
    let repo_path_string = repo_path.to_string_lossy().to_string();
    let repo_path_for_scope = if scope == "local" {
        Some(repo_path_string.as_str())
    } else {
        None
    };

    write_git_identity(
        repo_path_for_scope,
        scope,
        &git_identity.name,
        &git_identity.email,
    )
}

fn folder_name(path: &Path) -> Option<String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(std::string::ToString::to_string)
}

#[cfg(test)]
mod tests {
    use super::{
        create_repository_initial_commit, parse_clone_progress, validate_clone_repository_url,
    };
    use crate::git_support::git_command;
    use crate::settings::GitIdentityWriteRequest;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempTestDirectory {
        path: PathBuf,
    }

    impl TempTestDirectory {
        fn new(label: &str) -> Self {
            let unique_suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time before unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("litgit-{label}-{unique_suffix}"));
            fs::create_dir_all(&path).expect("temp test directory should be created");
            Self { path }
        }

        fn path_string(&self) -> String {
            self.path.to_string_lossy().to_string()
        }
    }

    impl Drop for TempTestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn validate_clone_repository_url_accepts_https_and_scp_style_ssh_urls() {
        assert!(validate_clone_repository_url("https://github.com/example/repo.git").is_ok());
        assert!(validate_clone_repository_url("git@github.com:example/repo.git").is_ok());
    }

    #[test]
    fn parse_clone_progress_returns_receiving_counts() {
        let progress =
            parse_clone_progress("Receiving objects:  42% (21/50), 12.00 KiB | 120.00 KiB/s")
                .expect("receiving progress should parse");

        assert_eq!(progress.phase, "receiving");
        assert_eq!(progress.percent, Some(42));
        assert_eq!(progress.received_objects, Some(21));
        assert_eq!(progress.total_objects, Some(50));
    }

    #[test]
    fn create_repository_initial_commit_applies_local_git_identity_when_initializing_repo() {
        let repo_path = TempTestDirectory::new("initial-commit");
        let repo_path_string = repo_path.path_string();

        let result = create_repository_initial_commit(
            repo_path_string.clone(),
            Some(GitIdentityWriteRequest {
                email: "dev@example.com".to_string(),
                name: "Lit Git Dev".to_string(),
                scope: "local".to_string(),
            }),
        );

        assert!(result.is_ok(), "initial commit should succeed: {result:?}");

        let name_output = git_command()
            .args([
                "-C",
                &repo_path_string,
                "config",
                "--local",
                "--get",
                "user.name",
            ])
            .output()
            .expect("git config name should run");
        let email_output = git_command()
            .args([
                "-C",
                &repo_path_string,
                "config",
                "--local",
                "--get",
                "user.email",
            ])
            .output()
            .expect("git config email should run");
        let head_output = git_command()
            .args(["-C", &repo_path_string, "rev-parse", "--verify", "HEAD"])
            .output()
            .expect("git rev-parse should run");

        assert_eq!(
            String::from_utf8_lossy(&name_output.stdout).trim(),
            "Lit Git Dev",
        );
        assert_eq!(
            String::from_utf8_lossy(&email_output.stdout).trim(),
            "dev@example.com",
        );
        assert!(
            head_output.status.success(),
            "initial commit should create HEAD: {}",
            String::from_utf8_lossy(&head_output.stderr)
        );
        assert!(
            !String::from_utf8_lossy(&head_output.stdout)
                .trim()
                .is_empty(),
            "HEAD should resolve to a commit hash",
        );
    }
}
