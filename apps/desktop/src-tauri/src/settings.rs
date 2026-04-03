use crate::commit_messages::clear_github_identity_cache;
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
use ureq::Proxy;

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

    /// An error occurred during a proxy operation.
    #[expect(dead_code)]
    #[error("Proxy error: {0}")]
    Proxy(String),
}

impl From<SettingsError> for String {
    fn from(error: SettingsError) -> Self {
        error.to_string()
    }
}

const AI_SECRET_SERVICE: &str = "litgit.ai.provider";
const PROXY_SECRET_SERVICE: &str = "litgit.proxy.auth";
pub(crate) const GITHUB_AVATAR_SERVICE: &str = "litgit.github.avatar";
const DEFAULT_PROXY_PORT: u16 = 80;
const PROXY_TEST_TIMEOUT_SECS: u64 = 10;

#[derive(Clone, Copy)]
enum GitHubTokenStorageTarget {
    Secure,
    Session,
}

#[derive(Clone)]
/// In-memory GitHub identity cache record used by history author enrichment.
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
    auto_fetch_scheduler: Mutex<Option<AutoFetchSchedulerHandle>>,
}

impl Default for SettingsState {
    fn default() -> Self {
        Self {
            ai_secrets: Mutex::default(),
            http_credentials: Mutex::default(),
            github_identity_cache: Mutex::default(),
            system_font_families: Mutex::default(),
            active_network_repo_paths: Arc::new(Mutex::new(HashSet::new())),
            auto_fetch_scheduler: Mutex::default(),
        }
    }
}

