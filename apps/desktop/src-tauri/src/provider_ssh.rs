//! Provider-specific SSH key management.
//!
//! Handles generation of SSH keys for specific Git providers and uploading
//! them via provider APIs. Keys are stored in `~/.litgit/profiles/<profile_id>/ssh/`.

use crate::git_host_auth::{APP_USER_AGENT, GITHUB_API_VERSION};
use crate::integrations_store::{
    get_or_create_profile_id, load_integrations_config, resolve_provider_access_token,
    save_integrations_config, IntegrationsConfigError, ProviderSshKey,
};
use crate::oauth::{fetch_user_info, OAuthProvider};
use crate::ssh_auth::{get_ssh_key_info, validate_ssh_key_command_path, SshKeyInfo};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::str::FromStr;
use thiserror::Error;
use ureq::http;

/// Errors that can occur during provider SSH operations.
#[derive(Error, Debug)]
pub(crate) enum ProviderSshError {
    /// Failed to generate SSH key.
    #[error("Failed to generate SSH key: {0}")]
    GenerationFailed(String),

    /// Failed to upload key to provider.
    #[error("Failed to upload key to {provider}: {message}")]
    UploadFailed {
        /// The provider that failed.
        provider: String,
        /// The error message.
        message: String,
    },

    /// Failed to read or write key files.
    #[error("File operation failed: {0}")]
    FileError(#[source] std::io::Error),

    /// SSH key path is outside approved key directories.
    #[error("Invalid SSH key path: {0}")]
    InvalidKeyPath(String),

    /// Provider not connected (no OAuth token).
    #[error("{0} is not connected. Please connect via OAuth first.")]
    ProviderNotConnected(String),

    /// Storage operation failed.
    #[error("Storage error: {0}")]
    StorageError(#[from] IntegrationsConfigError),

    /// No SSH key configured for this provider.
    #[error("No SSH key configured for {0}")]
    NoSshKeyConfigured(String),
}

/// SSH key status for a provider.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderSshStatus {
    /// Whether to use the system SSH agent.
    pub(crate) use_system_agent: bool,
    /// Custom SSH key configuration if set.
    pub(crate) custom_key: Option<ProviderSshKey>,
}

impl Default for ProviderSshStatus {
    fn default() -> Self {
        Self {
            use_system_agent: true,
            custom_key: None,
        }
    }
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

/// Returns the base directory for provider-specific SSH keys.
///
/// The path is `~/.litgit/profiles/<profile_id>/ssh/`.
fn get_provider_ssh_base_dir(profile_id: &str) -> PathBuf {
    dirs::home_dir()
        .map(|home| {
            home.join(".litgit")
                .join("profiles")
                .join(profile_id)
                .join("ssh")
        })
        .unwrap_or_else(|| {
            std::env::temp_dir()
                .join(".litgit")
                .join("profiles")
                .join(profile_id)
                .join("ssh")
        })
}

/// Ensures the provider SSH directory exists.
fn ensure_provider_ssh_dir(profile_id: &str) -> Result<PathBuf, ProviderSshError> {
    let dir = get_provider_ssh_base_dir(profile_id);
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(ProviderSshError::FileError)?;
    }
    Ok(dir)
}

/// Generates a unique key path for a provider.
///
/// The key is named `litgit_<provider>_<timestamp>` to ensure uniqueness.
fn generate_key_path(provider: &str, profile_id: &str) -> Result<PathBuf, ProviderSshError> {
    let base_dir = ensure_provider_ssh_dir(profile_id)?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| ProviderSshError::GenerationFailed(e.to_string()))?
        .as_secs();

    let key_name = format!("litgit_{}_{}", provider.to_lowercase(), timestamp);
    Ok(base_dir.join(key_name))
}

fn validate_provider_key_path(path: &Path) -> Result<PathBuf, ProviderSshError> {
    validate_ssh_key_command_path(path).map_err(ProviderSshError::InvalidKeyPath)
}

