//! Askpass prompt broker for Git authentication.
//!
//! This module provides types and commands for handling Git authentication prompts
//! between the askpass helper and the frontend UI.

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tauri::State;

use crate::askpass_state::GitAuthBrokerState;
use crate::integrations_store::{load_integrations_config, resolve_provider_access_token};

/// Payload sent to the frontend when a Git authentication prompt is needed.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitAuthPromptPayload {
    pub(crate) session_id: String,
    pub(crate) prompt_id: String,
    pub(crate) operation: String,
    pub(crate) prompt: String,
    pub(crate) host: Option<String>,
    pub(crate) username: Option<String>,
    pub(crate) kind: String,
    pub(crate) allow_remember: bool,
}

/// Input received from the frontend when submitting a prompt response.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SubmitGitAuthPromptResponseInput {
    pub(crate) session_id: String,
    pub(crate) prompt_id: String,
    pub(crate) username: Option<String>,
    pub(crate) secret: Option<String>,
    pub(crate) remember: bool,
    pub(crate) cancelled: bool,
}

#[derive(Debug, PartialEq, Eq)]
struct ResolvedPromptResponse {
    username: Option<String>,
    secret: Option<String>,
}

#[cfg(test)]
fn validate_prompt_response_input(input: &SubmitGitAuthPromptResponseInput) -> Result<(), String> {
    if input.cancelled || input.username.is_some() || input.secret.is_some() {
        return Ok(());
    }

    Err("Authentication response must include a username or secret when not cancelled".to_string())
}

fn normalize_optional_input(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|trimmed| !trimmed.is_empty())
        .map(ToOwned::to_owned)
}

fn provider_key_from_host(host: &str) -> Option<&'static str> {
    let normalized = host.trim().to_ascii_lowercase();
    if normalized.contains("github.com") || normalized.contains("github") {
        Some("github")
    } else if normalized.contains("gitlab.com") || normalized.contains("gitlab") {
        Some("gitlab")
    } else if normalized.contains("bitbucket.org") || normalized.contains("bitbucket") {
        Some("bitbucket")
    } else {
        None
    }
}

fn resolve_provider_username(
    provider_key: &str,
    prompt_username: Option<&str>,
    profile_username: Option<&str>,
) -> String {
    match provider_key {
        "gitlab" => "oauth2".to_string(),
        "bitbucket" => "x-token-auth".to_string(),
        "github" => prompt_username
            .filter(|value| !value.trim().is_empty())
            .or(profile_username.filter(|value| !value.trim().is_empty()))
            .unwrap_or("git")
            .to_string(),
        _ => prompt_username
            .or(profile_username)
            .unwrap_or("git")
            .to_string(),
    }
}

fn resolve_oauth_prompt_response(
    state: &GitAuthBrokerState,
    session_id: &str,
    prompt_id: &str,
) -> Result<ResolvedPromptResponse, String> {
    let context = state
        .get_prompt_context(session_id, prompt_id)
        .ok_or_else(|| {
            "Authentication response must include a username or secret when not cancelled"
                .to_string()
        })?;

    let kind = classify_prompt_kind(&context.prompt);
    if !matches!(kind, "https-username" | "https-password") {
        return Err(
            "Authentication response must include a username or secret when not cancelled"
                .to_string(),
        );
    }

    let host = context.host.as_deref().ok_or_else(|| {
        "Authentication response must include a username or secret when not cancelled".to_string()
    })?;
    let provider_key = provider_key_from_host(host).ok_or_else(|| {
        "Authentication response must include a username or secret when not cancelled".to_string()
    })?;

    let config = load_integrations_config()
        .map_err(|error| format!("Failed to load integrations config: {error}"))?;
    let provider = config.providers.get(provider_key).ok_or_else(|| {
        "Authentication response must include a username or secret when not cancelled".to_string()
    })?;
    let token = resolve_provider_access_token(&config, provider_key).ok_or_else(|| {
        "Authentication response must include a username or secret when not cancelled".to_string()
    })?;
    let username = resolve_provider_username(
        provider_key,
        context.username.as_deref(),
        provider
            .profile
            .as_ref()
            .and_then(|profile| profile.username.as_deref()),
    );

    Ok(match kind {
        "https-username" => ResolvedPromptResponse {
            username: Some(username),
            secret: None,
        },
        "https-password" => ResolvedPromptResponse {
            username: Some(username),
            secret: Some(token.to_string()),
        },
        _ => unreachable!("non-https prompt kinds are filtered above"),
    })
}

fn resolve_prompt_response(
    input: &SubmitGitAuthPromptResponseInput,
    state: &GitAuthBrokerState,
) -> Result<ResolvedPromptResponse, String> {
    let username = normalize_optional_input(input.username.as_deref());
    let secret = normalize_optional_input(input.secret.as_deref());

    if input.cancelled || username.is_some() || secret.is_some() {
        return Ok(ResolvedPromptResponse { username, secret });
    }

    resolve_oauth_prompt_response(state, &input.session_id, &input.prompt_id).map_err(|_| {
        "Authentication response must include a username or secret when not cancelled".to_string()
    })
}

