use crate::git_support::{
    ensure_git_output_success, git_command, git_error_message, is_git_repository_root,
    run_git_output, run_git_tool_output, validate_repository_path, GitSupportError,
};
use crate::settings::{
    apply_git_preferences_with_auth_session_from_snapshot, normalize_git_identity_scope,
    write_git_identity, GitIdentityWriteRequest, RepoCommandPreferences, SettingsCommandSnapshot,
    SettingsState,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager, State};
use thiserror::Error;

const CLONE_AUTH_PROMPT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

/// Error type for repository operations.
#[derive(Debug, Error)]
pub(crate) enum RepositoryError {
    /// A generic error message.
    #[error("{0}")]
    Message(String),

    /// An error occurred while running a git command.
    #[error("Failed to {action}: {source}")]
    GitCommand {
        /// The action that was being attempted.
        action: &'static str,
        /// The underlying I/O error.
        source: std::io::Error,
    },
}

impl From<RepositoryError> for String {
    fn from(error: RepositoryError) -> Self {
        error.to_string()
    }
}

fn map_git_support_error(error: GitSupportError) -> RepositoryError {
    match error {
        GitSupportError::Io { action, source } => RepositoryError::GitCommand { action, source },
        GitSupportError::Message(message) => RepositoryError::Message(message),
    }
}

fn run_repo_git_output(
    repo_path: &str,
    args: &[&str],
    action: &'static str,
) -> Result<std::process::Output, RepositoryError> {
    run_git_output(repo_path, args, action).map_err(map_git_support_error)
}

/// Metadata returned when a repository folder is picked or created.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PickedRepository {
    has_initial_commit: bool,
    is_git_repository: bool,
    name: String,
    path: String,
}

/// Generic picked file payload returned from native file dialogs.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PickedFilePath {
    /// Absolute file system path of the picked file.
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

struct CloneExecutionResult {
    stderr_output: String,
    succeeded: bool,
}

struct ApprovedCloneCredential {
    descriptor: String,
    remember: bool,
    secret: String,
}

/// Input payload used to initialize a new local repository.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateLocalRepositoryRequest {
    default_branch: String,
    destination_parent: String,
    git_identity: Option<GitIdentityWriteRequest>,
    gitignore_template_content: Option<String>,
    gitignore_template_key: Option<String>,
    license_template_content: Option<String>,
    license_template_key: Option<String>,
    name: String,
}

