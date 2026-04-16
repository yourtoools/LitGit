//! OAuth 2.0 flow handling for GitHub, GitLab, and Bitbucket.
//!
//! Implements PKCE (Proof Key for Code Exchange) for secure authorization
//! and state parameter for CSRF protection.

use crate::integrations_store::{
    disconnect_provider as disconnect_provider_store, get_all_provider_status,
    load_integrations_config, resolve_provider_access_token, save_integrations_config,
    IntegrationsConfig, ProviderDisplayStatus, ProviderProfile, StoredToken,
};
use base64::Engine;
use chrono::Utc;
use rand::Rng;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Read;
use std::net::TcpListener as StdTcpListener;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use thiserror::Error;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use ureq::http;

/// Errors that can occur during OAuth operations.
#[derive(Error, Debug)]
pub(crate) enum OAuthError {
    /// Invalid provider name.
    #[error("Unknown OAuth provider: {0}")]
    UnknownProvider(String),

    /// Flow expired or invalid state.
    #[error("OAuth flow has expired or is invalid")]
    FlowExpired,

    /// Invalid state parameter (CSRF check failed).
    #[error("Invalid state parameter")]
    InvalidState,

    /// Failed to exchange code for token.
    #[error("Token exchange failed: {0}")]
    TokenExchangeFailed(String),

    /// Failed to fetch user info.
    #[error("Failed to fetch user info: {0}")]
    UserInfoFetchFailed(String),

    /// Required OAuth credentials are missing for a provider.
    #[error("Missing OAuth configuration for provider '{provider}': set {variable}")]
    MissingProviderConfiguration { provider: String, variable: String },

    /// Failed to start or use the local OAuth callback server.
    #[error("Local OAuth callback server failed: {0}")]
    CallbackServerFailed(String),

    /// Storage operation failed.
    #[error("Storage error: {0}")]
    StorageError(#[from] crate::integrations_store::IntegrationsConfigError),
}

/// Supported OAuth providers.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub(crate) enum OAuthProvider {
    /// GitHub.com
    GitHub,
    /// GitLab.com
    GitLab,
    /// Bitbucket.org
    Bitbucket,
}

impl OAuthProvider {
    /// Returns the authorization URL for this provider.
    pub(crate) const fn auth_url(&self) -> &'static str {
        match self {
            Self::GitHub => "https://github.com/login/oauth/authorize",
            Self::GitLab => "https://gitlab.com/oauth/authorize",
            Self::Bitbucket => "https://bitbucket.org/site/oauth2/authorize",
        }
    }

    /// Returns the token exchange URL for this provider.
    pub(crate) const fn token_url(&self) -> &'static str {
        match self {
            Self::GitHub => "https://github.com/login/oauth/access_token",
            Self::GitLab => "https://gitlab.com/oauth/token",
            Self::Bitbucket => "https://bitbucket.org/site/oauth2/access_token",
        }
    }

    /// Returns the required OAuth scopes for this provider.
    pub(crate) const fn scopes(&self) -> &'static str {
        match self {
            // write:public_key is required to add SSH keys via the API
            Self::GitHub => "repo read:user read:org write:public_key",
            // api scope includes SSH key management
            Self::GitLab => "api read_repository write_repository read_user",
            Self::Bitbucket => "repositories:read repositories:write account:read",
        }
    }

    /// Returns the API base URL for this provider.
    pub(crate) const fn api_base_url(&self) -> &'static str {
        match self {
            Self::GitHub => "https://api.github.com",
            Self::GitLab => "https://gitlab.com/api/v4",
            Self::Bitbucket => "https://api.bitbucket.org/2.0",
        }
    }

    /// Returns a provider API URL for the given path suffix.
    pub(crate) fn api_url(&self, path: &str) -> String {
        format!("{}/{}", self.api_base_url(), path.trim_start_matches('/'))
    }

    /// Returns the provider name as a string.
    pub(crate) const fn as_str(&self) -> &'static str {
        match self {
            Self::GitHub => "github",
            Self::GitLab => "gitlab",
            Self::Bitbucket => "bitbucket",
        }
    }

    /// Returns the provider display name.
    pub(crate) const fn display_name(&self) -> &'static str {
        match self {
            Self::GitHub => "GitHub",
            Self::GitLab => "GitLab",
            Self::Bitbucket => "Bitbucket",
        }
    }
}

impl FromStr for OAuthProvider {
    type Err = OAuthError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "github" => Ok(Self::GitHub),
            "gitlab" => Ok(Self::GitLab),
            "bitbucket" => Ok(Self::Bitbucket),
            _ => Err(OAuthError::UnknownProvider(s.to_string())),
        }
    }
}

/// PKCE verifier for secure OAuth flows.
#[derive(Clone, Debug)]
pub(crate) struct PkceVerifier {
    /// The PKCE code verifier (128 random characters).
    code: String,
}

impl PkceVerifier {
    /// Generates a new random PKCE verifier.
    pub(crate) fn generate() -> Self {
        const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        let mut rng = rand::thread_rng();
        let code: String = (0..128)
            .map(|_| CHARSET[rng.gen_range(0..CHARSET.len())] as char)
            .collect();
        Self { code }
    }

    /// Returns the code challenge (SHA256 hash of verifier, Base64URL encoded).
    pub(crate) fn challenge(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(self.code.as_bytes());
        let result = hasher.finalize();
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(result)
    }

    /// Returns the code verifier string.
    pub(crate) fn verifier(&self) -> &str {
        &self.code
    }
}

/// OAuth state for CSRF protection and flow tracking.
#[derive(Clone, Debug)]
pub(crate) struct OAuthFlow {
    /// Random state string for CSRF protection.
    pub(crate) state: String,
    /// PKCE verifier for this flow.
    pub(crate) pkce_verifier: PkceVerifier,
    /// Which provider this flow is for.
    pub(crate) provider: OAuthProvider,
    /// The redirect URI registered with the provider for this flow.
    pub(crate) redirect_uri: String,
    /// When this flow was created.
    pub(crate) created_at: std::time::Instant,
}

impl OAuthFlow {
    /// Generates a new OAuth flow with random state parameter and PKCE verifier.
    pub(crate) fn generate(provider: OAuthProvider, redirect_uri: String) -> Self {
        const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let mut rng = rand::thread_rng();
        let state: String = (0..32)
            .map(|_| CHARSET[rng.gen_range(0..CHARSET.len())] as char)
            .collect();

        Self {
            state,
            pkce_verifier: PkceVerifier::generate(),
            provider,
            redirect_uri,
            created_at: std::time::Instant::now(),
        }
    }

    /// Checks if this flow is expired (older than 10 minutes).
    pub(crate) fn is_expired(&self) -> bool {
        self.created_at.elapsed().as_secs() > 600
    }
}

/// OAuth token response from the provider.
#[derive(Clone, Debug, serde::Deserialize)]
pub(crate) struct OAuthToken {
    /// The access token for API requests.
    pub(crate) access_token: String,
    /// Refresh token for obtaining new access tokens.
    pub(crate) refresh_token: Option<String>,
    /// Seconds until the access token expires.
    pub(crate) expires_in: Option<u64>,
    /// OAuth scopes granted.
    pub(crate) scope: String,
}

/// User information from the provider.
#[derive(Clone, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderUserInfo {
    /// Username/handle.
    pub(crate) username: String,
    /// Display name.
    pub(crate) display_name: String,
    /// Avatar URL if available.
    pub(crate) avatar_url: Option<String>,
    /// Known email addresses for this account.
    pub(crate) emails: Vec<String>,
}

/// Provider connection status (re-exported from integrations_store).
pub(crate) type ProviderStatus = ProviderDisplayStatus;

/// In-memory store for active OAuth flows.
pub(crate) struct OAuthFlowManager {
    /// Map of state strings to active flows.
    flows: Mutex<HashMap<String, OAuthFlow>>,
}

impl OAuthFlowManager {
    /// Creates a new flow manager.
    pub(crate) fn new() -> Self {
        Self {
            flows: Mutex::new(HashMap::new()),
        }
    }

