//! Git host avatar fetching and API utilities.
//!
//! Provides avatar URL fetching for GitHub, GitLab, and Bitbucket
//! using OAuth tokens from the integrations store.

use crate::integrations_store::{load_integrations_config, resolve_provider_access_token};
use crate::oauth::OAuthProvider;
use std::io::Read;
use thiserror::Error;
use ureq::http;

/// The version of the GitHub API to use for requests.
pub(crate) const GITHUB_API_VERSION: &str = "2022-11-28";
pub(crate) const APP_USER_AGENT: &str = "LitGit/0.1.0";

/// Errors that can occur during Git host API operations.
#[derive(Debug, Error)]
pub(crate) enum GitHostAuthError {
    /// HTTP request failed.
    #[error("Failed to {action}: {detail}")]
    Http {
        /// The action that was being performed.
        action: &'static str,
        /// Detailed error message.
        detail: String,
    },

    /// Storage operation failed.
    #[error("Storage error: {0}")]
    StorageError(String),
}

/// Retrieves the OAuth access token for a provider from integrations storage.
///
/// Returns `Ok(None)` if the provider is not connected or has no token.
/// Returns `Err` if storage access fails.
pub(crate) fn get_oauth_token_for_provider(
    provider: OAuthProvider,
) -> Result<Option<String>, GitHostAuthError> {
    let config = load_integrations_config()
        .map_err(|e| GitHostAuthError::StorageError(format!("Failed to load config: {e}")))?;

    let provider_key = provider.as_str().to_lowercase();

    Ok(resolve_provider_access_token(&config, &provider_key))
}

/// Fetches the GitHub avatar for an account.
///
/// Uses GitHub's CDN endpoints which have no rate limits and don't require authentication.
/// For numeric user IDs: `https://avatars.githubusercontent.com/u/{id}?v=4`
/// For usernames: `https://github.com/{username}.png` (redirects to CDN)
pub(crate) fn fetch_github_avatar_for_account(
    account: &str,
) -> Result<Option<String>, GitHostAuthError> {
    let trimmed_account = account.trim();
    if trimmed_account.is_empty() {
        return Ok(None);
    }

    // Use GitHub's CDN endpoints which have no rate limits
    // Numeric user IDs use avatars.githubusercontent.com/u/{id} format
    // Usernames use github.com/{username}.png which redirects to the CDN
    if trimmed_account
        .chars()
        .all(|character| character.is_ascii_digit())
    {
        Ok(Some(format!(
            "https://avatars.githubusercontent.com/u/{trimmed_account}?v=4"
        )))
    } else {
        Ok(Some(format!("https://github.com/{trimmed_account}.png")))
    }
}

/// Searches for a GitHub user by commit email using the connected account's token.
///
/// Tries two strategies in order:
/// 1. `/search/users?q={email}+in:email` — finds users with public emails
/// 2. `/search/commits?q=author-email:{email}` — finds users via commit association
///    (works even when email is private, because GitHub internally links commit
///    author emails to verified accounts)
///
/// Returns `(username, avatar_url)` if found. Requires connected GitHub account.
pub(crate) fn search_github_user_by_email(
    email: &str,
) -> Result<Option<(String, Option<String>)>, GitHostAuthError> {
    let normalized = email.trim().to_lowercase();
    if normalized.is_empty() {
        return Ok(None);
    }

    let token = match get_oauth_token_for_provider(OAuthProvider::GitHub)? {
        Some(token) if !token.trim().is_empty() => token,
        _ => return Ok(None),
    };

    // Strategy 1: search users by public email
    let encoded_email = urlencoding::encode(&normalized);
    let user_search_url = OAuthProvider::GitHub.api_url(&format!(
        "search/users?q={encoded_email}+in:email&per_page=1"
    ));

    if let Some(result) = search_github_user_from_url(&user_search_url, &token, |json| {
        let user = json["items"].as_array()?.first()?;
        extract_user_identity(user)
    })? {
        return Ok(Some(result));
    }

    // Strategy 2: search commits by author email (works for private emails)
    let commit_search_url = OAuthProvider::GitHub.api_url(&format!(
        "search/commits?q=author-email:{encoded_email}&per_page=1&sort=author-date&order=desc"
    ));

    if let Some(result) = search_github_user_from_url(&commit_search_url, &token, |json| {
        let commit_item = json["items"].as_array()?.first()?;
        // The top-level "author" field (not commit.author) is the GitHub user
        let author = commit_item.get("author")?;
        extract_user_identity(author)
    })? {
        return Ok(Some(result));
    }

    Ok(None)
}