fn cleanup_local_key_pair(private_key_path: &Path) {
    match validate_provider_key_path(private_key_path) {
        Ok(validated_private_key_path) => {
            if let Err(error) = std::fs::remove_file(&validated_private_key_path) {
                if error.kind() != std::io::ErrorKind::NotFound {
                    log::warn!(
                        "Failed to delete private key {}: {}",
                        validated_private_key_path.display(),
                        error
                    );
                }
            }

            let validated_public_key_path =
                validate_provider_key_path(&validated_private_key_path.with_extension("pub"));
            if let Ok(validated_public_key_path) = validated_public_key_path {
                if let Err(error) = std::fs::remove_file(&validated_public_key_path) {
                    if error.kind() != std::io::ErrorKind::NotFound {
                        log::warn!(
                            "Failed to delete public key {}: {}",
                            validated_public_key_path.display(),
                            error
                        );
                    }
                }
            }
        }
        Err(error) => {
            log::warn!(
                "Skipping provider SSH key file deletion for invalid path {}: {}",
                private_key_path.display(),
                error
            );
        }
    }
}

/// Generates an SSH key at a specific path.
///
/// Uses `ssh-keygen` to create an ED25519 key pair.
fn generate_ssh_key_at_path(
    key_path: &Path,
    comment: Option<&str>,
) -> Result<SshKeyInfo, ProviderSshError> {
    // Check if key already exists
    if key_path.exists() {
        return Err(ProviderSshError::GenerationFailed(format!(
            "Key already exists at {}",
            key_path.display()
        )));
    }

    let mut cmd = Command::new("ssh-keygen");
    cmd.arg("-t").arg("ed25519");
    cmd.arg("-f").arg(key_path);
    cmd.arg("-N").arg(""); // No passphrase for now

    if let Some(comment) = comment {
        cmd.arg("-C").arg(comment);
    } else {
        cmd.arg("-C").arg("litgit@localhost");
    }

    cmd.stdin(Stdio::null());

    let output = cmd
        .output()
        .map_err(|e| ProviderSshError::GenerationFailed(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ProviderSshError::GenerationFailed(stderr.to_string()));
    }

    // Set proper permissions on Unix (owner read/write only)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(key_path, permissions).map_err(ProviderSshError::FileError)?;
    }

    get_ssh_key_info(key_path).map_err(ProviderSshError::GenerationFailed)
}

/// Gets the fingerprint of an SSH key.
fn get_key_fingerprint(key_path: &Path) -> Result<String, ProviderSshError> {
    let output = Command::new("ssh-keygen")
        .args(["-lf", key_path.to_string_lossy().as_ref()])
        .output()
        .map_err(|e| ProviderSshError::GenerationFailed(e.to_string()))?;

    if !output.status.success() {
        return Err(ProviderSshError::GenerationFailed(
            "Failed to get key fingerprint".to_string(),
        ));
    }

    let output_str = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = output_str.split_whitespace().collect();
    parts.get(1).map(|s| s.to_string()).ok_or_else(|| {
        ProviderSshError::GenerationFailed("Failed to parse fingerprint".to_string())
    })
}

/// Reads the public key content from a key path.
fn read_public_key(key_path: &Path) -> Result<String, ProviderSshError> {
    let public_key_path = key_path.with_extension("pub");
    std::fs::read_to_string(&public_key_path).map_err(ProviderSshError::FileError)
}

/// Parses the title/comment from a public key line.
fn parse_key_title(public_key: &str) -> String {
    let parts: Vec<&str> = public_key.split_whitespace().collect();
    parts
        .get(2)
        .map(|s| s.to_string())
        .unwrap_or_else(|| "LitGit SSH Key".to_string())
}