impl SettingsState {
    pub(crate) fn github_session_token(&self) -> Option<String> {
        let Ok(secrets) = self.ai_secrets.lock() else {
            log::warn!("Failed to access settings state while reading the GitHub session token");
            return None;
        };

        secrets.get("github_token").map(|value| value.value.clone())
    }

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

struct AutoFetchSchedulerHandle {
    shutdown_tx: std::sync::mpsc::Sender<()>,
    worker: JoinHandle<()>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// Runtime capabilities reported by the settings backend.
pub(crate) struct SettingsBackendCapabilities {
    runtime_platform: String,
    secure_storage_available: bool,
    session_secrets_supported: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
/// Secret availability and storage mode metadata.
pub(crate) struct SecretStatusPayload {
    has_stored_value: bool,
    storage_mode: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
/// Metadata for one stored HTTP credential entry.
pub(crate) struct HttpCredentialEntryMetadata {
    host: String,
    id: String,
    port: Option<u16>,
    protocol: String,
    username: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// Result payload for proxy connectivity checks.
pub(crate) struct ProxyTestResult {
    message: String,
    ok: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// Signing key descriptor discovered from GPG or SSH sources.
pub(crate) struct SigningKeyInfo {
    id: String,
    label: String,
    r#type: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
/// System font family descriptor.
pub(crate) struct SystemFontFamily {
    /// The font family name as reported by the system.
    pub(crate) family: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
/// Git identity value pair (name and email) with completeness marker.
pub(crate) struct GitIdentityValue {
    email: Option<String>,
    is_complete: bool,
    name: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
/// Combined Git identity payload across effective/global/local scopes.
pub(crate) struct GitIdentityStatusPayload {
    effective: GitIdentityValue,
    effective_scope: Option<String>,
    global: GitIdentityValue,
    local: Option<GitIdentityValue>,
    repo_path: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Input payload for writing Git identity settings.
pub(crate) struct GitIdentityWriteRequest {
    /// The Git author email address to write.
    pub(crate) email: String,
    /// The Git author name to write.
    pub(crate) name: String,
    /// The config scope ("global" or "local") to write to.
    pub(crate) scope: String,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Repository command behavior preferences applied to git subprocesses.
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// Generic picked file path payload.
pub(crate) struct PickedFilePath {
    path: String,
}

#[derive(Clone)]
/// Secret value plus storage mode marker.
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

#[derive(Clone)]
/// HTTP credential record persisted in secure/session storage.
pub(crate) struct StoredHttpCredential {
    host: String,
    port: Option<u16>,
    protocol: String,
    secret: StoredSecretValue,
    username: String,
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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Generates an SSH keypair in the user's `~/.ssh` directory.
pub(crate) fn generate_ssh_keypair(file_name: String) -> Result<PickedFilePath, String> {
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
/// Lists available signing keys from GPG and SSH key stores.
pub(crate) fn list_signing_keys() -> Result<Vec<SigningKeyInfo>, String> {
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
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Lists system font families and caches the result in process state.
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

#[tauri::command]
/// Returns effective, global, and local Git identity values.
pub(crate) fn get_git_identity(
    repo_path: Option<String>,
) -> Result<GitIdentityStatusPayload, String> {
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
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Saves Git identity values at global or local scope and returns updated status.
pub(crate) fn set_git_identity(
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

pub(crate) fn load_keyring_entry(service: &str, account: &str) -> Result<Option<String>, SettingsError> {
    let entry = keyring::Entry::new(service, account)
        .map_err(|error| SettingsError::Message(format!("Failed to access secure storage: {error}")))?;

    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(SettingsError::Message(format!("Failed to read secure storage: {error}"))),
    }
}

fn save_keyring_entry(service: &str, account: &str, secret: &str) -> Result<(), SettingsError> {
    let entry = keyring::Entry::new(service, account)
        .map_err(|error| SettingsError::Message(format!("Failed to access secure storage: {error}")))?;

    entry
        .set_password(secret)
        .map_err(|error| SettingsError::Message(format!("Failed to save secure secret: {error}")))
}

fn clear_keyring_entry(service: &str, account: &str) -> Result<(), SettingsError> {
    let entry = keyring::Entry::new(service, account)
        .map_err(|error| SettingsError::Message(format!("Failed to access secure storage: {error}")))?;

    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(SettingsError::Message(format!("Failed to clear secure secret: {error}"))),
    }
}

fn get_ai_secret_from_session(
    state: &SettingsState,
    provider: &str,
) -> Result<Option<String>, SettingsError> {
    let secrets = state
        .ai_secrets
        .lock()
        .map_err(|_| SettingsError::Message("Failed to access settings state".to_string()))?;

    Ok(secrets.get(provider).map(|secret| secret.value.clone()))
}

pub(crate) fn resolve_ai_provider_secret(
    state: &State<'_, SettingsState>,
    provider: &str,
) -> Result<String, SettingsError> {
    let trimmed_provider = provider.trim();

    if trimmed_provider.is_empty() {
        return Err(SettingsError::Message("AI provider is required".to_string()));
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

pub(crate) fn apply_git_preferences(
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

fn build_git_identity_status(repo_path: Option<&str>) -> Result<GitIdentityStatusPayload, SettingsError> {
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

pub(crate) fn normalize_git_identity_scope(scope: &str) -> Result<&str, SettingsError> {
    match scope.trim() {
        "global" => Ok("global"),
        "local" => Ok("local"),
        _ => Err(SettingsError::Message("Git identity scope must be global or local".to_string())),
    }
}

pub(crate) fn validate_git_identity_name(name: &str) -> Result<String, SettingsError> {
    let trimmed = name.trim();

    if trimmed.is_empty() {
        return Err(SettingsError::Message("Git author name is required".to_string()));
    }

    Ok(trimmed.to_string())
}

pub(crate) fn validate_git_identity_email(email: &str) -> Result<String, SettingsError> {
    let trimmed = email.trim();

    if trimmed.is_empty() {
        return Err(SettingsError::Message("Git author email is required".to_string()));
    }

    let has_single_at_symbol = trimmed.matches('@').count() == 1;
    let has_non_empty_segments = trimmed.split_once('@').is_some_and(|(local, domain)| {
        !local.is_empty()
            && domain.contains('.')
            && !domain.starts_with('.')
            && !domain.ends_with('.')
    });

    if !(has_single_at_symbol && has_non_empty_segments) {
        return Err(SettingsError::Message("Enter a valid Git author email".to_string()));
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
            let repo_path = repo_path
                .ok_or_else(|| SettingsError::Message("A repository path is required for local Git config".to_string()))?;
            command.args(["-C", repo_path, "config", "--local", "--get", key]);
        }
        "effective" => {
            if let Some(repo_path) = repo_path {
                command.args(["-C", repo_path, "config", "--get", key]);
            } else {
                command.args(["config", "--global", "--get", key]);
            }
        }
        _ => return Err(SettingsError::Message("Unsupported Git config scope".to_string())),
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
            let repo_path = repo_path
                .ok_or_else(|| SettingsError::Message("A repository path is required for local Git config".to_string()))?;
            command.args(["-C", repo_path, "config", "--local", key, value]);
        }
        _ => return Err(SettingsError::Message("Unsupported Git config scope".to_string())),
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

// Tauri keeps this command result-wrapped so the frontend invoke contract stays stable.
#[expect(clippy::unnecessary_wraps)]
#[tauri::command]
/// Returns settings backend runtime capabilities.
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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Saves an AI provider secret to secure storage with session fallback.
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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Returns whether an AI provider secret is currently stored.
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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Clears an AI provider secret from secure and session storage.
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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Saves a GitHub token used for identity/avatar resolution.
pub(crate) fn save_github_token(
    state: State<'_, SettingsState>,
    token: String,
) -> Result<SecretStatusPayload, String> {
    let trimmed_token = token.trim();

    if trimmed_token.is_empty() {
        return Err("GitHub token is required".to_string());
    }

    if save_keyring_entry(GITHUB_AVATAR_SERVICE, "token", trimmed_token).is_ok() {
        return apply_github_token_storage(
            state.inner(),
            trimmed_token,
            GitHubTokenStorageTarget::Secure,
        );
    }

    apply_github_token_storage(
        state.inner(),
        trimmed_token,
        GitHubTokenStorageTarget::Session,
    )
}

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Returns whether a GitHub token is currently stored.
pub(crate) fn get_github_token_status(
    state: State<'_, SettingsState>,
) -> Result<SecretStatusPayload, String> {
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
            .map_or_else(|| "session".to_string(), |value| value.storage_mode.clone()),
    })
}

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Clears the stored GitHub token and invalidates identity cache.
pub(crate) fn clear_github_token(state: State<'_, SettingsState>) -> Result<(), String> {
    let _ = clear_keyring_entry(GITHUB_AVATAR_SERVICE, "token");
    set_session_github_token(state.inner(), None)
}

fn apply_github_token_storage(
    state: &SettingsState,
    token: &str,
    target: GitHubTokenStorageTarget,
) -> Result<SecretStatusPayload, String> {
    match target {
        GitHubTokenStorageTarget::Secure => {
            let _ = token;
            set_session_github_token(state, None)?;
            Ok(SecretStatusPayload {
                has_stored_value: true,
                storage_mode: "secure".to_string(),
            })
        }
        GitHubTokenStorageTarget::Session => {
            set_session_github_token(state, Some(token))?;
            Ok(SecretStatusPayload {
                has_stored_value: true,
                storage_mode: "session".to_string(),
            })
        }
    }
}

fn set_session_github_token(state: &SettingsState, token: Option<&str>) -> Result<(), String> {
    let mut secrets = state
        .ai_secrets
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    match token {
        Some(token) => {
            secrets.insert(
                "github_token".to_string(),
                StoredSecretValue::session(token),
            );
        }
        None => {
            secrets.remove("github_token");
        }
    }

    drop(secrets);
    clear_github_identity_cache(state);
    Ok(())
}

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Saves proxy authentication credentials.
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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Returns whether proxy credentials exist for a username.
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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Clears proxy credentials for a username.
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

pub(crate) fn begin_network_operation<'a>(
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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Lists cached HTTP credential metadata entries.
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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Removes one cached HTTP credential entry by identifier.
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

#[tauri::command]
/// Tests outbound connectivity through a proxy endpoint.
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
        let proxy = Proxy::new(&proxy_url)
            .map_err(|error| format!("Failed to configure proxy: {error}"))?;
        let agent = ureq::AgentBuilder::new()
            .proxy(proxy)
            .timeout(Duration::from_secs(PROXY_TEST_TIMEOUT_SECS))
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
                "Proxy request to https://example.com/ succeeded via {proxy_type}://{normalized_host}:{port}"
            ),
            ok: true,
        })
    })
    .await
    .map_err(|error| format!("Failed to test proxy connection: {error}"))?
}

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Starts or replaces the background auto-fetch scheduler for one repository.
pub(crate) fn start_auto_fetch_scheduler(
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
        let interval = Duration::from_secs(interval_minutes.saturating_mul(60));

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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Stops the running auto-fetch scheduler if one exists.
pub(crate) fn stop_auto_fetch_scheduler(state: State<'_, SettingsState>) -> Result<(), String> {
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
        apply_git_preferences, apply_github_token_storage, get_settings_backend_capabilities,
        normalize_git_identity_scope, set_session_github_token, validate_git_identity_email,
        validate_git_identity_name, GitHubTokenStorageTarget, RepoCommandPreferences,
        SettingsState,
    };
    use crate::settings::GitHubIdentityCacheRecord;
    use std::process::Command;

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
            normalize_git_identity_scope("workspace").unwrap_err().to_string(),
            "Git identity scope must be global or local",
        );
    }

