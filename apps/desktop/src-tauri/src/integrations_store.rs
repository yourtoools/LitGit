//! Integration settings persistence for OAuth tokens and provider SSH keys.
//!
//! Stores configuration in `~/.litgit/integrations.json`.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use thiserror::Error;

use crate::settings::{clear_keyring_entry, load_keyring_entry, save_keyring_entry};

const PROVIDER_TOKEN_SERVICE: &str = "litgit.oauth.provider-token";

/// Errors that can occur when working with integrations configuration.
#[derive(Error, Debug)]
pub(crate) enum IntegrationsConfigError {
    /// Failed to create the `.litgit` directory.
    #[error("Failed to create .litgit directory: {0}")]
    CreateDir(#[source] std::io::Error),

    /// Failed to read the configuration file.
    #[error("Failed to read integrations config: {0}")]
    Read(#[source] std::io::Error),

    /// Failed to parse the configuration file.
    #[error("Failed to parse integrations config: {0}")]
    Parse(#[source] serde_json::Error),

    /// Failed to serialize the configuration.
    #[error("Failed to serialize integrations config: {0}")]
    Serialize(#[source] serde_json::Error),

    /// Failed to write the configuration file.
    #[error("Failed to write integrations config: {0}")]
    Write(#[source] std::io::Error),
}

/// Persistent configuration for integrations.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub(crate) struct IntegrationsConfig {
    /// Unique identifier for the current profile.
    pub(crate) profile_id: String,
    /// Map of provider configurations keyed by provider name.
    pub(crate) providers: HashMap<String, ProviderConfig>,
}

/// Configuration for a specific Git provider.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct ProviderConfig {
    /// OAuth token for API access, if connected.
    pub(crate) oauth_token: Option<StoredToken>,
    /// Cached provider profile details for UI display.
    #[serde(default)]
    pub(crate) profile: Option<ProviderProfile>,
    /// SSH key configuration for this provider, if set.
    pub(crate) ssh_key: Option<ProviderSshKey>,
    /// Whether to use the system SSH agent for this provider.
    pub(crate) use_system_agent: bool,
}

impl Default for ProviderConfig {
    fn default() -> Self {
        Self {
            oauth_token: None,
            profile: None,
            ssh_key: None,
            use_system_agent: true,
        }
    }
}

/// Cached profile information for a connected provider.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderProfile {
    /// Username if returned by the provider.
    pub(crate) username: Option<String>,
    /// Display name if returned by the provider.
    pub(crate) display_name: Option<String>,
    /// Avatar URL if returned by the provider.
    pub(crate) avatar_url: Option<String>,
    /// Known email addresses for this provider account.
    ///
    /// Used to match commit author emails against the connected profile
    /// so avatars resolve correctly for commits using real personal emails.
    #[serde(default)]
    pub(crate) emails: Vec<String>,
}

/// OAuth token storage structure.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct StoredToken {
    /// The access token for API requests.
    pub(crate) access_token: String,
    /// Refresh token for obtaining new access tokens, if available.
    pub(crate) refresh_token: Option<String>,
    /// When the access token expires, if known.
    pub(crate) expires_at: Option<DateTime<Utc>>,
    /// OAuth scopes granted.
    pub(crate) scope: String,
}

fn generate_profile_id() -> String {
    format!(
        "profile_{}",
        uuid::Uuid::new_v4()
            .to_string()
            .split('-')
            .next()
            .unwrap_or("00000000")
    )
}

fn ensure_profile_id(config: &mut IntegrationsConfig) {
    if config.profile_id.trim().is_empty() {
        config.profile_id = generate_profile_id();
    }
}

fn provider_token_account_key(profile_id: &str, provider: &str, token_kind: &str) -> String {
    format!("{profile_id}:{provider}:{token_kind}")
}

fn redact_stored_token_secrets(token: &StoredToken) -> StoredToken {
    StoredToken {
        access_token: String::new(),
        refresh_token: None,
        expires_at: token.expires_at,
        scope: token.scope.clone(),
    }
}

fn persist_provider_token_secret(
    profile_id: &str,
    provider: &str,
    token_kind: &str,
    secret: &str,
) -> bool {
    let trimmed_secret = secret.trim();
    if trimmed_secret.is_empty() {
        return true;
    }

    save_keyring_entry(
        PROVIDER_TOKEN_SERVICE,
        &provider_token_account_key(profile_id, provider, token_kind),
        trimmed_secret,
    )
    .is_ok()
}

fn clear_provider_token_secret(profile_id: &str, provider: &str, token_kind: &str) {
    let _ = clear_keyring_entry(
        PROVIDER_TOKEN_SERVICE,
        &provider_token_account_key(profile_id, provider, token_kind),
    );
}

fn persist_provider_token_secrets(
    profile_id: &str,
    provider: &str,
    token: &StoredToken,
) -> Option<StoredToken> {
    let access_saved =
        persist_provider_token_secret(profile_id, provider, "access_token", &token.access_token);
    let refresh_saved = if let Some(refresh_token) = token.refresh_token.as_deref() {
        persist_provider_token_secret(profile_id, provider, "refresh_token", refresh_token)
    } else {
        clear_provider_token_secret(profile_id, provider, "refresh_token");
        true
    };

    if access_saved && refresh_saved {
        Some(redact_stored_token_secrets(token))
    } else {
        None
    }
}

fn read_provider_token_secret(
    profile_id: &str,
    provider: &str,
    token_kind: &str,
) -> Option<String> {
    load_keyring_entry(
        PROVIDER_TOKEN_SERVICE,
        &provider_token_account_key(profile_id, provider, token_kind),
    )
    .ok()
    .flatten()
    .map(|secret| secret.trim().to_string())
    .filter(|secret| !secret.is_empty())
}

pub(crate) fn resolve_provider_access_token(
    config: &IntegrationsConfig,
    provider: &str,
) -> Option<String> {
    let profile_id = config.profile_id.trim();
    if !profile_id.is_empty() {
        if let Some(secret) = read_provider_token_secret(profile_id, provider, "access_token") {
            return Some(secret);
        }
    }

    config
        .providers
        .get(provider)
        .and_then(|provider_config| provider_config.oauth_token.as_ref())
        .and_then(|token| {
            let trimmed = token.access_token.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        })
}

fn migrate_provider_tokens_to_secure_storage(config: &mut IntegrationsConfig) -> bool {
    let mut changed = false;
    ensure_profile_id(config);

    for (provider, provider_config) in &mut config.providers {
        let Some(token) = provider_config.oauth_token.as_ref() else {
            continue;
        };

        let has_inline_access = !token.access_token.trim().is_empty();
        let has_inline_refresh = token
            .refresh_token
            .as_deref()
            .is_some_and(|refresh_token| !refresh_token.trim().is_empty());

        if !(has_inline_access || has_inline_refresh) {
            continue;
        }

        if let Some(redacted_token) =
            persist_provider_token_secrets(&config.profile_id, provider, token)
        {
            provider_config.oauth_token = Some(redacted_token);
            changed = true;
        }
    }

    changed
}

/// SSH key information for a provider.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderSshKey {
    /// Path to the private key file.
    pub(crate) key_path: PathBuf,
    /// Title/description of the key.
    pub(crate) title: String,
    /// Key fingerprint for identification.
    pub(crate) fingerprint: String,
    /// When the key was added.
    pub(crate) added_at: DateTime<Utc>,
}