    fn start_flow_with_redirect_uri(
        &self,
        provider: OAuthProvider,
        redirect_uri: String,
    ) -> Result<(String, String), OAuthError> {
        let auth_url_base = provider.auth_url().to_string();
        let scopes = provider.scopes().to_string();
        let client_id = get_client_id(&provider)?;
        let flow = OAuthFlow::generate(provider, redirect_uri.clone());
        let state_string = flow.state.clone();
        let challenge = flow.pkce_verifier.challenge();

        {
            let mut flows = self.flows.lock().map_err(|_| OAuthError::InvalidState)?;
            flows.insert(state_string.clone(), flow);
        }

        let auth_url = format!(
            "{}?client_id={}&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256&response_type=code",
            auth_url_base,
            client_id,
            urlencoding::encode(&redirect_uri),
            urlencoding::encode(&scopes),
            state_string,
            challenge
        );

        Ok((auth_url, state_string))
    }

    /// Starts a new OAuth flow and returns the authorization URL.
    ///
    /// The returned state string must be validated when the callback is received.
    pub(crate) fn start_flow<R: tauri::Runtime>(
        &self,
        provider: OAuthProvider,
        app_handle: tauri::AppHandle<R>,
    ) -> Result<(String, String), OAuthError> {
        let provider_for_server = provider.clone();
        let (listener, redirect_uri) = bind_loopback_callback_listener()?;
        let (auth_url, state) =
            self.start_flow_with_redirect_uri(provider, redirect_uri.clone())?;

        spawn_loopback_callback_listener(listener, app_handle, provider_for_server, redirect_uri);

        Ok((auth_url, state))
    }

    /// Completes an OAuth flow by exchanging the code for a token.
    ///
    /// Returns the token and user info on success.
    pub(crate) fn complete_flow(
        &self,
        code: &str,
        state: &str,
    ) -> Result<(OAuthToken, ProviderUserInfo), OAuthError> {
        let flow = {
            let mut flows = self.flows.lock().map_err(|_| OAuthError::InvalidState)?;
            flows.remove(state).ok_or(OAuthError::InvalidState)?
        };

        if flow.is_expired() {
            return Err(OAuthError::FlowExpired);
        }

        let token = exchange_code_for_token(
            &flow.provider,
            code,
            &flow.pkce_verifier,
            &flow.redirect_uri,
        )?;
        let user_info = fetch_user_info(&flow.provider, &token.access_token)?;
        save_provider_token(
            &flow.provider,
            StoredToken {
                access_token: token.access_token.clone(),
                refresh_token: token.refresh_token.clone(),
                expires_at: token
                    .expires_in
                    .map(|secs| Utc::now() + chrono::Duration::seconds(secs as i64)),
                scope: token.scope.clone(),
            },
            &user_info,
        )?;

        Ok((token, user_info))
    }
}

impl Default for OAuthFlowManager {
    fn default() -> Self {
        Self::new()
    }
}

/// A callback staged by the loopback browser callback handler until the desktop deep-link confirms it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct PendingOAuthCallback {
    /// Provider that initiated the flow.
    pub(crate) provider: OAuthProvider,
    /// CSRF state tied to the flow.
    pub(crate) state: String,
    /// Raw authorization code returned by the provider.
    pub(crate) code: String,
    /// Browser callback URL for display and diagnostics.
    pub(crate) callback_url: String,
    /// Time the callback was staged.
    pub(crate) created_at: std::time::Instant,
}

/// A handoff token entry for single-use OAuth callback redemption.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct PendingOAuthHandoff {
    /// Provider that initiated the flow.
    pub(crate) provider: OAuthProvider,
    /// CSRF state tied to the flow.
    pub(crate) state: String,
    /// Time the handoff was created.
    pub(crate) created_at: std::time::Instant,
}

impl PendingOAuthHandoff {
    /// Checks if this handoff is expired (older than 90 seconds).
    fn is_expired(&self) -> bool {
        self.created_at.elapsed() >= Duration::from_secs(90)
    }
}

/// In-memory store for loopback callbacks that still need deep-link confirmation.
pub(crate) struct PendingOAuthCallbackManager {
    callbacks: Mutex<HashMap<String, PendingOAuthCallback>>,
}

/// In-memory store for handoff tokens that can be redeemed for staged callbacks.
pub(crate) struct PendingOAuthHandoffManager {
    handoffs: Mutex<HashMap<String, PendingOAuthHandoff>>,
}

impl PendingOAuthHandoffManager {
    /// Creates a new handoff manager.
    pub(crate) fn new() -> Self {
        Self {
            handoffs: Mutex::new(HashMap::new()),
        }
    }

    /// Issues a new handoff token for the given provider and state.
    /// Returns the opaque token string (base64url-encoded random bytes).
    ///
    /// # Errors
    /// Returns `OAuthError::StorageError` if the internal lock is poisoned.
    pub(crate) fn issue_token(
        &self,
        provider: OAuthProvider,
        state: String,
    ) -> Result<String, OAuthError> {
        self.prune_expired_tokens();

        // Generate 32 random bytes using thread_rng for better performance
        let mut rng = rand::thread_rng();
        let random_bytes: Vec<u8> = (0..32).map(|_| rng.gen::<u8>()).collect();
        let token = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&random_bytes);

        let mut handoffs = self.handoffs.lock().map_err(|_| {
            OAuthError::CallbackServerFailed("handoff token storage lock poisoned".to_string())
        })?;

        handoffs.insert(
            token.clone(),
            PendingOAuthHandoff {
                provider,
                state,
                created_at: Instant::now(),
            },
        );

        Ok(token)
    }

    /// Redeems a handoff token, returning the pending handoff if valid.
    /// This is single-use: the token is removed after redemption.
    pub(crate) fn redeem_token(&self, token: &str) -> Option<PendingOAuthHandoff> {
        self.prune_expired_tokens();

        let mut handoffs = self.handoffs.lock().ok()?;
        let handoff = handoffs.get(token)?;

        if handoff.is_expired() {
            handoffs.remove(token);
            return None;
        }

        handoffs.remove(token)
    }

    /// Removes expired handoff tokens (older than 90 seconds).
    pub(crate) fn prune_expired_tokens(&self) {
        if let Ok(mut handoffs) = self.handoffs.lock() {
            handoffs.retain(|_, handoff| !handoff.is_expired());
        }
    }
}

impl Default for PendingOAuthHandoffManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PendingOAuthCallbackManager {
    /// Creates a new pending callback manager.
    pub(crate) fn new() -> Self {
        Self {
            callbacks: Mutex::new(HashMap::new()),
        }
    }

    /// Stages a callback until the desktop deep-link confirms it.
    pub(crate) fn stage_callback(
        &self,
        provider: OAuthProvider,
        state: String,
        code: String,
        callback_url: String,
    ) {
        self.prune_expired_callbacks();

        if let Ok(mut callbacks) = self.callbacks.lock() {
            callbacks.insert(
                state.clone(),
                PendingOAuthCallback {
                    provider,
                    state,
                    code,
                    callback_url,
                    created_at: std::time::Instant::now(),
                },
            );
        } else {
            log::warn!(
                "Ignoring staged OAuth callback because the pending callback lock was poisoned"
            );
        }
    }

    /// Removes expired staged callbacks.
    pub(crate) fn prune_expired_callbacks(&self) {
        if let Ok(mut callbacks) = self.callbacks.lock() {
            callbacks.retain(|_, callback| !callback.is_expired());
        } else {
            log::warn!(
                "Ignoring expired OAuth callback pruning because the pending callback lock was poisoned"
            );
        }
    }

    /// Removes a staged callback after a successful manual completion.
    pub(crate) fn consume_completed_callback(
        &self,
        state: &str,
        code: &str,
    ) -> Option<PendingOAuthCallback> {
        let mut callbacks = self.callbacks.lock().ok()?;
        let pending = callbacks.get(state)?;
        if pending.is_expired() {
            callbacks.remove(state);
            return None;
        }

        if pending.code != code {
            return None;
        }

        callbacks.remove(state)
    }

    /// Retrieves a staged callback by state only (for handoff token redemption).
    pub(crate) fn get_callback_by_state(&self, state: &str) -> Option<PendingOAuthCallback> {
        let mut callbacks = self.callbacks.lock().ok()?;
        let pending = callbacks.get(state)?;
        if pending.is_expired() {
            callbacks.remove(state);
            return None;
        }
        callbacks.remove(state)
    }
}