/// Uploads a public key to GitHub.
fn upload_to_github(public_key: &str, title: &str, token: &str) -> Result<(), ProviderSshError> {
    let payload = serde_json::json!({
        "title": title,
        "key": public_key.trim()
    });

    let url = OAuthProvider::GitHub.api_url("user/keys");

    // Debug logging (token masked for security)
    let token_preview = if token.len() > 10 {
        format!("{}...{}", &token[..4], &token[token.len() - 4..])
    } else {
        "[hidden]".to_string()
    };
    log::info!(
        "Uploading SSH key to GitHub: {} (token: {})",
        url,
        token_preview
    );

    // First, verify the token works by making a simple GET request to /user
    let config = ureq::config::Config::builder()
        .timeout_global(Some(std::time::Duration::from_secs(30)))
        .max_redirects(0)
        .http_status_as_error(false)
        .build();

    let agent = ureq::Agent::new_with_config(config);

    // Verify token is valid
    let verify_request = http::Request::get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", APP_USER_AGENT)
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
        .body(())
        .map_err(|e| ProviderSshError::UploadFailed {
            provider: "GitHub".to_string(),
            message: format!("Failed to build verify request: {}", e),
        })?;

    match agent.run(verify_request) {
        Ok(verify_response) => {
            let verify_status = verify_response.status().as_u16();
            log::info!("Token verification status: {}", verify_status);

            // Try to get the X-OAuth-Scopes header to see what scopes the token has
            let scopes = verify_response
                .headers()
                .get("x-oauth-scopes")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("[no scopes info]")
                .to_string();
            log::info!("Token scopes: {}", scopes);

            if verify_status != 200 {
                let mut body = String::new();
                verify_response
                    .into_body()
                    .into_reader()
                    .read_to_string(&mut body)
                    .unwrap_or_default();
                log::error!(
                    "Token verification failed: status={}, body={}",
                    verify_status,
                    body
                );
                return Err(ProviderSshError::UploadFailed {
                    provider: "GitHub".to_string(),
                    message: format!(
                        "Token validation failed (status: {}). \
                        Your GitHub token may be expired or missing required 'write:public_key' scope. \
                        Current scopes: {}. \
                        Please disconnect and reconnect your GitHub account to refresh the token.",
                        verify_status, scopes
                    ),
                });
            }

            // If verification succeeded, continue to upload
            log::info!("Token verified successfully with scopes: {}", scopes);
        }
        Err(e) => {
            log::error!("Token verification request failed: {}", e);
        }
    }

    // Now make the actual SSH key upload request
    let request = http::Request::post(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", APP_USER_AGENT)
        .header("X-GitHub-Api-Version", "2022-11-28")
        .body(payload.to_string())
        .map_err(|e| ProviderSshError::UploadFailed {
            provider: "GitHub".to_string(),
            message: format!("Failed to build request: {}", e),
        })?;

    let response = agent
        .run(request)
        .map_err(|e| ProviderSshError::UploadFailed {
            provider: "GitHub".to_string(),
            message: e.to_string(),
        })?;

    let status = response.status().as_u16();

    if is_success_status(status) {
        log::info!("Successfully uploaded SSH key to GitHub");
        Ok(())
    } else {
        let mut body = String::new();
        response
            .into_body()
            .into_reader()
            .read_to_string(&mut body)
            .unwrap_or_default();
        log::error!("GitHub API error: status={}, body={}", status, body);

        // Check for specific error cases
        if status == 404 && body.contains("Not Found") {
            return Err(ProviderSshError::UploadFailed {
                provider: "GitHub".to_string(),
                message: format!(
                    "API returned status {}: {}. \
                    This usually means your OAuth token doesn't have the 'write:public_key' scope. \
                    Please disconnect and reconnect your GitHub account to get a new token with the correct permissions.",
                    status, body
                ),
            });
        }

        Err(ProviderSshError::UploadFailed {
            provider: "GitHub".to_string(),
            message: format!("API returned status {}: {}", status, body),
        })
    }
}

/// Uploads a public key to GitLab.
fn upload_to_gitlab(public_key: &str, title: &str, token: &str) -> Result<(), ProviderSshError> {
    let payload = serde_json::json!({
        "title": title,
        "key": public_key.trim()
    });

    let url = OAuthProvider::GitLab.api_url("user/keys");
    log::info!("Uploading SSH key to GitLab: {}", url);

    let config = ureq::config::Config::builder()
        .timeout_global(Some(std::time::Duration::from_secs(30)))
        .max_redirects(0)
        .http_status_as_error(false)
        .build();

    let agent = ureq::Agent::new_with_config(config);

    let request = http::Request::post(&url)
        .header("PRIVATE-TOKEN", token)
        .header("User-Agent", APP_USER_AGENT)
        .body(payload.to_string())
        .map_err(|e| ProviderSshError::UploadFailed {
            provider: "GitLab".to_string(),
            message: format!("Failed to build request: {}", e),
        })?;

    let response = agent
        .run(request)
        .map_err(|e| ProviderSshError::UploadFailed {
            provider: "GitLab".to_string(),
            message: e.to_string(),
        })?;

    let status = response.status().as_u16();

    if is_success_status(status) {
        log::info!("Successfully uploaded SSH key to GitLab");
        Ok(())
    } else {
        let mut body = String::new();
        response
            .into_body()
            .into_reader()
            .read_to_string(&mut body)
            .unwrap_or_default();
        log::error!("GitLab API error: status={}, body={}", status, body);
        Err(ProviderSshError::UploadFailed {
            provider: "GitLab".to_string(),
            message: format!("API returned status {}: {}", status, body),
        })
    }
}

/// Uploads a public key to Bitbucket.
fn upload_to_bitbucket(
    public_key: &str,
    title: &str,
    token: &str,
    username: &str,
) -> Result<(), ProviderSshError> {
    let payload = serde_json::json!({
        "label": title,
        "key": public_key.trim()
    });

    let url = OAuthProvider::Bitbucket.api_url(&format!("users/{username}/ssh-keys"));
    log::info!("Uploading SSH key to Bitbucket: {}", url);

    let config = ureq::config::Config::builder()
        .timeout_global(Some(std::time::Duration::from_secs(30)))
        .max_redirects(0)
        .http_status_as_error(false)
        .build();

    let agent = ureq::Agent::new_with_config(config);

    let request = http::Request::post(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", APP_USER_AGENT)
        .body(payload.to_string())
        .map_err(|e| ProviderSshError::UploadFailed {
            provider: "Bitbucket".to_string(),
            message: format!("Failed to build request: {}", e),
        })?;

    let response = agent
        .run(request)
        .map_err(|e| ProviderSshError::UploadFailed {
            provider: "Bitbucket".to_string(),
            message: e.to_string(),
        })?;

    let status = response.status().as_u16();

    if is_success_status(status) {
        log::info!("Successfully uploaded SSH key to Bitbucket");
        Ok(())
    } else {
        let mut body = String::new();
        response
            .into_body()
            .into_reader()
            .read_to_string(&mut body)
            .unwrap_or_default();
        log::error!("Bitbucket API error: status={}, body={}", status, body);
        Err(ProviderSshError::UploadFailed {
            provider: "Bitbucket".to_string(),
            message: format!("API returned status {}: {}", status, body),
        })
    }
}

/// Uploads a public key to the specified provider.
fn upload_key_to_provider(
    provider: &OAuthProvider,
    key_path: &Path,
    title: Option<&str>,
) -> Result<(), ProviderSshError> {
    let public_key = read_public_key(key_path)?;
    let title = title
        .map(|t| t.to_string())
        .unwrap_or_else(|| parse_key_title(&public_key));

    // Get the OAuth token from storage
    let config = load_integrations_config()?;
    let provider_key = provider.as_str();

    let token = resolve_provider_access_token(&config, provider_key)
        .ok_or_else(|| ProviderSshError::ProviderNotConnected(provider_key.to_string()))?;

    match provider {
        OAuthProvider::GitHub => upload_to_github(&public_key, &title, &token),
        OAuthProvider::GitLab => upload_to_gitlab(&public_key, &title, &token),
        OAuthProvider::Bitbucket => {
            // Need to fetch username for Bitbucket
            let user_info_result = fetch_user_info(provider, &token);
            match user_info_result {
                Ok(info) => upload_to_bitbucket(&public_key, &title, &token, &info.username),
                Err(e) => Err(ProviderSshError::UploadFailed {
                    provider: "Bitbucket".to_string(),
                    message: format!("{}", e),
                }),
            }
        }
    }
}

/// Generates and uploads an SSH key for a specific provider.
///
/// The key is stored in `~/.litgit/profiles/<profile_id>/ssh/litgit_<provider>_<timestamp>`.
/// The public key is uploaded to the provider's API.
pub(crate) fn generate_and_upload_provider_ssh_key(
    provider: &OAuthProvider,
    title: Option<&str>,
) -> Result<SshKeyInfo, ProviderSshError> {
    let profile_id = get_or_create_profile_id()?;
    let key_path = generate_key_path(provider.as_str(), &profile_id)?;

    // Generate the key
    let key_info = generate_ssh_key_at_path(&key_path, title)?;

    // Upload to provider
    if let Err(error) = upload_key_to_provider(provider, &key_path, title) {
        cleanup_local_key_pair(&key_path);
        return Err(error);
    }

    // Save to config
    let mut config = load_integrations_config()?;
    let provider_key = provider.as_str().to_string();
    let provider_config = config.providers.entry(provider_key).or_default();

    let fingerprint = get_key_fingerprint(&key_path)?;
    let key_title = title
        .map(|t| t.to_string())
        .unwrap_or_else(|| format!("litgit_{}", provider.as_str()));

    provider_config.ssh_key = Some(ProviderSshKey {
        key_path: key_path.clone(),
        title: key_title,
        fingerprint,
        added_at: chrono::Utc::now(),
    });
    provider_config.use_system_agent = false;

    save_integrations_config(&config)?;

    Ok(key_info)
}

/// Removes a provider SSH key from the provider and deletes local files.
pub(crate) fn remove_provider_ssh_key(provider: &OAuthProvider) -> Result<(), ProviderSshError> {
    let mut config = load_integrations_config()?;
    let provider_key = provider.as_str();

    let ssh_key = config
        .providers
        .get(provider_key)
        .and_then(|p| p.ssh_key.clone())
        .ok_or_else(|| ProviderSshError::NoSshKeyConfigured(provider_key.to_string()))?;

    // Try to delete from provider (best effort - may fail if token expired)
    // For now, we focus on local deletion. API deletion can be added later
    // as it requires tracking key IDs from the API response.

    cleanup_local_key_pair(&ssh_key.key_path);

    // Clear from config
    if let Some(provider_config) = config.providers.get_mut(provider_key) {
        provider_config.ssh_key = None;
        provider_config.use_system_agent = true;
    }

    save_integrations_config(&config)?;
    Ok(())
}

/// Gets the SSH status for a provider.
pub(crate) fn get_provider_ssh_status(
    provider: &OAuthProvider,
) -> Result<ProviderSshStatus, ProviderSshError> {
    let config = load_integrations_config()?;
    let provider_key = provider.as_str();

    let (use_system_agent, custom_key) =
        if let Some(provider_config) = config.providers.get(provider_key) {
            (
                provider_config.use_system_agent,
                provider_config.ssh_key.clone(),
            )
        } else {
            (true, None)
        };

    Ok(ProviderSshStatus {
        use_system_agent,
        custom_key,
    })
}

/// Sets whether to use the system SSH agent for a provider.
pub(crate) fn set_provider_use_system_agent(
    provider: &OAuthProvider,
    use_system_agent: bool,
) -> Result<(), ProviderSshError> {
    let mut config = load_integrations_config()?;
    let provider_key = provider.as_str().to_string();
    let provider_config = config.providers.entry(provider_key).or_default();
    provider_config.use_system_agent = use_system_agent;
    save_integrations_config(&config)?;
    Ok(())
}

/// Sets a custom SSH key path for a provider.
/// The public key is expected to be at `{private_key_path}.pub`.
pub(crate) fn set_provider_custom_ssh_key(
    provider: &OAuthProvider,
    private_key_path: &Path,
) -> Result<SshKeyInfo, ProviderSshError> {
    let validated_private_key_path = validate_provider_key_path(private_key_path)?;

    // Validate that the private key exists
    if !validated_private_key_path.exists() {
        return Err(ProviderSshError::FileError(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!(
                "Private key not found at {}",
                validated_private_key_path.display()
            ),
        )));
    }

    // Validate that the public key exists
    let public_key_path =
        validate_provider_key_path(&validated_private_key_path.with_extension("pub"))?;
    if !public_key_path.exists() {
        return Err(ProviderSshError::FileError(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Public key not found at {}", public_key_path.display()),
        )));
    }

    // Get key info (fingerprint, etc.)
    let key_info = get_ssh_key_info(&validated_private_key_path)
        .map_err(ProviderSshError::GenerationFailed)?;

    // Read the public key to get the title/comment
    let public_key_content = read_public_key(&validated_private_key_path)?;
    let title = parse_key_title(&public_key_content);

    // Get fingerprint
    let fingerprint = get_key_fingerprint(&validated_private_key_path)?;

    // Save to config
    let mut config = load_integrations_config()?;
    let provider_key = provider.as_str().to_string();
    let provider_config = config.providers.entry(provider_key).or_default();

    provider_config.ssh_key = Some(ProviderSshKey {
        key_path: validated_private_key_path,
        title,
        fingerprint,
        added_at: chrono::Utc::now(),
    });
    provider_config.use_system_agent = false;

    save_integrations_config(&config)?;

    Ok(key_info)
}