/// Returns the path to the integrations config file.
///
/// The config is stored at `~/.litgit/integrations.json`.
pub(crate) fn integrations_config_path() -> PathBuf {
    dirs::home_dir()
        .map(|home| home.join(".litgit").join("integrations.json"))
        .unwrap_or_else(|| {
            std::env::temp_dir()
                .join(".litgit")
                .join("integrations.json")
        })
}

/// Ensures the `.litgit` directory exists.
///
/// Creates the directory and all parent directories if they don't exist.
pub(crate) fn ensure_litgit_dir() -> Result<PathBuf, IntegrationsConfigError> {
    let litgit_dir = dirs::home_dir()
        .map(|home| home.join(".litgit"))
        .unwrap_or_else(|| std::env::temp_dir().join(".litgit"));

    if !litgit_dir.exists() {
        std::fs::create_dir_all(&litgit_dir).map_err(IntegrationsConfigError::CreateDir)?;
    }

    Ok(litgit_dir)
}

/// Loads the integrations configuration from disk.
///
/// Returns a default configuration if the file doesn't exist.
/// Automatically migrates old snake_case SSH key format to camelCase by clearing them.
pub(crate) fn load_integrations_config() -> Result<IntegrationsConfig, IntegrationsConfigError> {
    let config_path = integrations_config_path();

    if !config_path.exists() {
        return Ok(IntegrationsConfig::default());
    }

    let content = std::fs::read_to_string(&config_path).map_err(IntegrationsConfigError::Read)?;

    // Try to parse with backward compatibility aliases
    let mut config: IntegrationsConfig =
        serde_json::from_str(&content).map_err(IntegrationsConfigError::Parse)?;

    let mut changed = migrate_provider_tokens_to_secure_storage(&mut config);

    // Check if any SSH keys have old snake_case format and clear them
    let mut needs_save = false;
    for provider_config in config.providers.values_mut() {
        if let Some(ssh_key) = &provider_config.ssh_key {
            // If the key was loaded via alias (snake_case), it will have the data
            // but we want to force regeneration with new camelCase format
            // We detect this by checking if serialization produces snake_case
            match serde_json::to_value(ssh_key) {
                Ok(json) => {
                    if json.get("key_path").is_some() || json.get("added_at").is_some() {
                        log::info!(
                            "Clearing old format SSH key for provider, will need regeneration"
                        );
                        provider_config.ssh_key = None;
                        needs_save = true;
                    }
                }
                Err(error) => {
                    log::warn!("Failed to inspect stored SSH key format during migration: {error}");
                }
            }
        }
    }

    changed |= needs_save;

    if changed {
        save_integrations_config(&config)?;
    }

    Ok(config)
}

