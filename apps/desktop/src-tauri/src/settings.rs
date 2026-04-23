use crate::git_host_auth::APP_USER_AGENT;
use crate::git_support::{background_command, git_command, git_error_message, validate_git_repo};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::State;
use thiserror::Error;
use ureq::http;

/// Error type for settings operations.
#[derive(Debug, Error)]
pub(crate) enum SettingsError {
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

impl From<SettingsError> for String {
    fn from(error: SettingsError) -> Self {
        error.to_string()
    }
}

const AI_SECRET_SERVICE: &str = "litgit.ai.provider";
const PROXY_SECRET_SERVICE: &str = "litgit.proxy.auth";
const DEFAULT_PROXY_PORT: u16 = 80;
const PROXY_TEST_TIMEOUT_SECS: u64 = 10;

/// In-memory GitHub identity cache record used by history author enrichment.
#[derive(Clone)]
pub(crate) struct GitHubIdentityCacheRecord {
    /// The avatar URL returned by the GitHub API.
    pub(crate) avatar_url: Option<String>,
    /// The Unix timestamp (seconds) when this record was stored.
    pub(crate) stored_at_unix_seconds: u64,
    /// The GitHub username associated with this identity.
    pub(crate) username: Option<String>,
}

#[derive(Default)]
struct GitHubIdentityCacheStore {
    entries: HashMap<String, GitHubIdentityCacheRecord>,
    file_path: Option<PathBuf>,
}

/// Shared application state for settings, secrets, and scheduler handles.
pub(crate) struct SettingsState {
    /// In-memory AI provider secrets keyed by provider name.
    pub(crate) ai_secrets: Mutex<HashMap<String, StoredSecretValue>>,
    http_credentials: Mutex<HashMap<String, StoredHttpCredential>>,
    github_identity_cache: Mutex<GitHubIdentityCacheStore>,
    system_font_families: Mutex<Option<Vec<SystemFontFamily>>>,
    active_network_repo_paths: Arc<Mutex<HashSet<String>>>,
    auto_fetch_scheduler: Arc<Mutex<Option<AutoFetchSchedulerHandle>>>,
    askpass_socket_path: Mutex<Option<std::path::PathBuf>>,
}

impl Default for SettingsState {
    fn default() -> Self {
        Self {
            ai_secrets: Mutex::default(),
            http_credentials: Mutex::default(),
            github_identity_cache: Mutex::default(),
            system_font_families: Mutex::default(),
            active_network_repo_paths: Arc::new(Mutex::new(HashSet::new())),
            auto_fetch_scheduler: Arc::new(Mutex::default()),
            askpass_socket_path: Mutex::default(),
        }
    }
}

impl SettingsState {
    pub(crate) fn github_identity_cache_file_path(&self) -> Option<PathBuf> {
        let Ok(cache) = self.github_identity_cache.lock() else {
            log::warn!(
                "Failed to access GitHub identity cache path because the cache lock is poisoned"
            );
            return None;
        };

        cache.file_path.clone()
    }

    pub(crate) fn set_github_identity_cache_file_path(&self, file_path: Option<PathBuf>) {
        match self.github_identity_cache.lock() {
            Ok(mut cache) => {
                cache.file_path = file_path;
            }
            Err(_) => {
                log::warn!("Failed to update the GitHub identity cache path because the cache lock is poisoned");
            }
        }
    }

    pub(crate) fn set_askpass_socket_path(&self, path: std::path::PathBuf) {
        match self.askpass_socket_path.lock() {
            Ok(mut stored_path) => {
                *stored_path = Some(path);
            }
            Err(_) => {
                log::warn!("Failed to set askpass socket path because the lock is poisoned");
            }
        }
    }

    pub(crate) fn askpass_socket_path(&self) -> Option<std::path::PathBuf> {
        self.askpass_socket_path.lock().ok().and_then(|p| p.clone())
    }

    pub(crate) fn command_snapshot(&self) -> Result<SettingsCommandSnapshot, String> {
        let http_credentials = self
            .http_credentials
            .lock()
            .map_err(|_| "Failed to access settings state".to_string())?
            .clone();

        Ok(SettingsCommandSnapshot {
            active_network_repo_paths: Arc::clone(&self.active_network_repo_paths),
            askpass_socket_path: self.askpass_socket_path(),
            http_credentials,
        })
    }

    pub(crate) fn auto_fetch_scheduler_handle(
        &self,
    ) -> Arc<Mutex<Option<AutoFetchSchedulerHandle>>> {
        Arc::clone(&self.auto_fetch_scheduler)
    }

    pub(crate) fn mutate_github_identity_cache<T>(
        &self,
        mutate: impl FnOnce(&mut HashMap<String, GitHubIdentityCacheRecord>) -> T,
    ) -> Result<T, String> {
        let mut cache = self
            .github_identity_cache
            .lock()
            .map_err(|_| "Failed to access GitHub identity cache".to_string())?;

        Ok(mutate(&mut cache.entries))
    }
}

pub(crate) struct AutoFetchSchedulerHandle {
    shutdown_tx: std::sync::mpsc::Sender<()>,
    worker: JoinHandle<()>,
}

fn take_auto_fetch_scheduler(
    scheduler_handle: &Arc<Mutex<Option<AutoFetchSchedulerHandle>>>,
) -> Result<Option<AutoFetchSchedulerHandle>, String> {
    let mut scheduler = scheduler_handle
        .lock()
        .map_err(|_| "Failed to access scheduler state".to_string())?;

    Ok(scheduler.take())
}

fn shutdown_auto_fetch_scheduler(handle: AutoFetchSchedulerHandle) {
    let _ = handle.shutdown_tx.send(());

    if handle.worker.join().is_err() {
        log::warn!("Auto-fetch scheduler worker panicked during shutdown");
    }
}

/// Runtime capabilities reported by the settings backend.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SettingsBackendCapabilities {
    runtime_platform: String,
    secure_storage_available: bool,
    session_secrets_supported: bool,
}

/// Secret availability and storage mode metadata.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SecretStatusPayload {
    has_stored_value: bool,
    storage_mode: String,
}

/// Metadata for one stored HTTP credential entry.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HttpCredentialEntryMetadata {
    host: String,
    id: String,
    port: Option<u16>,
    protocol: String,
    username: String,
}

/// Result payload for proxy connectivity checks.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProxyTestResult {
    message: String,
    ok: bool,
}

/// Signing key descriptor discovered from GPG or SSH sources.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SigningKeyInfo {
    id: String,
    label: String,
    r#type: String,
}

/// System font family descriptor.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SystemFontFamily {
    /// The font family name as reported by the system.
    pub(crate) family: String,
}