/// Classifies a prompt string into a specific authentication kind.
///
/// # Arguments
///
/// * `prompt` - The prompt text from Git/SSH
///
/// # Returns
///
/// Returns a string identifying the prompt type:
/// - `"ssh-passphrase"` - SSH key passphrase prompts
/// - `"https-password"` - HTTPS password prompts
/// - `"https-username"` - HTTPS username prompts
/// - `"ssh-password"` - SSH password prompts (fallback)
pub(crate) fn classify_prompt_kind(prompt: &str) -> &'static str {
    let normalized = prompt.to_ascii_lowercase();
    let is_http_prompt = normalized.contains("https://") || normalized.contains("http://");

    if normalized.contains("passphrase") {
        "ssh-passphrase"
    } else if normalized.contains("password") && is_http_prompt {
        "https-password"
    } else if normalized.contains("username") && is_http_prompt {
        "https-username"
    } else if normalized.contains("password") {
        "ssh-password"
    } else {
        "https-password"
    }
}

/// Determines if the "remember" option should be shown for a given prompt kind.
///
/// Remember is only allowed for HTTPS authentication types.
///
/// # Arguments
///
/// * `kind` - The prompt kind as returned by `classify_prompt_kind`
///
/// # Returns
///
/// Returns `true` if the remember checkbox should be shown, `false` otherwise.
pub(crate) fn allow_remember_for_kind(kind: &str) -> bool {
    matches!(kind, "https-username" | "https-password")
}

/// Emits a Git authentication prompt event to the frontend.
///
/// # Arguments
///
/// * `app` - The Tauri app handle
/// * `payload` - The prompt payload containing session and prompt details
///
/// # Returns
///
/// Returns `Ok(())` on success, or an error string if emission fails.
pub(crate) fn emit_git_auth_prompt(
    app: &tauri::AppHandle,
    payload: &GitAuthPromptPayload,
) -> Result<(), String> {
    app.emit("git-auth-prompt", payload)
        .map_err(|error| format!("Failed to emit git auth prompt: {error}"))
}

/// Tauri command to submit a response to a Git authentication prompt.
///
/// This is called by the frontend when the user submits their credentials.
#[tauri::command]
pub(crate) fn submit_git_auth_prompt_response(
    state: State<'_, GitAuthBrokerState>,
    input: SubmitGitAuthPromptResponseInput,
) -> Result<(), String> {
    let response = resolve_prompt_response(&input, &state)?;

    state.store_prompt_response(
        &input.session_id,
        &input.prompt_id,
        response.username.as_deref(),
        response.secret.as_deref(),
        input.remember,
        input.cancelled,
    )
}

/// Tauri command to cancel a Git authentication prompt.
///
/// This is called by the frontend when the user cancels the authentication dialog.
#[tauri::command]
pub(crate) fn cancel_git_auth_prompt(
    state: State<'_, GitAuthBrokerState>,
    session_id: String,
    prompt_id: String,
) -> Result<(), String> {
    state.store_prompt_response(&session_id, &prompt_id, None, None, false, true)
}

#[cfg(test)]
mod tests {
    use crate::integrations_store::{
        save_integrations_config, IntegrationsConfig, ProviderConfig, ProviderProfile, StoredToken,
    };

    use super::{
        allow_remember_for_kind, classify_prompt_kind, resolve_prompt_response,
        validate_prompt_response_input, SubmitGitAuthPromptResponseInput,
    };
    use std::collections::HashMap;
    use std::path::PathBuf;
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

    fn save_provider_token(provider: &str, username: Option<&str>, token: &str) {
        let mut providers = HashMap::new();
        providers.insert(
            provider.to_string(),
            ProviderConfig {
                oauth_token: Some(StoredToken {
                    access_token: token.to_string(),
                    refresh_token: None,
                    expires_at: None,
                    scope: "repository".to_string(),
                }),
                profile: Some(ProviderProfile {
                    username: username.map(ToOwned::to_owned),
                    display_name: None,
                    avatar_url: None,
                    emails: vec![],
                }),
                ssh_key: None,
                use_system_agent: true,
            },
        );

        save_integrations_config(&IntegrationsConfig {
            profile_id: "test-profile".to_string(),
            providers,
        })
        .expect("should save integrations config");
    }

    #[test]
    fn classify_prompt_kind_detects_https_password() {
        assert_eq!(
            classify_prompt_kind("Password for 'https://example.com':"),
            "https-password"
        );
    }

    #[test]
    fn classify_prompt_kind_detects_http_password() {
        assert_eq!(
            classify_prompt_kind("Password for 'http://example.com':"),
            "https-password"
        );
    }

    #[test]
    fn classify_prompt_kind_detects_http_username() {
        assert_eq!(
            classify_prompt_kind("Username for 'http://example.com':"),
            "https-username"
        );
    }