/// Saves the integrations configuration to disk.
///
/// Creates the `.litgit` directory if it doesn't exist.
pub(crate) fn save_integrations_config(
    config: &IntegrationsConfig,
) -> Result<(), IntegrationsConfigError> {
    ensure_litgit_dir()?;

    let config_path = integrations_config_path();
    let mut persisted_config = config.clone();
    migrate_provider_tokens_to_secure_storage(&mut persisted_config);
    let content = serde_json::to_string_pretty(&persisted_config)
        .map_err(IntegrationsConfigError::Serialize)?;

    std::fs::write(&config_path, content).map_err(IntegrationsConfigError::Write)
}

/// Gets the existing profile ID or creates a new one.
///
/// If no profile ID exists, generates a new random one and saves it.
pub(crate) fn get_or_create_profile_id() -> Result<String, IntegrationsConfigError> {
    let mut config = load_integrations_config()?;

    if config.profile_id.is_empty() {
        config.profile_id = generate_profile_id();
        save_integrations_config(&config)?;
    }

    Ok(config.profile_id.clone())
}

/// Disconnects a provider by removing its stored credentials.
pub(crate) fn disconnect_provider(provider: &str) -> Result<(), IntegrationsConfigError> {
    let mut config = load_integrations_config()?;

    if !config.profile_id.trim().is_empty() {
        clear_provider_token_secret(&config.profile_id, provider, "access_token");
        clear_provider_token_secret(&config.profile_id, provider, "refresh_token");
    }

    if let Some(provider_config) = config.providers.get_mut(provider) {
        provider_config.oauth_token = None;
        provider_config.profile = None;
        provider_config.ssh_key = None;
        provider_config.use_system_agent = true;
    }

    save_integrations_config(&config)
}

/// Provider connection status for frontend display.
#[derive(Clone, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderDisplayStatus {
    /// Whether the provider is connected.
    pub(crate) connected: bool,
    /// Username if connected.
    pub(crate) username: Option<String>,
    /// Display name if connected.
    pub(crate) display_name: Option<String>,
    /// Avatar URL if connected.
    pub(crate) avatar_url: Option<String>,
}