impl Default for PendingOAuthCallbackManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PendingOAuthCallback {
    fn is_expired(&self) -> bool {
        self.created_at.elapsed() >= Duration::from_secs(OAUTH_CALLBACK_TIMEOUT_SECONDS)
    }
}

static OAUTH_ENV_LOADER: OnceLock<()> = OnceLock::new();

fn load_oauth_env_if_available() {
    OAUTH_ENV_LOADER.get_or_init(|| {
        for env_path in oauth_env_candidate_paths() {
            if !env_path.is_file() {
                continue;
            }

            match dotenvy::from_path_override(&env_path) {
                Ok(()) => {
                    log::info!(
                        "Loaded OAuth environment variables from {}",
                        env_path.display()
                    );
                    return;
                }
                Err(error) => {
                    log::warn!(
                        "Failed to load OAuth environment variables from {}: {}",
                        env_path.display(),
                        error
                    );
                }
            }
        }
    });
}

fn oauth_env_candidate_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(current_dir) = std::env::current_dir() {
        paths.push(current_dir.join(".env"));
        paths.push(current_dir.join("apps/desktop/.env"));
        paths.push(current_dir.join("../.env"));
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(executable_dir) = current_exe.parent() {
            paths.push(executable_dir.join(".env"));
            paths.push(executable_dir.join("../.env"));
        }
    }

    paths.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.env"));
    paths
}

fn provider_client_id_var(provider: &OAuthProvider) -> &'static str {
    match provider {
        OAuthProvider::GitHub => "GITHUB_CLIENT_ID",
        OAuthProvider::GitLab => "GITLAB_CLIENT_ID",
        OAuthProvider::Bitbucket => "BITBUCKET_CLIENT_ID",
    }
}

fn provider_client_secret_var(provider: &OAuthProvider) -> &'static str {
    match provider {
        OAuthProvider::GitHub => "GITHUB_CLIENT_SECRET",
        OAuthProvider::GitLab => "GITLAB_CLIENT_SECRET",
        OAuthProvider::Bitbucket => "BITBUCKET_CLIENT_SECRET",
    }
}

fn get_required_provider_env(
    provider: &OAuthProvider,
    variable: &'static str,
) -> Result<String, OAuthError> {
    load_oauth_env_if_available();

    std::env::var(variable)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| OAuthError::MissingProviderConfiguration {
            provider: provider.as_str().to_string(),
            variable: variable.to_string(),
        })
}

/// Gets the OAuth client ID for a provider from environment.
fn get_client_id(provider: &OAuthProvider) -> Result<String, OAuthError> {
    get_required_provider_env(provider, provider_client_id_var(provider))
}

/// Gets the OAuth client secret for a provider from environment.
fn get_client_secret(provider: &OAuthProvider) -> Result<String, OAuthError> {
    get_required_provider_env(provider, provider_client_secret_var(provider))
}

/// Exchanges an authorization code for an access token.
fn exchange_code_for_token(
    provider: &OAuthProvider,
    code: &str,
    pkce_verifier: &PkceVerifier,
    redirect_uri: &str,
) -> Result<OAuthToken, OAuthError> {
    let params = match provider {
        OAuthProvider::GitHub | OAuthProvider::GitLab => {
            let client_id = get_client_id(provider)?;
            let client_secret = get_client_secret(provider)?;
            format!(
                "client_id={}&client_secret={}&code={}&redirect_uri={}&grant_type=authorization_code&code_verifier={}",
                client_id,
                client_secret,
                code,
                urlencoding::encode(redirect_uri),
                pkce_verifier.verifier()
            )
        }
        OAuthProvider::Bitbucket => {
            // Bitbucket uses basic auth with client_id:client_secret
            format!(
                "grant_type=authorization_code&code={}&redirect_uri={}",
                code,
                urlencoding::encode(redirect_uri)
            )
        }
    };

    let mut request = http::Request::post(provider.token_url())
        .header("Accept", "application/json")
        .header("User-Agent", "LitGit");

    // Bitbucket requires basic auth header
    if matches!(provider, OAuthProvider::Bitbucket) {
        let client_id = get_client_id(provider)?;
        let client_secret = get_client_secret(provider)?;
        let credentials = format!("{}:{}", client_id, client_secret);
        let encoded = base64::engine::general_purpose::STANDARD.encode(credentials);
        request = request.header("Authorization", format!("Basic {encoded}"));
    }

    let config = ureq::config::Config::builder()
        .http_status_as_error(false)
        .build();
    let agent = ureq::Agent::new_with_config(config);

    let request = request
        .body(params)
        .map_err(|e| OAuthError::TokenExchangeFailed(e.to_string()))?;

    let response = agent
        .run(request)
        .map_err(|e| OAuthError::TokenExchangeFailed(e.to_string()))?;

    let mut body = String::new();
    response
        .into_body()
        .into_reader()
        .read_to_string(&mut body)
        .map_err(|e| OAuthError::TokenExchangeFailed(e.to_string()))?;

    serde_json::from_str(&body).map_err(|e| OAuthError::TokenExchangeFailed(e.to_string()))
}

fn normalize_profile_field(value: &str) -> Option<String> {
    let trimmed_value = value.trim();
    if trimmed_value.is_empty() {
        return None;
    }

    Some(trimmed_value.to_string())
}

fn save_provider_token(
    provider: &OAuthProvider,
    token: StoredToken,
    user_info: &ProviderUserInfo,
) -> Result<(), OAuthError> {
    let mut config = load_integrations_config()?;
    let provider_key = provider.as_str().to_string();
    let provider_config = config.providers.entry(provider_key).or_default();
    provider_config.oauth_token = Some(token);
    provider_config.profile = Some(ProviderProfile {
        username: normalize_profile_field(&user_info.username),
        display_name: normalize_profile_field(&user_info.display_name),
        avatar_url: user_info.avatar_url.clone(),
        emails: user_info.emails.clone(),
    });
    save_integrations_config(&config)?;
    Ok(())
}

fn hydrate_provider_profiles_with(
    config: &mut IntegrationsConfig,
    mut fetcher: impl FnMut(&OAuthProvider, &str) -> Result<ProviderUserInfo, OAuthError>,
) -> Result<bool, OAuthError> {
    let mut updated = false;

    for provider in [
        OAuthProvider::GitHub,
        OAuthProvider::GitLab,
        OAuthProvider::Bitbucket,
    ] {
        let provider_key = provider.as_str();
        let Some(provider_config) = config.providers.get(provider_key) else {
            continue;
        };

        // Skip if no token. Also skip if profile is fully populated (has emails).
        // Re-fetch when profile is missing OR has empty emails (needs backfill).
        let needs_profile = provider_config.profile.is_none();
        let needs_email_backfill = provider_config
            .profile
            .as_ref()
            .is_some_and(|profile| profile.emails.is_empty());

        if provider_config.oauth_token.is_none() || !(needs_profile || needs_email_backfill) {
            continue;
        }

        let Some(token) = resolve_provider_access_token(config, provider_key) else {
            continue;
        };

        // Try to fetch user info, but don't fail the entire operation if one provider fails
        match fetcher(&provider, &token) {
            Ok(user_info) => {
                let Some(provider_config) = config.providers.get_mut(provider_key) else {
                    continue;
                };
                provider_config.profile = Some(ProviderProfile {
                    username: normalize_profile_field(&user_info.username),
                    display_name: normalize_profile_field(&user_info.display_name),
                    avatar_url: user_info.avatar_url,
                    emails: user_info.emails,
                });
                updated = true;
            }
            Err(e) => {
                log::warn!("Failed to hydrate profile for {}: {}", provider.as_str(), e);
                // Continue with other providers instead of failing entirely
            }
        }
    }

    Ok(updated)
}

/// Fetches user information from the provider API.
pub(crate) fn fetch_user_info(
    provider: &OAuthProvider,
    token: &str,
) -> Result<ProviderUserInfo, OAuthError> {
    match provider {
        OAuthProvider::GitHub => fetch_github_user_info(token),
        OAuthProvider::GitLab => fetch_gitlab_user_info(token),
        OAuthProvider::Bitbucket => fetch_bitbucket_user_info(token),
    }
}

