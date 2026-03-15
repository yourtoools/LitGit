use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use encoding_rs::{Encoding, UTF_8};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::io::Write;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;
use tauri::State;
use tauri::{AppHandle, Emitter};
use ureq::Proxy;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

mod diff_preview;
use diff_preview::{
    get_repository_commit_file_content, get_repository_commit_file_preflight,
    get_repository_file_content, get_repository_file_preflight,
};
mod diff_workspace;
use diff_workspace::{
    detect_repository_file_encoding, get_repository_commit_file_hunks, get_repository_file_blame,
    get_repository_file_history, get_repository_file_hunks, get_repository_file_text,
    save_repository_file_text,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PickedRepository {
    has_initial_commit: bool,
    is_git_repository: bool,
    name: String,
    path: String,
}

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
struct RepositoryHistoryPayload {
    commits: Vec<RepositoryCommit>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryBranch {
    ref_type: String,
    is_remote: bool,
    name: String,
    short_hash: String,
    last_commit_date: String,
    is_current: bool,
    commit_count: Option<usize>,
    ahead_count: Option<usize>,
    behind_count: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryStash {
    anchor_commit_hash: String,
    message: String,
    r#ref: String,
    short_hash: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryWorkingTreeStatus {
    has_changes: bool,
    staged_count: usize,
    unstaged_count: usize,
    untracked_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryWorkingTreeItem {
    path: String,
    staged_status: String,
    unstaged_status: String,
    is_untracked: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryFileEntry {
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryFileDiff {
    path: String,
    old_text: String,
    new_text: String,
    viewer_kind: String,
    old_image_data_url: Option<String>,
    new_image_data_url: Option<String>,
    unsupported_extension: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryCommitFile {
    status: String,
    path: String,
    previous_path: Option<String>,
    additions: usize,
    deletions: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryCommitFileDiff {
    commit_hash: String,
    path: String,
    old_text: String,
    new_text: String,
    viewer_kind: String,
    old_image_data_url: Option<String>,
    new_image_data_url: Option<String>,
    unsupported_extension: Option<String>,
}

struct DiffPreviewPayload {
    viewer_kind: String,
    old_text: String,
    new_text: String,
    old_image_data_url: Option<String>,
    new_image_data_url: Option<String>,
    unsupported_extension: Option<String>,
}

const MAX_IMAGE_PREVIEW_BYTES: usize = 64 * 1024 * 1024;

fn resolve_file_extension(file_path: &str) -> Option<String> {
    Path::new(file_path)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
}

fn resolve_image_mime_type(extension: &str) -> Option<&'static str> {
    match extension {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        "avif" => Some("image/avif"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

fn encode_image_data_url(content: &[u8], mime_type: &str) -> Option<String> {
    if content.is_empty() || content.len() > MAX_IMAGE_PREVIEW_BYTES {
        return None;
    }

    let encoded = BASE64_STANDARD.encode(content);
    Some(format!("data:{mime_type};base64,{encoded}"))
}

fn is_probably_text_content(content: Option<&[u8]>) -> bool {
    let Some(content) = content else {
        return true;
    };

    if content.is_empty() {
        return true;
    }

    !content.contains(&0) && std::str::from_utf8(content).is_ok()
}

fn text_content_to_string(content: Option<&[u8]>) -> String {
    content
        .map(|bytes| String::from_utf8_lossy(bytes).to_string())
        .unwrap_or_default()
}

fn resolve_text_encoding(encoding: Option<&str>) -> Result<&'static Encoding, String> {
    let normalized = encoding.map(str::trim).filter(|value| !value.is_empty());
    let Some(encoding_label) = normalized else {
        return Ok(UTF_8);
    };

    if encoding_label.eq_ignore_ascii_case("utf-8") || encoding_label.eq_ignore_ascii_case("utf8") {
        return Ok(UTF_8);
    }

    Encoding::for_label(encoding_label.as_bytes())
        .ok_or_else(|| format!("Unsupported encoding: {encoding_label}"))
}

fn decode_text_content_with_encoding(
    content: Option<&[u8]>,
    encoding: Option<&str>,
) -> Result<String, String> {
    let Some(bytes) = content else {
        return Ok(String::new());
    };

    if bytes.is_empty() {
        return Ok(String::new());
    }

    let selected_encoding = resolve_text_encoding(encoding)?;
    let (decoded, _, had_errors) = selected_encoding.decode(bytes);

    if had_errors {
        return Err("Failed to decode file with selected encoding".to_string());
    }

    Ok(decoded.into_owned())
}

fn encode_text_with_encoding(text: &str, encoding: Option<&str>) -> Result<Vec<u8>, String> {
    let selected_encoding = resolve_text_encoding(encoding)?;
    let (encoded, _, had_errors) = selected_encoding.encode(text);

    if had_errors {
        return Err("Failed to encode file with selected encoding".to_string());
    }

    Ok(encoded.into_owned())
}

fn build_diff_preview_payload(
    file_path: &str,
    old_content: Option<&[u8]>,
    new_content: Option<&[u8]>,
) -> DiffPreviewPayload {
    let extension = resolve_file_extension(file_path);

    if let Some(extension) = extension.clone() {
        if let Some(mime_type) = resolve_image_mime_type(&extension) {
            let old_image_data_url =
                old_content.and_then(|content| encode_image_data_url(content, mime_type));
            let new_image_data_url =
                new_content.and_then(|content| encode_image_data_url(content, mime_type));

            if old_image_data_url.is_some() || new_image_data_url.is_some() {
                return DiffPreviewPayload {
                    viewer_kind: "image".to_string(),
                    old_text: String::new(),
                    new_text: String::new(),
                    old_image_data_url,
                    new_image_data_url,
                    unsupported_extension: None,
                };
            }

            return DiffPreviewPayload {
                viewer_kind: "unsupported".to_string(),
                old_text: String::new(),
                new_text: String::new(),
                old_image_data_url: None,
                new_image_data_url: None,
                unsupported_extension: Some(extension),
            };
        }
    }

    if is_probably_text_content(old_content) && is_probably_text_content(new_content) {
        return DiffPreviewPayload {
            viewer_kind: "text".to_string(),
            old_text: text_content_to_string(old_content),
            new_text: text_content_to_string(new_content),
            old_image_data_url: None,
            new_image_data_url: None,
            unsupported_extension: None,
        };
    }

    DiffPreviewPayload {
        viewer_kind: "unsupported".to_string(),
        old_text: String::new(),
        new_text: String::new(),
        old_image_data_url: None,
        new_image_data_url: None,
        unsupported_extension: extension,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PullActionResult {
    head_changed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MergeActionResult {
    head_changed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LatestRepositoryCommitMessage {
    summary: String,
    description: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AiModelInfo {
    id: String,
    label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedCommitMessage {
    body: String,
    title: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsBackendCapabilities {
    runtime_platform: String,
    secure_storage_available: bool,
    session_secrets_supported: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SecretStatusPayload {
    has_stored_value: bool,
    storage_mode: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HttpCredentialEntryMetadata {
    host: String,
    id: String,
    port: Option<u16>,
    protocol: String,
    username: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProxyTestResult {
    message: String,
    ok: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PickedFilePath {
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SigningKeyInfo {
    id: String,
    label: String,
    r#type: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SystemFontFamily {
    family: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GitIdentityValue {
    email: Option<String>,
    is_complete: bool,
    name: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GitIdentityStatusPayload {
    effective: GitIdentityValue,
    effective_scope: Option<String>,
    global: GitIdentityValue,
    local: Option<GitIdentityValue>,
    repo_path: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitIdentityWriteRequest {
    email: String,
    name: String,
    scope: String,
}

#[derive(Clone)]
struct StoredSecretValue {
    storage_mode: String,
    value: String,
}

impl StoredSecretValue {
    fn session(value: &str) -> Self {
        Self {
            storage_mode: "session".to_string(),
            value: value.to_string(),
        }
    }
}

#[derive(Clone)]
struct StoredHttpCredential {
    host: String,
    port: Option<u16>,
    protocol: String,
    secret: StoredSecretValue,
    username: String,
}

struct NetworkOperationGuard<'a> {
    active_operations: &'a Arc<Mutex<HashSet<String>>>,
    repo_path: String,
}

impl Drop for NetworkOperationGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut active_operations) = self.active_operations.lock() {
            active_operations.remove(&self.repo_path);
        }
    }
}

const AI_SECRET_SERVICE: &str = "litgit.ai.provider";
const PROXY_SECRET_SERVICE: &str = "litgit.proxy.auth";
const GITHUB_AVATAR_SERVICE: &str = "litgit.github.avatar";
const GITHUB_IDENTITY_CACHE_MAX_ENTRIES: usize = 1024;
const GITHUB_IDENTITY_CACHE_TTL: Duration = Duration::from_secs(60 * 60);
const GITHUB_IDENTITY_CACHE_FILE_NAME: &str = "github_identity_cache.json";
const GITHUB_IDENTITY_CACHE_VERSION: u8 = 1;

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoCommandPreferences {
    enable_proxy: Option<bool>,
    gpg_program_path: Option<String>,
    proxy_auth_password: Option<String>,
    proxy_auth_enabled: Option<bool>,
    proxy_host: Option<String>,
    proxy_port: Option<u16>,
    proxy_type: Option<String>,
    proxy_username: Option<String>,
    ssh_private_key_path: Option<String>,
    ssh_public_key_path: Option<String>,
    signing_format: Option<String>,
    signing_key: Option<String>,
    sign_commits_by_default: Option<bool>,
    ssl_verification: Option<bool>,
    use_git_credential_manager: Option<bool>,
    use_local_ssh_agent: Option<bool>,
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
fn pick_git_repository() -> Result<Option<PickedRepository>, String> {
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
fn pick_clone_destination_folder() -> Result<Option<String>, String> {
    let folder = match rfd::FileDialog::new().pick_folder() {
        Some(folder) => folder,
        None => return Ok(None),
    };

    Ok(Some(folder.to_string_lossy().to_string()))
}

#[tauri::command]
fn pick_settings_file() -> Result<Option<PickedFilePath>, String> {
    let file = match rfd::FileDialog::new().pick_file() {
        Some(file) => file,
        None => return Ok(None),
    };

    Ok(Some(PickedFilePath {
        path: file.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
fn generate_ssh_keypair(file_name: String) -> Result<PickedFilePath, String> {
    let trimmed_name = file_name.trim();

    if trimmed_name.is_empty() {
        return Err("Key file name is required".to_string());
    }

    let home = env::var("HOME").map_err(|_| "HOME is not available".to_string())?;
    let ssh_dir = Path::new(&home).join(".ssh");
    fs::create_dir_all(&ssh_dir)
        .map_err(|error| format!("Failed to create ~/.ssh directory: {error}"))?;

    let key_path = ssh_dir.join(trimmed_name);

    let mut command = background_command("ssh-keygen");
    let output = command
        .args([
            "-t",
            "ed25519",
            "-N",
            "",
            "-f",
            key_path.to_string_lossy().as_ref(),
        ])
        .output()
        .map_err(|error| format!("Failed to run ssh-keygen: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to generate SSH keypair",
        ));
    }

    Ok(PickedFilePath {
        path: key_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn list_signing_keys() -> Result<Vec<SigningKeyInfo>, String> {
    let mut keys = Vec::new();

    let mut command = background_command("gpg");
    let gpg_output = command
        .args([
            "--list-secret-keys",
            "--keyid-format",
            "LONG",
            "--with-colons",
        ])
        .output();

    if let Ok(output) = gpg_output {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);

            let mut current_key_id: Option<String> = None;

            for line in stdout.lines() {
                let parts: Vec<&str> = line.split(':').collect();

                if parts.is_empty() {
                    continue;
                }

                match parts[0] {
                    "sec" => {
                        current_key_id = parts.get(4).map(|value| value.to_string());
                    }
                    "uid" => {
                        if let Some(key_id) = current_key_id.clone() {
                            let label = parts.get(9).unwrap_or(&"GPG key").to_string();
                            keys.push(SigningKeyInfo {
                                id: key_id,
                                label,
                                r#type: "gpg".to_string(),
                            });
                            current_key_id = None;
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    let home = env::var("HOME").unwrap_or_default();
    let ssh_dir = Path::new(&home).join(".ssh");

    if ssh_dir.exists() {
        let entries = fs::read_dir(&ssh_dir)
            .map_err(|error| format!("Failed to read ~/.ssh directory: {error}"))?;

        for entry in entries.flatten() {
            let path = entry.path();

            if path.extension().and_then(|value| value.to_str()) == Some("pub") {
                let label = path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("SSH public key")
                    .to_string();

                keys.push(SigningKeyInfo {
                    id: path.to_string_lossy().to_string(),
                    label,
                    r#type: "ssh".to_string(),
                });
            }
        }
    }

    Ok(keys)
}

#[tauri::command]
fn list_system_font_families(
    state: State<'_, SettingsState>,
) -> Result<Vec<SystemFontFamily>, String> {
    let mut cached_fonts = state
        .system_font_families
        .lock()
        .map_err(|_| "Failed to access system font cache".to_string())?;

    if let Some(font_families) = cached_fonts.as_ref() {
        return Ok(font_families.clone());
    }

    let mut database = fontdb::Database::new();
    database.load_system_fonts();

    let families = database
        .faces()
        .flat_map(|face| face.families.iter())
        .map(|(family, _language)| family.trim())
        .filter(|family| !family.is_empty())
        .collect::<HashSet<_>>();

    let mut font_families = families
        .into_iter()
        .map(|family| SystemFontFamily {
            family: family.to_string(),
        })
        .collect::<Vec<_>>();

    font_families.sort_by(|left, right| left.family.cmp(&right.family));

    *cached_fonts = Some(font_families.clone());

    Ok(font_families)
}

#[tauri::command]
fn create_local_repository(
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
async fn clone_git_repository(
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
fn get_git_identity(repo_path: Option<String>) -> Result<GitIdentityStatusPayload, String> {
    let repo_path = repo_path.and_then(|value| {
        let trimmed = value.trim();

        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });

    if let Some(path) = repo_path.as_deref() {
        validate_git_repo(Path::new(path))?;
    }

    build_git_identity_status(repo_path.as_deref())
}

#[tauri::command]
fn set_git_identity(
    git_identity: GitIdentityWriteRequest,
    repo_path: Option<String>,
) -> Result<GitIdentityStatusPayload, String> {
    let normalized_repo_path = repo_path.and_then(|value| {
        let trimmed = value.trim();

        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });

    let scope = normalize_git_identity_scope(&git_identity.scope)?;
    let repo_path_for_scope = match scope {
        "global" => None,
        "local" => {
            let repo_path = normalized_repo_path.as_deref().ok_or_else(|| {
                "A repository path is required for local Git identity".to_string()
            })?;
            validate_git_repo(Path::new(repo_path))?;
            Some(repo_path)
        }
        _ => return Err("Unsupported Git identity scope".to_string()),
    };

    write_git_identity(
        repo_path_for_scope,
        scope,
        &git_identity.name,
        &git_identity.email,
    )?;

    build_git_identity_status(normalized_repo_path.as_deref())
}

#[tauri::command]
fn validate_opened_repositories(repo_paths: Vec<String>) -> Result<Vec<String>, String> {
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
fn create_repository_initial_commit(
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
        std::fs::write(&readme_path, format!("# {repo_name}\n"))
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
fn get_repository_history(
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
    let pullable_commits = if let Some(upstream_ref) = resolve_repository_upstream_ref(&repo_path)? {
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
fn get_latest_repository_commit_message(
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
fn get_repository_branches(repo_path: String) -> Result<Vec<RepositoryBranch>, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = git_command()
    .args([
      "-C",
      &repo_path,
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(HEAD)\t%(refname)\t%(refname:short)\t%(objectname:short)\t%(committerdate:iso-strict)\t%(objectname)\t%(upstream:short)",
      "refs/heads",
      "refs/remotes",
      "refs/tags",
    ])
    .output()
    .map_err(|error| format!("Failed to run git for-each-ref: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to read repository branches".to_string()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut current_branch_upstream: Option<String> = None;
    for row in stdout.lines() {
        let trimmed = row.trim_end();

        if trimmed.is_empty() {
            continue;
        }

        let mut parts = trimmed.split('\t');
        let head = parts.next().unwrap_or(" ").trim();
        let _full_ref_name = parts.next().unwrap_or("").trim();
        let _name = parts.next().unwrap_or("").trim();
        let _short_hash = parts.next().unwrap_or("").trim();
        let _last_commit_date = parts.next().unwrap_or("").trim();
        let _full_hash = parts.next().unwrap_or("").trim();
        let upstream_ref = parts.next().unwrap_or("").trim();

        if head == "*" && !upstream_ref.is_empty() {
            current_branch_upstream = Some(upstream_ref.to_string());
            break;
        }
    }

    let current_branch_sync_counts = if let Some(upstream_ref) = current_branch_upstream.as_deref() {
        let sync_count_output = git_command()
            .args([
                "-C",
                &repo_path,
                "rev-list",
                "--left-right",
                "--count",
                &format!("HEAD...{upstream_ref}"),
            ])
            .output()
            .map_err(|error| format!("Failed to run git rev-list: {error}"))?;

        if sync_count_output.status.success() {
            let counts = String::from_utf8_lossy(&sync_count_output.stdout);
            let mut values = counts.split_whitespace();
            let ahead = values.next().unwrap_or("0").parse::<usize>().unwrap_or(0);
            let behind = values.next().unwrap_or("0").parse::<usize>().unwrap_or(0);
            Some((ahead, behind))
        } else {
            None
        }
    } else {
        None
    };

    let mut branches = Vec::new();

    for row in stdout.lines() {
        let trimmed = row.trim_end();

        if trimmed.is_empty() {
            continue;
        }

        let mut parts = trimmed.split('\t');
        let head = parts.next().unwrap_or(" ").trim();
        let full_ref_name = parts.next().unwrap_or("").trim();
        let name = parts.next().unwrap_or("").to_string();
        let short_hash = parts.next().unwrap_or("").to_string();
        let last_commit_date = parts.next().unwrap_or("").to_string();
        let _full_hash = parts.next().unwrap_or("").to_string();
        let upstream_ref = parts.next().unwrap_or("").trim().to_string();

        if full_ref_name.starts_with("refs/remotes/") && full_ref_name.ends_with("/HEAD") {
            continue;
        }

        if name.is_empty() || _full_hash.is_empty() {
            continue;
        }

        let ref_type = if full_ref_name.starts_with("refs/tags/") {
            "tag".to_string()
        } else {
            "branch".to_string()
        };
        let is_remote = full_ref_name.starts_with("refs/remotes/");
        let (ahead_count, behind_count) =
            if head == "*" && !upstream_ref.is_empty() && !is_remote {
                current_branch_sync_counts.unwrap_or((0, 0))
            } else {
                (0, 0)
            };

        branches.push(RepositoryBranch {
            ref_type,
            is_remote,
            name,
            short_hash,
            last_commit_date,
            is_current: head == "*",
            commit_count: None,
            ahead_count: if head == "*" && !is_remote {
                Some(ahead_count)
            } else {
                None
            },
            behind_count: if head == "*" && !is_remote {
                Some(behind_count)
            } else {
                None
            },
        });
    }

    Ok(branches)
}

#[tauri::command]
fn get_repository_remote_names(repo_path: String) -> Result<Vec<String>, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = git_command()
        .args(["-C", &repo_path, "remote"])
        .output()
        .map_err(|error| format!("Failed to run git remote: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to read repository remotes",
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let remote_names = stdout
        .lines()
        .map(str::trim)
        .filter(|remote_name| !remote_name.is_empty())
        .map(ToOwned::to_owned)
        .collect();

    Ok(remote_names)
}

#[tauri::command]
fn create_repository_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_branch_name = branch_name.trim();

    if trimmed_branch_name.is_empty() {
        return Err("Branch name is required".to_string());
    }

    validate_branch_name(trimmed_branch_name)?;

    let output = git_command()
        .args(["-C", &repo_path, "switch", "-c", trimmed_branch_name])
        .output()
        .map_err(|error| format!("Failed to run git switch: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to create branch".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[tauri::command]
fn create_repository_branch_at_reference(
    repo_path: String,
    branch_name: String,
    target: String,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_branch_name = branch_name.trim();
    let trimmed_target = target.trim();

    if trimmed_branch_name.is_empty() {
        return Err("Branch name is required".to_string());
    }

    if trimmed_target.is_empty() {
        return Err("Target reference is required".to_string());
    }

    validate_branch_name(trimmed_branch_name)?;

    let output = git_command()
        .args([
            "-C",
            &repo_path,
            "switch",
            "-c",
            trimmed_branch_name,
            trimmed_target,
        ])
        .output()
        .map_err(|error| format!("Failed to run git switch: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to create branch".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[tauri::command]
fn delete_repository_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_branch_name = branch_name.trim();

    if trimmed_branch_name.is_empty() {
        return Err("Branch name is required".to_string());
    }

    validate_branch_name(trimmed_branch_name)?;

    let output = git_command()
        .args(["-C", &repo_path, "branch", "-d", trimmed_branch_name])
        .output()
        .map_err(|error| format!("Failed to run git branch: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to delete branch".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[tauri::command]
fn rename_repository_branch(
    repo_path: String,
    branch_name: String,
    new_branch_name: String,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_branch_name = branch_name.trim();
    let trimmed_new_branch_name = new_branch_name.trim();

    if trimmed_branch_name.is_empty() {
        return Err("Branch name is required".to_string());
    }

    if trimmed_new_branch_name.is_empty() {
        return Err("New branch name is required".to_string());
    }

    validate_branch_name(trimmed_branch_name)?;
    validate_branch_name(trimmed_new_branch_name)?;

    let output = git_command()
        .args([
            "-C",
            &repo_path,
            "branch",
            "-m",
            trimmed_branch_name,
            trimmed_new_branch_name,
        ])
        .output()
        .map_err(|error| format!("Failed to run git branch: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to rename branch".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[tauri::command]
fn delete_remote_repository_branch(
    state: State<'_, SettingsState>,
    repo_path: String,
    remote_name: String,
    branch_name: String,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_remote_name = remote_name.trim();
    let trimmed_branch_name = branch_name.trim();

    if trimmed_remote_name.is_empty() {
        return Err("Remote name is required".to_string());
    }

    if trimmed_branch_name.is_empty() {
        return Err("Branch name is required".to_string());
    }

    validate_branch_name(trimmed_branch_name)?;

    let command_preferences = RepoCommandPreferences::default();
    let _network_operation = begin_network_operation(&state, &repo_path)?;

    let mut command = git_command();
    apply_git_preferences(&mut command, &command_preferences, Some(&state))?;
    let output = command
        .args([
            "-C",
            &repo_path,
            "push",
            trimmed_remote_name,
            "--delete",
            trimmed_branch_name,
        ])
        .output()
        .map_err(|error| format!("Failed to run git push --delete: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to delete remote branch",
        ));
    }

    Ok(())
}

#[tauri::command]
fn set_repository_branch_upstream(
    state: State<'_, SettingsState>,
    repo_path: String,
    local_branch_name: String,
    remote_name: String,
    remote_branch_name: String,
    preferences: Option<RepoCommandPreferences>,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_local_branch_name = local_branch_name.trim();
    let trimmed_remote_name = remote_name.trim();
    let trimmed_remote_branch_name = remote_branch_name.trim();

    if trimmed_local_branch_name.is_empty() {
        return Err("Local branch name is required".to_string());
    }

    if trimmed_remote_name.is_empty() {
        return Err("Remote name is required".to_string());
    }

    if trimmed_remote_branch_name.is_empty() {
        return Err("Remote branch name is required".to_string());
    }

    validate_branch_name(trimmed_local_branch_name)?;
    validate_branch_name(trimmed_remote_branch_name)?;

    let remote_ref = format!("refs/remotes/{trimmed_remote_name}/{trimmed_remote_branch_name}");
    let has_remote_branch = git_command()
        .args([
            "-C",
            &repo_path,
            "show-ref",
            "--verify",
            "--quiet",
            &remote_ref,
        ])
        .status()
        .map_err(|error| format!("Failed to inspect remote branch: {error}"))?
        .success();

    let command_preferences = preferences.unwrap_or_default();
    let _network_operation = begin_network_operation(&state, &repo_path)?;

    let output = if has_remote_branch {
        let mut command = git_command();
        apply_git_preferences(&mut command, &command_preferences, Some(&state))?;

        let upstream = format!("{trimmed_remote_name}/{trimmed_remote_branch_name}");
        command
            .args([
                "-C",
                &repo_path,
                "branch",
                "--set-upstream-to",
                &upstream,
                trimmed_local_branch_name,
            ])
            .output()
            .map_err(|error| format!("Failed to run git branch --set-upstream-to: {error}"))?
    } else {
        let mut command = git_command();
        apply_git_preferences(&mut command, &command_preferences, Some(&state))?;

        let destination = format!("{trimmed_local_branch_name}:{trimmed_remote_branch_name}");
        command
            .args([
                "-C",
                &repo_path,
                "push",
                "-u",
                trimmed_remote_name,
                &destination,
            ])
            .output()
            .map_err(|error| format!("Failed to run git push -u: {error}"))?
    };

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to set branch upstream",
        ));
    }

    Ok(())
}

#[tauri::command]
fn switch_repository_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let is_remote_ref = git_command()
        .args([
            "-C",
            &repo_path,
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/remotes/{branch_name}"),
        ])
        .status()
        .map_err(|error| format!("Failed to run git show-ref: {error}"))?
        .success();

    let output = if is_remote_ref {
        let local_name = branch_name
            .split_once('/')
            .map_or(branch_name.as_str(), |(_, local)| local);
        let local_branch_exists = git_command()
            .args([
                "-C",
                &repo_path,
                "show-ref",
                "--verify",
                "--quiet",
                &format!("refs/heads/{local_name}"),
            ])
            .status()
            .map_err(|error| format!("Failed to run git show-ref: {error}"))?
            .success();

        if local_branch_exists {
            git_command()
                .args(["-C", &repo_path, "switch", local_name])
                .output()
                .map_err(|error| format!("Failed to run git switch: {error}"))?
        } else {
            git_command()
                .args([
                    "-C",
                    &repo_path,
                    "switch",
                    "--track",
                    "-c",
                    local_name,
                    &branch_name,
                ])
                .output()
                .map_err(|error| format!("Failed to run git switch: {error}"))?
        }
    } else {
        git_command()
            .args(["-C", &repo_path, "switch", &branch_name])
            .output()
            .map_err(|error| format!("Failed to run git switch: {error}"))?
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to switch branch".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[tauri::command]
fn checkout_repository_commit(repo_path: String, target: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_target = target.trim();

    if trimmed_target.is_empty() {
        return Err("Target reference is required".to_string());
    }

    let output = git_command()
        .args(["-C", &repo_path, "switch", "--detach", trimmed_target])
        .output()
        .map_err(|error| format!("Failed to run git switch --detach: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to checkout commit",
        ));
    }

    Ok(())
}

#[tauri::command]
fn push_repository_branch(
    state: State<'_, SettingsState>,
    repo_path: String,
    preferences: Option<RepoCommandPreferences>,
    force_with_lease: Option<bool>,
    publish_repo_name: Option<String>,
    publish_visibility: Option<String>,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;
    let command_preferences = preferences.unwrap_or_default();
    let _network_operation = begin_network_operation(&state, &repo_path)?;

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

    if branch_name.is_empty() || branch_name == "HEAD" {
        return Err("Cannot push from detached HEAD".to_string());
    }

    let remote_output = git_command()
        .args(["-C", &repo_path, "remote"])
        .output()
        .map_err(|error| format!("Failed to read repository remotes: {error}"))?;

    if !remote_output.status.success() {
        return Err(git_error_message(
            &remote_output.stderr,
            "Failed to read repository remotes",
        ));
    }

    let has_any_remote = String::from_utf8_lossy(&remote_output.stdout)
        .lines()
        .map(str::trim)
        .any(|remote_name| !remote_name.is_empty());

    if !has_any_remote {
        let publish_name = publish_repo_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                "No remote is configured. Publish this repository before pushing.".to_string()
            })?;

        validate_repository_name(publish_name)?;

        let visibility_flag = match publish_visibility
            .as_deref()
            .map(str::trim)
            .map(str::to_lowercase)
            .as_deref()
        {
            Some("public") => "--public",
            _ => "--private",
        };

        let mut command = background_command("gh");
        let publish_output = command
            .current_dir(&repo_path)
            .env("GH_PROMPT_DISABLED", "1")
            .args([
                "repo",
                "create",
                publish_name,
                "--source",
                ".",
                "--remote",
                "origin",
                visibility_flag,
                "--push",
            ])
            .output()
            .map_err(|error| format!("Failed to run gh repo create: {error}"))?;

        if !publish_output.status.success() {
            let stderr = String::from_utf8_lossy(&publish_output.stderr)
                .trim()
                .to_string();
            let stdout = String::from_utf8_lossy(&publish_output.stdout)
                .trim()
                .to_string();

            return Err(if !stderr.is_empty() {
                stderr
            } else if !stdout.is_empty() {
                stdout
            } else {
                "Failed to publish repository with GitHub CLI".to_string()
            });
        }

        return Ok(());
    }

    let origin_remote_output = git_command()
        .args(["-C", &repo_path, "remote", "get-url", "origin"])
        .output()
        .map_err(|error| format!("Failed to verify origin remote: {error}"))?;

    let has_origin_remote = origin_remote_output.status.success();

    let origin_remote_missing_on_server = if has_origin_remote {
        let mut health_check_command = git_command();
        apply_git_preferences(
            &mut health_check_command,
            &command_preferences,
            Some(&state),
        )?;

        let health_check_output = health_check_command
            .args([
                "-C",
                &repo_path,
                "ls-remote",
                "--exit-code",
                "origin",
                "HEAD",
            ])
            .output()
            .map_err(|error| format!("Failed to check remote repository health: {error}"))?;

        if health_check_output.status.success() {
            false
        } else {
            let stderr = String::from_utf8_lossy(&health_check_output.stderr).to_string();
            let stdout = String::from_utf8_lossy(&health_check_output.stdout).to_string();

            is_missing_remote_repository_message(&stderr)
                || is_missing_remote_repository_message(&stdout)
        }
    } else {
        false
    };

    if origin_remote_missing_on_server {
        let publish_name = publish_repo_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                "Remote repository for 'origin' was not found. Publish this repository to recreate it before pushing."
                    .to_string()
            })?;

        validate_repository_name(publish_name)?;

        let visibility_flag = match publish_visibility
            .as_deref()
            .map(str::trim)
            .map(str::to_lowercase)
            .as_deref()
        {
            Some("public") => "--public",
            _ => "--private",
        };

        let remove_origin_output = git_command()
            .args(["-C", &repo_path, "remote", "remove", "origin"])
            .output()
            .map_err(|error| format!("Failed to remove stale origin remote: {error}"))?;

        if !remove_origin_output.status.success() {
            return Err(git_error_message(
                &remove_origin_output.stderr,
                "Failed to remove stale origin remote",
            ));
        }

        let mut command = background_command("gh");
        let publish_output = command
            .current_dir(&repo_path)
            .env("GH_PROMPT_DISABLED", "1")
            .args([
                "repo",
                "create",
                publish_name,
                "--source",
                ".",
                "--remote",
                "origin",
                visibility_flag,
                "--push",
            ])
            .output()
            .map_err(|error| format!("Failed to run gh repo create: {error}"))?;

        if !publish_output.status.success() {
            let stderr = String::from_utf8_lossy(&publish_output.stderr)
                .trim()
                .to_string();
            let stdout = String::from_utf8_lossy(&publish_output.stdout)
                .trim()
                .to_string();

            return Err(if !stderr.is_empty() {
                stderr
            } else if !stdout.is_empty() {
                stdout
            } else {
                "Failed to publish repository with GitHub CLI".to_string()
            });
        }

        return Ok(());
    }

    let upstream_output = git_command()
        .args([
            "-C",
            &repo_path,
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{u}",
        ])
        .output()
        .map_err(|error| format!("Failed to check branch upstream: {error}"))?;

    let upstream_ref = if upstream_output.status.success() {
        let value = String::from_utf8_lossy(&upstream_output.stdout)
            .trim()
            .to_string();

        if value.is_empty() {
            None
        } else {
            Some(value)
        }
    } else {
        None
    };

    let upstream_remote_and_branch = upstream_ref
        .as_deref()
        .and_then(|value| value.strip_prefix("refs/remotes/"))
        .and_then(|value| value.split_once('/'));

    let upstream_remote_name = upstream_remote_and_branch
        .map(|(remote_name, _)| remote_name.to_string())
        .unwrap_or_else(|| "origin".to_string());
    let upstream_branch_name =
        upstream_remote_and_branch.map(|(_, remote_branch_name)| remote_branch_name);
    let upstream_matches_current_branch =
        upstream_branch_name.is_some_and(|remote_branch_name| remote_branch_name == branch_name);
    let should_set_upstream = upstream_ref.is_none() || !upstream_matches_current_branch;

    let should_force_with_lease = force_with_lease == Some(true);

    let push_output = if should_set_upstream {
        if upstream_ref.is_none() && !has_origin_remote {
            return Err(
                "No upstream branch found and remote 'origin' is not configured".to_string(),
            );
        }

        let mut command = git_command();
        apply_git_preferences(&mut command, &command_preferences, Some(&state))?;

        command.args(["-C", &repo_path, "push"]);

        if should_force_with_lease {
            command.arg("--force-with-lease");
        }

        command
            .args(["-u", &upstream_remote_name, &branch_name])
            .output()
            .map_err(|error| format!("Failed to run git push: {error}"))?
    } else {
        let mut command = git_command();
        apply_git_preferences(&mut command, &command_preferences, Some(&state))?;

        command.args(["-C", &repo_path, "push"]);

        if should_force_with_lease {
            command.arg("--force-with-lease");
        }

        command
            .output()
            .map_err(|error| format!("Failed to run git push: {error}"))?
    };

    if !push_output.status.success() {
        return Err(git_error_message(
            &push_output.stderr,
            "Failed to push branch",
        ));
    }

    Ok(())
}

#[tauri::command]
fn pull_repository_action(
    state: State<'_, SettingsState>,
    repo_path: String,
    mode: String,
    preferences: Option<RepoCommandPreferences>,
) -> Result<PullActionResult, String> {
    validate_git_repo(Path::new(&repo_path))?;
    let command_preferences = preferences.unwrap_or_default();
    let _network_operation = begin_network_operation(&state, &repo_path)?;

    let head_before = resolve_head_hash(&repo_path)?;

    let mut pull_command = git_command();
    pull_command.args(["-C", &repo_path]);
    apply_git_preferences(&mut pull_command, &command_preferences, Some(&state))?;

    match mode.as_str() {
        "fetch-all" => {
            pull_command.args(["fetch", "--all", "--prune"]);
        }
        "pull-ff-possible" => {
            pull_command.arg("pull");
        }
        "pull-ff-only" => {
            pull_command.args(["pull", "--ff-only"]);
        }
        "pull-rebase" => {
            pull_command.args(["pull", "--rebase"]);
        }
        _ => {
            return Err("Unsupported pull mode".to_string());
        }
    }

    let output = pull_command
        .output()
        .map_err(|error| format!("Failed to run git pull/fetch: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to execute pull action",
        ));
    }

    let head_after = resolve_head_hash(&repo_path)?;

    Ok(PullActionResult {
        head_changed: head_before != head_after,
    })
}

#[tauri::command]
fn run_repository_merge_action(
    state: State<'_, SettingsState>,
    repo_path: String,
    mode: String,
    target_ref: String,
    preferences: Option<RepoCommandPreferences>,
) -> Result<MergeActionResult, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_target_ref = target_ref.trim();

    if trimmed_target_ref.is_empty() {
        return Err("A target reference is required".to_string());
    }

    let target_resolution = format!("{trimmed_target_ref}^{{commit}}");
    let target_exists = git_command()
        .args([
            "-C",
            &repo_path,
            "rev-parse",
            "--verify",
            "--quiet",
            &target_resolution,
        ])
        .status()
        .map_err(|error| format!("Failed to resolve target reference: {error}"))?
        .success();

    if !target_exists {
        return Err(format!(
            "The target reference '{trimmed_target_ref}' could not be resolved"
        ));
    }

    let current_branch_output = git_command()
        .args(["-C", &repo_path, "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|error| format!("Failed to inspect current branch: {error}"))?;

    if !current_branch_output.status.success() {
        return Err(git_error_message(
            &current_branch_output.stderr,
            "Failed to inspect current branch",
        ));
    }

    let current_branch_name = String::from_utf8_lossy(&current_branch_output.stdout)
        .trim()
        .to_string();

    if current_branch_name == "HEAD" {
        return Err(
            "This action requires a checked out branch. Exit detached HEAD and try again."
                .to_string(),
        );
    }

    let command_preferences = preferences.unwrap_or_default();
    let head_before = resolve_head_hash(&repo_path)?;

    let mut command = git_command();
    command.args(["-C", &repo_path]);
    apply_git_preferences(&mut command, &command_preferences, Some(&state))?;

    match mode.as_str() {
        "ff-only" => {
            command.args(["merge", "--ff-only", trimmed_target_ref]);
        }
        "merge" => {
            command.args(["merge", trimmed_target_ref]);
        }
        "rebase" => {
            command.args(["rebase", trimmed_target_ref]);
        }
        _ => {
            return Err("Unsupported merge action mode".to_string());
        }
    }

    let output = command
        .output()
        .map_err(|error| format!("Failed to run merge action: {error}"))?;

    if !output.status.success() {
        let fallback_message = match mode.as_str() {
            "ff-only" => "Failed to fast-forward branch",
            "merge" => "Failed to merge branch",
            "rebase" => "Failed to rebase branch",
            _ => "Failed to run merge action",
        };

        return Err(git_error_message(&output.stderr, fallback_message));
    }

    let head_after = resolve_head_hash(&repo_path)?;

    Ok(MergeActionResult {
        head_changed: head_before != head_after,
    })
}

#[tauri::command]
fn get_repository_stashes(repo_path: String) -> Result<Vec<RepositoryStash>, String> {
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
fn apply_repository_stash(repo_path: String, stash_ref: String) -> Result<(), String> {
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
fn pop_repository_stash(repo_path: String, stash_ref: String) -> Result<(), String> {
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
fn drop_repository_stash(repo_path: String, stash_ref: String) -> Result<(), String> {
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
fn create_repository_stash(
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
#[tauri::command]
fn commit_repository_changes(
    repo_path: String,
    summary: String,
    description: String,
    include_all: bool,
    amend: bool,
    skip_hooks: bool,
    preferences: Option<RepoCommandPreferences>,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;
    let command_preferences = preferences.unwrap_or_default();

    let summary_trimmed = summary.trim();

    if summary_trimmed.is_empty() {
        return Err("Commit summary is required".to_string());
    }

    if include_all {
        let add_output = git_command()
            .args(["-C", &repo_path, "add", "-A"])
            .output()
            .map_err(|error| format!("Failed to run git add: {error}"))?;

        if !add_output.status.success() {
            let stderr = String::from_utf8_lossy(&add_output.stderr)
                .trim()
                .to_string();
            return Err(if stderr.is_empty() {
                "Failed to stage changes".to_string()
            } else {
                stderr
            });
        }
    }

    let description_trimmed = description.trim();
    let mut commit_command = git_command();

    commit_command.args(["-C", &repo_path]);
    apply_git_preferences(&mut commit_command, &command_preferences, None)?;

    if let Some(signing_format) = command_preferences
        .signing_format
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        commit_command.args(["-c", &format!("gpg.format={}", signing_format.trim())]);
    }

    if let Some(signing_key) = command_preferences
        .signing_key
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        commit_command.args(["-c", &format!("user.signingkey={}", signing_key.trim())]);
    }

    commit_command.args(["commit", "-m", summary_trimmed]);

    if amend {
        commit_command.arg("--amend");
    }

    if skip_hooks {
        commit_command.arg("--no-verify");
    }

    if command_preferences.sign_commits_by_default == Some(true) {
        commit_command.arg("-S");
    }

    if !description_trimmed.is_empty() {
        commit_command.args(["-m", description_trimmed]);
    }

    let output = commit_command
        .output()
        .map_err(|error| format!("Failed to run git commit: {error}"))?;

    if !output.status.success() {
        return Err(git_process_error_message(
            &output.stdout,
            &output.stderr,
            "Failed to create commit",
        ));
    }

    Ok(())
}

#[tauri::command]
fn stage_all_repository_changes(repo_path: String) -> Result<(), String> {
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
fn unstage_all_repository_changes(repo_path: String) -> Result<(), String> {
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
fn stage_repository_file(repo_path: String, file_path: String) -> Result<(), String> {
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
fn unstage_repository_file(repo_path: String, file_path: String) -> Result<(), String> {
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
fn add_repository_ignore_rule(repo_path: String, pattern: String) -> Result<(), String> {
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
fn discard_repository_path_changes(repo_path: String, file_path: String) -> Result<(), String> {
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
fn discard_all_repository_changes(repo_path: String) -> Result<(), String> {
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
fn reset_repository_to_reference(
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
fn cherry_pick_repository_commit(repo_path: String, target: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_target = target.trim();

    if trimmed_target.is_empty() {
        return Err("Target reference is required".to_string());
    }

    let output = git_command()
        .args(["-C", &repo_path, "cherry-pick", trimmed_target])
        .output()
        .map_err(|error| format!("Failed to run git cherry-pick: {error}"))?;

    if !output.status.success() {
        return Err(git_process_error_message(
            &output.stdout,
            &output.stderr,
            "Failed to cherry-pick commit",
        ));
    }

    Ok(())
}

#[tauri::command]
fn revert_repository_commit(repo_path: String, target: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_target = target.trim();

    if trimmed_target.is_empty() {
        return Err("Target reference is required".to_string());
    }

    let output = git_command()
        .args(["-C", &repo_path, "revert", "--no-edit", trimmed_target])
        .output()
        .map_err(|error| format!("Failed to run git revert: {error}"))?;

    if !output.status.success() {
        return Err(git_process_error_message(
            &output.stdout,
            &output.stderr,
            "Failed to revert commit",
        ));
    }

    Ok(())
}

#[tauri::command]
fn create_repository_tag(
    repo_path: String,
    tag_name: String,
    target: String,
    annotated: Option<bool>,
    annotation_message: Option<String>,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_tag_name = tag_name.trim();
    let trimmed_target = target.trim();

    if trimmed_tag_name.is_empty() {
        return Err("Tag name is required".to_string());
    }

    if trimmed_target.is_empty() {
        return Err("Target reference is required".to_string());
    }

    validate_tag_name(trimmed_tag_name)?;

    let is_annotated = annotated.unwrap_or(false);
    let resolved_annotation_message = annotation_message
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(trimmed_tag_name);

    let output = if is_annotated {
        git_command()
            .args([
                "-C",
                &repo_path,
                "tag",
                "-a",
                trimmed_tag_name,
                trimmed_target,
                "-m",
                resolved_annotation_message,
            ])
            .output()
            .map_err(|error| format!("Failed to run git tag -a: {error}"))?
    } else {
        git_command()
            .args(["-C", &repo_path, "tag", trimmed_tag_name, trimmed_target])
            .output()
            .map_err(|error| format!("Failed to run git tag: {error}"))?
    };

    if !output.status.success() {
        return Err(git_error_message(&output.stderr, "Failed to create tag"));
    }

    Ok(())
}

#[tauri::command]
fn get_repository_commit_files(
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

    let mut files: Vec<RepositoryCommitFile> = Vec::new();
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

#[tauri::command]
fn get_repository_commit_file_diff(
    repo_path: String,
    commit_hash: String,
    file_path: String,
) -> Result<RepositoryCommitFileDiff, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let old_output = git_command()
        .args([
            "-C",
            &repo_path,
            "show",
            &format!("{commit_hash}^:{file_path}"),
        ])
        .output()
        .map_err(|error| format!("Failed to run git show for previous commit file: {error}"))?;

    let old_content = old_output.status.success().then_some(old_output.stdout);

    let new_output = git_command()
        .args([
            "-C",
            &repo_path,
            "show",
            &format!("{commit_hash}:{file_path}"),
        ])
        .output()
        .map_err(|error| format!("Failed to run git show for commit file: {error}"))?;

    let new_content = new_output.status.success().then_some(new_output.stdout);
    let preview_payload =
        build_diff_preview_payload(&file_path, old_content.as_deref(), new_content.as_deref());

    Ok(RepositoryCommitFileDiff {
        commit_hash,
        path: file_path,
        old_text: preview_payload.old_text,
        new_text: preview_payload.new_text,
        viewer_kind: preview_payload.viewer_kind,
        old_image_data_url: preview_payload.old_image_data_url,
        new_image_data_url: preview_payload.new_image_data_url,
        unsupported_extension: preview_payload.unsupported_extension,
    })
}

#[tauri::command]
fn get_repository_file_diff(
    repo_path: String,
    file_path: String,
) -> Result<RepositoryFileDiff, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let old_output = git_command()
        .args(["-C", &repo_path, "show", &format!("HEAD:{file_path}")])
        .output()
        .map_err(|error| format!("Failed to run git show: {error}"))?;

    let old_content = old_output.status.success().then_some(old_output.stdout);

    let full_path = Path::new(&repo_path).join(&file_path);
    let new_content = std::fs::read(&full_path).ok();
    let preview_payload =
        build_diff_preview_payload(&file_path, old_content.as_deref(), new_content.as_deref());

    Ok(RepositoryFileDiff {
        path: file_path,
        old_text: preview_payload.old_text,
        new_text: preview_payload.new_text,
        viewer_kind: preview_payload.viewer_kind,
        old_image_data_url: preview_payload.old_image_data_url,
        new_image_data_url: preview_payload.new_image_data_url,
        unsupported_extension: preview_payload.unsupported_extension,
    })
}

#[tauri::command]
fn get_repository_working_tree_status(
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
fn get_repository_working_tree_items(
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
fn get_repository_files(repo_path: String) -> Result<Vec<RepositoryFileEntry>, String> {
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

fn resolve_head_hash(repo_path: &str) -> Result<String, String> {
    let output = git_command()
        .args(["-C", repo_path, "rev-parse", "HEAD"])
        .output()
        .map_err(|error| format!("Failed to resolve HEAD: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(&output.stderr, "Failed to resolve HEAD"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn is_valid_github_username(username: &str) -> bool {
    let length = username.len();

    if length == 0 || length > 39 {
        return false;
    }

    if username.starts_with('-') || username.ends_with('-') {
        return false;
    }

    username
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

#[derive(Clone, Default)]
struct GitHubIdentity {
    avatar_url: Option<String>,
    username: Option<String>,
}

#[derive(Clone)]
struct CachedGitHubIdentityEntry {
    identity: GitHubIdentity,
    stored_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedGitHubIdentityEntry {
    avatar_url: Option<String>,
    cached_at_unix_seconds: u64,
    key: String,
    username: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedGitHubIdentityCache {
    entries: Vec<PersistedGitHubIdentityEntry>,
    version: u8,
}

fn now_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn is_github_identity_cache_entry_fresh(
    stored_at_unix_seconds: u64,
    now_unix_seconds_value: u64,
) -> bool {
    let age = now_unix_seconds_value.saturating_sub(stored_at_unix_seconds);
    Duration::from_secs(age) <= GITHUB_IDENTITY_CACHE_TTL
}

fn github_identity_cache_key(email: &str, author: &str) -> Option<String> {
    let normalized_email = email.trim().to_lowercase();
    if !normalized_email.is_empty() {
        return Some(format!("email:{normalized_email}"));
    }

    let normalized_author = author.trim().to_lowercase();
    if !normalized_author.is_empty() {
        return Some(format!("author:{normalized_author}"));
    }

    None
}

fn get_cached_github_identity(state: &SettingsState, key: &str) -> Option<GitHubIdentity> {
    let mut cache = state.github_identity_cache.lock().ok()?;
    let cached_entry = cache.get(key).cloned()?;
    let now_unix_seconds_value = now_unix_seconds();

    if is_github_identity_cache_entry_fresh(
        cached_entry.stored_at_unix_seconds,
        now_unix_seconds_value,
    ) {
        return Some(cached_entry.identity);
    }

    cache.remove(key);
    None
}

fn github_identity_cache_file_path(state: &SettingsState) -> Option<PathBuf> {
    let cache_file_path = state.github_identity_cache_file_path.lock().ok()?;
    cache_file_path.clone()
}

fn write_text_file_atomically(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!("Failed to create GitHub identity cache directory: {error}")
        })?;
    }

    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("cache");
    let temp_file_name = format!(
        "{file_name}.tmp-{}-{}",
        std::process::id(),
        now_unix_seconds()
    );
    let temp_file_path = path.with_file_name(temp_file_name);

    fs::write(&temp_file_path, contents)
        .map_err(|error| format!("Failed to write temporary cache file: {error}"))?;

    match fs::rename(&temp_file_path, path) {
        Ok(()) => Ok(()),
        Err(rename_error) => {
            let _ = fs::remove_file(path);
            fs::rename(&temp_file_path, path).map_err(|fallback_error| {
                let _ = fs::remove_file(&temp_file_path);
                format!(
                    "Failed to replace cache file (rename error: {rename_error}; fallback error: {fallback_error})"
                )
            })
        }
    }
}

fn save_github_identity_cache_to_disk(state: &SettingsState) {
    let Some(cache_file_path) = github_identity_cache_file_path(state) else {
        return;
    };

    let now_unix_seconds_value = now_unix_seconds();
    let mut entries = if let Ok(cache) = state.github_identity_cache.lock() {
        cache
            .iter()
            .filter_map(|(key, cached_entry)| {
                if !is_github_identity_cache_entry_fresh(
                    cached_entry.stored_at_unix_seconds,
                    now_unix_seconds_value,
                ) {
                    return None;
                }

                Some(PersistedGitHubIdentityEntry {
                    avatar_url: cached_entry.identity.avatar_url.clone(),
                    cached_at_unix_seconds: cached_entry.stored_at_unix_seconds,
                    key: key.clone(),
                    username: cached_entry.identity.username.clone(),
                })
            })
            .collect::<Vec<_>>()
    } else {
        log::warn!("Failed to lock GitHub identity cache for disk persistence");
        return;
    };

    entries.sort_by(|left, right| {
        right
            .cached_at_unix_seconds
            .cmp(&left.cached_at_unix_seconds)
    });

    if entries.len() > GITHUB_IDENTITY_CACHE_MAX_ENTRIES {
        entries.truncate(GITHUB_IDENTITY_CACHE_MAX_ENTRIES);
    }

    let payload = PersistedGitHubIdentityCache {
        entries,
        version: GITHUB_IDENTITY_CACHE_VERSION,
    };

    let Ok(serialized) = serde_json::to_string(&payload) else {
        log::warn!("Failed to serialize GitHub identity cache payload");
        return;
    };

    if let Err(error) = write_text_file_atomically(&cache_file_path, &serialized) {
        log::warn!("Failed to persist GitHub identity cache: {error}");
    }
}

fn initialize_github_identity_cache(app: &AppHandle, state: &SettingsState) {
    let Ok(app_data_dir) = app.path().app_data_dir() else {
        return;
    };

    let cache_file_path = app_data_dir.join(GITHUB_IDENTITY_CACHE_FILE_NAME);

    if let Ok(mut cache_file_path_state) = state.github_identity_cache_file_path.lock() {
        *cache_file_path_state = Some(cache_file_path.clone());
    }

    let contents = match fs::read_to_string(&cache_file_path) {
        Ok(value) => value,
        Err(error) => {
            if error.kind() != std::io::ErrorKind::NotFound {
                log::warn!("Failed to read GitHub identity cache file: {error}");
            }
            return;
        }
    };

    let persisted_cache = match serde_json::from_str::<PersistedGitHubIdentityCache>(&contents) {
        Ok(value) => value,
        Err(error) => {
            log::warn!("Failed to parse GitHub identity cache file: {error}");
            return;
        }
    };

    if persisted_cache.version != GITHUB_IDENTITY_CACHE_VERSION {
        return;
    }

    let now_unix_seconds_value = now_unix_seconds();
    let mut restored_cache = HashMap::new();

    for entry in persisted_cache.entries {
        if restored_cache.len() >= GITHUB_IDENTITY_CACHE_MAX_ENTRIES {
            break;
        }

        let trimmed_key = entry.key.trim();
        if trimmed_key.is_empty() {
            continue;
        }

        if !is_github_identity_cache_entry_fresh(
            entry.cached_at_unix_seconds,
            now_unix_seconds_value,
        ) {
            continue;
        }

        let identity = GitHubIdentity {
            avatar_url: entry.avatar_url,
            username: entry.username,
        };

        restored_cache.insert(
            trimmed_key.to_string(),
            CachedGitHubIdentityEntry {
                identity,
                stored_at_unix_seconds: entry.cached_at_unix_seconds,
            },
        );
    }

    if let Ok(mut cache) = state.github_identity_cache.lock() {
        *cache = restored_cache;
    } else {
        log::warn!("Failed to lock GitHub identity cache while initializing");
        return;
    }

    save_github_identity_cache_to_disk(state);
}

fn cache_github_identity(state: &SettingsState, key: &str, identity: &GitHubIdentity) {
    let Ok(mut cache) = state.github_identity_cache.lock() else {
        log::warn!("Failed to lock GitHub identity cache for update");
        return;
    };

    let now_unix_seconds_value = now_unix_seconds();
    cache.retain(|_, entry| {
        is_github_identity_cache_entry_fresh(entry.stored_at_unix_seconds, now_unix_seconds_value)
    });

    if cache.len() >= GITHUB_IDENTITY_CACHE_MAX_ENTRIES {
        if let Some(oldest_key) = cache
            .iter()
            .min_by_key(|(_, entry)| entry.stored_at_unix_seconds)
            .map(|(existing_key, _)| existing_key.clone())
        {
            cache.remove(&oldest_key);
        }
    }

    cache.insert(
        key.to_string(),
        CachedGitHubIdentityEntry {
            identity: identity.clone(),
            stored_at_unix_seconds: now_unix_seconds_value,
        },
    );

    drop(cache);
    save_github_identity_cache_to_disk(state);
}

fn clear_github_identity_cache(state: &SettingsState) {
    let mut changed = false;
    if let Ok(mut cache) = state.github_identity_cache.lock() {
        changed = !cache.is_empty();
        cache.clear();
    }

    if changed || github_identity_cache_file_path(state).is_some() {
        save_github_identity_cache_to_disk(state);
    }
}

fn get_github_token(state: &SettingsState) -> Option<String> {
    if let Ok(Some(token)) = load_keyring_entry(GITHUB_AVATAR_SERVICE, "token") {
        return Some(token);
    }

    let secrets = state.ai_secrets.lock().ok()?;
    secrets.get("github_token").map(|v| v.value.clone())
}

fn fetch_github_user_by_email(email: &str, token: &str) -> Option<GitHubIdentity> {
    let query = ureq::get("https://api.github.com/search/users")
        .query("q", &format!("{} in:email", email))
        .query("per_page", "1")
        .set("Authorization", &format!("Bearer {}", token))
        .set("Accept", "application/vnd.github+json")
        .set("X-GitHub-Api-Version", "2022-11-28")
        .call()
        .ok()?;

    let body = query.into_string().ok()?;
    let json: serde_json::Value = serde_json::from_str(&body).ok()?;
    let items = json.get("items")?.as_array()?;

    if items.is_empty() {
        return None;
    }

    let user = items.first()?;
    let login = user.get("login")?.as_str()?.to_string();
    let avatar_url = user.get("avatar_url")?.as_str()?.to_string();

    Some(GitHubIdentity {
        avatar_url: Some(avatar_url),
        username: Some(login),
    })
}

fn fetch_github_user_by_name(name: &str, token: &str) -> Option<GitHubIdentity> {
    let query = ureq::get("https://api.github.com/search/users")
        .query("q", &format!("{} in:name", name))
        .query("sort", "followers")
        .query("order", "desc")
        .query("per_page", "1")
        .set("Authorization", &format!("Bearer {}", token))
        .set("Accept", "application/vnd.github+json")
        .set("X-GitHub-Api-Version", "2022-11-28")
        .call()
        .ok()?;

    let body = query.into_string().ok()?;
    let json: serde_json::Value = serde_json::from_str(&body).ok()?;
    let items = json.get("items")?.as_array()?;

    if items.is_empty() {
        return None;
    }

    let user = items.first()?;
    let login = user.get("login")?.as_str()?.to_string();
    let avatar_url = user.get("avatar_url")?.as_str()?.to_string();

    Some(GitHubIdentity {
        avatar_url: Some(avatar_url),
        username: Some(login),
    })
}

fn resolve_commit_identity(state: &SettingsState, email: &str, author: &str) -> GitHubIdentity {
    let cache_key = github_identity_cache_key(email, author);

    if let Some(key) = cache_key.as_deref() {
        if let Some(cached_identity) = get_cached_github_identity(state, key) {
            return cached_identity;
        }
    }

    let github_identity = resolve_github_identity_from_email(email);

    if github_identity.avatar_url.is_some() {
        if let Some(key) = cache_key.as_deref() {
            cache_github_identity(state, key, &github_identity);
        }
        return github_identity;
    }

    let token = match get_github_token(state) {
        Some(t) => t,
        None => {
            let empty_identity = GitHubIdentity::default();
            if let Some(key) = cache_key.as_deref() {
                cache_github_identity(state, key, &empty_identity);
            }
            return empty_identity;
        }
    };

    if !email.is_empty() {
        if let Some(identity) = fetch_github_user_by_email(email, &token) {
            if let Some(key) = cache_key.as_deref() {
                cache_github_identity(state, key, &identity);
            }
            return identity;
        }
    }

    if !author.is_empty() {
        let identity = fetch_github_user_by_name(author, &token).unwrap_or_default();
        if let Some(key) = cache_key.as_deref() {
            cache_github_identity(state, key, &identity);
        }
        return identity;
    }

    let empty_identity = GitHubIdentity::default();
    if let Some(key) = cache_key.as_deref() {
        cache_github_identity(state, key, &empty_identity);
    }
    empty_identity
}

fn resolve_github_identity_from_email(email: &str) -> GitHubIdentity {
    let normalized = email.trim().to_lowercase();

    if normalized.is_empty() {
        return GitHubIdentity::default();
    }

    let Some(local_part) = normalized.strip_suffix("@users.noreply.github.com") else {
        return GitHubIdentity::default();
    };

    if let Some((left, right)) = local_part.split_once('+') {
        let username = if is_valid_github_username(right) {
            Some(right.to_string())
        } else if is_valid_github_username(left) {
            Some(left.to_string())
        } else {
            None
        };

        let avatar_url = if left.chars().all(|character| character.is_ascii_digit()) {
            Some(format!(
                "https://avatars.githubusercontent.com/u/{left}?v=4"
            ))
        } else {
            username
                .as_ref()
                .map(|value| format!("https://github.com/{value}.png"))
        };

        return GitHubIdentity {
            avatar_url,
            username,
        };
    }

    if is_valid_github_username(local_part) {
        return GitHubIdentity {
            avatar_url: Some(format!("https://github.com/{local_part}.png")),
            username: Some(local_part.to_string()),
        };
    }

    GitHubIdentity::default()
}

// Git subprocesses are non-interactive by default so the desktop app fails
// fast instead of hanging on hidden stdin prompts.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
fn background_process_creation_flags() -> u32 {
    CREATE_NO_WINDOW
}

#[cfg(windows)]
fn apply_background_process_flags(command: &mut Command) {
    command.creation_flags(background_process_creation_flags());
}

#[cfg(not(windows))]
fn apply_background_process_flags(_command: &mut Command) {}

fn background_command(program: &str) -> Command {
    let mut command = Command::new(program);
    apply_background_process_flags(&mut command);
    command
}

fn git_command() -> Command {
    let mut command = background_command("git");
    command.stdin(Stdio::null());
    command
}

fn git_error_message(stderr: &[u8], fallback: &str) -> String {
    let message = String::from_utf8_lossy(stderr).trim().to_string();

    if message.is_empty() {
        return fallback.to_string();
    }

    if is_git_authentication_message(&message) {
        return "Authentication required or credentials were rejected for this HTTPS remote. Configure a Git credential helper or use SSH, then try again.".to_string();
    }

    message
}

fn git_process_error_message(stdout: &[u8], stderr: &[u8], fallback: &str) -> String {
    let stderr_message = String::from_utf8_lossy(stderr).trim().to_string();

    if !stderr_message.is_empty() {
        return git_error_message(stderr, fallback);
    }

    let stdout_message = String::from_utf8_lossy(stdout).trim().to_string();

    if !stdout_message.is_empty() {
        return stdout_message;
    }

    fallback.to_string()
}

fn is_git_authentication_message(message: &str) -> bool {
    let normalized = message.to_lowercase();

    normalized.contains("terminal prompts disabled")
        || normalized.contains("could not read username")
        || normalized.contains("could not read password")
        || normalized.contains("unable to read askpass response")
        || normalized.contains("authentication failed")
        || normalized.contains("the requested url returned error: 401")
        || normalized.contains("the requested url returned error: 403")
}

fn is_missing_remote_repository_message(message: &str) -> bool {
    let normalized = message.to_lowercase();

    normalized.contains("repository not found")
        || normalized.contains("remote repository was not found")
        || normalized.contains("not found") && normalized.contains("repository")
}

fn validate_repository_name(name: &str) -> Result<(), String> {
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

fn validate_branch_name(name: &str) -> Result<(), String> {
    let output = git_command()
        .args(["check-ref-format", "--branch", name])
        .output()
        .map_err(|error| format!("Failed to validate default branch name: {error}"))?;

    if !output.status.success() {
        return Err("Enter a valid Git branch name".to_string());
    }

    Ok(())
}

fn validate_tag_name(name: &str) -> Result<(), String> {
    let output = git_command()
        .args(["check-ref-format", &format!("refs/tags/{name}")])
        .output()
        .map_err(|error| format!("Failed to validate tag name: {error}"))?;

    if !output.status.success() {
        return Err("Enter a valid Git tag name".to_string());
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

fn build_git_identity_status(repo_path: Option<&str>) -> Result<GitIdentityStatusPayload, String> {
    let global = read_git_identity_value(None, "global")?;
    let local = if let Some(path) = repo_path {
        Some(read_git_identity_value(Some(path), "local")?)
    } else {
        None
    };

    let (effective, effective_scope) = if let Some(path) = repo_path {
        let local_value = local.clone().unwrap_or_else(empty_git_identity_value);

        if local_value.is_complete {
            (local_value, Some("local".to_string()))
        } else {
            let effective_value = read_git_identity_value(Some(path), "effective")?;
            let scope = if effective_value.is_complete {
                Some("global".to_string())
            } else {
                None
            };

            (effective_value, scope)
        }
    } else {
        (
            global.clone(),
            if global.is_complete {
                Some("global".to_string())
            } else {
                None
            },
        )
    };

    Ok(GitIdentityStatusPayload {
        effective,
        effective_scope,
        global,
        local,
        repo_path: repo_path.map(std::string::ToString::to_string),
    })
}

fn empty_git_identity_value() -> GitIdentityValue {
    GitIdentityValue {
        email: None,
        is_complete: false,
        name: None,
    }
}

fn normalize_git_identity_scope(scope: &str) -> Result<&str, String> {
    match scope.trim() {
        "global" => Ok("global"),
        "local" => Ok("local"),
        _ => Err("Git identity scope must be global or local".to_string()),
    }
}

fn validate_git_identity_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();

    if trimmed.is_empty() {
        return Err("Git author name is required".to_string());
    }

    Ok(trimmed.to_string())
}

fn validate_git_identity_email(email: &str) -> Result<String, String> {
    let trimmed = email.trim();

    if trimmed.is_empty() {
        return Err("Git author email is required".to_string());
    }

    let has_single_at_symbol = trimmed.matches('@').count() == 1;
    let has_non_empty_segments = trimmed
        .split_once('@')
        .map(|(local, domain)| {
            !local.is_empty()
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
        })
        .unwrap_or(false);

    if !(has_single_at_symbol && has_non_empty_segments) {
        return Err("Enter a valid Git author email".to_string());
    }

    Ok(trimmed.to_string())
}

fn read_git_config_value(
    repo_path: Option<&str>,
    scope: &str,
    key: &str,
) -> Result<Option<String>, String> {
    let mut command = git_command();

    match scope {
        "global" => {
            command.args(["config", "--global", "--get", key]);
        }
        "local" => {
            let repo_path = repo_path
                .ok_or_else(|| "A repository path is required for local Git config".to_string())?;
            command.args(["-C", repo_path, "config", "--local", "--get", key]);
        }
        "effective" => {
            if let Some(repo_path) = repo_path {
                command.args(["-C", repo_path, "config", "--get", key]);
            } else {
                command.args(["config", "--global", "--get", key]);
            }
        }
        _ => return Err("Unsupported Git config scope".to_string()),
    }

    let output = command
        .output()
        .map_err(|error| format!("Failed to run git config: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if stderr.is_empty() {
            return Ok(None);
        }

        return Err(git_error_message(
            &output.stderr,
            "Failed to read Git identity",
        ));
    }

    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if value.is_empty() {
        return Ok(None);
    }

    Ok(Some(value))
}

fn read_git_identity_value(
    repo_path: Option<&str>,
    scope: &str,
) -> Result<GitIdentityValue, String> {
    let name = read_git_config_value(repo_path, scope, "user.name")?;
    let email = read_git_config_value(repo_path, scope, "user.email")?;
    let is_complete = name.is_some() && email.is_some();

    Ok(GitIdentityValue {
        email,
        is_complete,
        name,
    })
}

fn write_git_config_value(
    repo_path: Option<&str>,
    scope: &str,
    key: &str,
    value: &str,
) -> Result<(), String> {
    let mut command = git_command();

    match scope {
        "global" => {
            command.args(["config", "--global", key, value]);
        }
        "local" => {
            let repo_path = repo_path
                .ok_or_else(|| "A repository path is required for local Git config".to_string())?;
            command.args(["-C", repo_path, "config", "--local", key, value]);
        }
        _ => return Err("Unsupported Git config scope".to_string()),
    }

    let output = command
        .output()
        .map_err(|error| format!("Failed to run git config: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to save Git identity",
        ));
    }

    Ok(())
}

fn write_git_identity(
    repo_path: Option<&str>,
    scope: &str,
    name: &str,
    email: &str,
) -> Result<(), String> {
    let validated_name = validate_git_identity_name(name)?;
    let validated_email = validate_git_identity_email(email)?;

    write_git_config_value(repo_path, scope, "user.name", &validated_name)?;
    write_git_config_value(repo_path, scope, "user.email", &validated_email)?;

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

fn validate_repository_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err("Repository path does not exist".to_string());
    }

    if !path.is_dir() {
        return Err("Repository path is not a folder".to_string());
    }

    Ok(())
}

fn validate_git_repo(path: &Path) -> Result<(), String> {
    validate_repository_path(path)?;

    if !path.join(".git").exists() {
        return Err("Selected folder is not a git repository".to_string());
    }

    Ok(())
}

fn folder_name(path: &Path) -> Option<String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(std::string::ToString::to_string)
}

fn build_http_credential_entry_id(
    protocol: &str,
    host: &str,
    port: Option<u16>,
    username: &str,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(protocol.as_bytes());
    hasher.update(b"|");
    hasher.update(host.as_bytes());
    hasher.update(b"|");
    hasher.update(port.unwrap_or_default().to_string().as_bytes());
    hasher.update(b"|");
    hasher.update(username.as_bytes());

    format!("{:x}", hasher.finalize())
}

fn load_keyring_entry(service: &str, account: &str) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(service, account)
        .map_err(|error| format!("Failed to access secure storage: {error}"))?;

    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Failed to read secure storage: {error}")),
    }
}

fn save_keyring_entry(service: &str, account: &str, secret: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(service, account)
        .map_err(|error| format!("Failed to access secure storage: {error}"))?;

    entry
        .set_password(secret)
        .map_err(|error| format!("Failed to save secure secret: {error}"))
}

fn clear_keyring_entry(service: &str, account: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(service, account)
        .map_err(|error| format!("Failed to access secure storage: {error}"))?;

    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Failed to clear secure secret: {error}")),
    }
}

fn get_ai_secret_from_session(
    state: &SettingsState,
    provider: &str,
) -> Result<Option<String>, String> {
    let secrets = state
        .ai_secrets
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    Ok(secrets.get(provider).map(|secret| secret.value.clone()))
}

fn resolve_ai_provider_secret(
    state: &State<'_, SettingsState>,
    provider: &str,
) -> Result<String, String> {
    let trimmed_provider = provider.trim();

    if trimmed_provider.is_empty() {
        return Err("AI provider is required".to_string());
    }

    if let Some(secret) = load_keyring_entry(AI_SECRET_SERVICE, trimmed_provider)? {
        return Ok(secret);
    }

    if let Some(secret) = get_ai_secret_from_session(state.inner(), trimmed_provider)? {
        return Ok(secret);
    }

    Err(format!(
        "No API key saved for the '{}' AI provider",
        trimmed_provider
    ))
}

fn resolve_ai_base_url(provider: &str, custom_endpoint: &str) -> Result<String, String> {
    let trimmed_provider = provider.trim();
    let trimmed_endpoint = custom_endpoint.trim().trim_end_matches('/');

    let base_url = match trimmed_provider {
        "openai" => {
            if trimmed_endpoint.is_empty() {
                "https://api.openai.com/v1"
            } else {
                trimmed_endpoint
            }
        }
        "anthropic" => {
            if trimmed_endpoint.is_empty() {
                "https://api.anthropic.com/v1"
            } else {
                trimmed_endpoint
            }
        }
        "google" => {
            if trimmed_endpoint.is_empty() {
                "https://generativelanguage.googleapis.com/v1beta/openai"
            } else {
                trimmed_endpoint
            }
        }
        "ollama" => {
            if trimmed_endpoint.is_empty() {
                "http://localhost:11434/v1"
            } else {
                trimmed_endpoint
            }
        }
        "azure" => {
            if trimmed_endpoint.is_empty() {
                return Err("Azure requires a custom OpenAI-compatible base URL".to_string());
            }

            trimmed_endpoint
        }
        "custom" => {
            if trimmed_endpoint.is_empty() {
                return Err("Custom AI endpoint is required".to_string());
            }

            trimmed_endpoint
        }
        _ => {
            if trimmed_endpoint.is_empty() {
                return Err("Unsupported AI provider".to_string());
            }

            trimmed_endpoint
        }
    };

    if !(base_url.starts_with("http://") || base_url.starts_with("https://")) {
        return Err("AI endpoint must start with http:// or https://".to_string());
    }

    Ok(base_url.to_string())
}

fn read_ureq_response_string(response: ureq::Response) -> Result<String, String> {
    response
        .into_string()
        .map_err(|error| format!("Failed to read AI response body: {error}"))
}

fn map_ai_http_error(error: ureq::Error) -> String {
    match error {
        ureq::Error::Status(code, response) => {
            let body = read_ureq_response_string(response).unwrap_or_default();
            let compact_body = body.trim();

            match code {
                401 | 403 => "The configured AI endpoint rejected the API key.".to_string(),
                _ => {
                    if compact_body.is_empty() {
                        format!("AI request failed with HTTP {code}")
                    } else {
                        format!("AI request failed with HTTP {code}: {compact_body}")
                    }
                }
            }
        }
        ureq::Error::Transport(transport) => format!("Failed to reach AI endpoint: {transport}"),
    }
}

fn parse_ai_model_list(value: &serde_json::Value) -> Result<Vec<AiModelInfo>, String> {
    let data = value
        .get("data")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "The configured AI endpoint is not OpenAI-compatible.".to_string())?;

    let mut models = data
        .iter()
        .filter_map(|entry| {
            let id = entry.get("id")?.as_str()?.trim();

            if id.is_empty() {
                return None;
            }

            Some(AiModelInfo {
                id: id.to_string(),
                label: id.to_string(),
            })
        })
        .collect::<Vec<_>>();

    models.sort_by(|left, right| left.label.cmp(&right.label));
    models.dedup_by(|left, right| left.id == right.id);

    Ok(models)
}

fn extract_ai_message_content(value: &serde_json::Value) -> Option<String> {
    let content = value
        .get("choices")?
        .as_array()?
        .first()?
        .get("message")?
        .get("content")?;

    if let Some(text) = content.as_str() {
        return Some(text.to_string());
    }

    let content_parts = content.as_array()?;
    let mut combined = String::new();

    for part in content_parts {
        let text = part.get("text").and_then(serde_json::Value::as_str)?;
        combined.push_str(text);
    }

    Some(combined)
}

fn parse_generated_commit_message(content: &str) -> Result<GeneratedCommitMessage, String> {
    let parsed: serde_json::Value = serde_json::from_str(content.trim())
        .map_err(|_| "AI response was not valid JSON.".to_string())?;
    let title = parsed
        .get("title")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "AI response did not include a valid commit title.".to_string())?;
    let body = parsed
        .get("body")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .unwrap_or_default();

    Ok(GeneratedCommitMessage {
        body: body.to_string(),
        title: title.to_string(),
    })
}

fn run_git_text_command(repo_path: &str, args: &[&str], fallback: &str) -> Result<String, String> {
    let output = git_command()
        .args(["-C", repo_path])
        .args(args)
        .output()
        .map_err(|error| format!("Failed to run git command: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(&output.stderr, fallback));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn build_commit_generation_prompt(
    status: &str,
    diff_stat: &str,
    staged_diff: &str,
    recent_titles: &str,
    instruction: &str,
) -> String {
    format!(
        concat!(
            "You generate git commit messages.\n",
            "Return strict JSON with exactly this shape: ",
            "{{\"title\":\"string\",\"body\":\"string\"}}.\n",
            "Rules:\n",
            "- Use staged changes only.\n",
            "- Title must be concise, imperative, and specific.\n",
            "- Body is optional and should be brief.\n",
            "- Do not mention files unless they matter.\n",
            "- Do not wrap the JSON in markdown.\n",
            "- If the body is unnecessary, return an empty string.\n\n",
            "User instruction:\n{instruction}\n\n",
            "Recent commit titles for tone/style continuity:\n{recent_titles}\n\n",
            "Git status --short:\n{status}\n\n",
            "Git diff --cached --stat:\n{diff_stat}\n\n",
            "Git diff --cached --unified=0:\n{staged_diff}\n"
        ),
        instruction = instruction.trim(),
        recent_titles = recent_titles,
        status = status,
        diff_stat = diff_stat,
        staged_diff = staged_diff
    )
}

fn truncate_for_ai_budget(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }

    let truncated = value.chars().take(max_chars).collect::<String>();
    format!("{truncated}\n...[truncated]")
}

fn get_proxy_secret_from_session(
    state: &SettingsState,
    username: &str,
) -> Result<Option<String>, String> {
    let credentials = state
        .http_credentials
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    Ok(credentials
        .values()
        .find(|entry| entry.protocol == "proxy" && entry.username == username)
        .map(|entry| entry.secret.value.clone()))
}

fn resolve_proxy_secret(
    state: Option<&State<'_, SettingsState>>,
    username: &str,
    supplied_secret: Option<&str>,
) -> Result<Option<String>, String> {
    if let Some(secret) = supplied_secret.filter(|value| !value.trim().is_empty()) {
        return Ok(Some(secret.trim().to_string()));
    }

    if let Some(secret) = load_keyring_entry(PROXY_SECRET_SERVICE, username)? {
        return Ok(Some(secret));
    }

    let Some(state) = state else {
        return Ok(None);
    };

    get_proxy_secret_from_session(state.inner(), username)
}

fn configure_git_ssh_command(preferences: &RepoCommandPreferences) -> Option<String> {
    if preferences.use_local_ssh_agent != Some(false) {
        return None;
    }

    let private_key_path = preferences
        .ssh_private_key_path
        .as_ref()
        .filter(|value| !value.trim().is_empty())?;
    let public_key_path = preferences
        .ssh_public_key_path
        .as_ref()
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().to_string());

    if let Some(public_key_path) = public_key_path {
        let expected_public_key_path = format!("{}.pub", private_key_path.trim());

        if public_key_path != expected_public_key_path {
            return None;
        }
    }

    Some(format!(
        "ssh -i '{}' -o IdentitiesOnly=yes -o IdentityAgent=none",
        private_key_path.trim().replace('\'', "'\\''")
    ))
}

fn apply_git_preferences(
    command: &mut Command,
    preferences: &RepoCommandPreferences,
    settings_state: Option<&State<'_, SettingsState>>,
) -> Result<(), String> {
    if preferences.use_local_ssh_agent == Some(false) {
        command.env("SSH_AUTH_SOCK", "");
    }

    if preferences.ssl_verification == Some(false) {
        command.env("GIT_SSL_NO_VERIFY", "true");
    }

    command.env("GIT_TERMINAL_PROMPT", "0");

    if preferences.use_git_credential_manager == Some(true) {
        command.env("GCM_INTERACTIVE", "never");
    }

    if let Some(ssh_command) = configure_git_ssh_command(preferences) {
        command.env("GIT_SSH_COMMAND", ssh_command);
        command.env("SSH_AUTH_SOCK", "");
    }

    if preferences.enable_proxy == Some(true) {
        if let Some(host) = preferences
            .proxy_host
            .as_ref()
            .filter(|value| !value.trim().is_empty())
        {
            let scheme = preferences
                .proxy_type
                .clone()
                .unwrap_or_else(|| "http".to_string());
            let port = preferences.proxy_port.unwrap_or(80);

            if preferences.proxy_auth_enabled == Some(true) {
                if let Some(username) = preferences
                    .proxy_username
                    .as_ref()
                    .filter(|value| !value.trim().is_empty())
                {
                    if let Some(secret) = resolve_proxy_secret(
                        settings_state,
                        username.trim(),
                        preferences.proxy_auth_password.as_deref(),
                    )? {
                        command.env("LITGIT_PROXY_USERNAME", username.trim());
                        command.env("LITGIT_PROXY_PASSWORD", secret);
                    }
                }
            }

            command.env("LITGIT_PROXY_HOST", host.trim());
            command.env("LITGIT_PROXY_PORT", port.to_string());
            command.env("LITGIT_PROXY_TYPE", scheme);
        }
    }

    if let Some(gpg_program_path) = preferences
        .gpg_program_path
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        command.args(["-c", &format!("gpg.program={}", gpg_program_path.trim())]);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        git_error_message, git_process_error_message, is_git_authentication_message,
        parse_ai_model_list, parse_generated_commit_message, truncate_for_ai_budget,
    };

    #[test]
    fn detects_terminal_prompts_disabled_as_auth_error() {
        assert!(is_git_authentication_message(
            "fatal: could not read Username for 'https://github.com': terminal prompts disabled"
        ));
    }

    #[test]
    fn detects_read_username_as_auth_error() {
        assert!(is_git_authentication_message(
            "fatal: could not read Username for 'https://github.com': No such device or address"
        ));
    }

    #[test]
    fn detects_http_401_as_auth_error() {
        assert!(is_git_authentication_message(
            "remote: Invalid username or token. fatal: Authentication failed: The requested URL returned error: 401"
        ));
    }

    #[test]
    fn does_not_misclassify_repository_not_found_as_auth_error() {
        assert!(!is_git_authentication_message(
            "remote: Repository not found. fatal: repository 'https://github.com/owner/repo.git/' not found"
        ));
    }

    #[test]
    fn returns_fallback_for_empty_git_error() {
        assert_eq!(git_error_message(b"", "Fallback error"), "Fallback error");
    }

    #[test]
    fn returns_actionable_message_for_auth_error() {
        assert_eq!(
            git_error_message(
                b"fatal: could not read Username for 'https://github.com': terminal prompts disabled",
                "Fallback error"
            ),
            "Authentication required or credentials were rejected for this HTTPS remote. Configure a Git credential helper or use SSH, then try again."
        );
    }

    #[test]
    fn preserves_non_auth_git_errors() {
        assert_eq!(
            git_error_message(b"fatal: not a git repository", "Fallback error"),
            "fatal: not a git repository"
        );
    }

    #[test]
    fn falls_back_to_stdout_when_stderr_is_empty() {
        assert_eq!(
            git_process_error_message(
                b"husky - pre-commit hook exited with code 1",
                b"",
                "Fallback error",
            ),
            "husky - pre-commit hook exited with code 1"
        );
    }

    #[cfg(windows)]
    #[test]
    fn uses_create_no_window_for_background_processes() {
        assert_eq!(super::background_process_creation_flags(), 0x08000000);
    }

    #[test]
    fn parses_openai_model_list_payload() {
        let payload = serde_json::json!({
            "data": [
                { "id": "gpt-4o-mini" },
                { "id": "gpt-4.1" }
            ]
        });

        let models = parse_ai_model_list(&payload).expect("model list should parse");

        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "gpt-4.1");
        assert_eq!(models[1].id, "gpt-4o-mini");
    }

    #[test]
    fn rejects_invalid_generated_commit_payload() {
        assert!(parse_generated_commit_message("not-json").is_err());
        assert!(parse_generated_commit_message(r#"{"body":"Only body"}"#).is_err());
    }

    #[test]
    fn parses_generated_commit_payload() {
        let generated = parse_generated_commit_message(
            r#"{"title":"Add AI commit generation","body":"Wire settings and repo composer."}"#,
        )
        .expect("generated commit payload should parse");

        assert_eq!(generated.title, "Add AI commit generation");
        assert_eq!(generated.body, "Wire settings and repo composer.");
    }

    #[test]
    fn truncates_large_prompt_segments() {
        let truncated = truncate_for_ai_budget("abcdefghijklmnopqrstuvwxyz", 10);

        assert!(truncated.starts_with("abcdefghij"));
        assert!(truncated.contains("[truncated]"));
    }
}

#[tauri::command]
fn get_settings_backend_capabilities() -> Result<SettingsBackendCapabilities, String> {
    let secure_storage_available =
        keyring::Entry::new(AI_SECRET_SERVICE, "capability-check").is_ok();
    let runtime_platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "ios") {
        "ios"
    } else if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    };

    Ok(SettingsBackendCapabilities {
        runtime_platform: runtime_platform.to_string(),
        secure_storage_available,
        session_secrets_supported: true,
    })
}

#[tauri::command]
fn save_ai_provider_secret(
    state: State<'_, SettingsState>,
    provider: String,
    secret: String,
) -> Result<SecretStatusPayload, String> {
    let trimmed_provider = provider.trim();
    let trimmed_secret = secret.trim();

    if trimmed_provider.is_empty() {
        return Err("Provider is required".to_string());
    }

    if trimmed_secret.is_empty() {
        return Err("Secret is required".to_string());
    }

    if save_keyring_entry(AI_SECRET_SERVICE, trimmed_provider, trimmed_secret).is_ok() {
        return Ok(SecretStatusPayload {
            has_stored_value: true,
            storage_mode: "secure".to_string(),
        });
    }

    let mut secrets = state
        .ai_secrets
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    secrets.insert(
        trimmed_provider.to_string(),
        StoredSecretValue::session(trimmed_secret),
    );

    Ok(SecretStatusPayload {
        has_stored_value: true,
        storage_mode: "session".to_string(),
    })
}

#[tauri::command]
fn get_ai_provider_secret_status(
    state: State<'_, SettingsState>,
    provider: String,
) -> Result<SecretStatusPayload, String> {
    if load_keyring_entry(AI_SECRET_SERVICE, provider.trim())?.is_some() {
        return Ok(SecretStatusPayload {
            has_stored_value: true,
            storage_mode: "secure".to_string(),
        });
    }

    let secrets = state
        .ai_secrets
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    let status = secrets.get(provider.trim());

    Ok(SecretStatusPayload {
        has_stored_value: status.is_some(),
        storage_mode: status
            .map(|value| value.storage_mode.clone())
            .unwrap_or_else(|| "session".to_string()),
    })
}

#[tauri::command]
fn clear_ai_provider_secret(
    state: State<'_, SettingsState>,
    provider: String,
) -> Result<(), String> {
    let trimmed_provider = provider.trim();

    if trimmed_provider.is_empty() {
        return Ok(());
    }

    let _ = clear_keyring_entry(AI_SECRET_SERVICE, trimmed_provider);

    let mut secrets = state
        .ai_secrets
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;
    secrets.remove(trimmed_provider);

    Ok(())
}

#[tauri::command]
fn list_ai_models(
    state: State<'_, SettingsState>,
    provider: String,
    custom_endpoint: String,
) -> Result<Vec<AiModelInfo>, String> {
    let secret = resolve_ai_provider_secret(&state, &provider)?;
    let base_url = resolve_ai_base_url(&provider, &custom_endpoint)?;
    let models_url = format!("{base_url}/models");
    let response = ureq::get(&models_url)
        .set("Accept", "application/json")
        .set("Authorization", &format!("Bearer {secret}"))
        .call()
        .map_err(map_ai_http_error)?;
    let body = read_ureq_response_string(response)?;
    let payload: serde_json::Value = serde_json::from_str(&body)
        .map_err(|_| "The configured AI endpoint is not OpenAI-compatible.".to_string())?;

    parse_ai_model_list(&payload)
}

#[tauri::command]
fn generate_repository_commit_message(
    state: State<'_, SettingsState>,
    repo_path: String,
    provider: String,
    custom_endpoint: String,
    model: String,
    instruction: String,
    max_input_tokens: usize,
) -> Result<GeneratedCommitMessage, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_model = model.trim();

    if trimmed_model.is_empty() {
        return Err("Select an AI model before generating a commit message".to_string());
    }

    let diff_stat = run_git_text_command(
        &repo_path,
        &["diff", "--cached", "--stat"],
        "Failed to inspect staged diff",
    )?;

    if diff_stat.trim().is_empty() {
        return Err("Stage changes before generating a commit message".to_string());
    }

    let staged_diff = run_git_text_command(
        &repo_path,
        &["diff", "--cached", "--unified=0"],
        "Failed to inspect staged diff",
    )?;
    let status = run_git_text_command(
        &repo_path,
        &["status", "--short"],
        "Failed to inspect repository status",
    )?;
    let recent_titles = run_git_text_command(
        &repo_path,
        &["log", "-5", "--pretty=format:%s"],
        "Failed to inspect recent commits",
    )
    .unwrap_or_default();
    let input_budget_chars = max_input_tokens.max(512).saturating_mul(4);
    let staged_diff_budget = input_budget_chars.saturating_mul(70) / 100;
    let diff_stat_budget = input_budget_chars.saturating_mul(15) / 100;
    let status_budget = input_budget_chars.saturating_mul(10) / 100;
    let recent_titles_budget = input_budget_chars.saturating_mul(5) / 100;
    let truncated_staged_diff = truncate_for_ai_budget(&staged_diff, staged_diff_budget.max(512));
    let truncated_diff_stat = truncate_for_ai_budget(&diff_stat, diff_stat_budget.max(128));
    let truncated_status = truncate_for_ai_budget(&status, status_budget.max(64));
    let truncated_recent_titles =
        truncate_for_ai_budget(&recent_titles, recent_titles_budget.max(64));

    let prompt = build_commit_generation_prompt(
        &truncated_status,
        &truncated_diff_stat,
        &truncated_staged_diff,
        &truncated_recent_titles,
        &instruction,
    );
    let secret = resolve_ai_provider_secret(&state, &provider)?;
    let base_url = resolve_ai_base_url(&provider, &custom_endpoint)?;
    let completions_url = format!("{base_url}/chat/completions");
    let request_body = serde_json::json!({
        "model": trimmed_model,
        "messages": [
            {
                "role": "system",
                "content": "You write high-quality git commit messages and must respond with strict JSON only."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "max_tokens": max_input_tokens.min(300).max(64),
        "temperature": 0.2
    });
    let response = ureq::post(&completions_url)
        .set("Accept", "application/json")
        .set("Authorization", &format!("Bearer {secret}"))
        .set("Content-Type", "application/json")
        .send_string(&request_body.to_string())
        .map_err(map_ai_http_error)?;
    let body = read_ureq_response_string(response)?;
    let payload: serde_json::Value = serde_json::from_str(&body)
        .map_err(|_| "The configured AI endpoint is not OpenAI-compatible.".to_string())?;
    let content = extract_ai_message_content(&payload)
        .ok_or_else(|| "The configured AI endpoint is not OpenAI-compatible.".to_string())?;

    parse_generated_commit_message(&content)
}

#[tauri::command]
fn save_github_token(
    state: State<'_, SettingsState>,
    token: String,
) -> Result<SecretStatusPayload, String> {
    let trimmed_token = token.trim();

    if trimmed_token.is_empty() {
        return Err("GitHub token is required".to_string());
    }

    if save_keyring_entry(GITHUB_AVATAR_SERVICE, "token", trimmed_token).is_ok() {
        clear_github_identity_cache(state.inner());
        return Ok(SecretStatusPayload {
            has_stored_value: true,
            storage_mode: "secure".to_string(),
        });
    }

    let mut secrets = state
        .ai_secrets
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    secrets.insert(
        "github_token".to_string(),
        StoredSecretValue::session(trimmed_token),
    );

    clear_github_identity_cache(state.inner());

    Ok(SecretStatusPayload {
        has_stored_value: true,
        storage_mode: "session".to_string(),
    })
}

#[tauri::command]
fn get_github_token_status(state: State<'_, SettingsState>) -> Result<SecretStatusPayload, String> {
    if load_keyring_entry(GITHUB_AVATAR_SERVICE, "token")?.is_some() {
        return Ok(SecretStatusPayload {
            has_stored_value: true,
            storage_mode: "secure".to_string(),
        });
    }

    let secrets = state
        .ai_secrets
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    let status = secrets.get("github_token");

    Ok(SecretStatusPayload {
        has_stored_value: status.is_some(),
        storage_mode: status
            .map(|value| value.storage_mode.clone())
            .unwrap_or_else(|| "session".to_string()),
    })
}

#[tauri::command]
fn clear_github_token(state: State<'_, SettingsState>) -> Result<(), String> {
    let _ = clear_keyring_entry(GITHUB_AVATAR_SERVICE, "token");

    let mut secrets = state
        .ai_secrets
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;
    secrets.remove("github_token");
    clear_github_identity_cache(state.inner());

    Ok(())
}

#[tauri::command]
fn save_proxy_auth_secret(
    state: State<'_, SettingsState>,
    username: String,
    secret: String,
) -> Result<SecretStatusPayload, String> {
    let trimmed_username = username.trim();
    let trimmed_secret = secret.trim();

    if trimmed_username.is_empty() {
        return Err("Proxy username is required".to_string());
    }

    if trimmed_secret.is_empty() {
        return Err("Proxy password is required".to_string());
    }

    if save_keyring_entry(PROXY_SECRET_SERVICE, trimmed_username, trimmed_secret).is_ok() {
        return Ok(SecretStatusPayload {
            has_stored_value: true,
            storage_mode: "secure".to_string(),
        });
    }

    let mut credentials = state
        .http_credentials
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    let entry_id = build_http_credential_entry_id("proxy", "proxy", None, trimmed_username);
    credentials.insert(
        entry_id,
        StoredHttpCredential {
            host: "proxy".to_string(),
            port: None,
            protocol: "proxy".to_string(),
            secret: StoredSecretValue::session(trimmed_secret),
            username: trimmed_username.to_string(),
        },
    );

    Ok(SecretStatusPayload {
        has_stored_value: true,
        storage_mode: "session".to_string(),
    })
}

#[tauri::command]
fn get_proxy_auth_secret_status(
    state: State<'_, SettingsState>,
    username: String,
) -> Result<SecretStatusPayload, String> {
    let trimmed_username = username.trim();

    if trimmed_username.is_empty() {
        return Ok(SecretStatusPayload {
            has_stored_value: false,
            storage_mode: "session".to_string(),
        });
    }

    if load_keyring_entry(PROXY_SECRET_SERVICE, trimmed_username)?.is_some() {
        return Ok(SecretStatusPayload {
            has_stored_value: true,
            storage_mode: "secure".to_string(),
        });
    }

    let credentials = state
        .http_credentials
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    let has_session_value = credentials
        .values()
        .any(|entry| entry.protocol == "proxy" && entry.username == trimmed_username);

    Ok(SecretStatusPayload {
        has_stored_value: has_session_value,
        storage_mode: "session".to_string(),
    })
}

#[tauri::command]
fn clear_proxy_auth_secret(
    state: State<'_, SettingsState>,
    username: String,
) -> Result<(), String> {
    let trimmed_username = username.trim();

    if trimmed_username.is_empty() {
        return Ok(());
    }

    let _ = clear_keyring_entry(PROXY_SECRET_SERVICE, trimmed_username);

    let mut credentials = state
        .http_credentials
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;
    credentials
        .retain(|_, entry| !(entry.protocol == "proxy" && entry.username == trimmed_username));
    Ok(())
}

fn begin_network_operation<'a>(
    state: &'a State<'_, SettingsState>,
    repo_path: &str,
) -> Result<NetworkOperationGuard<'a>, String> {
    let mut active_operations = state
        .active_network_repo_paths
        .lock()
        .map_err(|_| "Failed to access scheduler state".to_string())?;

    if active_operations.contains(repo_path) {
        return Err("Another network operation is already running for this repository".to_string());
    }

    active_operations.insert(repo_path.to_string());

    Ok(NetworkOperationGuard {
        active_operations: &state.active_network_repo_paths,
        repo_path: repo_path.to_string(),
    })
}

#[tauri::command]
fn list_http_credential_entries(
    state: State<'_, SettingsState>,
) -> Result<Vec<HttpCredentialEntryMetadata>, String> {
    let credentials = state
        .http_credentials
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    Ok(credentials
        .iter()
        .map(|(entry_id, credential)| HttpCredentialEntryMetadata {
            host: credential.host.clone(),
            id: entry_id.clone(),
            port: credential.port,
            protocol: credential.protocol.clone(),
            username: credential.username.clone(),
        })
        .collect())
}

#[tauri::command]
fn clear_http_credential_entry(
    state: State<'_, SettingsState>,
    entry_id: String,
) -> Result<(), String> {
    let mut credentials = state
        .http_credentials
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    credentials.remove(entry_id.trim());
    Ok(())
}

#[tauri::command]
fn test_proxy_connection(
    host: String,
    port: u16,
    proxy_type: String,
    username: Option<String>,
    password: Option<String>,
) -> Result<ProxyTestResult, String> {
    let trimmed_host = host.trim();

    if trimmed_host.is_empty() {
        return Err("Proxy host is required".to_string());
    }

    let supported = matches!(proxy_type.as_str(), "http" | "https" | "socks5");

    if !supported {
        return Err("Unsupported proxy type".to_string());
    }

    let proxy_url = if let (Some(username), Some(password)) = (username, password) {
        format!(
            "{}://{}:{}@{}:{}",
            proxy_type, username, password, trimmed_host, port
        )
    } else {
        format!("{}://{}:{}", proxy_type, trimmed_host, port)
    };
    let proxy =
        Proxy::new(&proxy_url).map_err(|error| format!("Failed to configure proxy: {error}"))?;
    let agent = ureq::AgentBuilder::new()
        .proxy(proxy)
        .timeout(std::time::Duration::from_secs(10))
        .build();

    let response = agent
        .get("https://example.com/")
        .call()
        .map_err(|error| format!("Proxy request failed: {error}"))?;

    let status = response.status();

    if !(200..400).contains(&status) {
        return Ok(ProxyTestResult {
            message: format!("Proxy responded with unexpected status code {status}"),
            ok: false,
        });
    }

    Ok(ProxyTestResult {
        message: format!(
            "Proxy request to https://example.com/ succeeded via {}://{}:{}",
            proxy_type, trimmed_host, port,
        ),
        ok: true,
    })
}

#[tauri::command]
fn start_auto_fetch_scheduler(
    state: State<'_, SettingsState>,
    interval_minutes: u64,
    repo_path: String,
    preferences: Option<RepoCommandPreferences>,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let mut scheduler = state
        .auto_fetch_scheduler
        .lock()
        .map_err(|_| "Failed to access scheduler state".to_string())?;

    if let Some(existing) = scheduler.take() {
        let _ = existing.shutdown_tx.send(());
        let _ = existing.worker.join();
    }

    if interval_minutes == 0 {
        return Ok(());
    }

    let active_network_repo_paths = Arc::clone(&state.active_network_repo_paths);

    let (shutdown_tx, shutdown_rx) = std::sync::mpsc::channel::<()>();
    let repo_path_for_worker = repo_path.clone();
    let worker_preferences = preferences.unwrap_or_default();
    let worker = std::thread::spawn(move || {
        let interval = std::time::Duration::from_secs(interval_minutes.saturating_mul(60));

        loop {
            match shutdown_rx.recv_timeout(interval) {
                Ok(()) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    break;
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    let network_operation = match active_network_repo_paths.lock() {
                        Ok(mut active_operations) => {
                            if active_operations.contains(&repo_path_for_worker) {
                                None
                            } else {
                                active_operations.insert(repo_path_for_worker.clone());
                                Some(NetworkOperationGuard {
                                    active_operations: &active_network_repo_paths,
                                    repo_path: repo_path_for_worker.clone(),
                                })
                            }
                        }
                        Err(_) => None,
                    };

                    if network_operation.is_none() {
                        continue;
                    }

                    let _ = run_network_git_command(
                        &repo_path_for_worker,
                        &["fetch", "--all", "--prune"],
                        &worker_preferences,
                    );
                    drop(network_operation);
                }
            }
        }
    });

    *scheduler = Some(AutoFetchSchedulerHandle {
        shutdown_tx,
        worker,
    });

    Ok(())
}

#[tauri::command]
fn stop_auto_fetch_scheduler(state: State<'_, SettingsState>) -> Result<(), String> {
    let mut scheduler = state
        .auto_fetch_scheduler
        .lock()
        .map_err(|_| "Failed to access scheduler state".to_string())?;

    if let Some(existing) = scheduler.take() {
        let _ = existing.shutdown_tx.send(());
        let _ = existing.worker.join();
    }

    Ok(())
}

static NEXT_TERMINAL_SESSION_ID: AtomicUsize = AtomicUsize::new(1);

struct TerminalSession {
    child: Box<dyn portable_pty::Child + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
}

#[derive(Default)]
struct TerminalState {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

struct SettingsState {
    ai_secrets: Mutex<HashMap<String, StoredSecretValue>>,
    http_credentials: Mutex<HashMap<String, StoredHttpCredential>>,
    github_identity_cache: Mutex<HashMap<String, CachedGitHubIdentityEntry>>,
    github_identity_cache_file_path: Mutex<Option<PathBuf>>,
    system_font_families: Mutex<Option<Vec<SystemFontFamily>>>,
    active_network_repo_paths: Arc<Mutex<HashSet<String>>>,
    auto_fetch_scheduler: Mutex<Option<AutoFetchSchedulerHandle>>,
}

impl Default for SettingsState {
    fn default() -> Self {
        Self {
            ai_secrets: Mutex::default(),
            http_credentials: Mutex::default(),
            github_identity_cache: Mutex::default(),
            github_identity_cache_file_path: Mutex::default(),
            system_font_families: Mutex::default(),
            active_network_repo_paths: Arc::new(Mutex::new(HashSet::new())),
            auto_fetch_scheduler: Mutex::default(),
        }
    }
}

struct AutoFetchSchedulerHandle {
    shutdown_tx: std::sync::mpsc::Sender<()>,
    worker: JoinHandle<()>,
}

fn run_network_git_command(
    repo_path: &str,
    args: &[&str],
    preferences: &RepoCommandPreferences,
) -> Result<std::process::Output, String> {
    let mut command = git_command();
    apply_git_preferences(&mut command, preferences, None)?;
    command.args(["-C", repo_path]);
    command.args(args);
    command
        .output()
        .map_err(|error| format!("Failed to run git command: {error}"))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalOutputPayload {
    data: String,
}

fn default_shell() -> String {
    if cfg!(windows) {
        env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    } else {
        env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

#[tauri::command]
fn create_terminal_session(
    app: AppHandle,
    state: State<'_, TerminalState>,
    cwd: String,
) -> Result<String, String> {
    let trimmed_cwd = cwd.trim();
    let pty_system = native_pty_system();
    let pty_pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("Failed to open pty: {error}"))?;

    let shell = default_shell();
    let mut command = CommandBuilder::new(shell);

    if !trimmed_cwd.is_empty() {
        let cwd_path = Path::new(trimmed_cwd);

        if !cwd_path.exists() {
            return Err("Terminal working directory does not exist".to_string());
        }

        if !cwd_path.is_dir() {
            return Err("Terminal working directory is not a folder".to_string());
        }

        command.cwd(cwd_path);
    }

    let child = pty_pair
        .slave
        .spawn_command(command)
        .map_err(|error| format!("Failed to start shell: {error}"))?;
    let writer = pty_pair
        .master
        .take_writer()
        .map_err(|error| format!("Failed to create terminal writer: {error}"))?;
    let mut reader = pty_pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("Failed to create terminal reader: {error}"))?;

    let session_id = format!(
        "terminal-{}",
        NEXT_TERMINAL_SESSION_ID.fetch_add(1, Ordering::Relaxed)
    );
    let event_name = format!("terminal-output:{session_id}");
    let output_app = app.clone();

    std::thread::spawn(move || {
        let mut buffer = vec![0_u8; 8192];

        loop {
            let bytes_read = match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => size,
                Err(_) => break,
            };

            let chunk = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();

            if output_app
                .emit(&event_name, TerminalOutputPayload { data: chunk })
                .is_err()
            {
                break;
            }
        }
    });

    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to acquire terminal state lock".to_string())?;

    sessions.insert(
        session_id.clone(),
        TerminalSession {
            child,
            master: pty_pair.master,
            writer,
        },
    );

    Ok(session_id)
}

#[tauri::command]
fn write_terminal_session(
    state: State<'_, TerminalState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to acquire terminal state lock".to_string())?;

    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| "Terminal session not found".to_string())?;

    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|error| format!("Failed to write to terminal: {error}"))?;
    session
        .writer
        .flush()
        .map_err(|error| format!("Failed to flush terminal input: {error}"))?;

    Ok(())
}

#[tauri::command]
fn resize_terminal_session(
    state: State<'_, TerminalState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to acquire terminal state lock".to_string())?;

    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| "Terminal session not found".to_string())?;

    session
        .master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("Failed to resize terminal: {error}"))?;

    Ok(())
}

#[tauri::command]
fn close_terminal_session(
    state: State<'_, TerminalState>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to acquire terminal state lock".to_string())?;

    let mut session = sessions
        .remove(&session_id)
        .ok_or_else(|| "Terminal session not found".to_string())?;

    let _ = session.child.kill();
    let _ = session.child.wait();

    Ok(())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(TerminalState::default())
        .manage(SettingsState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let settings_state = app.state::<SettingsState>();
            initialize_github_identity_cache(app.handle(), settings_state.inner());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_git_repository,
            pick_clone_destination_folder,
            pick_settings_file,
            generate_ssh_keypair,
            list_signing_keys,
            list_system_font_families,
            create_local_repository,
            get_git_identity,
            set_git_identity,
            clone_git_repository,
            validate_opened_repositories,
            create_repository_initial_commit,
            get_repository_history,
            get_latest_repository_commit_message,
            get_repository_branches,
            get_repository_remote_names,
            get_repository_stashes,
            create_repository_branch,
            create_repository_branch_at_reference,
            delete_repository_branch,
            rename_repository_branch,
            delete_remote_repository_branch,
            set_repository_branch_upstream,
            switch_repository_branch,
            checkout_repository_commit,
            pull_repository_action,
            run_repository_merge_action,
            push_repository_branch,
            create_repository_stash,
            apply_repository_stash,
            pop_repository_stash,
            drop_repository_stash,
            commit_repository_changes,
            add_repository_ignore_rule,
            stage_all_repository_changes,
            unstage_all_repository_changes,
            stage_repository_file,
            unstage_repository_file,
            discard_repository_path_changes,
            discard_all_repository_changes,
            reset_repository_to_reference,
            cherry_pick_repository_commit,
            revert_repository_commit,
            create_repository_tag,
            get_repository_file_diff,
            get_repository_file_preflight,
            get_repository_file_content,
            get_repository_file_hunks,
            get_repository_file_history,
            get_repository_file_blame,
            get_repository_file_text,
            detect_repository_file_encoding,
            save_repository_file_text,
            get_repository_commit_files,
            get_repository_commit_file_diff,
            get_repository_commit_file_preflight,
            get_repository_commit_file_content,
            get_repository_commit_file_hunks,
            get_repository_working_tree_status,
            get_repository_working_tree_items,
            get_repository_files,
            get_settings_backend_capabilities,
            save_ai_provider_secret,
            get_ai_provider_secret_status,
            clear_ai_provider_secret,
            list_ai_models,
            generate_repository_commit_message,
            save_github_token,
            get_github_token_status,
            clear_github_token,
            save_proxy_auth_secret,
            get_proxy_auth_secret_status,
            clear_proxy_auth_secret,
            list_http_credential_entries,
            clear_http_credential_entry,
            test_proxy_connection,
            start_auto_fetch_scheduler,
            stop_auto_fetch_scheduler,
            create_terminal_session,
            write_terminal_session,
            resize_terminal_session,
            close_terminal_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