/// Extracts (login, avatar_url) from a GitHub user JSON object.
fn extract_user_identity(user: &serde_json::Value) -> Option<(String, Option<String>)> {
    let username = user["login"].as_str()?.trim();
    if username.is_empty() {
        return None;
    }

    let avatar_url = user["avatar_url"]
        .as_str()
        .filter(|v| !v.trim().is_empty())
        .map(ToString::to_string);

    Some((username.to_string(), avatar_url))
}

/// Makes a GitHub API GET request and extracts a result using the provided parser.
fn search_github_user_from_url(
    url: &str,
    token: &str,
    parser: impl FnOnce(&serde_json::Value) -> Option<(String, Option<String>)>,
) -> Result<Option<(String, Option<String>)>, GitHostAuthError> {
    let request = http::Request::get(url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", APP_USER_AGENT)
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
        .body(())
        .map_err(|e| GitHostAuthError::Http {
            action: "build GitHub search request",
            detail: e.to_string(),
        })?;

    let config = ureq::config::Config::builder()
        .timeout_global(Some(std::time::Duration::from_secs(10)))
        .http_status_as_error(false)
        .build();
    let agent = ureq::Agent::new_with_config(config);

    let response = agent.run(request).map_err(|e| GitHostAuthError::Http {
        action: "search GitHub API",
        detail: e.to_string(),
    })?;

    let status = response.status().as_u16();
    let mut body = String::new();
    response
        .into_body()
        .into_reader()
        .read_to_string(&mut body)
        .map_err(|e| GitHostAuthError::Http {
            action: "read GitHub search response",
            detail: e.to_string(),
        })?;

    // Non-2xx = skip silently (rate limit, auth issue, etc.)
    if !(200..300).contains(&status) {
        log::warn!("GitHub search returned status {status} for {url}");
        return Ok(None);
    }

    let json: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| GitHostAuthError::Http {
            action: "parse GitHub search response",
            detail: e.to_string(),
        })?;

    let total_count = json["total_count"].as_u64().unwrap_or(0);
    if total_count == 0 {
        return Ok(None);
    }

    Ok(parser(&json))
}

/// Fetches the GitLab avatar for a username using an OAuth token.
pub(crate) fn fetch_gitlab_avatar_for_username(
    username: &str,
) -> Result<Option<String>, GitHostAuthError> {
    let trimmed_username = username.trim();
    if trimmed_username.is_empty() {
        return Ok(None);
    }

    let token = get_oauth_token_for_provider(OAuthProvider::GitLab)?;

    let endpoint = OAuthProvider::GitLab.api_url(&format!("users?username={trimmed_username}"));
    let mut request = http::Request::get(&endpoint)
        .header("Accept", "application/json")
        .header("User-Agent", APP_USER_AGENT);

    if let Some(ref token_str) = token.filter(|value| !value.trim().is_empty()) {
        request = request.header("PRIVATE-TOKEN", token_str);
    }

    let config = ureq::config::Config::builder()
        .http_status_as_error(false)
        .build();
    let agent = ureq::Agent::new_with_config(config);

    let request = request
        .body(())
        .map_err(|e| GitHostAuthError::Http {
            action: "build GitLab avatar request",
            detail: e.to_string(),
        })?;

    let payload = read_json_response(
        agent.run(request),
        "fetch GitLab avatar",
        format!("Failed to fetch GitLab avatar for username {trimmed_username}"),
    )?;

    Ok(payload
        .as_array()
        .and_then(|users| users.first())
        .and_then(|user| user.get("avatar_url"))
        .and_then(serde_json::Value::as_str)
        .map(ToOwned::to_owned))
}

/// Fetches the GitLab avatar for a user ID using an OAuth token.
pub(crate) fn fetch_gitlab_avatar_for_user_id(
    user_id: &str,
) -> Result<Option<String>, GitHostAuthError> {
    let trimmed_user_id = user_id.trim();
    if trimmed_user_id.is_empty() {
        return Ok(None);
    }

    let token = get_oauth_token_for_provider(OAuthProvider::GitLab)?;

    let endpoint = OAuthProvider::GitLab.api_url(&format!("users/{trimmed_user_id}"));
    let mut request = http::Request::get(&endpoint)
        .header("Accept", "application/json")
        .header("User-Agent", APP_USER_AGENT);

    if let Some(ref token_str) = token.filter(|value| !value.trim().is_empty()) {
        request = request.header("PRIVATE-TOKEN", token_str);
    }

    let config = ureq::config::Config::builder()
        .http_status_as_error(false)
        .build();
    let agent = ureq::Agent::new_with_config(config);

    let request = request
        .body(())
        .map_err(|e| GitHostAuthError::Http {
            action: "build GitLab avatar request",
            detail: e.to_string(),
        })?;

    let payload = read_json_response(
        agent.run(request),
        "fetch GitLab avatar",
        format!("Failed to fetch GitLab avatar for user id {trimmed_user_id}"),
    )?;

    Ok(payload
        .get("avatar_url")
        .and_then(serde_json::Value::as_str)
        .map(ToOwned::to_owned))
}