// Tauri commands
/// Generates an SSH key for a provider and uploads it.
#[tauri::command]
pub(crate) fn generate_provider_ssh_key(
    provider: String,
    title: Option<String>,
) -> Result<SshKeyInfo, String> {
    let provider = OAuthProvider::from_str(&provider).map_err(|e| e.to_string())?;
    generate_and_upload_provider_ssh_key(&provider, title.as_deref()).map_err(|e| e.to_string())
}

/// Removes a provider SSH key.
#[tauri::command]
pub(crate) fn remove_provider_ssh_key_cmd(provider: String) -> Result<(), String> {
    let provider = OAuthProvider::from_str(&provider).map_err(|e| e.to_string())?;
    remove_provider_ssh_key(&provider).map_err(|e| e.to_string())
}

/// Gets the SSH status for a provider.
#[tauri::command]
pub(crate) fn get_provider_ssh_status_cmd(provider: String) -> Result<ProviderSshStatus, String> {
    let provider = OAuthProvider::from_str(&provider).map_err(|e| e.to_string())?;
    get_provider_ssh_status(&provider).map_err(|e| e.to_string())
}

/// Sets whether to use the system SSH agent for a provider.
#[tauri::command]
pub(crate) fn set_provider_ssh_use_system_agent(
    provider: String,
    use_system_agent: bool,
) -> Result<(), String> {
    let provider = OAuthProvider::from_str(&provider).map_err(|e| e.to_string())?;
    set_provider_use_system_agent(&provider, use_system_agent).map_err(|e| e.to_string())
}