    #[test]
    fn classify_prompt_kind_detects_ssh_passphrase() {
        assert_eq!(
            classify_prompt_kind("Enter passphrase for key '/tmp/id_ed25519':"),
            "ssh-passphrase"
        );
    }

    #[test]
    fn allow_remember_is_https_only() {
        assert!(allow_remember_for_kind("https-password"));
        assert!(!allow_remember_for_kind("ssh-passphrase"));
    }

    #[test]
    fn validate_prompt_response_input_rejects_empty_non_cancelled_response() {
        let input = SubmitGitAuthPromptResponseInput {
            session_id: "session".to_string(),
            prompt_id: "prompt".to_string(),
            username: None,
            secret: None,
            remember: false,
            cancelled: false,
        };

        assert!(validate_prompt_response_input(&input).is_err());
    }

    #[test]
    fn validate_prompt_response_input_allows_cancelled_empty_response() {
        let input = SubmitGitAuthPromptResponseInput {
            session_id: "session".to_string(),
            prompt_id: "prompt".to_string(),
            username: None,
            secret: None,
            remember: false,
            cancelled: true,
        };

        assert!(validate_prompt_response_input(&input).is_ok());
    }

    #[test]
    fn resolve_prompt_response_autofills_github_credentials_when_oauth_connected() {
        run_with_temp_home("askpass-github-autofill", || {
            save_provider_token("github", Some("octocat"), "gho_test_token");

            let state = crate::askpass_state::GitAuthBrokerState::default();
            let session = state.create_session("push").expect("session");
            let prompt_id = state
                .queue_prompt(
                    &session.session_id,
                    "Password for 'https://github.com/octo/repo.git':",
                    Some("github.com"),
                    None,
                )
                .expect("prompt should queue");
            let input = SubmitGitAuthPromptResponseInput {
                session_id: session.session_id,
                prompt_id,
                username: None,
                secret: None,
                remember: true,
                cancelled: false,
            };

            let response = resolve_prompt_response(&input, &state).expect("prompt should resolve");

            assert_eq!(response.username.as_deref(), Some("octocat"));
            assert_eq!(response.secret.as_deref(), Some("gho_test_token"));
        });
    }

    #[test]
    fn resolve_prompt_response_uses_documented_gitlab_oauth_username() {
        run_with_temp_home("askpass-gitlab-autofill", || {
            save_provider_token("gitlab", Some("octocat"), "glpat_test_token");

            let state = crate::askpass_state::GitAuthBrokerState::default();
            let session = state.create_session("pull").expect("session");
            let prompt_id = state
                .queue_prompt(
                    &session.session_id,
                    "Password for 'https://gitlab.com/group/repo.git':",
                    Some("gitlab.com"),
                    None,
                )
                .expect("prompt should queue");
            let input = SubmitGitAuthPromptResponseInput {
                session_id: session.session_id,
                prompt_id,
                username: None,
                secret: None,
                remember: true,
                cancelled: false,
            };

            let response = resolve_prompt_response(&input, &state).expect("prompt should resolve");

            assert_eq!(response.username.as_deref(), Some("oauth2"));
            assert_eq!(response.secret.as_deref(), Some("glpat_test_token"));
        });
    }

    #[test]
    fn resolve_prompt_response_uses_documented_bitbucket_oauth_username() {
        run_with_temp_home("askpass-bitbucket-autofill", || {
            save_provider_token("bitbucket", Some("octocat"), "bb_test_token");

            let state = crate::askpass_state::GitAuthBrokerState::default();
            let session = state.create_session("fetch").expect("session");
            let prompt_id = state
                .queue_prompt(
                    &session.session_id,
                    "Password for 'https://bitbucket.org/workspace/repo.git':",
                    Some("bitbucket.org"),
                    None,
                )
                .expect("prompt should queue");
            let input = SubmitGitAuthPromptResponseInput {
                session_id: session.session_id,
                prompt_id,
                username: None,
                secret: None,
                remember: true,
                cancelled: false,
            };

            let response = resolve_prompt_response(&input, &state).expect("prompt should resolve");

            assert_eq!(response.username.as_deref(), Some("x-token-auth"));
            assert_eq!(response.secret.as_deref(), Some("bb_test_token"));
        });
    }

    #[test]
    fn resolve_prompt_response_rejects_empty_non_cancelled_response_without_credentials() {
        run_with_temp_home("askpass-no-autofill", || {
            let state = crate::askpass_state::GitAuthBrokerState::default();
            let session = state.create_session("push").expect("session");
            let prompt_id = state
                .queue_prompt(
                    &session.session_id,
                    "Password for 'https://unknown.example.com/repo.git':",
                    Some("unknown.example.com"),
                    None,
                )
                .expect("prompt should queue");
            let input = SubmitGitAuthPromptResponseInput {
                session_id: session.session_id,
                prompt_id,
                username: None,
                secret: None,
                remember: false,
                cancelled: false,
            };

            let error = resolve_prompt_response(&input, &state)
                .expect_err("empty response without autofill should fail");

            assert_eq!(
                error,
                "Authentication response must include a username or secret when not cancelled"
            );
        });
    }
}