/// Opens a native folder picker and inspects whether the selected folder is a Git repository.
#[tauri::command]
pub(crate) fn pick_git_repository() -> Result<Option<PickedRepository>, String> {
    let Some(folder) = rfd::FileDialog::new().pick_folder() else {
        return Ok(None);
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

/// Opens a native folder picker for clone destination selection.
// Tauri keeps this command result-wrapped so the frontend invoke contract stays stable.
#[tauri::command]
pub(crate) fn pick_clone_destination_folder() -> Result<Option<String>, String> {
    let Some(folder) = rfd::FileDialog::new().pick_folder() else {
        return Ok(None);
    };

    Ok(Some(folder.to_string_lossy().to_string()))
}

/// Opens a native file picker used by settings flows.
// Tauri keeps this command result-wrapped so the frontend invoke contract stays stable.
#[tauri::command]
pub(crate) fn pick_settings_file() -> Result<Option<PickedFilePath>, String> {
    let Some(file) = rfd::FileDialog::new().pick_file() else {
        return Ok(None);
    };

    Ok(Some(PickedFilePath {
        path: file.to_string_lossy().to_string(),
    }))
}

/// Creates a new local Git repository with optional templates and initial commit.
#[tauri::command]
pub(crate) async fn create_local_repository(
    input: CreateLocalRepositoryRequest,
) -> Result<PickedRepository, String> {
    tauri::async_runtime::spawn_blocking(move || create_local_repository_inner(input))
        .await
        .map_err(|error| format!("Failed to create repository: {error}"))?
}

fn create_local_repository_inner(
    input: CreateLocalRepositoryRequest,
) -> Result<PickedRepository, String> {
    let CreateLocalRepositoryRequest {
        default_branch,
        destination_parent,
        git_identity,
        gitignore_template_content,
        gitignore_template_key,
        license_template_content,
        license_template_key,
        name,
    } = input;
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

/// Clones a repository into a destination folder and emits progress events.
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
    let settings_snapshot = state.command_snapshot()?;

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

    let auth_state = app.state::<crate::askpass_state::GitAuthBrokerState>();
    let auth_state_ref: &crate::askpass_state::GitAuthBrokerState = &auth_state;
    let auth_session = auth_state_ref.create_session("clone")?;
    let session_id = auth_session.session_id.clone();
    let _session_cleanup =
        crate::askpass_state::SessionCleanupGuard::new(auth_state_ref, session_id.clone());

    // Check if credentials are already stored for this HTTPS URL
    let credential_descriptor = if trimmed_url.starts_with("https://") {
        crate::git_support::build_git_credential_descriptor(trimmed_url, None).ok()
    } else {
        None
    };

    let has_stored_credentials = credential_descriptor
        .as_ref()
        .and_then(|desc| crate::git_support::git_credential_fill(desc).ok())
        .flatten()
        .is_some();

    emit_clone_progress(
        &app,
        CloneRepositoryProgress {
            phase: "preparing".to_string(),
            message: format!(
                "{} into {}",
                if has_stored_credentials {
                    "Using stored credentials"
                } else {
                    "Preparing to clone"
                },
                destination_path.display()
            ),
            percent: Some(3),
            received_objects: None,
            resolved_objects: None,
            total_objects: None,
        },
    );

    let mut clone_result = run_clone_command(
        app.clone(),
        settings_snapshot.clone(),
        trimmed_url.to_string(),
        destination_path.clone(),
        recurse_submodules,
        command_preferences.clone(),
        auth_session.clone(),
    )
    .await?;

    let mut approved_retry_credential: Option<ApprovedCloneCredential> = None;

    if !clone_result.succeeded
        && should_retry_clone_with_auth_prompt(trimmed_url, &clone_result.stderr_output)
    {
        approved_retry_credential =
            prompt_for_clone_retry_credentials(&app, auth_state_ref, &session_id, trimmed_url)
                .await?;
        clone_result = run_clone_command(
            app.clone(),
            settings_snapshot.clone(),
            trimmed_url.to_string(),
            destination_path.clone(),
            recurse_submodules,
            command_preferences.clone(),
            auth_session.clone(),
        )
        .await?;
    }

    let clone_succeeded = clone_result.succeeded;
    let auth_failed = !clone_succeeded
        && crate::git_support::is_git_authentication_message(&clone_result.stderr_output);

    // Handle credential approval/rejection based on operation result
    if let Some(descriptor) = credential_descriptor {
        if clone_succeeded {
            // Check if user wants to remember credentials
            if let Some(response) = auth_state.take_last_prompt_response(&session_id) {
                if response.remember {
                    if let Some(secret) = response.secret {
                        // Rebuild descriptor with username if provided
                        let descriptor_with_user = if let Some(username) = response.username {
                            crate::git_support::build_git_credential_descriptor(
                                trimmed_url,
                                Some(&username),
                            )
                            .ok()
                        } else {
                            Some(descriptor.clone())
                        };
                        if let Some(desc) = descriptor_with_user {
                            let _ = crate::git_support::git_credential_approve(&desc, &secret);
                        }
                    }
                }
            }
        } else if auth_failed {
            // Auth failed after submitting credentials - reject them
            if let Some(response) = auth_state.take_last_prompt_response(&session_id) {
                if let Some(secret) = response.secret {
                    let _ = crate::git_support::git_credential_reject(&descriptor, &secret);
                }
            }
        }
    }

    if let Some(approved_credential) = approved_retry_credential {
        if !approved_credential.remember {
            let _ = crate::git_support::git_credential_reject(
                &approved_credential.descriptor,
                &approved_credential.secret,
            );
        }
    }

    if !clone_succeeded {
        remove_partial_clone_destination(&destination_path);
        if !auth_state.session_has_prompt(&session_id) {
            if let Some(message) = oauth_first_unsupported_auth_message(trimmed_url) {
                return Err(message);
            }
        }
        return Err(git_error_message(
            clone_result.stderr_output.as_bytes(),
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

/// Filters repository paths and returns only existing folders that contain `.git`.
// Tauri keeps this command result-wrapped so the frontend invoke contract stays stable.
#[tauri::command]
pub(crate) async fn validate_opened_repositories(
    repo_paths: Vec<String>,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || validate_opened_repositories_inner(repo_paths))
        .await
        .map_err(|error| format!("Failed to validate opened repositories: {error}"))?
}

fn validate_opened_repositories_inner(repo_paths: Vec<String>) -> Result<Vec<String>, String> {
    let valid_paths = repo_paths
        .into_iter()
        .filter(|repo_path| {
            let path = Path::new(repo_path);
            path.exists() && is_git_repository_root(path)
        })
        .collect();

    Ok(valid_paths)
}

/// Creates an initial commit in an existing repository folder.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[tauri::command]
pub(crate) async fn create_repository_initial_commit(
    repo_path: String,
    git_identity: Option<GitIdentityWriteRequest>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        create_repository_initial_commit_inner(repo_path, git_identity)
    })
    .await
    .map_err(|error| format!("Failed to create initial commit: {error}"))?
}

fn create_repository_initial_commit_inner(
    repo_path: String,
    git_identity: Option<GitIdentityWriteRequest>,
) -> Result<(), String> {
    validate_repository_path(Path::new(&repo_path))?;

    if !is_git_repository_root(Path::new(&repo_path)) {
        let init_output = run_git_output(&repo_path, &["init"], "run git init")
            .map_err(|error| error.to_string())?;
        ensure_git_output_success(&init_output, "Failed to initialize repository")
            .map_err(|error| error.to_string())?;
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

    let add_output = run_git_output(&repo_path, &["add", "--", "README.md"], "run git add")
        .map_err(|error| error.to_string())?;
    ensure_git_output_success(&add_output, "Failed to stage README.md")
        .map_err(|error| error.to_string())?;

    let commit_output = run_git_output(
        &repo_path,
        &["commit", "--allow-empty", "-m", "Initial commit"],
        "run git commit",
    )
    .map_err(|error| error.to_string())?;
    ensure_git_output_success(&commit_output, "Failed to create initial commit")
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn repository_has_initial_commit(repo_path: &str) -> Result<bool, RepositoryError> {
    let output = run_repo_git_output(
        repo_path,
        &["rev-parse", "--verify", "HEAD"],
        "check repository history",
    )?;

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

async fn run_clone_command(
    app: AppHandle,
    settings_snapshot: SettingsCommandSnapshot,
    repository_url: String,
    destination_path: PathBuf,
    recurse_submodules: bool,
    command_preferences: RepoCommandPreferences,
    auth_session: crate::askpass_state::GitAuthSessionHandle,
) -> Result<CloneExecutionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut clone_command = git_command();
        apply_git_preferences_with_auth_session_from_snapshot(
            &mut clone_command,
            &command_preferences,
            Some(&settings_snapshot),
            Some(&auth_session),
        )?;
        clone_command.args([
            "clone",
            "--progress",
            &repository_url,
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

        let mut stderr_output = String::new();

        if let Some(stderr) = child.stderr.take() {
            let stderr_reader = BufReader::new(stderr);

            for line_result in stderr_reader.lines() {
                let line = line_result
                    .map_err(|error| format!("Failed to read git clone output: {error}"))?;
                stderr_output.push_str(&line);
                stderr_output.push('\n');
                if let Some(progress) = parse_clone_progress(&line) {
                    emit_clone_progress(&app, progress);
                }
            }
        }

        let status = child
            .wait()
            .map_err(|error| format!("Failed to finalize git clone: {error}"))?;

        Ok(CloneExecutionResult {
            stderr_output,
            succeeded: status.success(),
        })
    })
    .await
    .map_err(|error| format!("Failed to run git clone: {error}"))?
}

fn clone_prompt_provider_from_url(repository_url: &str) -> Option<&'static str> {
    let normalized = repository_url.trim().to_ascii_lowercase();

    if !(normalized.starts_with("https://") || normalized.starts_with("http://")) {
        return None;
    }

    if normalized.contains("github.com") {
        Some("github.com")
    } else if normalized.contains("gitlab.com") {
        Some("gitlab.com")
    } else if normalized.contains("bitbucket.org") {
        Some("bitbucket.org")
    } else {
        None
    }
}

fn should_retry_clone_with_auth_prompt(repository_url: &str, stderr_output: &str) -> bool {
    if clone_prompt_provider_from_url(repository_url).is_none() {
        return false;
    }

    crate::git_support::is_git_authentication_message(stderr_output)
        || stderr_output.to_lowercase().contains("access denied")
}

fn oauth_first_unsupported_auth_message(repository_url: &str) -> Option<String> {
    let normalized = repository_url.trim().to_ascii_lowercase();

    if normalized.starts_with("git@") || normalized.starts_with("ssh://") {
        return Some(
            "LitGit currently supports OAuth authentication for github.com, gitlab.com, and bitbucket.org over HTTPS only. SSH authentication is not supported in this product flow yet.".to_string(),
        );
    }

    if (normalized.starts_with("https://") || normalized.starts_with("http://"))
        && clone_prompt_provider_from_url(repository_url).is_none()
    {
        return Some(
            "LitGit currently supports OAuth authentication for github.com, gitlab.com, and bitbucket.org over HTTPS only. This host is not supported yet.".to_string(),
        );
    }

    None
}

async fn prompt_for_clone_retry_credentials(
    app: &AppHandle,
    auth_state: &crate::askpass_state::GitAuthBrokerState,
    session_id: &str,
    repository_url: &str,
) -> Result<Option<ApprovedCloneCredential>, String> {
    let Some(host) = clone_prompt_provider_from_url(repository_url) else {
        return Ok(None);
    };

    let prompt = format!("Password for 'https://{host}':");
    let prompt_id = auth_state.queue_prompt(session_id, &prompt, Some(host), None)?;
    let payload = crate::askpass::GitAuthPromptPayload {
        session_id: session_id.to_string(),
        prompt_id: prompt_id.clone(),
        operation: "clone".to_string(),
        prompt,
        host: Some(host.to_string()),
        username: None,
        kind: "https-password".to_string(),
        allow_remember: true,
    };

    crate::askpass::emit_git_auth_prompt(app, &payload)?;

    let response = auth_state
        .wait_for_prompt_response(session_id, &prompt_id, CLONE_AUTH_PROMPT_TIMEOUT)
        .await
        .ok_or_else(|| "Authentication timed out".to_string())?;

    if response.cancelled {
        return Err("Authentication cancelled".to_string());
    }

    let Some(secret) = response.secret else {
        return Ok(None);
    };

    let descriptor = crate::git_support::build_git_credential_descriptor(
        repository_url,
        response.username.as_deref(),
    )
    .map_err(|error| error.to_string())?;
    crate::git_support::git_credential_approve(&descriptor, &secret)
        .map_err(|error| error.to_string())?;

    Ok(Some(ApprovedCloneCredential {
        descriptor,
        remember: response.remember,
        secret,
    }))
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

/// Validates that a repository name does not contain path separators or invalid characters.
///
/// Rejects `.`, `..`, and any characters that are unsafe for file system paths.
pub(crate) fn validate_repository_name(name: &str) -> Result<(), RepositoryError> {
    if name == "." || name == ".." {
        return Err(RepositoryError::Message(
            "Repository name must be more specific".to_string(),
        ));
    }

    if name.contains('/') || name.contains('\\') {
        return Err(RepositoryError::Message(
            "Repository name cannot contain path separators".to_string(),
        ));
    }

    if name.chars().any(is_invalid_path_character) {
        return Err(RepositoryError::Message(
            "Repository name contains unsupported characters".to_string(),
        ));
    }

    Ok(())
}

/// Validates a branch name using `git check-ref-format`.
///
/// Returns an error when the name does not follow Git branch naming conventions.
pub(crate) fn validate_branch_name(name: &str) -> Result<(), RepositoryError> {
    let output = run_git_tool_output(
        &["check-ref-format", "--branch", name],
        "validate default branch name",
    )
    .map_err(map_git_support_error)?;

    if !output.status.success() {
        return Err(RepositoryError::Message(
            "Enter a valid Git branch name".to_string(),
        ));
    }

    Ok(())
}

fn validate_clone_repository_url(repository_url: &str) -> Result<(), RepositoryError> {
    if repository_url.starts_with("file://") {
        return Err(RepositoryError::Message(
            "Local file clone URLs are not supported".to_string(),
        ));
    }

    if repository_url.starts_with("https://")
        || repository_url.starts_with("ssh://")
        || is_scp_style_ssh_repository_url(repository_url)
    {
        return Ok(());
    }

    Err(RepositoryError::Message(
        "Enter a valid HTTPS or SSH repository URL".to_string(),
    ))
}

fn validate_clone_destination_folder_name(name: &str) -> Result<(), RepositoryError> {
    validate_repository_name(name)?;

    if name.ends_with('.') || name.ends_with(' ') {
        return Err(RepositoryError::Message(
            "Folder name cannot end with a dot or space".to_string(),
        ));
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

fn initialize_git_repository(
    repo_path: &Path,
    default_branch: &str,
) -> Result<(), RepositoryError> {
    let repo_path_string = repo_path.to_string_lossy().to_string();
    let init_output = run_repo_git_output(&repo_path_string, &["init"], "run git init")?;

    if !init_output.status.success() {
        return Err(RepositoryError::Message(git_error_message(
            &init_output.stderr,
            "Failed to initialize repository",
        )));
    }

    let branch_output = run_repo_git_output(
        &repo_path_string,
        &["checkout", "-b", default_branch],
        "run git checkout",
    )?;

    if !branch_output.status.success() {
        return Err(RepositoryError::Message(git_error_message(
            &branch_output.stderr,
            "Failed to set default branch",
        )));
    }

    Ok(())
}

fn apply_git_identity_to_repository(
    repo_path: &Path,
    git_identity: Option<&GitIdentityWriteRequest>,
) -> Result<(), RepositoryError> {
    let Some(identity) = git_identity else {
        return Ok(());
    };

    let scope = normalize_git_identity_scope(identity.scope.as_str())
        .map_err(|message| RepositoryError::Message(message.to_string()))?;

    let local_name = repo_path.to_string_lossy().to_string();
    let repo_path_for_scope = if scope == "local" {
        Some(local_name.as_str())
    } else {
        None
    };

    write_git_identity(
        repo_path_for_scope,
        scope,
        identity.name.as_str(),
        identity.email.as_str(),
    )
    .map_err(|e| RepositoryError::Message(e.to_string()))?;

    Ok(())
}

fn write_repository_files(
    repo_path: &Path,
    repository_name: &str,
    gitignore_template_key: Option<&str>,
    gitignore_template_content: Option<&str>,
    license_template_key: Option<&str>,
    license_template_content: Option<&str>,
) -> Result<(), RepositoryError> {
    let readme_path = repo_path.join("README.md");
    fs::write(&readme_path, format!("# {repository_name}\n")).map_err(|error| {
        RepositoryError::Message(format!("Failed to create README.md: {error}"))
    })?;

    if let Some(gitignore_contents) =
        gitignore_template_content.filter(|value| !value.trim().is_empty())
    {
        fs::write(repo_path.join(".gitignore"), gitignore_contents).map_err(|error| {
            RepositoryError::Message(format!("Failed to create .gitignore: {error}"))
        })?;
    } else if gitignore_template_key.is_some() {
        return Err(RepositoryError::Message(
            "Selected .gitignore template content is empty".to_string(),
        ));
    }

    if let Some(license_contents) =
        license_template_content.filter(|value| !value.trim().is_empty())
    {
        fs::write(repo_path.join("LICENSE"), license_contents).map_err(|error| {
            RepositoryError::Message(format!("Failed to create LICENSE: {error}"))
        })?;
    } else if license_template_key.is_some() {
        return Err(RepositoryError::Message(
            "Selected license template content is empty".to_string(),
        ));
    }

    Ok(())
}

fn create_initial_commit(repo_path: &Path) -> Result<(), RepositoryError> {
    let repo_path_string = repo_path.to_string_lossy().to_string();

    let add_output = run_repo_git_output(&repo_path_string, &["add", "-A"], "run git add")?;

    if !add_output.status.success() {
        return Err(RepositoryError::Message(git_error_message(
            &add_output.stderr,
            "Failed to stage repository files",
        )));
    }

    let commit_output = run_repo_git_output(
        &repo_path_string,
        &["commit", "-m", "Initial commit"],
        "run git commit",
    )?;

    if !commit_output.status.success() {
        return Err(RepositoryError::Message(git_error_message(
            &commit_output.stderr,
            "Failed to create initial commit",
        )));
    }

    Ok(())
}

fn folder_name(path: &Path) -> Option<String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(std::string::ToString::to_string)
}

#[cfg(test)]
mod tests {
    use super::{
        create_local_repository, create_repository_initial_commit,
        oauth_first_unsupported_auth_message, parse_clone_progress,
        should_retry_clone_with_auth_prompt, validate_clone_repository_url,
        validate_opened_repositories, CreateLocalRepositoryRequest, RepoCommandPreferences,
    };
    use crate::git_support::git_command;
    use crate::settings::GitIdentityWriteRequest;
    use serde_json::json;
    use std::fs;
    use std::path::PathBuf;
    use std::process::Output;
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

    fn git_output(repo_path: &str, args: &[&str]) -> Output {
        git_command()
            .args(["-C", repo_path])
            .args(args)
            .output()
            .expect("git command should run")
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
    fn clone_command_uses_auth_session_env() {
        let mut command = crate::git_support::git_command();
        let preferences = RepoCommandPreferences::default();
        let settings_state = crate::settings::SettingsState::default();
        let session = crate::askpass_state::GitAuthSessionHandle {
            session_id: "clone-session".to_string(),
            secret: "clone-secret".to_string(),
            operation: "clone".to_string(),
        };
        settings_state.set_askpass_socket_path(std::env::temp_dir().join("litgit-test.sock"));
        let settings_snapshot = settings_state
            .command_snapshot()
            .expect("settings snapshot should build");

        crate::settings::apply_git_preferences_with_auth_session_from_snapshot(
            &mut command,
            &preferences,
            Some(&settings_snapshot),
            Some(&session),
        )
        .expect("git preferences should apply");

        let envs = command
            .get_envs()
            .map(|(key, value)| {
                (
                    key.to_string_lossy().to_string(),
                    value.map(|entry| entry.to_string_lossy().to_string()),
                )
            })
            .collect::<std::collections::HashMap<_, _>>();

        assert_eq!(
            envs.get("LITGIT_ASKPASS_OPERATION"),
            Some(&Some("clone".to_string()))
        );
    }

    #[test]
    fn validate_clone_repository_url_rejects_local_file_clone_urls() {
        let error = validate_clone_repository_url("file:///tmp/repo.git")
            .expect_err("local file clone urls should be rejected");

        assert_eq!(error.to_string(), "Local file clone URLs are not supported");
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
    fn parse_clone_progress_returns_resolving_counts() {
        let progress = parse_clone_progress("Resolving deltas:  75% (15/20)")
            .expect("resolving progress should parse");

        assert_eq!(progress.phase, "resolving");
        assert_eq!(progress.percent, Some(75));
        assert_eq!(progress.resolved_objects, Some(15));
        assert_eq!(progress.total_objects, Some(20));
    }

    #[test]
    fn should_retry_clone_with_auth_prompt_for_known_provider_not_found_error() {
        assert!(should_retry_clone_with_auth_prompt(
            "https://github.com/example/private.git",
            "remote: Repository not found.",
        ));
    }

    #[test]
    fn should_retry_clone_with_auth_prompt_for_silent_git_failures() {
        assert!(should_retry_clone_with_auth_prompt(
            "https://github.com/example/private.git",
            "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
        ));
    }

    #[test]
    fn should_not_retry_clone_with_auth_prompt_for_unknown_host() {
        assert!(!should_retry_clone_with_auth_prompt(
            "https://code.example.com/private.git",
            "remote: Repository not found.",
        ));
    }

    #[test]
    fn oauth_first_unsupported_auth_message_reports_unknown_https_host() {
        let message = oauth_first_unsupported_auth_message("https://code.example.com/private.git");

        assert_eq!(
            message.as_deref(),
            Some(
                "LitGit currently supports OAuth authentication for github.com, gitlab.com, and bitbucket.org over HTTPS only. This host is not supported yet."
            )
        );
    }

    #[test]
    fn oauth_first_unsupported_auth_message_reports_ssh_as_unsupported() {
        let message = oauth_first_unsupported_auth_message("git@github.com:owner/repo.git");

        assert_eq!(
            message.as_deref(),
            Some(
                "LitGit currently supports OAuth authentication for github.com, gitlab.com, and bitbucket.org over HTTPS only. SSH authentication is not supported in this product flow yet."
            )
        );
    }

    #[test]
    fn create_local_repository_request_deserializes_frontend_camel_case_payload() {
        let payload = json!({
            "name": "litgit",
            "destinationParent": "/tmp",
            "defaultBranch": "main",
            "gitignoreTemplateKey": "node",
            "gitignoreTemplateContent": "dist/",
            "licenseTemplateKey": "mit",
            "licenseTemplateContent": "MIT",
            "gitIdentity": {
                "name": "Lit Git",
                "email": "litgit@example.com",
                "scope": "local"
            }
        });

        let request: CreateLocalRepositoryRequest =
            serde_json::from_value(payload).expect("request should deserialize");

        assert_eq!(request.name, "litgit");
        assert_eq!(request.destination_parent, "/tmp");
        assert_eq!(request.default_branch, "main");
        assert_eq!(request.gitignore_template_key.as_deref(), Some("node"));
        assert_eq!(request.gitignore_template_content.as_deref(), Some("dist/"));
        assert_eq!(request.license_template_key.as_deref(), Some("mit"));
        assert_eq!(request.license_template_content.as_deref(), Some("MIT"));
        assert_eq!(
            request
                .git_identity
                .as_ref()
                .map(|identity| identity.name.as_str()),
            Some("Lit Git")
        );
    }

    #[tokio::test]
    async fn create_local_repository_creates_repository_with_initial_commit() {
        let parent_dir = TempTestDirectory::new("create-local-parent");

        let repository = create_local_repository(CreateLocalRepositoryRequest {
            default_branch: "main".to_string(),
            destination_parent: parent_dir.path_string(),
            git_identity: Some(GitIdentityWriteRequest {
                email: "dev@example.com".to_string(),
                name: "Lit Git Dev".to_string(),
                scope: "local".to_string(),
            }),
            gitignore_template_content: Some("dist/\n".to_string()),
            gitignore_template_key: Some("node".to_string()),
            license_template_content: Some("MIT License\n".to_string()),
            license_template_key: Some("mit".to_string()),
            name: "litgit-local".to_string(),
        })
        .await
        .expect("local repository should be created");

        let repo_path = repository.path;
        let head_output = git_output(&repo_path, &["rev-parse", "--verify", "HEAD"]);
        let branch_output = git_output(&repo_path, &["branch", "--show-current"]);
        let status_output = git_output(&repo_path, &["status", "--short"]);

        assert!(repository.has_initial_commit);
        assert!(repository.is_git_repository);
        assert_eq!(repository.name, "litgit-local");
        assert!(head_output.status.success(), "HEAD should exist");
        assert_eq!(
            String::from_utf8_lossy(&branch_output.stdout).trim(),
            "main"
        );
        assert_eq!(String::from_utf8_lossy(&status_output.stdout), "");
        assert_eq!(
            fs::read_to_string(PathBuf::from(&repo_path).join("README.md")).expect("read readme"),
            "# litgit-local\n"
        );
        assert_eq!(
            fs::read_to_string(PathBuf::from(&repo_path).join(".gitignore"))
                .expect("read gitignore"),
            "dist/\n"
        );
        assert_eq!(
            fs::read_to_string(PathBuf::from(&repo_path).join("LICENSE")).expect("read license"),
            "MIT License\n"
        );
    }

    #[tokio::test]
    async fn validate_opened_repositories_returns_only_existing_git_directories() {
        let git_repo = TempTestDirectory::new("opened-repo");
        let plain_dir = TempTestDirectory::new("plain-dir");
        let missing_path = plain_dir.path.join("missing");
        git_command()
            .args(["init", "--quiet", git_repo.path.to_string_lossy().as_ref()])
            .output()
            .expect("git init should run");

        let valid_paths = validate_opened_repositories(vec![
            git_repo.path_string(),
            plain_dir.path_string(),
            missing_path.to_string_lossy().to_string(),
        ])
        .await
        .expect("opened repositories should validate");

        assert_eq!(valid_paths, vec![git_repo.path_string()]);
    }

    #[tokio::test]
    async fn validate_opened_repositories_rejects_invalid_git_file_markers() {
        let fake_repo = TempTestDirectory::new("fake-git-file");
        fs::write(fake_repo.path.join(".git"), "gitdir: /missing/location")
            .expect("fake git file should be written");

        let valid_paths = validate_opened_repositories(vec![fake_repo.path_string()])
            .await
            .expect("validation");

        assert!(valid_paths.is_empty());
    }

    #[tokio::test]
    async fn create_repository_initial_commit_applies_local_git_identity_when_initializing_repo() {
        let repo_path = TempTestDirectory::new("initial-commit");
        let repo_path_string = repo_path.path_string();

        let result = create_repository_initial_commit(
            repo_path_string.clone(),
            Some(GitIdentityWriteRequest {
                email: "dev@example.com".to_string(),
                name: "Lit Git Dev".to_string(),
                scope: "local".to_string(),
            }),
        )
        .await;

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

    #[test]
    fn is_scp_style_ssh_repository_url_accepts_only_scp_style_urls() {
        use super::is_scp_style_ssh_repository_url;

        assert!(is_scp_style_ssh_repository_url(
            "git@github.com:owner/repo.git"
        ));
        assert!(is_scp_style_ssh_repository_url(
            "user@host.com:path/to/repo"
        ));
        assert!(!is_scp_style_ssh_repository_url(
            "https://github.com/owner/repo.git"
        ));
        assert!(!is_scp_style_ssh_repository_url(
            "git@github.com:/absolute/path"
        ));
        assert!(!is_scp_style_ssh_repository_url(
            "ssh://git@github.com/owner/repo.git"
        ));
        assert!(!is_scp_style_ssh_repository_url("git@github.com: "));
    }
}