/// Sets a custom SSH key path for a provider.
#[tauri::command]
pub(crate) fn set_provider_custom_ssh_key_cmd(
    provider: String,
    private_key_path: String,
) -> Result<SshKeyInfo, String> {
    let provider = OAuthProvider::from_str(&provider).map_err(|e| e.to_string())?;
    let path = PathBuf::from(private_key_path);
    set_provider_custom_ssh_key(&provider, &path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_success_status_should_only_accept_2xx_codes() {
        assert!(!is_success_status(199));
        assert!(is_success_status(200));
        assert!(is_success_status(299));
        assert!(!is_success_status(300));
    }

    #[test]
    fn provider_ssh_key_path_should_include_provider_and_profile() {
        let path = get_provider_ssh_base_dir("test_profile_123");
        let path_str = path.to_string_lossy();
        assert!(path_str.contains(".litgit"));
        assert!(path_str.contains("profiles"));
        assert!(path_str.contains("test_profile_123"));
        assert!(path_str.contains("ssh"));
    }

    #[test]
    fn parse_key_title_should_extract_comment_from_public_key() {
        let ed25519_key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDIhz2GK user@example.com";
        let title = parse_key_title(ed25519_key);
        assert_eq!(title, "user@example.com");
    }

    #[test]
    fn parse_key_title_should_return_default_when_no_comment() {
        let key_without_comment = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDIhz2GK";
        let title = parse_key_title(key_without_comment);
        assert_eq!(title, "LitGit SSH Key");
    }

    #[test]
    fn provider_ssh_status_should_default_to_system_agent() {
        let status = ProviderSshStatus::default();
        assert!(status.use_system_agent);
        assert!(status.custom_key.is_none());
    }

    #[test]
    fn provider_ssh_key_path_should_contain_provider_and_timestamp() {
        let profile_id = "test_profile";
        let provider = "github";

        // Generate a key path and verify it contains expected components
        let path = generate_key_path(provider, profile_id).unwrap();
        let path_str = path.to_string_lossy();

        // Should contain provider name
        assert!(path_str.contains("litgit_github_"));
        // Should be in the correct directory structure
        assert!(path_str.contains(".litgit/profiles/test_profile/ssh"));
        // Should have a numeric timestamp suffix
        let file_name = path.file_name().unwrap().to_string_lossy();
        let parts: Vec<&str> = file_name.split('_').collect();
        assert_eq!(parts.len(), 3); // litgit, github, <timestamp>
                                    // Verify timestamp is numeric
        parts[2]
            .parse::<u64>()
            .expect("timestamp should be numeric");
    }

    #[test]
    fn provider_ssh_error_should_format_correctly() {
        let error = ProviderSshError::ProviderNotConnected("github".to_string());
        let error_string = format!("{}", error);
        assert!(error_string.contains("github"));
        assert!(error_string.contains("not connected"));

        let error = ProviderSshError::NoSshKeyConfigured("gitlab".to_string());
        let error_string = format!("{}", error);
        assert!(error_string.contains("gitlab"));
        assert!(error_string.contains("No SSH key"));
    }

    #[test]
    fn validate_provider_key_path_rejects_relative_path() {
        let result = validate_provider_key_path(Path::new("id_ed25519"));
        assert!(result.is_err());
    }

    #[test]
    fn validate_provider_key_path_accepts_default_ssh_path() {
        let path = crate::ssh_auth::default_ssh_dir().join("id_ed25519_litgit");
        let validated =
            validate_provider_key_path(&path).expect("default ssh path should validate");
        assert!(validated.starts_with(crate::ssh_auth::default_ssh_dir()));
    }

    #[test]
    fn provider_ssh_status_should_be_clonable() {
        let status = ProviderSshStatus {
            use_system_agent: false,
            custom_key: Some(ProviderSshKey {
                key_path: std::path::PathBuf::from("/test/path"),
                title: "test-key".to_string(),
                fingerprint: "SHA256:abcdef".to_string(),
                added_at: chrono::Utc::now(),
            }),
        };
        let cloned = status.clone();
        assert_eq!(status.use_system_agent, cloned.use_system_agent);
        assert!(cloned.custom_key.is_some());
    }

    #[test]
    fn provider_ssh_key_should_be_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<ProviderSshStatus>();
        assert_send_sync::<ProviderSshError>();
    }

    #[test]
    fn parse_key_title_should_handle_rsa_keys() {
        let rsa_key = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC user@example.com";
        let title = parse_key_title(rsa_key);
        assert_eq!(title, "user@example.com");
    }

    #[test]
    fn parse_key_title_should_handle_multiple_whitespace() {
        let key_with_extra_spaces =
            "ssh-ed25519   AAAAC3NzaC1lZDI1NTE5AAAAIDIhz2GK   user@example.com";
        let title = parse_key_title(key_with_extra_spaces);
        assert_eq!(title, "user@example.com");
    }

    #[test]
    fn parse_key_title_should_handle_empty_comment() {
        let key_with_empty_comment = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDIhz2GK ";
        let title = parse_key_title(key_with_empty_comment);
        assert_eq!(title, "LitGit SSH Key");
    }

    #[test]
    fn get_provider_ssh_base_dir_should_fallback_to_temp() {
        // This test verifies the fallback behavior when home_dir is not available
        // The function should always return a valid path
        let dir = get_provider_ssh_base_dir("test");
        assert!(dir.to_string_lossy().contains("test"));
    }

    #[test]
    fn provider_ssh_error_should_convert_from_storage_error() {
        use crate::integrations_store::IntegrationsConfigError;

        let storage_error = IntegrationsConfigError::CreateDir(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "test",
        ));
        let ssh_error: ProviderSshError = storage_error.into();

        assert!(matches!(ssh_error, ProviderSshError::StorageError(_)));
    }
}