    #[test]
    fn get_settings_backend_capabilities_reports_session_secret_support() {
        let capabilities =
            get_settings_backend_capabilities().expect("backend capabilities should resolve");

        assert!(capabilities.session_secrets_supported);
        assert!(!capabilities.runtime_platform.is_empty());
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
    fn set_session_github_token_clears_github_identity_cache_when_token_changes() {
        let state = SettingsState::default();

        state
            .mutate_github_identity_cache(|cache| {
                cache.insert(
                    "email:dev@example.com".to_string(),
                    GitHubIdentityCacheRecord {
                        avatar_url: Some("https://github.com/litgit-tests.png".to_string()),
                        stored_at_unix_seconds: 100,
                        username: Some("litgit-tests".to_string()),
                    },
                );
            })
            .expect("cache should seed");

        set_session_github_token(&state, Some("first-token")).expect("first token should save");
        assert!(state
            .mutate_github_identity_cache(|cache| cache.is_empty())
            .expect("cache should read"));

        state
            .mutate_github_identity_cache(|cache| {
                cache.insert(
                    "email:dev@example.com".to_string(),
                    GitHubIdentityCacheRecord {
                        avatar_url: Some("https://github.com/litgit-tests.png".to_string()),
                        stored_at_unix_seconds: 200,
                        username: Some("litgit-tests".to_string()),
                    },
                );
            })
            .expect("cache should reseed");

        set_session_github_token(&state, Some("second-token")).expect("second token should save");
        assert!(state
            .mutate_github_identity_cache(|cache| cache.is_empty())
            .expect("cache should read"));
    }

    #[test]
    fn apply_github_token_storage_secure_clears_stale_session_fallback() {
        let state = SettingsState::default();

        set_session_github_token(&state, Some("stale-session-token"))
            .expect("session token should seed");

        let result = apply_github_token_storage(
            &state,
            "fresh-secure-token",
            GitHubTokenStorageTarget::Secure,
        );

        assert!(result.is_ok(), "secure token update should succeed");
        assert_eq!(
            state
                .ai_secrets
                .lock()
                .expect("settings lock")
                .get("github_token")
                .map(|value| value.value.clone()),
            None
        );
    }
}