/// Fetches the Bitbucket avatar for a username using an OAuth token.
pub(crate) fn fetch_bitbucket_avatar_for_username(
    username: &str,
) -> Result<Option<String>, GitHostAuthError> {
    let trimmed_username = username.trim();
    if trimmed_username.is_empty() {
        return Ok(None);
    }

    let token = get_oauth_token_for_provider(OAuthProvider::Bitbucket)?;

    let config = ureq::config::Config::builder()
        .http_status_as_error(false)
        .build();
    let agent = ureq::Agent::new_with_config(config);

    for endpoint in [
        OAuthProvider::Bitbucket.api_url(&format!("users/{trimmed_username}")),
        OAuthProvider::Bitbucket.api_url(&format!("workspaces/{trimmed_username}")),
    ] {
        let mut request = http::Request::get(&endpoint)
            .header("Accept", "application/json")
            .header("User-Agent", APP_USER_AGENT);

        if let Some(ref token_str) = token.as_ref().filter(|value| !value.trim().is_empty()) {
            request = request.header("Authorization", format!("Bearer {token_str}"));
        }

        let request = request
            .body(())
            .map_err(|e| GitHostAuthError::Http {
                action: "build Bitbucket avatar request",
                detail: e.to_string(),
            })?;

        match read_json_response(
            agent.run(request),
            "fetch Bitbucket avatar",
            format!("Failed to fetch Bitbucket avatar for username {trimmed_username}"),
        ) {
            Ok(payload) => {
                let avatar_url = payload
                    .get("links")
                    .and_then(|links| links.get("avatar"))
                    .and_then(|avatar| avatar.get("href"))
                    .and_then(serde_json::Value::as_str)
                    .map(ToOwned::to_owned);

                if avatar_url.is_some() {
                    return Ok(avatar_url);
                }
            }
            Err(error) => {
                log::warn!("{error}");
            }
        }
    }

    Ok(None)
}

fn read_json_response(
    response: Result<http::Response<ureq::Body>, ureq::Error>,
    action: &'static str,
    detail: impl Into<String>,
) -> Result<serde_json::Value, GitHostAuthError> {
    let detail = detail.into();
    let response = response.map_err(|error| GitHostAuthError::Http {
        action,
        detail: format!("{detail}: {error}"),
    })?;

    let mut body = String::new();
    response
        .into_body()
        .into_reader()
        .read_to_string(&mut body)
        .map_err(|error| GitHostAuthError::Http {
            action: "read avatar response",
            detail: format!("{detail}: {error}"),
        })?;

    serde_json::from_str(&body).map_err(|error| GitHostAuthError::Http {
        action: "parse avatar response",
        detail: format!("{detail}: {error}"),
    })
}

#[cfg(test)]
mod tests {
    use super::{extract_user_identity, fetch_github_avatar_for_account};
    use serde_json::json;

    #[test]
    fn fetch_github_avatar_for_account_returns_none_when_input_is_blank() {
        let avatar = fetch_github_avatar_for_account("   ").expect("blank input should not fail");
        assert!(avatar.is_none());
    }

    #[test]
    fn fetch_github_avatar_for_account_returns_numeric_cdn_url_for_user_id() {
        let avatar = fetch_github_avatar_for_account("12345")
            .expect("numeric account should resolve deterministic avatar URL");

        assert_eq!(
            avatar.as_deref(),
            Some("https://avatars.githubusercontent.com/u/12345?v=4")
        );
    }

    #[test]
    fn fetch_github_avatar_for_account_returns_profile_png_for_username() {
        let avatar = fetch_github_avatar_for_account("octocat")
            .expect("username account should resolve deterministic avatar URL");

        assert_eq!(avatar.as_deref(), Some("https://github.com/octocat.png"));
    }

    #[test]
    fn extract_user_identity_returns_none_when_login_is_missing_or_blank() {
        assert!(
            extract_user_identity(&json!({ "avatar_url": "https://example.com/a.png" })).is_none()
        );
        assert!(extract_user_identity(
            &json!({ "login": "   ", "avatar_url": "https://example.com/a.png" })
        )
        .is_none());
    }

    #[test]
    fn extract_user_identity_returns_login_and_avatar_when_present() {
        let identity = extract_user_identity(&json!({
            "login": " octocat ",
            "avatar_url": "https://github.com/images/error/octocat_happy.gif"
        }))
        .expect("valid user payload should parse");

        assert_eq!(identity.0, "octocat");
        assert_eq!(
            identity.1.as_deref(),
            Some("https://github.com/images/error/octocat_happy.gif")
        );
    }
}