fn fetch_github_user_info(token: &str) -> Result<ProviderUserInfo, OAuthError> {
    let request = http::Request::get(OAuthProvider::GitHub.api_url("user"))
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "LitGit")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .body(String::new())
        .map_err(|e| OAuthError::UserInfoFetchFailed(e.to_string()))?;

    let config = ureq::config::Config::builder()
        .timeout_global(Some(std::time::Duration::from_secs(10)))
        .http_status_as_error(false)
        .build();
    let agent = ureq::Agent::new_with_config(config);

    let response = agent
        .run(request)
        .map_err(|e| OAuthError::UserInfoFetchFailed(e.to_string()))?;

    let mut body = String::new();
    response
        .into_body()
        .into_reader()
        .read_to_string(&mut body)
        .map_err(|e| OAuthError::UserInfoFetchFailed(e.to_string()))?;

    let json: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| OAuthError::UserInfoFetchFailed(e.to_string()))?;

    // Collect emails: start with the primary email from the profile
    let mut emails = Vec::new();
    if let Some(primary_email) = json["email"].as_str().filter(|e| !e.trim().is_empty()) {
        emails.push(primary_email.trim().to_lowercase());
    }

    // Fetch verified emails from /user/emails endpoint
    let email_request = http::Request::get(OAuthProvider::GitHub.api_url("user/emails"))
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "LitGit")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .body(String::new());

    if let Ok(email_request) = email_request {
        if let Ok(email_response) = agent.run(email_request) {
            let mut email_body = String::new();
            if email_response
                .into_body()
                .into_reader()
                .read_to_string(&mut email_body)
                .is_ok()
            {
                if let Ok(email_json) = serde_json::from_str::<serde_json::Value>(&email_body) {
                    if let Some(email_array) = email_json.as_array() {
                        for entry in email_array {
                            let is_verified = entry["verified"].as_bool().unwrap_or(false);
                            if !is_verified {
                                continue;
                            }
                            if let Some(addr) =
                                entry["email"].as_str().filter(|e| !e.trim().is_empty())
                            {
                                let normalized = addr.trim().to_lowercase();
                                if !emails.contains(&normalized) {
                                    emails.push(normalized);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(ProviderUserInfo {
        username: json["login"].as_str().unwrap_or("").to_string(),
        display_name: json["name"].as_str().unwrap_or("").to_string(),
        avatar_url: json["avatar_url"].as_str().map(|s| s.to_string()),
        emails,
    })
}

fn fetch_gitlab_user_info(token: &str) -> Result<ProviderUserInfo, OAuthError> {
    let request = http::Request::get(OAuthProvider::GitLab.api_url("user"))
        .header("PRIVATE-TOKEN", token)
        .header("User-Agent", "LitGit")
        .body(String::new())
        .map_err(|e| OAuthError::UserInfoFetchFailed(e.to_string()))?;

    let config = ureq::config::Config::builder()
        .timeout_global(Some(std::time::Duration::from_secs(10)))
        .http_status_as_error(false)
        .build();
    let agent = ureq::Agent::new_with_config(config);

    let response = agent
        .run(request)
        .map_err(|e| OAuthError::UserInfoFetchFailed(e.to_string()))?;

    let mut body = String::new();
    response
        .into_body()
        .into_reader()
        .read_to_string(&mut body)
        .map_err(|e| OAuthError::UserInfoFetchFailed(e.to_string()))?;

    let json: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| OAuthError::UserInfoFetchFailed(e.to_string()))?;

    let mut emails = Vec::new();
    // GitLab returns primary email in public_email or email field
    for field in ["public_email", "email"] {
        if let Some(addr) = json[field].as_str().filter(|e| !e.trim().is_empty()) {
            let normalized = addr.trim().to_lowercase();
            if !emails.contains(&normalized) {
                emails.push(normalized);
            }
        }
    }

    Ok(ProviderUserInfo {
        username: json["username"].as_str().unwrap_or("").to_string(),
        display_name: json["name"].as_str().unwrap_or("").to_string(),
        avatar_url: json["avatar_url"].as_str().map(|s| s.to_string()),
        emails,
    })
}

fn fetch_bitbucket_user_info(token: &str) -> Result<ProviderUserInfo, OAuthError> {
    let request = http::Request::get(OAuthProvider::Bitbucket.api_url("user"))
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", "LitGit")
        .body(String::new())
        .map_err(|e| OAuthError::UserInfoFetchFailed(e.to_string()))?;

    let config = ureq::config::Config::builder()
        .timeout_global(Some(std::time::Duration::from_secs(10)))
        .http_status_as_error(false)
        .build();
    let agent = ureq::Agent::new_with_config(config);

    let response = agent
        .run(request)
        .map_err(|e| OAuthError::UserInfoFetchFailed(e.to_string()))?;

    let mut body = String::new();
    response
        .into_body()
        .into_reader()
        .read_to_string(&mut body)
        .map_err(|e| OAuthError::UserInfoFetchFailed(e.to_string()))?;

    let json: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| OAuthError::UserInfoFetchFailed(e.to_string()))?;

    // Bitbucket may not expose email in the user endpoint directly;
    // we collect what's available.
    let mut emails = Vec::new();
    // Try the emails endpoint for Bitbucket
    let emails_request = http::Request::get(OAuthProvider::Bitbucket.api_url("user/emails"))
        .header("Authorization", format!("Bearer {token}"))
        .header("User-Agent", "LitGit")
        .body(String::new());

    if let Ok(emails_request) = emails_request {
        if let Ok(emails_response) = agent.run(emails_request) {
            let mut emails_body = String::new();
            if emails_response
                .into_body()
                .into_reader()
                .read_to_string(&mut emails_body)
                .is_ok()
            {
                if let Ok(emails_json) = serde_json::from_str::<serde_json::Value>(&emails_body) {
                    if let Some(values) = emails_json["values"].as_array() {
                        for entry in values {
                            let is_confirmed = entry["is_confirmed"].as_bool().unwrap_or(false);
                            if !is_confirmed {
                                continue;
                            }
                            if let Some(addr) =
                                entry["email"].as_str().filter(|e| !e.trim().is_empty())
                            {
                                let normalized = addr.trim().to_lowercase();
                                if !emails.contains(&normalized) {
                                    emails.push(normalized);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(ProviderUserInfo {
        username: json["username"].as_str().unwrap_or("").to_string(),
        display_name: json["display_name"].as_str().unwrap_or("").to_string(),
        avatar_url: json["links"]["avatar"]["href"]
            .as_str()
            .map(|s| s.to_string()),
        emails,
    })
}

/// Disconnects a provider by removing its stored credentials.
pub(crate) fn disconnect_provider(provider: &OAuthProvider) -> Result<(), OAuthError> {
    disconnect_provider_store(provider.as_str())?;
    Ok(())
}

const OAUTH_CALLBACK_HOST: &str = "127.0.0.1";
const OAUTH_CALLBACK_PATH: &str = "/callback";
const OAUTH_CALLBACK_TIMEOUT_SECONDS: u64 = 600;

struct LoopbackCallbackSuccess {
    callback_url: String,
    code: String,
    state: String,
}

enum LoopbackCallbackRequest {
    InvalidPath,
    ProviderError(String),
    Success(LoopbackCallbackSuccess),
}

fn build_loopback_redirect_uri(port: u16) -> String {
    format!("http://{OAUTH_CALLBACK_HOST}:{port}{OAUTH_CALLBACK_PATH}")
}

fn build_deep_link_callback_url(handoff_token: &str) -> String {
    format!(
        "litgit://oauth/callback?token={}",
        urlencoding::encode(handoff_token)
    )
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn build_oauth_success_page(
    provider: &OAuthProvider,
    handoff_token: &str,
    callback_url: &str,
    deep_link_url: &str,
) -> String {
    let provider_name = provider.display_name();
    let escaped_token = html_escape(handoff_token);
    let escaped_callback_url = html_escape(callback_url);
    let escaped_deep_link = html_escape(deep_link_url);

    // Read HTML template from file
    const HTML_TEMPLATE: &str = include_str!("../../public/oauth-success.html");

    // Replace placeholders
    HTML_TEMPLATE
        .replace("{{PROVIDER}}", provider_name)
        .replace("{{HANDOFF_TOKEN}}", &escaped_token)
        .replace("{{CALLBACK_URL}}", &escaped_callback_url)
        .replace("{{DEEP_LINK}}", &escaped_deep_link)
}

fn build_oauth_error_page(provider: &OAuthProvider, message: &str) -> String {
    let provider_name = provider.display_name();
    let escaped_message = html_escape(message);

    format!(
        r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{provider_name} Connection Failed</title>
    <style>
      body {{
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #111827;
        color: #f9fafb;
        font-family: "Geist Variable", "Segoe UI", sans-serif;
      }}
      main {{
        width: min(560px, calc(100vw - 32px));
        padding: 28px;
        border-radius: 20px;
        background: #1f2937;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }}
      h1 {{
        margin-top: 0;
      }}
      pre {{
        padding: 14px;
        border-radius: 14px;
        background: rgba(0, 0, 0, 0.2);
        white-space: pre-wrap;
      }}
      p {{
        color: rgba(249, 250, 251, 0.8);
      }}
    </style>
  </head>
  <body>
    <main>
      <h1>{provider_name} connection failed</h1>
      <p>Return to LitGit and try the OAuth flow again.</p>
      <pre>{escaped_message}</pre>
    </main>
  </body>
</html>"#
    )
}

fn bind_loopback_callback_listener() -> Result<(StdTcpListener, String), OAuthError> {
    let listener = StdTcpListener::bind((OAUTH_CALLBACK_HOST, 0))
        .map_err(|error| OAuthError::CallbackServerFailed(error.to_string()))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| OAuthError::CallbackServerFailed(error.to_string()))?;
    let port = listener
        .local_addr()
        .map_err(|error| OAuthError::CallbackServerFailed(error.to_string()))?
        .port();

    Ok((listener, build_loopback_redirect_uri(port)))
}

fn parse_loopback_callback_request(
    request_target: &str,
    redirect_uri: &str,
) -> LoopbackCallbackRequest {
    let parsed_url = match url::Url::parse(&format!("http://{OAUTH_CALLBACK_HOST}{request_target}"))
    {
        Ok(url) => url,
        Err(_error) => {
            return LoopbackCallbackRequest::ProviderError("Invalid callback URL.".into())
        }
    };

    if parsed_url.path() != OAUTH_CALLBACK_PATH {
        return LoopbackCallbackRequest::InvalidPath;
    }

    let query = parsed_url.query().unwrap_or_default();
    let query_params: HashMap<_, _> = parsed_url.query_pairs().into_owned().collect();

    if let Some(error_message) = query_params
        .get("error_description")
        .or_else(|| query_params.get("error"))
    {
        return LoopbackCallbackRequest::ProviderError(error_message.clone());
    }

    match (query_params.get("code"), query_params.get("state")) {
        (Some(code), Some(state)) => {
            let callback_url = if query.is_empty() {
                redirect_uri.to_string()
            } else {
                format!("{redirect_uri}?{query}")
            };

            LoopbackCallbackRequest::Success(LoopbackCallbackSuccess {
                callback_url,
                code: code.clone(),
                state: state.clone(),
            })
        }
        _ => LoopbackCallbackRequest::ProviderError(
            "The callback did not include both code and state.".into(),
        ),
    }
}

async fn write_loopback_response(
    stream: &mut tokio::net::TcpStream,
    status_line: &str,
    body: &str,
) -> Result<(), OAuthError> {
    let response = format!(
        "{status_line}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );

    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|error| OAuthError::CallbackServerFailed(error.to_string()))
}

async fn read_http_request_target(
    stream: &mut tokio::net::TcpStream,
) -> Result<String, OAuthError> {
    let mut buffer = vec![0_u8; 8192];
    let bytes_read = stream
        .read(&mut buffer)
        .await
        .map_err(|error| OAuthError::CallbackServerFailed(error.to_string()))?;

    if bytes_read == 0 {
        return Err(OAuthError::CallbackServerFailed(
            "The browser closed the OAuth callback connection.".into(),
        ));
    }

    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let request_line = request.lines().next().ok_or_else(|| {
        OAuthError::CallbackServerFailed("The browser sent an empty callback request.".into())
    })?;
    let mut parts = request_line.split_whitespace();
    let _method = parts.next();
    let target = parts.next().ok_or_else(|| {
        OAuthError::CallbackServerFailed("The callback request target was missing.".into())
    })?;

    Ok(target.to_string())
}

async fn handle_loopback_callback_connection<R: tauri::Runtime>(
    stream: &mut tokio::net::TcpStream,
    app_handle: &tauri::AppHandle<R>,
    provider: &OAuthProvider,
    redirect_uri: &str,
) -> Result<(), OAuthError> {
    let request_target = read_http_request_target(stream).await?;

    match parse_loopback_callback_request(&request_target, redirect_uri) {
        LoopbackCallbackRequest::InvalidPath => {
            write_loopback_response(
                stream,
                "HTTP/1.1 404 Not Found",
                "<!doctype html><html><body>Not found.</body></html>",
            )
            .await?;
        }
        LoopbackCallbackRequest::ProviderError(message) => {
            let body = build_oauth_error_page(provider, &message);
            write_loopback_response(stream, "HTTP/1.1 400 Bad Request", &body).await?;
        }
        LoopbackCallbackRequest::Success(payload) => {
            let handoff_manager = app_handle.state::<PendingOAuthHandoffManager>();
            let handoff_token = handoff_manager
                .issue_token(provider.clone(), payload.state.clone())
                .map_err(|e| OAuthError::CallbackServerFailed(e.to_string()))?;
            let deep_link_url = build_deep_link_callback_url(&handoff_token);

            let body = build_oauth_success_page(
                provider,
                &handoff_token,
                &payload.callback_url,
                &deep_link_url,
            );

            let pending_callbacks = app_handle.state::<PendingOAuthCallbackManager>();
            pending_callbacks.stage_callback(
                provider.clone(),
                payload.state.clone(),
                payload.code.clone(),
                payload.callback_url.clone(),
            );

            write_loopback_response(stream, "HTTP/1.1 200 OK", &body).await?;
        }
    }

    Ok(())
}

fn spawn_loopback_callback_listener<R: tauri::Runtime>(
    listener: StdTcpListener,
    app_handle: tauri::AppHandle<R>,
    provider: OAuthProvider,
    redirect_uri: String,
) {
    tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::from_std(listener) {
            Ok(listener) => listener,
            Err(error) => {
                log::error!("Failed to attach OAuth callback listener: {}", error);
                return;
            }
        };

        match tokio::time::timeout(
            Duration::from_secs(OAUTH_CALLBACK_TIMEOUT_SECONDS),
            listener.accept(),
        )
        .await
        {
            Ok(Ok((mut stream, _address))) => {
                if let Err(error) = handle_loopback_callback_connection(
                    &mut stream,
                    &app_handle,
                    &provider,
                    &redirect_uri,
                )
                .await
                {
                    log::warn!("Failed to process OAuth callback: {}", error);
                }
            }
            Ok(Err(error)) => {
                log::warn!("Failed to accept OAuth callback connection: {}", error);
            }
            Err(_timeout) => {
                log::warn!("Timed out waiting for OAuth callback on {}", redirect_uri);
            }
        }
    });
}

/// Payload returned when redeeming an OAuth handoff token.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OAuthCallbackPayload {
    pub(crate) code: String,
    pub(crate) state: String,
}

/// Retrieves a staged callback by state only (for handoff token redemption).
pub(crate) fn redeem_oauth_handoff_token_impl(
    token: &str,
    pending_callbacks: &PendingOAuthCallbackManager,
    pending_handoffs: &PendingOAuthHandoffManager,
) -> Result<OAuthCallbackPayload, OAuthError> {
    // Redeem the handoff token
    let handoff = pending_handoffs
        .redeem_token(token)
        .ok_or(OAuthError::FlowExpired)?;

    // Look up the staged callback by state
    let callback = pending_callbacks
        .get_callback_by_state(&handoff.state)
        .ok_or(OAuthError::InvalidState)?;

    Ok(OAuthCallbackPayload {
        code: callback.code,
        state: callback.state,
    })
}

// Tauri commands
use tauri::{AppHandle, Manager, State};

/// Starts an OAuth flow and returns the authorization URL.
#[tauri::command]
pub(crate) fn start_oauth_flow(
    provider: String,
    app_handle: AppHandle,
    state: State<'_, OAuthFlowManager>,
) -> Result<(String, String), String> {
    let provider = OAuthProvider::from_str(&provider).map_err(|e| e.to_string())?;
    state
        .start_flow(provider, app_handle)
        .map_err(|e| e.to_string())
}

/// Completes an OAuth flow with the authorization code.
#[tauri::command]
pub(crate) fn complete_oauth_flow(
    code: String,
    state: String,
    flow_state: State<'_, OAuthFlowManager>,
    pending_callbacks: State<'_, PendingOAuthCallbackManager>,
) -> Result<ProviderUserInfo, String> {
    let (_, user_info) = flow_state
        .complete_flow(&code, &state)
        .map_err(|e| e.to_string())?;
    pending_callbacks.prune_expired_callbacks();
    let _ = pending_callbacks.consume_completed_callback(&state, &code);
    Ok(user_info)
}

/// Disconnects a provider.
#[tauri::command]
pub(crate) fn disconnect_provider_cmd(provider: String) -> Result<(), String> {
    let provider = OAuthProvider::from_str(&provider).map_err(|e| e.to_string())?;
    disconnect_provider(&provider).map_err(|e| e.to_string())
}

/// Gets status for all providers.
#[tauri::command]
pub(crate) fn get_provider_status() -> Result<HashMap<String, ProviderStatus>, String> {
    let mut config = load_integrations_config().map_err(|e| e.to_string())?;
    if hydrate_provider_profiles_with(&mut config, fetch_user_info).map_err(|e| e.to_string())? {
        save_integrations_config(&config).map_err(|e| e.to_string())?;
    }
    get_all_provider_status().map_err(|e| e.to_string())
}

/// Redeems an OAuth handoff token to retrieve the callback payload.
#[tauri::command]
pub(crate) fn redeem_oauth_handoff_token(
    token: String,
    pending_callbacks: State<'_, PendingOAuthCallbackManager>,
    pending_handoffs: State<'_, PendingOAuthHandoffManager>,
) -> Result<OAuthCallbackPayload, String> {
    redeem_oauth_handoff_token_impl(&token, &pending_callbacks, &pending_handoffs)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oauth_provider_github_should_have_correct_urls() {
        let provider = OAuthProvider::GitHub;
        assert_eq!(
            provider.auth_url(),
            "https://github.com/login/oauth/authorize"
        );
        assert_eq!(
            provider.token_url(),
            "https://github.com/login/oauth/access_token"
        );
        assert_eq!(provider.as_str(), "github");
    }

    #[test]
    fn oauth_provider_gitlab_should_have_correct_urls() {
        let provider = OAuthProvider::GitLab;
        assert_eq!(provider.auth_url(), "https://gitlab.com/oauth/authorize");
        assert_eq!(provider.token_url(), "https://gitlab.com/oauth/token");
        assert_eq!(provider.as_str(), "gitlab");
    }

    #[test]
    fn oauth_provider_bitbucket_should_have_correct_urls() {
        let provider = OAuthProvider::Bitbucket;
        assert_eq!(
            provider.auth_url(),
            "https://bitbucket.org/site/oauth2/authorize"
        );
        assert_eq!(
            provider.token_url(),
            "https://bitbucket.org/site/oauth2/access_token"
        );
        assert_eq!(provider.as_str(), "bitbucket");
    }

    #[test]
    fn oauth_provider_from_str_should_parse_valid_providers() {
        assert!(matches!(
            OAuthProvider::from_str("github"),
            Ok(OAuthProvider::GitHub)
        ));
        assert!(matches!(
            OAuthProvider::from_str("gitlab"),
            Ok(OAuthProvider::GitLab)
        ));
        assert!(matches!(
            OAuthProvider::from_str("bitbucket"),
            Ok(OAuthProvider::Bitbucket)
        ));
    }

    #[test]
    fn oauth_provider_from_str_should_reject_invalid_provider() {
        let result = OAuthProvider::from_str("unknown");
        assert!(result.is_err());
        assert!(matches!(result, Err(OAuthError::UnknownProvider(_))));
    }

    #[test]
    fn pkce_verifier_should_generate_128_char_code() {
        let verifier = PkceVerifier::generate();
        assert_eq!(verifier.verifier().len(), 128);
        assert!(verifier
            .verifier()
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_'));
    }

    #[test]
    fn pkce_verifier_should_generate_valid_challenge() {
        let verifier = PkceVerifier::generate();
        let challenge = verifier.challenge();
        assert!(!challenge.is_empty());
        assert!(!challenge.contains('='));
        assert!(!challenge.contains('+'));
        assert!(!challenge.contains('/'));
    }

    #[test]
    fn oauth_flow_should_generate_unique_states() {
        let flow1 = OAuthFlow::generate(
            OAuthProvider::GitHub,
            "http://127.0.0.1:3000/callback".to_string(),
        );
        let flow2 = OAuthFlow::generate(
            OAuthProvider::GitHub,
            "http://127.0.0.1:3001/callback".to_string(),
        );
        assert_ne!(flow1.state, flow2.state);
        assert_ne!(
            flow1.pkce_verifier.verifier(),
            flow2.pkce_verifier.verifier()
        );
    }

    #[test]
    fn oauth_flow_should_not_be_expired_immediately() {
        let flow = OAuthFlow::generate(
            OAuthProvider::GitHub,
            "http://127.0.0.1:3000/callback".to_string(),
        );
        assert!(!flow.is_expired());
    }

    #[test]
    fn oauth_flow_manager_should_store_and_retrieve_flow() {
        let manager = OAuthFlowManager::new();
        let (url, state) = manager
            .start_flow_with_redirect_uri(
                OAuthProvider::GitHub,
                "http://127.0.0.1:43123/callback".to_string(),
            )
            .unwrap();

        assert!(url.contains("github.com/login/oauth/authorize"));
        assert!(!state.is_empty());
        assert!(url.contains(&state));
        assert!(url.contains("code_challenge="));
    }

    #[test]
    fn provider_status_should_default_to_disconnected() {
        let status = ProviderStatus::default();
        assert!(!status.connected);
        assert!(status.username.is_none());
        assert!(status.display_name.is_none());
        assert!(status.avatar_url.is_none());
    }

    #[test]
    fn oauth_flow_should_expire_after_10_minutes() {
        let flow = OAuthFlow {
            state: "test_state".to_string(),
            pkce_verifier: PkceVerifier::generate(),
            provider: OAuthProvider::GitHub,
            redirect_uri: "http://127.0.0.1:3000/callback".to_string(),
            created_at: std::time::Instant::now() - std::time::Duration::from_secs(601),
        };
        assert!(flow.is_expired());
    }

    #[test]
    fn oauth_flow_should_not_expire_within_10_minutes() {
        let flow = OAuthFlow {
            state: "test_state".to_string(),
            pkce_verifier: PkceVerifier::generate(),
            provider: OAuthProvider::GitHub,
            redirect_uri: "http://127.0.0.1:3000/callback".to_string(),
            created_at: std::time::Instant::now() - std::time::Duration::from_secs(599),
        };
        assert!(!flow.is_expired());
    }

    #[test]
    fn oauth_provider_should_return_correct_scopes() {
        assert!(OAuthProvider::GitHub.scopes().contains("repo"));
        assert!(OAuthProvider::GitHub.scopes().contains("read:user"));
        assert!(OAuthProvider::GitHub.scopes().contains("read:org"));
        assert!(OAuthProvider::GitHub.scopes().contains("write:public_key"));
        assert!(OAuthProvider::GitLab.scopes().contains("api"));
        assert!(OAuthProvider::GitLab.scopes().contains("read_repository"));
        assert!(OAuthProvider::Bitbucket.scopes().contains("repositories"));
    }

    #[test]
    fn oauth_provider_should_return_correct_api_base_url() {
        assert_eq!(
            OAuthProvider::GitHub.api_base_url(),
            "https://api.github.com"
        );
        assert_eq!(
            OAuthProvider::GitLab.api_base_url(),
            "https://gitlab.com/api/v4"
        );
        assert_eq!(
            OAuthProvider::Bitbucket.api_base_url(),
            "https://api.bitbucket.org/2.0"
        );
    }

    #[test]
    fn oauth_provider_should_build_api_urls_from_base_url() {
        assert_eq!(
            OAuthProvider::GitHub.api_url("user"),
            "https://api.github.com/user"
        );
        assert_eq!(
            OAuthProvider::GitLab.api_url("/users/123"),
            "https://gitlab.com/api/v4/users/123"
        );
        assert_eq!(
            OAuthProvider::Bitbucket.api_url("workspaces/example"),
            "https://api.bitbucket.org/2.0/workspaces/example"
        );
    }

    #[test]
    fn oauth_provider_should_use_expected_client_id_variables() {
        assert_eq!(
            provider_client_id_var(&OAuthProvider::GitHub),
            "GITHUB_CLIENT_ID"
        );
        assert_eq!(
            provider_client_id_var(&OAuthProvider::GitLab),
            "GITLAB_CLIENT_ID"
        );
        assert_eq!(
            provider_client_id_var(&OAuthProvider::Bitbucket),
            "BITBUCKET_CLIENT_ID"
        );
    }

    #[test]
    fn oauth_provider_should_use_expected_client_secret_variables() {
        assert_eq!(
            provider_client_secret_var(&OAuthProvider::GitHub),
            "GITHUB_CLIENT_SECRET"
        );
        assert_eq!(
            provider_client_secret_var(&OAuthProvider::GitLab),
            "GITLAB_CLIENT_SECRET"
        );
        assert_eq!(
            provider_client_secret_var(&OAuthProvider::Bitbucket),
            "BITBUCKET_CLIENT_SECRET"
        );
    }

    #[test]
    fn pkce_verifier_challenge_should_be_base64url_encoded() {
        let verifier = PkceVerifier::generate();
        let challenge = verifier.challenge();

        // Base64URL encoding should not contain these characters
        assert!(!challenge.contains('+')); // Not in Base64URL
        assert!(!challenge.contains('/')); // Not in Base64URL
        assert!(!challenge.contains('=')); // No padding in Base64URL

        // Challenge should be exactly 43 characters (256 bits = 32 bytes = 43 Base64URL chars)
        assert_eq!(challenge.len(), 43);
    }

    #[test]
    fn oauth_flow_manager_should_complete_flow_with_valid_state() {
        let manager = OAuthFlowManager::new();
        let (url, state) = manager
            .start_flow_with_redirect_uri(
                OAuthProvider::GitHub,
                "http://127.0.0.1:43123/callback".to_string(),
            )
            .unwrap();

        // Verify the URL contains all required OAuth parameters
        assert!(url.contains("client_id="));
        assert!(url.contains("redirect_uri="));
        assert!(url.contains("scope="));
        assert!(url.contains("state="));
        assert!(url.contains("code_challenge="));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("response_type=code"));

        // Verify state is returned and stored
        assert!(!state.is_empty());
    }

    #[test]
    fn oauth_error_should_format_unknown_provider_correctly() {
        let error = OAuthError::UnknownProvider("myprovider".to_string());
        let error_string = format!("{}", error);
        assert!(error_string.contains("myprovider"));
        assert!(error_string.contains("Unknown OAuth provider"));
    }

    #[test]
    fn oauth_error_should_format_flow_expired_correctly() {
        let error = OAuthError::FlowExpired;
        let error_string = format!("{}", error);
        assert!(error_string.contains("expired"));
    }

    #[test]
    fn oauth_provider_from_str_should_be_case_insensitive() {
        assert!(matches!(
            OAuthProvider::from_str("GITHUB"),
            Ok(OAuthProvider::GitHub)
        ));
        assert!(matches!(
            OAuthProvider::from_str("GitLab"),
            Ok(OAuthProvider::GitLab)
        ));
        assert!(matches!(
            OAuthProvider::from_str("BitBucket"),
            Ok(OAuthProvider::Bitbucket)
        ));
    }

    #[test]
    fn oauth_flow_manager_should_be_send_and_sync() {
        // This is a compile-time test to ensure OAuthFlowManager is thread-safe
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<OAuthFlowManager>();
    }

    #[test]
    fn loopback_redirect_uri_should_use_localhost_callback_port() {
        let redirect_uri = build_loopback_redirect_uri(43123);

        assert_eq!(redirect_uri, "http://127.0.0.1:43123/callback");
    }

    #[test]
    fn parse_loopback_callback_request_returns_success_payload_without_side_effects() {
        let redirect_uri = "http://127.0.0.1:43123/callback";
        let request = "/callback?code=raw-code&state=expected-state";

        let parsed = parse_loopback_callback_request(request, redirect_uri);

        match parsed {
            LoopbackCallbackRequest::Success(payload) => {
                assert_eq!(payload.code, "raw-code");
                assert_eq!(payload.state, "expected-state");
                assert_eq!(
                    payload.callback_url,
                    "http://127.0.0.1:43123/callback?code=raw-code&state=expected-state"
                );
            }
            _ => panic!("expected success payload"),
        }
    }

    #[test]
    fn oauth_success_page_should_use_handoff_token_for_manual_copy_and_deep_link() {
        let handoff_token = "opaque-handoff-token-abc123";
        let callback_url =
            "http://127.0.0.1:43123/callback?code=raw-code&state=expected-state".to_string();
        let deep_link_url = format!("litgit://oauth/callback?token={handoff_token}");

        let html = build_oauth_success_page(
            &OAuthProvider::GitHub,
            handoff_token,
            &callback_url,
            &deep_link_url,
        );

        assert!(html.contains("GitHub"));
        assert!(html.contains(handoff_token));
        assert!(html.contains(&deep_link_url));
        assert!(html.contains(r#"const fullToken = "opaque-handoff-token-abc123";"#));
        assert!(html.contains(r#"id="copy-token""#));
    }

    #[test]
    fn pending_callback_manager_should_prune_expired_callbacks() {
        let manager = PendingOAuthCallbackManager::default();

        {
            let mut callbacks = manager
                .callbacks
                .lock()
                .expect("pending callback lock should be available in test");
            callbacks.insert(
                "expected-state".to_string(),
                PendingOAuthCallback {
                    provider: OAuthProvider::GitHub,
                    state: "expected-state".to_string(),
                    code: "raw-code".to_string(),
                    callback_url:
                        "http://127.0.0.1:43123/callback?code=raw-code&state=expected-state"
                            .to_string(),
                    created_at: std::time::Instant::now()
                        - std::time::Duration::from_secs(OAUTH_CALLBACK_TIMEOUT_SECONDS + 1),
                },
            );
        }

        manager.prune_expired_callbacks();

        // Expired callback should be removed
        assert!(manager.get_callback_by_state("expected-state").is_none());
    }

    #[test]
    fn pending_callback_manager_should_remove_matching_callback_after_manual_completion() {
        let manager = PendingOAuthCallbackManager::default();

        manager.stage_callback(
            OAuthProvider::GitHub,
            "expected-state".into(),
            "raw-code".into(),
            "http://127.0.0.1:43123/callback?code=raw-code&state=expected-state".into(),
        );

        let completed = manager
            .consume_completed_callback("expected-state", "raw-code")
            .expect("manual completion should clear matching staged callback");

        assert_eq!(completed.state, "expected-state");
        assert_eq!(completed.code, "raw-code");
        // Verify callback was removed by trying to get it again
        assert!(manager.get_callback_by_state("expected-state").is_none());
    }

    #[test]
    fn hydrate_provider_profiles_with_should_backfill_missing_profiles() {
        let mut config = IntegrationsConfig {
            profile_id: "test_profile".to_string(),
            providers: {
                let mut providers = HashMap::new();
                providers.insert(
                    "github".to_string(),
                    crate::integrations_store::ProviderConfig {
                        oauth_token: Some(StoredToken {
                            access_token: "ghp_test123".to_string(),
                            refresh_token: None,
                            expires_at: None,
                            scope: "repo,user".to_string(),
                        }),
                        profile: None,
                        ssh_key: None,
                        use_system_agent: true,
                    },
                );
                providers
            },
        };

        let updated = hydrate_provider_profiles_with(&mut config, |provider, token| {
            assert_eq!(provider.as_str(), "github");
            assert_eq!(token, "ghp_test123");

            Ok(ProviderUserInfo {
                username: "octocat".to_string(),
                display_name: "The Octocat".to_string(),
                avatar_url: Some("https://github.com/images/error/octocat_happy.gif".to_string()),
                emails: vec!["octocat@github.com".to_string()],
            })
        })
        .expect("should hydrate provider profile");

        assert!(updated);
        let profile = config.providers["github"]
            .profile
            .as_ref()
            .expect("profile should be stored");
        assert_eq!(profile.username.as_deref(), Some("octocat"));
        assert_eq!(profile.display_name.as_deref(), Some("The Octocat"));
        assert_eq!(
            profile.avatar_url.as_deref(),
            Some("https://github.com/images/error/octocat_happy.gif")
        );
        assert_eq!(profile.emails, vec!["octocat@github.com".to_string()]);
    }

    #[test]
    fn hydrate_provider_profiles_with_should_backfill_profile_emails_when_empty() {
        let mut config = IntegrationsConfig {
            profile_id: "test_profile".to_string(),
            providers: {
                let mut providers = HashMap::new();
                providers.insert(
                    "github".to_string(),
                    crate::integrations_store::ProviderConfig {
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
                            emails: Vec::new(),
                        }),
                        ssh_key: None,
                        use_system_agent: true,
                    },
                );
                providers
            },
        };

        let updated = hydrate_provider_profiles_with(&mut config, |provider, token| {
            assert_eq!(provider.as_str(), "github");
            assert_eq!(token, "ghp_test123");

            Ok(ProviderUserInfo {
                username: "octocat".to_string(),
                display_name: "The Octocat".to_string(),
                avatar_url: Some("https://github.com/images/error/octocat_happy.gif".to_string()),
                emails: vec![
                    "octocat@github.com".to_string(),
                    "the.octocat@github.com".to_string(),
                ],
            })
        })
        .expect("should backfill missing profile emails");

        assert!(updated);
        let profile = config.providers["github"]
            .profile
            .as_ref()
            .expect("profile should exist");
        assert_eq!(
            profile.emails,
            vec![
                "octocat@github.com".to_string(),
                "the.octocat@github.com".to_string()
            ]
        );
    }

    #[test]
    fn hydrate_provider_profiles_with_should_skip_fetch_when_profile_already_has_emails() {
        let mut config = IntegrationsConfig {
            profile_id: "test_profile".to_string(),
            providers: {
                let mut providers = HashMap::new();
                providers.insert(
                    "github".to_string(),
                    crate::integrations_store::ProviderConfig {
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
        let mut fetch_called = false;

        let updated = hydrate_provider_profiles_with(&mut config, |_, _| {
            fetch_called = true;
            Ok(ProviderUserInfo {
                username: String::new(),
                display_name: String::new(),
                avatar_url: None,
                emails: Vec::new(),
            })
        })
        .expect("should skip fetch when profile already has emails");

        assert!(!updated);
        assert!(!fetch_called);
    }

    #[test]
    fn handoff_token_manager_mints_and_redeems_single_use_tokens() {
        let manager = PendingOAuthHandoffManager::default();
        let token = manager
            .issue_token(OAuthProvider::GitHub, "expected-state".to_string())
            .expect("should issue token");

        let redeemed = manager
            .redeem_token(&token)
            .expect("fresh token should redeem");

        assert_eq!(redeemed.provider, OAuthProvider::GitHub);
        assert_eq!(redeemed.state, "expected-state");
        assert!(manager.redeem_token(&token).is_none());
    }

    #[test]
    fn oauth_success_page_does_not_render_raw_provider_code() {
        let body = build_oauth_success_page(
            &OAuthProvider::GitHub,
            "opaque-handoff-token",
            "http://127.0.0.1:43123/callback?code=raw-code&state=expected-state",
            "litgit://oauth/callback?token=opaque-handoff-token",
        );

        assert!(body.contains("opaque-handoff-token"));
        assert!(!body.contains("raw-code"));
    }

    #[test]
    fn complete_oauth_handoff_redeems_token_to_staged_callback() {
        let callbacks = PendingOAuthCallbackManager::default();
        let handoffs = PendingOAuthHandoffManager::default();

        callbacks.stage_callback(
            OAuthProvider::GitHub,
            "expected-state".to_string(),
            "raw-code".to_string(),
            "http://127.0.0.1:43123/callback?code=raw-code&state=expected-state".to_string(),
        );

        let token = handoffs
            .issue_token(OAuthProvider::GitHub, "expected-state".to_string())
            .expect("should issue token");
        let payload = redeem_oauth_handoff_token_impl(&token, &callbacks, &handoffs)
            .expect("token should resolve staged callback");

        assert_eq!(payload.code, "raw-code");
        assert_eq!(payload.state, "expected-state");
    }

    #[test]
    fn handoff_token_manager_rejects_expired_tokens() {
        let manager = PendingOAuthHandoffManager::default();
        let token = manager
            .issue_token(OAuthProvider::GitHub, "expected-state".to_string())
            .expect("should issue token");

        // Simulate expiry by manipulating the created_at time through internal access
        {
            let mut handoffs = manager
                .handoffs
                .lock()
                .expect("lock should not be poisoned");
            let handoff = handoffs.get_mut(&token).expect("token should exist");
            handoff.created_at = Instant::now() - Duration::from_secs(91);
        }

        // Expired token should not redeem
        assert!(manager.redeem_token(&token).is_none());
    }

    #[test]
    fn handoff_token_manager_rejects_double_redemption() {
        let manager = PendingOAuthHandoffManager::default();
        let token = manager
            .issue_token(OAuthProvider::GitHub, "expected-state".to_string())
            .expect("should issue token");

        // First redemption should succeed
        assert!(manager.redeem_token(&token).is_some());

        // Second redemption should fail (single-use)
        assert!(manager.redeem_token(&token).is_none());
    }

    #[test]
    fn handoff_token_manager_prunes_expired_tokens() {
        let manager = PendingOAuthHandoffManager::default();

        // Issue two tokens
        let token1 = manager
            .issue_token(OAuthProvider::GitHub, "state-1".to_string())
            .expect("should issue token");
        let token2 = manager
            .issue_token(OAuthProvider::GitLab, "state-2".to_string())
            .expect("should issue token");

        // Expire the first token
        {
            let mut handoffs = manager
                .handoffs
                .lock()
                .expect("lock should not be poisoned");
            let handoff = handoffs.get_mut(&token1).expect("token should exist");
            handoff.created_at = Instant::now() - Duration::from_secs(91);
        }

        // Prune should remove expired tokens
        manager.prune_expired_tokens();

        // Expired token should be gone
        assert!(manager.redeem_token(&token1).is_none());
        // Fresh token should still work
        assert!(manager.redeem_token(&token2).is_some());
    }

    #[test]
    fn redeem_oauth_handoff_token_impl_rejects_missing_callback() {
        let callbacks = PendingOAuthCallbackManager::default();
        let handoffs = PendingOAuthHandoffManager::default();

        // Issue token but don't stage callback
        let token = handoffs
            .issue_token(OAuthProvider::GitHub, "expected-state".to_string())
            .expect("should issue token");

        // Should fail because callback not staged
        let result = redeem_oauth_handoff_token_impl(&token, &callbacks, &handoffs);
        assert!(matches!(result, Err(OAuthError::InvalidState)));
    }

    #[test]
    fn redeem_oauth_handoff_token_impl_rejects_expired_callback() {
        let callbacks = PendingOAuthCallbackManager::default();
        let handoffs = PendingOAuthHandoffManager::default();

        // Stage a callback that will expire
        callbacks.stage_callback(
            OAuthProvider::GitHub,
            "expected-state".to_string(),
            "raw-code".to_string(),
            "http://127.0.0.1:43123/callback?code=raw-code&state=expected-state".to_string(),
        );

        // Expire the callback (10 minute timeout)
        {
            let mut cb = callbacks
                .callbacks
                .lock()
                .expect("lock should not be poisoned");
            let callback = cb.get_mut("expected-state").expect("callback should exist");
            callback.created_at = Instant::now() - Duration::from_secs(601);
        }

        // Issue token for the same state
        let token = handoffs
            .issue_token(OAuthProvider::GitHub, "expected-state".to_string())
            .expect("should issue token");

        // Should fail because callback expired
        let result = redeem_oauth_handoff_token_impl(&token, &callbacks, &handoffs);
        assert!(matches!(result, Err(OAuthError::InvalidState)));
    }
}