/// Git identity value pair (name and email) with completeness marker.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitIdentityValue {
    email: Option<String>,
    is_complete: bool,
    name: Option<String>,
}

/// Combined Git identity payload across effective/global/local scopes.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitIdentityStatusPayload {
    effective: GitIdentityValue,
    effective_scope: Option<String>,
    global: GitIdentityValue,
    local: Option<GitIdentityValue>,
    repo_path: Option<String>,
}

/// Input payload for writing Git identity settings.
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitIdentityWriteRequest {
    /// The Git author email address to write.
    pub(crate) email: String,
    /// The Git author name to write.
    pub(crate) name: String,
    /// The config scope ("global" or "local") to write to.
    pub(crate) scope: String,
}

/// Repository command behavior preferences applied to git subprocesses.
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepoCommandPreferences {
    /// Whether to enable proxy usage for git operations.
    pub(crate) enable_proxy: Option<bool>,
    /// Custom path to the GPG signing program.
    pub(crate) gpg_program_path: Option<String>,
    /// Proxy authentication password.
    pub(crate) proxy_auth_password: Option<String>,
    /// Whether proxy authentication is enabled.
    pub(crate) proxy_auth_enabled: Option<bool>,
    /// Proxy server hostname.
    pub(crate) proxy_host: Option<String>,
    /// Proxy server port number.
    pub(crate) proxy_port: Option<u16>,
    /// Proxy protocol type (http, https, socks5).
    pub(crate) proxy_type: Option<String>,
    /// Proxy authentication username.
    pub(crate) proxy_username: Option<String>,
    /// Path to the SSH private key file.
    pub(crate) ssh_private_key_path: Option<String>,
    /// Path to the SSH public key file.
    pub(crate) ssh_public_key_path: Option<String>,
    /// Commit signing format (e.g. "openpgp", "ssh").
    pub(crate) signing_format: Option<String>,
    /// The signing key identifier (GPG key ID or SSH key path).
    pub(crate) signing_key: Option<String>,
    /// Whether to sign commits by default.
    pub(crate) sign_commits_by_default: Option<bool>,
    /// Whether to disable SSL certificate verification.
    pub(crate) ssl_verification: Option<bool>,
    /// Whether to use the Git Credential Manager.
    pub(crate) use_git_credential_manager: Option<bool>,
    /// Whether to bypass the system SSH agent.
    pub(crate) use_local_ssh_agent: Option<bool>,
}

/// Generic picked file path payload.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PickedFilePath {
    path: String,
}

/// Secret value plus storage mode marker.
#[derive(Clone)]
pub(crate) struct StoredSecretValue {
    /// The storage mode ("secure" or "session").
    pub(crate) storage_mode: String,
    /// The raw secret value string.
    pub(crate) value: String,
}

impl StoredSecretValue {
    fn session(value: &str) -> Self {
        Self {
            storage_mode: "session".to_string(),
            value: value.to_string(),
        }
    }
}

/// HTTP credential record persisted in secure/session storage.
#[derive(Clone)]
pub(crate) struct StoredHttpCredential {
    host: String,
    port: Option<u16>,
    protocol: String,
    secret: StoredSecretValue,
    username: String,
}

#[derive(Clone)]
pub(crate) struct SettingsCommandSnapshot {
    pub(crate) active_network_repo_paths: Arc<Mutex<HashSet<String>>>,
    pub(crate) askpass_socket_path: Option<PathBuf>,
    pub(crate) http_credentials: HashMap<String, StoredHttpCredential>,
}

pub(crate) struct NetworkOperationGuard<'a> {
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

/// Generates an SSH keypair in the user's `~/.ssh` directory.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[tauri::command]
pub(crate) async fn generate_ssh_keypair(file_name: String) -> Result<PickedFilePath, String> {
    tauri::async_runtime::spawn_blocking(move || generate_ssh_keypair_inner(file_name))
        .await
        .map_err(|error| format!("Failed to generate SSH keypair: {error}"))?
}