/// Gets status for all providers.
pub(crate) fn get_all_provider_status(
) -> Result<HashMap<String, ProviderDisplayStatus>, IntegrationsConfigError> {
    let config = load_integrations_config()?;
    let mut statuses = HashMap::new();

    // Check each supported provider
    for provider in ["github", "gitlab", "bitbucket"] {
        let status = if let Some(provider_config) = config.providers.get(provider) {
            // Check if we have a valid token
            let connected = provider_config.oauth_token.is_some()
                && resolve_provider_access_token(&config, provider).is_some();
            ProviderDisplayStatus {
                connected,
                username: provider_config
                    .profile
                    .as_ref()
                    .and_then(|profile| profile.username.clone()),
                display_name: provider_config
                    .profile
                    .as_ref()
                    .and_then(|profile| profile.display_name.clone()),
                avatar_url: provider_config
                    .profile
                    .as_ref()
                    .and_then(|profile| profile.avatar_url.clone()),
            }
        } else {
            ProviderDisplayStatus::default()
        };
        statuses.insert(provider.to_string(), status);
    }

    Ok(statuses)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn test_environment_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn create_temp_home_dir(label: &str) -> PathBuf {
        let unique_suffix = uuid::Uuid::new_v4();
        let path = std::env::temp_dir().join(format!("litgit-{label}-{unique_suffix}"));
        std::fs::create_dir_all(&path).expect("should create temporary home directory");
        path
    }

    fn run_with_temp_home<T>(label: &str, callback: impl FnOnce() -> T) -> T {
        let _guard = test_environment_lock()
            .lock()
            .expect("test environment lock should not be poisoned");
        let temp_home = create_temp_home_dir(label);
        let previous_home = std::env::var_os("HOME");

        unsafe {
            std::env::set_var("HOME", &temp_home);
        }

        let result = callback();

        if let Some(home) = previous_home {
            unsafe {
                std::env::set_var("HOME", home);
            }
        } else {
            unsafe {
                std::env::remove_var("HOME");
            }
        }

        std::fs::remove_dir_all(&temp_home).expect("should remove temporary home directory");
        result
    }

    #[test]
    fn integrations_config_should_serialize_and_deserialize_correctly() {
        let config = IntegrationsConfig {
            profile_id: "test_profile_123".to_string(),
            providers: {
                let mut providers = HashMap::new();
                providers.insert(
                    "github".to_string(),
                    ProviderConfig {
                        oauth_token: None,
                        profile: None,
                        ssh_key: None,
                        use_system_agent: true,
                    },
                );
                providers
            },
        };

        let json = serde_json::to_string(&config).expect("should serialize");
        let loaded: IntegrationsConfig = serde_json::from_str(&json).expect("should deserialize");

        assert_eq!(loaded.profile_id, "test_profile_123");
        assert!(loaded.providers.contains_key("github"));
        assert!(loaded.providers["github"].use_system_agent);
    }

    #[test]
    fn integrations_config_path_should_contain_litgit() {
        let path = integrations_config_path();
        let path_str = path.to_string_lossy();
        assert!(path_str.contains(".litgit"));
        assert!(path_str.contains("integrations.json"));
    }

    #[test]
    fn default_provider_config_should_use_system_agent() {
        let config = ProviderConfig::default();
        assert!(config.use_system_agent);
        assert!(config.oauth_token.is_none());
        assert!(config.ssh_key.is_none());
    }

    #[test]
    fn stored_token_should_serialize_all_fields() {
        let token = StoredToken {
            access_token: "ghp_test123".to_string(),
            refresh_token: Some("refresh_456".to_string()),
            expires_at: Some(Utc::now()),
            scope: "repo,user".to_string(),
        };

        let json = serde_json::to_string(&token).expect("should serialize");
        assert!(json.contains("ghp_test123"));
        assert!(json.contains("refresh_456"));
        assert!(json.contains("repo,user"));
    }

    #[test]
    fn redact_stored_token_secrets_clears_sensitive_fields() {
        let redacted = redact_stored_token_secrets(&StoredToken {
            access_token: "ghp_test123".to_string(),
            refresh_token: Some("refresh_456".to_string()),
            expires_at: None,
            scope: "repo,user".to_string(),
        });

        assert!(redacted.access_token.is_empty());
        assert!(redacted.refresh_token.is_none());
        assert_eq!(redacted.scope, "repo,user");
    }

    #[test]
    fn provider_token_account_key_scopes_by_profile_provider_and_kind() {
        assert_eq!(
            provider_token_account_key("profile_123", "github", "access_token"),
            "profile_123:github:access_token"
        );
    }

    #[test]
    fn provider_profile_should_default_emails_when_missing_in_legacy_payload() {
        let legacy_payload = r#"{
            "username": "octocat",
            "displayName": "The Octocat",
            "avatarUrl": "https://github.com/images/error/octocat_happy.gif"
        }"#;

        let profile: ProviderProfile = serde_json::from_str(legacy_payload)
            .expect("legacy profile payload should deserialize");

        assert_eq!(profile.username.as_deref(), Some("octocat"));
        assert!(profile.emails.is_empty());
    }

    #[test]
    fn get_all_provider_status_should_return_persisted_profile_details() {
        run_with_temp_home("provider-status-profile", || {
            let config = IntegrationsConfig {
                profile_id: "test_profile_123".to_string(),
                providers: {
                    let mut providers = HashMap::new();
                    providers.insert(
                        "github".to_string(),
                        ProviderConfig {
                            oauth_token: Some(StoredToken {
                                access_token: "ghp_test123".to_string(),
                                refresh_token: None,
                                expires_at: None,
                                scope: "repo,user".to_string(),
                            }),
                            profile: Some(ProviderProfile {
                                username: Some("octocat".to_string()),
                                display_name: Some("The Octocat".to_string()),
                                avatar_url: Some(
                                    "https://github.com/images/error/octocat_happy.gif".to_string(),
                                ),
                                emails: vec!["octocat@github.com".to_string()],
                            }),
                            ssh_key: None,
                            use_system_agent: true,
                        },
                    );
                    providers
                },
            };

            save_integrations_config(&config).expect("should save config");

            let statuses = get_all_provider_status().expect("should load provider statuses");
            let github_status = statuses
                .get("github")
                .expect("github status should be available");

            assert!(github_status.connected);
            assert_eq!(github_status.username.as_deref(), Some("octocat"));
            assert_eq!(github_status.display_name.as_deref(), Some("The Octocat"));
            assert_eq!(
                github_status.avatar_url.as_deref(),
                Some("https://github.com/images/error/octocat_happy.gif")
            );
        });
    }
}