fn generate_ssh_keypair_inner(file_name: String) -> Result<PickedFilePath, String> {
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

/// Lists available signing keys from GPG and SSH key stores.
#[tauri::command]
pub(crate) async fn list_signing_keys() -> Result<Vec<SigningKeyInfo>, String> {
    tauri::async_runtime::spawn_blocking(list_signing_keys_inner)
        .await
        .map_err(|error| format!("Failed to list signing keys: {error}"))?
}

fn list_signing_keys_inner() -> Result<Vec<SigningKeyInfo>, String> {
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
                        current_key_id = parts.get(4).map(|&s| s.to_string());
                    }
                    "uid" => {
                        if let Some(key_id) = current_key_id.take() {
                            let label = parts.get(9).copied().unwrap_or("GPG key").to_string();
                            keys.push(SigningKeyInfo {
                                id: key_id,
                                label,
                                r#type: "gpg".to_string(),
                            });
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    let home = env::var("HOME").map_err(|_| "HOME is not available".to_string())?;
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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
/// Lists system font families and caches the result in process state.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
pub(crate) fn list_system_font_families(
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

    font_families.sort_unstable_by(|left, right| left.family.cmp(&right.family));

    *cached_fonts = Some(font_families.clone());

    Ok(font_families)
}

/// Returns effective, global, and local Git identity values.
#[tauri::command]
pub(crate) async fn get_git_identity(
    repo_path: Option<String>,
) -> Result<GitIdentityStatusPayload, String> {
    tauri::async_runtime::spawn_blocking(move || get_git_identity_inner(repo_path))
        .await
        .map_err(|error| format!("Failed to read Git identity: {error}"))?
}

fn get_git_identity_inner(repo_path: Option<String>) -> Result<GitIdentityStatusPayload, String> {
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

    build_git_identity_status(repo_path.as_deref()).map_err(|e| e.to_string())
}

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
/// Saves Git identity values at global or local scope and returns updated status.
#[tauri::command]
pub(crate) async fn set_git_identity(
    git_identity: GitIdentityWriteRequest,
    repo_path: Option<String>,
) -> Result<GitIdentityStatusPayload, String> {
    tauri::async_runtime::spawn_blocking(move || set_git_identity_inner(git_identity, repo_path))
        .await
        .map_err(|error| format!("Failed to save Git identity: {error}"))?
}

fn set_git_identity_inner(
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

    build_git_identity_status(normalized_repo_path.as_deref()).map_err(|e| e.to_string())
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

/// Loads a secret entry from the system keyring.
pub(crate) fn load_keyring_entry(
    service: &str,
    account: &str,
) -> Result<Option<String>, SettingsError> {
    #[cfg(all(debug_assertions, target_os = "macos"))]
    {
        if let Ok(Some(secret)) = load_git_credential_fallback(service, account) {
            return Ok(Some(secret));
        }
    }

    let entry = keyring::Entry::new(service, account).map_err(|error| {
        annotate_keyring_error(SettingsError::Message(format!(
            "Failed to access secure storage: {error}"
        )))
    })?;

    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(annotate_keyring_error(SettingsError::Message(format!(
            "Failed to read secure storage: {error}"
        )))),
    }
}

pub(crate) fn save_keyring_entry(
    service: &str,
    account: &str,
    secret: &str,
) -> Result<(), SettingsError> {
    #[cfg(all(debug_assertions, target_os = "macos"))]
    {
        if save_git_credential_fallback(service, account, secret).is_ok() {
            return Ok(());
        }
    }

    let entry = keyring::Entry::new(service, account).map_err(|error| {
        annotate_keyring_error(SettingsError::Message(format!(
            "Failed to access secure storage: {error}"
        )))
    })?;

    entry.set_password(secret).map_err(|error| {
        annotate_keyring_error(SettingsError::Message(format!(
            "Failed to save secure secret: {error}"
        )))
    })
}

pub(crate) fn clear_keyring_entry(service: &str, account: &str) -> Result<(), SettingsError> {
    #[cfg(all(debug_assertions, target_os = "macos"))]
    {
        let _ = clear_git_credential_fallback(service, account);
    }

    let entry = keyring::Entry::new(service, account).map_err(|error| {
        annotate_keyring_error(SettingsError::Message(format!(
            "Failed to access secure storage: {error}"
        )))
    })?;

    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(annotate_keyring_error(SettingsError::Message(format!(
            "Failed to clear secure secret: {error}"
        )))),
    }
}

#[cfg(all(debug_assertions, target_os = "macos"))]
fn load_git_credential_fallback(service: &str, account: &str) -> Result<Option<String>, String> {
    use std::io::Write;
    let mut child = Command::new("git")
        .args(["credential", "fill"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    if let Some(mut stdin) = child.stdin.take() {
        let input = format!(
            "protocol=https\nhost=litgit-dev-secrets\nusername={}\npath=/{}\n\n",
            urlencoding::encode(service),
            urlencoding::encode(account)
        );
        stdin
            .write_all(input.as_bytes())
            .map_err(|e| e.to_string())?;
    }

    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(None);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(password) = line.strip_prefix("password=") {
            let trimmed = password.trim();
            if !trimmed.is_empty() {
                return Ok(Some(trimmed.to_string()));
            }
        }
    }

    Ok(None)
}

#[cfg(all(debug_assertions, target_os = "macos"))]
fn save_git_credential_fallback(service: &str, account: &str, secret: &str) -> Result<(), String> {
    use std::io::Write;
    let mut child = Command::new("git")
        .args(["credential", "approve"])
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    if let Some(mut stdin) = child.stdin.take() {
        let input = format!(
            "protocol=https\nhost=litgit-dev-secrets\nusername={}\npath=/{}\npassword={}\n\n",
            urlencoding::encode(service),
            urlencoding::encode(account),
            secret
        );
        stdin
            .write_all(input.as_bytes())
            .map_err(|e| e.to_string())?;
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("git credential approve failed".to_string());
    }

    Ok(())
}

#[cfg(all(debug_assertions, target_os = "macos"))]
fn clear_git_credential_fallback(service: &str, account: &str) -> Result<(), String> {
    use std::io::Write;
    let mut child = Command::new("git")
        .args(["credential", "reject"])
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    if let Some(mut stdin) = child.stdin.take() {
        let input = format!(
            "protocol=https\nhost=litgit-dev-secrets\nusername={}\npath=/{}\n\n",
            urlencoding::encode(service),
            urlencoding::encode(account)
        );
        stdin
            .write_all(input.as_bytes())
            .map_err(|e| e.to_string())?;
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("git credential reject failed".to_string());
    }

    Ok(())
}

fn annotate_keyring_error(error: SettingsError) -> SettingsError {
    if !cfg!(target_os = "linux") {
        return error;
    }

    let error_string = error.to_string();
    if error_string.contains(" org.freedesktop.secrets ") || error_string.contains("DBus error") {
        SettingsError::Message(
            "Keychain not found. Ensure a secret service (like gnome-keyring or kwallet) is running and unlocked.".to_string()
        )
    } else if error_string.contains("Secret Service: no result found") {
        SettingsError::Message(
            "Login keychain not found or locked. Please unlock your keychain.".to_string(),
        )
    } else {
        error
    }
}

pub(crate) fn get_ai_secret_from_session(
    state: &SettingsState,
    provider: &str,
) -> Result<Option<String>, SettingsError> {
    let secrets = state
        .ai_secrets
        .lock()
        .map_err(|_| SettingsError::Message("Failed to access settings state".to_string()))?;

    Ok(secrets.get(provider).map(|secret| secret.value.clone()))
}

/// Resolves an AI provider secret from secure storage or session state.
pub(crate) fn resolve_ai_provider_secret(
    state: &State<'_, SettingsState>,
    provider: &str,
) -> Result<String, SettingsError> {
    let trimmed_provider = provider.trim();

    if trimmed_provider.is_empty() {
        return Err(SettingsError::Message(
            "AI provider is required".to_string(),
        ));
    }

    if let Some(secret) = load_keyring_entry(AI_SECRET_SERVICE, trimmed_provider)? {
        return Ok(secret);
    }

    if let Some(secret) = get_ai_secret_from_session(state.inner(), trimmed_provider)? {
        return Ok(secret);
    }

    Err(SettingsError::Message(format!(
        "No API key saved for the '{trimmed_provider}' AI provider"
    )))
}

fn get_proxy_secret_from_session(
    state: &SettingsState,
    username: &str,
) -> Result<Option<String>, SettingsError> {
    let credentials = state
        .http_credentials
        .lock()
        .map_err(|_| SettingsError::Message("Failed to access settings state".to_string()))?;

    Ok(credentials
        .values()
        .find(|entry| entry.protocol == "proxy" && entry.username == username)
        .map(|entry| entry.secret.value.clone()))
}

fn get_proxy_secret_from_snapshot(
    snapshot: &SettingsCommandSnapshot,
    username: &str,
) -> Option<String> {
    snapshot
        .http_credentials
        .values()
        .find(|entry| entry.protocol == "proxy" && entry.username == username)
        .map(|entry| entry.secret.value.clone())
}

fn resolve_proxy_secret(
    state: Option<&State<'_, SettingsState>>,
    username: &str,
    supplied_secret: Option<&str>,
) -> Result<Option<String>, SettingsError> {
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

fn resolve_proxy_secret_from_snapshot(
    snapshot: Option<&SettingsCommandSnapshot>,
    username: &str,
    supplied_secret: Option<&str>,
) -> Result<Option<String>, SettingsError> {
    if let Some(secret) = supplied_secret.filter(|value| !value.trim().is_empty()) {
        return Ok(Some(secret.trim().to_string()));
    }

    if let Some(secret) = load_keyring_entry(PROXY_SECRET_SERVICE, username)? {
        return Ok(Some(secret));
    }

    Ok(snapshot.and_then(|value| get_proxy_secret_from_snapshot(value, username)))
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

/// Resolves the absolute path to the `litgit-git-askpass` helper binary.
///
/// The helper is compiled as a sibling binary in the same Cargo workspace,
/// so it always lives in the same directory as the main application binary
/// (e.g. `target/debug/` during development, or the bundle directory in
/// production). Using the absolute path ensures Git can locate the helper
/// regardless of the system `$PATH`.
fn resolve_askpass_binary_path() -> String {
    let askpass_binary_name = format!("litgit-git-askpass{}", std::env::consts::EXE_SUFFIX);

    let path = if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            let askpass_binary = exe_dir.join(&askpass_binary_name);
            if askpass_binary.exists() {
                askpass_binary.to_string_lossy().to_string()
            } else if std::env::consts::EXE_SUFFIX.is_empty() {
                "litgit-git-askpass".to_string()
            } else {
                let askpass_binary_without_suffix = exe_dir.join("litgit-git-askpass");
                if askpass_binary_without_suffix.exists() {
                    askpass_binary_without_suffix.to_string_lossy().to_string()
                } else {
                    "litgit-git-askpass".to_string()
                }
            }
        } else {
            "litgit-git-askpass".to_string()
        }
    } else {
        "litgit-git-askpass".to_string()
    };

    log::info!("Resolved GIT_ASKPASS path: {}", path);
    path
}

pub(crate) fn apply_auth_session_environment(
    command: &mut Command,
    settings_state: Option<&SettingsState>,
    auth_session: Option<&crate::askpass_state::GitAuthSessionHandle>,
) -> Result<(), String> {
    command
        .env_remove("GIT_ASKPASS")
        .env_remove("SSH_ASKPASS")
        .env_remove("SSH_ASKPASS_REQUIRE");

    let Some(session) = auth_session else {
        return Ok(());
    };

    let socket_path = settings_state
        .and_then(SettingsState::askpass_socket_path)
        .ok_or_else(|| {
            "Askpass IPC server is not ready yet. Try the Git operation again.".to_string()
        })?;

    let askpass_path = resolve_askpass_binary_path();
    command.env("GIT_ASKPASS", &askpass_path);
    command.env("SSH_ASKPASS", &askpass_path);
    command.env("SSH_ASKPASS_REQUIRE", "force");
    // Crucial: force Git to bypass terminal prompting and always use the askpass helper
    command.env("GIT_TERMINAL_PROMPT", "0");
    command.env("LITGIT_ASKPASS_SESSION", &session.session_id);
    command.env("LITGIT_ASKPASS_SECRET", &session.secret);
    command.env("LITGIT_ASKPASS_OPERATION", &session.operation);
    command.env(
        "LITGIT_ASKPASS_SOCKET",
        socket_path.to_string_lossy().to_string(),
    );

    Ok(())
}

pub(crate) fn apply_auth_session_environment_from_snapshot(
    command: &mut Command,
    settings_snapshot: Option<&SettingsCommandSnapshot>,
    auth_session: Option<&crate::askpass_state::GitAuthSessionHandle>,
) -> Result<(), String> {
    command
        .env_remove("GIT_ASKPASS")
        .env_remove("SSH_ASKPASS")
        .env_remove("SSH_ASKPASS_REQUIRE");

    let Some(session) = auth_session else {
        return Ok(());
    };

    let socket_path = settings_snapshot
        .and_then(|snapshot| snapshot.askpass_socket_path.clone())
        .ok_or_else(|| {
            "Askpass IPC server is not ready yet. Try the Git operation again.".to_string()
        })?;

    let askpass_path = resolve_askpass_binary_path();
    command.env("GIT_ASKPASS", &askpass_path);
    command.env("SSH_ASKPASS", &askpass_path);
    command.env("SSH_ASKPASS_REQUIRE", "force");
    command.env("GIT_TERMINAL_PROMPT", "0");
    command.env("LITGIT_ASKPASS_SESSION", &session.session_id);
    command.env("LITGIT_ASKPASS_SECRET", &session.secret);
    command.env("LITGIT_ASKPASS_OPERATION", &session.operation);
    command.env(
        "LITGIT_ASKPASS_SOCKET",
        socket_path.to_string_lossy().to_string(),
    );

    Ok(())
}

/// Applies Git preferences to a command with optional authentication session.
///
/// This function configures a Git command with user preferences and sets up
/// environment variables for the askpass helper when an authentication session
/// is provided.
///
/// # Arguments
///
/// * `command` - The Git command to configure
/// * `preferences` - User repository command preferences
/// * `settings_state` - Optional settings state for proxy configuration
/// * `auth_session` - Optional authentication session for askpass integration
///
/// # Returns
///
/// Returns `Ok(())` on success, or an error string if configuration fails.
pub(crate) fn apply_git_preferences_with_auth_session(
    command: &mut Command,
    preferences: &RepoCommandPreferences,
    settings_state: Option<&State<'_, SettingsState>>,
    auth_session: Option<&crate::askpass_state::GitAuthSessionHandle>,
) -> Result<(), String> {
    apply_auth_session_environment(command, settings_state.map(State::inner), auth_session)?;

    apply_existing_git_preferences(command, preferences, settings_state)
}

pub(crate) fn apply_git_preferences_with_auth_session_from_snapshot(
    command: &mut Command,
    preferences: &RepoCommandPreferences,
    settings_snapshot: Option<&SettingsCommandSnapshot>,
    auth_session: Option<&crate::askpass_state::GitAuthSessionHandle>,
) -> Result<(), String> {
    apply_auth_session_environment_from_snapshot(command, settings_snapshot, auth_session)?;

    apply_existing_git_preferences_from_snapshot(command, preferences, settings_snapshot)
}

fn apply_existing_git_preferences(
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
            let port = preferences.proxy_port.unwrap_or(DEFAULT_PROXY_PORT);

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

fn apply_existing_git_preferences_from_snapshot(
    command: &mut Command,
    preferences: &RepoCommandPreferences,
    settings_snapshot: Option<&SettingsCommandSnapshot>,
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
            let port = preferences.proxy_port.unwrap_or(DEFAULT_PROXY_PORT);

            if preferences.proxy_auth_enabled == Some(true) {
                if let Some(username) = preferences
                    .proxy_username
                    .as_ref()
                    .filter(|value| !value.trim().is_empty())
                {
                    if let Some(secret) = resolve_proxy_secret_from_snapshot(
                        settings_snapshot,
                        username.trim(),
                        preferences.proxy_auth_password.as_deref(),
                    )
                    .map_err(|error| error.to_string())?
                    {
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

/// Applies Git preferences to a command without an authentication session.
pub(crate) fn apply_git_preferences(
    command: &mut Command,
    preferences: &RepoCommandPreferences,
    settings_state: Option<&State<'_, SettingsState>>,
) -> Result<(), String> {
    apply_git_preferences_with_auth_session(command, preferences, settings_state, None)
}

pub(crate) fn apply_git_preferences_from_snapshot(
    command: &mut Command,
    preferences: &RepoCommandPreferences,
    settings_snapshot: Option<&SettingsCommandSnapshot>,
) -> Result<(), String> {
    apply_git_preferences_with_auth_session_from_snapshot(
        command,
        preferences,
        settings_snapshot,
        None,
    )
}

fn build_git_identity_status(
    repo_path: Option<&str>,
) -> Result<GitIdentityStatusPayload, SettingsError> {
    let global = read_git_identity_value(None, "global")?;
    let local = if let Some(path) = repo_path {
        Some(read_git_identity_value(Some(path), "local")?)
    } else {
        None
    };

    let (effective, effective_scope) = if let Some(path) = repo_path {
        if let Some(local_value) = local.as_ref().filter(|value| value.is_complete) {
            (local_value.clone(), Some("local".to_string()))
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
        repo_path: repo_path.map(str::to_string),
    })
}

/// Normalizes the Git identity scope to "global" or "local".
pub(crate) fn normalize_git_identity_scope(scope: &str) -> Result<&str, SettingsError> {
    match scope.trim() {
        "global" => Ok("global"),
        "local" => Ok("local"),
        _ => Err(SettingsError::Message(
            "Git identity scope must be global or local".to_string(),
        )),
    }
}

/// Validates that a Git author name is provided and not empty.
pub(crate) fn validate_git_identity_name(name: &str) -> Result<String, SettingsError> {
    let trimmed = name.trim();

    if trimmed.is_empty() {
        return Err(SettingsError::Message(
            "Git author name is required".to_string(),
        ));
    }

    Ok(trimmed.to_string())
}

/// Validates that a Git author email is provided and follows a basic email format.
pub(crate) fn validate_git_identity_email(email: &str) -> Result<String, SettingsError> {
    let trimmed = email.trim();

    if trimmed.is_empty() {
        return Err(SettingsError::Message(
            "Git author email is required".to_string(),
        ));
    }

    let has_single_at_symbol = trimmed.matches('@').count() == 1;
    let has_non_empty_segments = trimmed.split_once('@').is_some_and(|(local, domain)| {
        !local.is_empty()
            && domain.contains('.')
            && !domain.starts_with('.')
            && !domain.ends_with('.')
    });

    if !(has_single_at_symbol && has_non_empty_segments) {
        return Err(SettingsError::Message(
            "Enter a valid Git author email".to_string(),
        ));
    }

    Ok(trimmed.to_string())
}

fn read_git_config_value(
    repo_path: Option<&str>,
    scope: &str,
    key: &str,
) -> Result<Option<String>, SettingsError> {
    let mut command = git_command();

    match scope {
        "global" => {
            command.args(["config", "--global", "--get", key]);
        }
        "local" => {
            let repo_path = repo_path.ok_or_else(|| {
                SettingsError::Message(
                    "A repository path is required for local Git config".to_string(),
                )
            })?;
            command.args(["-C", repo_path, "config", "--local", "--get", key]);
        }
        "effective" => {
            if let Some(repo_path) = repo_path {
                command.args(["-C", repo_path, "config", "--get", key]);
            } else {
                command.args(["config", "--global", "--get", key]);
            }
        }
        _ => {
            return Err(SettingsError::Message(
                "Unsupported Git config scope".to_string(),
            ))
        }
    }

    let output = command
        .output()
        .map_err(|error| SettingsError::GitCommand {
            action: "run git config",
            source: error,
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if stderr.is_empty() {
            return Ok(None);
        }

        return Err(SettingsError::Message(git_error_message(
            &output.stderr,
            "Failed to read Git identity",
        )));
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
) -> Result<GitIdentityValue, SettingsError> {
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
) -> Result<(), SettingsError> {
    let mut command = git_command();

    match scope {
        "global" => {
            command.args(["config", "--global", key, value]);
        }
        "local" => {
            let repo_path = repo_path.ok_or_else(|| {
                SettingsError::Message(
                    "A repository path is required for local Git config".to_string(),
                )
            })?;
            command.args(["-C", repo_path, "config", "--local", key, value]);
        }
        _ => {
            return Err(SettingsError::Message(
                "Unsupported Git config scope".to_string(),
            ))
        }
    }

    let output = command
        .output()
        .map_err(|error| SettingsError::GitCommand {
            action: "run git config",
            source: error,
        })?;

    if !output.status.success() {
        return Err(SettingsError::Message(git_error_message(
            &output.stderr,
            "Failed to save Git identity",
        )));
    }

    Ok(())
}

pub(crate) fn write_git_identity(
    repo_path: Option<&str>,
    scope: &str,
    name: &str,
    email: &str,
) -> Result<(), SettingsError> {
    let validated_name = validate_git_identity_name(name)?;
    let validated_email = validate_git_identity_email(email)?;

    write_git_config_value(repo_path, scope, "user.name", &validated_name)?;
    write_git_config_value(repo_path, scope, "user.email", &validated_email)?;

    Ok(())
}

/// Returns settings backend runtime capabilities.
// Tauri keeps this command result-wrapped so the frontend invoke contract stays stable.
#[expect(clippy::unnecessary_wraps)]
#[tauri::command]
pub(crate) fn get_settings_backend_capabilities() -> Result<SettingsBackendCapabilities, String> {
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

/// Saves an AI provider secret to secure storage with session fallback.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
pub(crate) fn save_ai_provider_secret(
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

/// Returns whether an AI provider secret is currently stored.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
pub(crate) fn get_ai_provider_secret_status(
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
            .map_or_else(|| "session".to_string(), |value| value.storage_mode.clone()),
    })
}

/// Clears an AI provider secret from secure and session storage.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
pub(crate) fn clear_ai_provider_secret(
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

/// Saves proxy authentication credentials.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
pub(crate) fn save_proxy_auth_secret(
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

/// Returns whether proxy credentials exist for a username.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
pub(crate) fn get_proxy_auth_secret_status(
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

/// Clears proxy credentials for a username.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
pub(crate) fn clear_proxy_auth_secret(
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

pub(crate) fn begin_network_operation_with_active_paths<'a>(
    active_network_repo_paths: &'a Arc<Mutex<HashSet<String>>>,
    repo_path: &str,
) -> Result<NetworkOperationGuard<'a>, String> {
    let mut active_operations = active_network_repo_paths
        .lock()
        .map_err(|_| "Failed to access scheduler state".to_string())?;

    if active_operations.contains(repo_path) {
        return Err("Another network operation is already running for this repository".to_string());
    }

    active_operations.insert(repo_path.to_string());

    Ok(NetworkOperationGuard {
        active_operations: active_network_repo_paths,
        repo_path: repo_path.to_string(),
    })
}

/// Lists cached HTTP credential metadata entries.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
pub(crate) fn list_http_credential_entries(
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

/// Removes one cached HTTP credential entry by identifier.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
pub(crate) fn clear_http_credential_entry(
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

/// Tests outbound connectivity through a proxy endpoint.
#[tauri::command]
pub(crate) async fn test_proxy_connection(
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

    let normalized_host = trimmed_host.to_string();

    tauri::async_runtime::spawn_blocking(move || {
        let proxy_url = if let (Some(username), Some(password)) = (username, password) {
            format!("{proxy_type}://{username}:{password}@{normalized_host}:{port}")
        } else {
            format!("{proxy_type}://{normalized_host}:{port}")
        };
        let proxy = ureq::Proxy::new(&proxy_url)
            .map_err(|error| format!("Failed to configure proxy: {error}"))?;
        let config = ureq::config::Config::builder()
            .proxy(Some(proxy))
            .timeout_global(Some(Duration::from_secs(PROXY_TEST_TIMEOUT_SECS)))
            .http_status_as_error(false)
            .build();
        let agent = ureq::Agent::new_with_config(config);

        let request = http::Request::get("https://example.com/")
            .header("User-Agent", APP_USER_AGENT)
            .body(())
            .map_err(|error| format!("Failed to build proxy request: {error}"))?;

        let response = agent
            .run(request)
            .map_err(|error| format!("Proxy request failed: {error}"))?;

        let status = response.status().as_u16();

        if !(200..400).contains(&status) {
            return Ok(ProxyTestResult {
                message: format!("Proxy responded with unexpected status code {status}"),
                ok: false,
            });
        }

        Ok(ProxyTestResult {
            message: format!(
                "Proxy request to https://example.com/ succeeded via {proxy_type}://{normalized_host}:{port}"
            ),
            ok: true,
        })
    })
    .await
    .map_err(|error| format!("Failed to test proxy connection: {error}"))?
}

/// Starts or replaces the background auto-fetch scheduler for one repository.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[tauri::command]
pub(crate) async fn start_auto_fetch_scheduler(
    state: State<'_, SettingsState>,
    interval_minutes: u64,
    repo_path: String,
    preferences: Option<RepoCommandPreferences>,
) -> Result<(), String> {
    let scheduler_handle = state.inner().auto_fetch_scheduler_handle();
    let active_network_repo_paths = Arc::clone(&state.active_network_repo_paths);

    tauri::async_runtime::spawn_blocking(move || {
        start_auto_fetch_scheduler_inner(
            scheduler_handle,
            active_network_repo_paths,
            interval_minutes,
            repo_path,
            preferences,
        )
    })
    .await
    .map_err(|error| format!("Failed to start auto-fetch scheduler: {error}"))?
}

fn start_auto_fetch_scheduler_inner(
    scheduler_handle: Arc<Mutex<Option<AutoFetchSchedulerHandle>>>,
    active_network_repo_paths: Arc<Mutex<HashSet<String>>>,
    interval_minutes: u64,
    repo_path: String,
    preferences: Option<RepoCommandPreferences>,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    if let Some(existing) = take_auto_fetch_scheduler(&scheduler_handle)? {
        shutdown_auto_fetch_scheduler(existing);
    }

    if interval_minutes == 0 {
        return Ok(());
    }

    let (shutdown_tx, shutdown_rx) = std::sync::mpsc::channel::<()>();
    let repo_path_for_worker = repo_path.clone();
    let worker_preferences = preferences.unwrap_or_default();
    let worker = std::thread::spawn(move || {
        let interval = Duration::from_secs(interval_minutes.saturating_mul(60));

        loop {
            match shutdown_rx.recv_timeout(interval) {
                Ok(()) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    break;
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    let network_operation = begin_network_operation_with_active_paths(
                        &active_network_repo_paths,
                        &repo_path_for_worker,
                    )
                    .ok();

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

    let mut scheduler = scheduler_handle
        .lock()
        .map_err(|_| "Failed to access scheduler state".to_string())?;

    *scheduler = Some(AutoFetchSchedulerHandle {
        shutdown_tx,
        worker,
    });

    Ok(())
}

/// Stops the running auto-fetch scheduler if one exists.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[tauri::command]
pub(crate) async fn stop_auto_fetch_scheduler(
    state: State<'_, SettingsState>,
) -> Result<(), String> {
    let scheduler_handle = state.inner().auto_fetch_scheduler_handle();

    tauri::async_runtime::spawn_blocking(move || stop_auto_fetch_scheduler_inner(scheduler_handle))
        .await
        .map_err(|error| format!("Failed to stop auto-fetch scheduler: {error}"))?
}

fn stop_auto_fetch_scheduler_inner(
    scheduler_handle: Arc<Mutex<Option<AutoFetchSchedulerHandle>>>,
) -> Result<(), String> {
    if let Some(existing) = take_auto_fetch_scheduler(&scheduler_handle)? {
        shutdown_auto_fetch_scheduler(existing);
    }

    Ok(())
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

#[cfg(test)]
mod tests {
    use super::{
        annotate_keyring_error, apply_auth_session_environment, apply_existing_git_preferences,
        apply_git_preferences, get_ai_secret_from_session, get_git_identity,
        get_settings_backend_capabilities, normalize_git_identity_scope, set_git_identity,
        start_auto_fetch_scheduler, stop_auto_fetch_scheduler, validate_git_identity_email,
        validate_git_identity_name, GitIdentityWriteRequest, RepoCommandPreferences, SettingsError,
        SettingsState, StoredSecretValue,
    };
    use crate::git_support::git_command;
    use std::env;
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};
    use tauri::Manager;

    #[test]
    fn validate_git_identity_email_returns_error_when_input_is_blank() {
        assert_eq!(
            validate_git_identity_email("   ").unwrap_err().to_string(),
            "Git author email is required",
        );
    }

    #[test]
    fn validate_git_identity_email_accepts_well_formed_address() {
        let email = validate_git_identity_email("dev@example.com").expect("email should validate");

        assert_eq!(email, "dev@example.com");
    }

    #[test]
    fn validate_git_identity_name_trims_whitespace() {
        assert_eq!(
            validate_git_identity_name("  Lit Git User  ").expect("name should validate"),
            "Lit Git User",
        );
    }

    #[test]
    fn normalize_git_identity_scope_rejects_unknown_values() {
        assert_eq!(
            normalize_git_identity_scope("workspace")
                .unwrap_err()
                .to_string(),
            "Git identity scope must be global or local",
        );
    }

    #[test]
    fn get_settings_backend_capabilities_reports_valid_state() {
        let capabilities =
            get_settings_backend_capabilities().expect("backend capabilities should resolve");

        assert!(capabilities.session_secrets_supported);
        assert!(!capabilities.runtime_platform.is_empty());
        // secure_storage_available depends on environment, but should at least be present
        let _ = capabilities.secure_storage_available;
    }

    #[test]
    fn apply_git_preferences_sets_expected_env_and_config_arguments() {
        let mut command = Command::new("git");
        let preferences = RepoCommandPreferences {
            enable_proxy: Some(true),
            gpg_program_path: Some("/usr/local/bin/gpg".to_string()),
            proxy_auth_password: Some("secret-pass".to_string()),
            proxy_auth_enabled: Some(true),
            proxy_host: Some("proxy.example.com".to_string()),
            proxy_port: Some(8080),
            proxy_type: Some("https".to_string()),
            proxy_username: Some("dev-user".to_string()),
            ssh_private_key_path: Some("/tmp/id_test".to_string()),
            ssh_public_key_path: Some("/tmp/id_test.pub".to_string()),
            signing_format: None,
            signing_key: None,
            sign_commits_by_default: None,
            ssl_verification: Some(false),
            use_git_credential_manager: Some(true),
            use_local_ssh_agent: Some(false),
        };

        let result = apply_git_preferences(&mut command, &preferences, None);

        assert!(result.is_ok(), "git preferences should apply: {result:?}");

        let args = command
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect::<Vec<_>>();
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
            args,
            vec![
                "-c".to_string(),
                "gpg.program=/usr/local/bin/gpg".to_string()
            ]
        );
        assert_eq!(envs.get("SSH_AUTH_SOCK"), Some(&Some(String::new())));
        assert_eq!(
            envs.get("GIT_SSL_NO_VERIFY"),
            Some(&Some("true".to_string()))
        );
        assert_eq!(
            envs.get("GIT_TERMINAL_PROMPT"),
            Some(&Some("0".to_string()))
        );
        assert_eq!(
            envs.get("GCM_INTERACTIVE"),
            Some(&Some("never".to_string()))
        );
        assert_eq!(
            envs.get("LITGIT_PROXY_HOST"),
            Some(&Some("proxy.example.com".to_string())),
        );
        assert_eq!(
            envs.get("LITGIT_PROXY_PORT"),
            Some(&Some("8080".to_string()))
        );
        assert_eq!(
            envs.get("LITGIT_PROXY_TYPE"),
            Some(&Some("https".to_string()))
        );
        assert_eq!(
            envs.get("LITGIT_PROXY_USERNAME"),
            Some(&Some("dev-user".to_string())),
        );
        assert_eq!(
            envs.get("LITGIT_PROXY_PASSWORD"),
            Some(&Some("secret-pass".to_string())),
        );
        assert_eq!(
            envs.get("GIT_SSH_COMMAND"),
            Some(&Some(
                "ssh -i '/tmp/id_test' -o IdentitiesOnly=yes -o IdentityAgent=none".to_string(),
            )),
        );
    }

    #[test]
    fn apply_git_preferences_skips_proxy_env_when_proxy_is_disabled() {
        let mut command = Command::new("git");
        let preferences = RepoCommandPreferences {
            enable_proxy: Some(false),
            proxy_host: Some("proxy.example.com".to_string()),
            proxy_port: Some(8080),
            proxy_type: Some("https".to_string()),
            ..RepoCommandPreferences::default()
        };

        apply_git_preferences(&mut command, &preferences, None)
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

        assert!(!envs.contains_key("LITGIT_PROXY_HOST"));
        assert!(!envs.contains_key("LITGIT_PROXY_PORT"));
        assert!(!envs.contains_key("LITGIT_PROXY_TYPE"));
    }

    #[test]
    fn apply_git_preferences_sets_litgit_askpass_env_when_session_present() {
        let mut command = std::process::Command::new("git");
        let preferences = RepoCommandPreferences::default();
        let askpass_socket_path = std::env::temp_dir().join("litgit-test.sock");

        let session = crate::askpass_state::GitAuthSessionHandle {
            session_id: "session-1".to_string(),
            secret: "secret-1".to_string(),
            operation: "clone".to_string(),
        };

        let settings_state = SettingsState::default();
        settings_state.set_askpass_socket_path(askpass_socket_path.clone());

        apply_auth_session_environment(&mut command, Some(&settings_state), Some(&session))
            .expect("preferences should apply");
        apply_existing_git_preferences(&mut command, &preferences, None)
            .expect("existing preferences should apply");

        let envs = command
            .get_envs()
            .map(|(key, value)| {
                (
                    key.to_string_lossy().to_string(),
                    value.map(|entry| entry.to_string_lossy().to_string()),
                )
            })
            .collect::<std::collections::HashMap<_, _>>();

        let askpass_value = envs
            .get("GIT_ASKPASS")
            .and_then(|v| v.as_ref())
            .expect("GIT_ASKPASS should be set");
        let expected_askpass_suffix = format!("litgit-git-askpass{}", std::env::consts::EXE_SUFFIX);
        assert!(
            askpass_value.ends_with(&expected_askpass_suffix)
                || askpass_value.ends_with("litgit-git-askpass"),
            "GIT_ASKPASS should resolve to litgit-git-askpass helper, got: {askpass_value}"
        );
        let ssh_askpass_value = envs
            .get("SSH_ASKPASS")
            .and_then(|v| v.as_ref())
            .expect("SSH_ASKPASS should be set");
        assert!(
            ssh_askpass_value.ends_with(&expected_askpass_suffix)
                || ssh_askpass_value.ends_with("litgit-git-askpass"),
            "SSH_ASKPASS should resolve to litgit-git-askpass helper, got: {ssh_askpass_value}"
        );
        assert_eq!(
            envs.get("SSH_ASKPASS_REQUIRE"),
            Some(&Some("force".to_string()))
        );
        assert_eq!(
            envs.get("GIT_TERMINAL_PROMPT"),
            Some(&Some("0".to_string()))
        );
        assert_eq!(
            envs.get("LITGIT_ASKPASS_SESSION"),
            Some(&Some("session-1".to_string()))
        );
        assert_eq!(
            envs.get("LITGIT_ASKPASS_SECRET"),
            Some(&Some("secret-1".to_string()))
        );
        assert_eq!(
            envs.get("LITGIT_ASKPASS_OPERATION"),
            Some(&Some("clone".to_string()))
        );
        assert_eq!(
            envs.get("LITGIT_ASKPASS_SOCKET"),
            Some(&Some(askpass_socket_path.to_string_lossy().to_string()))
        );
    }

    #[test]
    fn resolve_ai_provider_secret_prefers_session_fallback() {
        let state = SettingsState::default();
        let provider = "test-provider";
        let secret_value = "session-secret";

        {
            let mut secrets = state.ai_secrets.lock().unwrap();
            secrets.insert(
                provider.to_string(),
                StoredSecretValue::session(secret_value),
            );
        }

        let resolved = get_ai_secret_from_session(&state, provider).expect("should resolve");
        assert_eq!(resolved, Some(secret_value.to_string()));
    }

    #[test]
    fn annotate_keyring_error_provides_helpful_linux_messages() {
        // This test only runs its logic on Linux, or we can check the fn directly
        let error =
            SettingsError::Message("error: org.freedesktop.secrets was not found".to_string());
        let annotated = annotate_keyring_error(error);

        #[cfg(target_os = "linux")]
        assert!(annotated.to_string().contains("Keychain not found"));

        #[cfg(not(target_os = "linux"))]
        assert!(annotated.to_string().contains("org.freedesktop.secrets"));
    }

    #[test]
    fn apply_auth_session_environment_clears_existing_askpass() {
        let mut command = std::process::Command::new("git");
        command.env("GIT_ASKPASS", "old-askpass");

        // Verify that existing GIT_ASKPASS is removed even when no session is provided
        apply_auth_session_environment(&mut command, None, None).expect("should work");

        let envs = command
            .get_envs()
            .collect::<std::collections::HashMap<_, _>>();
        assert_eq!(envs.get(std::ffi::OsStr::new("GIT_ASKPASS")), Some(&None));
    }

    #[test]
    fn apply_auth_session_environment_rejects_missing_socket_path() {
        let mut command = std::process::Command::new("git");
        let session = crate::askpass_state::GitAuthSessionHandle {
            session_id: "session-1".to_string(),
            secret: "secret-1".to_string(),
            operation: "clone".to_string(),
        };

        let error = apply_auth_session_environment(
            &mut command,
            Some(&SettingsState::default()),
            Some(&session),
        )
        .expect_err("missing socket path should fail");

        assert_eq!(
            error,
            "Askpass IPC server is not ready yet. Try the Git operation again."
        );
    }

    #[tokio::test]
    async fn set_git_identity_writes_local_scope_and_returns_updated_status() {
        let repo = TempRepository::create();

        let status = set_git_identity(
            GitIdentityWriteRequest {
                email: "dev@example.com".to_string(),
                name: "Lit Git User".to_string(),
                scope: "local".to_string(),
            },
            Some(repo.path.to_string_lossy().to_string()),
        )
        .await
        .expect("git identity should be saved");

        assert_eq!(status.effective_scope.as_deref(), Some("local"));
        assert_eq!(status.effective.name.as_deref(), Some("Lit Git User"));
        assert_eq!(status.effective.email.as_deref(), Some("dev@example.com"));
        assert_eq!(
            status
                .local
                .as_ref()
                .and_then(|value| value.name.as_deref()),
            Some("Lit Git User")
        );
        assert_eq!(
            status
                .local
                .as_ref()
                .and_then(|value| value.email.as_deref()),
            Some("dev@example.com")
        );
    }

    #[tokio::test]
    async fn get_git_identity_reads_existing_local_identity() {
        let repo = TempRepository::create();
        repo.git(&["config", "--local", "user.name", "Existing User"]);
        repo.git(&["config", "--local", "user.email", "existing@example.com"]);

        let status = get_git_identity(Some(repo.path.to_string_lossy().to_string()))
            .await
            .expect("git identity should resolve");

        assert_eq!(status.effective_scope.as_deref(), Some("local"));
        assert_eq!(status.effective.name.as_deref(), Some("Existing User"));
        assert_eq!(
            status.effective.email.as_deref(),
            Some("existing@example.com")
        );
    }

    #[tokio::test]
    async fn start_auto_fetch_scheduler_registers_worker_until_stopped() {
        let repo = TempRepository::create();
        let app = tauri::test::mock_builder()
            .manage(SettingsState::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("settings test app should build");

        start_auto_fetch_scheduler(
            app.state::<SettingsState>(),
            1,
            repo.path.to_string_lossy().to_string(),
            None,
        )
        .await
        .expect("scheduler should start");

        assert!(app
            .state::<SettingsState>()
            .auto_fetch_scheduler
            .lock()
            .expect("scheduler lock should be available")
            .is_some());

        stop_auto_fetch_scheduler(app.state::<SettingsState>())
            .await
            .expect("scheduler should stop cleanly");

        assert!(app
            .state::<SettingsState>()
            .auto_fetch_scheduler
            .lock()
            .expect("scheduler lock should be available")
            .is_none());
    }

    struct TempRepository {
        path: PathBuf,
    }

    impl TempRepository {
        fn create() -> Self {
            let unique_suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock should be after unix epoch")
                .as_nanos();
            let path = env::temp_dir().join(format!("litgit-settings-test-{unique_suffix}"));

            fs::create_dir_all(&path).expect("temp repo directory should be created");
            Self::git_in(&path, &["init", "-b", "main"]);
            Self::git_in(&path, &["config", "user.name", "LitGit Tests"]);
            Self::git_in(&path, &["config", "user.email", "tests@example.com"]);

            Self { path }
        }

        fn git(&self, args: &[&str]) {
            Self::git_in(&self.path, args);
        }

        fn git_in(path: &std::path::Path, args: &[&str]) {
            let output = git_command()
                .args(["-C", path.to_string_lossy().as_ref()])
                .args(args)
                .output()
                .expect("git command should run");

            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }

    impl Drop for TempRepository {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}
