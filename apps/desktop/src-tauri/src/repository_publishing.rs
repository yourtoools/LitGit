use crate::git_host_auth::{get_oauth_token_for_provider, APP_USER_AGENT, GITHUB_API_VERSION};
use crate::integrations_store::{load_integrations_config, ProviderProfile};
use crate::oauth::{fetch_user_info, OAuthProvider, ProviderUserInfo};
use crate::repository::validate_repository_name;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use std::io::Read;
use std::str::FromStr;
use thiserror::Error;
use ureq::http;

const PUBLISH_TARGET_PAGE_SIZE: usize = 100;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum PublishProvider {
    GitHub,
    GitLab,
    Bitbucket,
}

impl PublishProvider {
    pub(crate) const fn as_str(&self) -> &'static str {
        match self {
            Self::GitHub => "github",
            Self::GitLab => "gitlab",
            Self::Bitbucket => "bitbucket",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum PublishVisibility {
    Private,
    Public,
}

impl PublishVisibility {
    pub(crate) const fn as_str(&self) -> &'static str {
        match self {
            Self::Private => "private",
            Self::Public => "public",
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishRepositoryRequest {
    pub(crate) provider: String,
    pub(crate) target_id: String,
    pub(crate) repo_name: String,
    pub(crate) visibility: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishTarget {
    pub(crate) id: String,
    pub(crate) provider: String,
    pub(crate) kind: String,
    pub(crate) display_name: String,
    pub(crate) full_path: String,
    pub(crate) avatar_url: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct CreateRemoteRequest {
    pub(crate) provider: PublishProvider,
    pub(crate) url: String,
    pub(crate) body: Value,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreatedRemoteRepository {
    pub(crate) clone_url: String,
    pub(crate) ssh_clone_url: Option<String>,
    pub(crate) web_url: String,
}

#[derive(Clone, Debug, Deserialize)]
struct GitLabNamespaceRecord {
    id: i64,
    full_path: String,
    #[allow(dead_code)]
    kind: String,
    name: String,
    avatar_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct BitbucketWorkspaceRecord {
    slug: String,
    display_name: String,
    #[allow(dead_code)]
    uuid: String,
    avatar_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct GitHubOrganizationRecord {
    login: String,
}

#[derive(Clone, Debug, Deserialize)]
struct BitbucketWorkspaceAccessPage {
    values: Vec<BitbucketWorkspaceAccessRecord>,
    next: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct BitbucketWorkspaceAccessRecord {
    workspace: BitbucketWorkspaceApiRecord,
}

#[derive(Clone, Debug, Deserialize)]
struct BitbucketWorkspaceApiRecord {
    slug: String,
    uuid: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    links: Option<BitbucketWorkspaceLinks>,
}

#[derive(Clone, Debug, Deserialize)]
struct BitbucketWorkspaceLinks {
    #[serde(default)]
    avatar: Option<BitbucketLinkRecord>,
}

#[derive(Clone, Debug, Deserialize)]
struct BitbucketLinkRecord {
    href: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub(crate) enum RepositoryPublishingError {
    #[error("Provider is required")]
    MissingProvider,
    #[error("Unknown provider: {0}")]
    UnknownProvider(String),
    #[error("Destination is required")]
    MissingTarget,
    #[error("Target does not match the selected provider")]
    InvalidTargetId(String),
    #[error("Repository name is required")]
    MissingRepositoryName,
    #[error("{0}")]
    InvalidRepositoryName(String),
    #[error("Visibility is required")]
    MissingVisibility,
    #[error("Visibility must be public or private")]
    InvalidVisibility,
    #[error("{0}")]
    Message(String),
}

impl FromStr for PublishProvider {
    type Err = RepositoryPublishingError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        parse_publish_provider(value)
    }
}

impl FromStr for PublishVisibility {
    type Err = RepositoryPublishingError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        parse_publish_visibility(value)
    }
}

pub(crate) fn parse_publish_provider(
    value: &str,
) -> Result<PublishProvider, RepositoryPublishingError> {
    let trimmed_value = value.trim();

    match trimmed_value.to_lowercase().as_str() {
        "github" => Ok(PublishProvider::GitHub),
        "gitlab" => Ok(PublishProvider::GitLab),
        "bitbucket" => Ok(PublishProvider::Bitbucket),
        "" => Err(RepositoryPublishingError::MissingProvider),
        _ => Err(RepositoryPublishingError::UnknownProvider(
            trimmed_value.to_string(),
        )),
    }
}

pub(crate) fn parse_publish_visibility(
    value: &str,
) -> Result<PublishVisibility, RepositoryPublishingError> {
    match value.trim().to_lowercase().as_str() {
        "" => Err(RepositoryPublishingError::MissingVisibility),
        "private" => Ok(PublishVisibility::Private),
        "public" => Ok(PublishVisibility::Public),
        _ => Err(RepositoryPublishingError::InvalidVisibility),
    }
}

pub(crate) fn validate_publish_request(
    request: &PublishRepositoryRequest,
) -> Result<(), RepositoryPublishingError> {
    parse_publish_provider(&request.provider)?;
    parse_publish_visibility(&request.visibility)?;
    validate_publish_target_id(&request.provider, &request.target_id)?;

    let repo_name = request.repo_name.trim();
    if repo_name.is_empty() {
        return Err(RepositoryPublishingError::MissingRepositoryName);
    }

    validate_repository_name(repo_name)
        .map_err(|error| RepositoryPublishingError::InvalidRepositoryName(error.to_string()))?;

    Ok(())
}

fn validate_publish_target_id(
    provider: &str,
    target_id: &str,
) -> Result<(), RepositoryPublishingError> {
    let trimmed_target_id = target_id.trim();
    if trimmed_target_id.is_empty() {
        return Err(RepositoryPublishingError::MissingTarget);
    }

    let mut parts = trimmed_target_id.split(':');
    let provider_part = parts
        .next()
        .ok_or_else(|| RepositoryPublishingError::InvalidTargetId(trimmed_target_id.to_string()))?;
    let kind_part = parts
        .next()
        .ok_or_else(|| RepositoryPublishingError::InvalidTargetId(trimmed_target_id.to_string()))?;
    let identifier_part = parts
        .next()
        .ok_or_else(|| RepositoryPublishingError::InvalidTargetId(trimmed_target_id.to_string()))?;

    if parts.next().is_some()
        || provider_part.trim() != provider_part
        || kind_part.trim() != kind_part
        || identifier_part.trim() != identifier_part
        || identifier_part.is_empty()
    {
        return Err(RepositoryPublishingError::InvalidTargetId(
            trimmed_target_id.to_string(),
        ));
    }

    let provider = parse_publish_provider(provider)?;
    let matches_provider_pattern = match provider {
        PublishProvider::GitHub => {
            provider_part == "github" && matches!(kind_part, "personal" | "organization")
        }
        PublishProvider::GitLab => provider_part == "gitlab" && kind_part == "namespace",
        PublishProvider::Bitbucket => provider_part == "bitbucket" && kind_part == "workspace",
    };

    if matches_provider_pattern {
        Ok(())
    } else {
        Err(RepositoryPublishingError::InvalidTargetId(
            trimmed_target_id.to_string(),
        ))
    }
}

fn normalize_github_targets(
    username: &str,
    avatar_url: Option<String>,
    organizations: &[String],
) -> Vec<PublishTarget> {
    let mut targets = vec![PublishTarget {
        id: format!("github:personal:{username}"),
        provider: "github".to_string(),
        kind: "personal".to_string(),
        display_name: username.to_string(),
        full_path: username.to_string(),
        avatar_url: avatar_url.clone(),
    }];

    for organization in organizations {
        targets.push(PublishTarget {
            id: format!("github:organization:{organization}"),
            provider: "github".to_string(),
            kind: "organization".to_string(),
            display_name: organization.to_string(),
            full_path: organization.to_string(),
            avatar_url: None,
        });
    }

    targets
}

fn normalize_gitlab_targets(records: &[GitLabNamespaceRecord]) -> Vec<PublishTarget> {
    records
        .iter()
        .map(|record| PublishTarget {
            id: format!("gitlab:namespace:{}", record.id),
            provider: "gitlab".to_string(),
            kind: normalize_provider_value(&record.kind).unwrap_or_else(|| "namespace".to_string()),
            display_name: record.name.clone(),
            full_path: record.full_path.clone(),
            avatar_url: record.avatar_url.clone(),
        })
        .collect()
}

fn normalize_bitbucket_targets(records: &[BitbucketWorkspaceRecord]) -> Vec<PublishTarget> {
    records
        .iter()
        .map(|record| PublishTarget {
            id: format!("bitbucket:workspace:{}", record.slug),
            provider: "bitbucket".to_string(),
            kind: "workspace".to_string(),
            display_name: record.display_name.clone(),
            full_path: record.slug.clone(),
            avatar_url: record.avatar_url.clone(),
        })
        .collect()
}

#[tauri::command]
pub(crate) fn list_publish_targets(provider: String) -> Result<Vec<PublishTarget>, String> {
    let provider = parse_publish_provider(&provider).map_err(|e| e.to_string())?;

    match provider {
        PublishProvider::GitHub => list_github_publish_targets().map_err(|e| e.to_string()),
        PublishProvider::GitLab => list_gitlab_publish_targets().map_err(|e| e.to_string()),
        PublishProvider::Bitbucket => list_bitbucket_publish_targets().map_err(|e| e.to_string()),
    }
}

fn list_github_publish_targets() -> Result<Vec<PublishTarget>, RepositoryPublishingError> {
    let token = require_provider_token(OAuthProvider::GitHub)?;
    let config = load_integrations_config().map_err(|error| {
        RepositoryPublishingError::Message(format!("Failed to load integrations config: {error}"))
    })?;
    github_publish_targets_require_org_scope(&config)?;
    let provider_key = OAuthProvider::GitHub.as_str();
    let cached_profile = config
        .providers
        .get(provider_key)
        .and_then(|provider_config| provider_config.profile.as_ref());
    let fetched_user = load_github_identity_from_token(&token, cached_profile)?;
    let (username, avatar_url) = resolve_github_identity(cached_profile, fetched_user.as_ref())?;
    let organizations = match list_github_organization_logins(&token) {
        Ok(organizations) => organizations,
        Err(error) => {
            log::warn!(
                "GitHub organization discovery is unavailable; returning personal publish target only: {}",
                error
            );
            Vec::new()
        }
    };

    Ok(normalize_github_targets(
        &username,
        avatar_url,
        &organizations,
    ))
}

fn github_publish_targets_require_org_scope(
    config: &crate::integrations_store::IntegrationsConfig,
) -> Result<(), RepositoryPublishingError> {
    let Some(provider_config) = config.providers.get(OAuthProvider::GitHub.as_str()) else {
        return Ok(());
    };

    let Some(token) = provider_config.oauth_token.as_ref() else {
        return Ok(());
    };

    if github_scope_includes_read_org(&token.scope) {
        Ok(())
    } else {
        Err(RepositoryPublishingError::Message(
            "Reconnect GitHub to load organization destinations.".to_string(),
        ))
    }
}

fn github_scope_includes_read_org(scope: &str) -> bool {
    scope
        .split(|character: char| character.is_whitespace() || character == ',')
        .any(|part| part == "read:org")
}

fn load_github_identity_from_token(
    token: &str,
    cached_profile: Option<&ProviderProfile>,
) -> Result<Option<ProviderUserInfo>, RepositoryPublishingError> {
    if !github_profile_needs_refresh(cached_profile) {
        return Ok(None);
    }

    match fetch_user_info(&OAuthProvider::GitHub, token) {
        Ok(user_info) => Ok(Some(user_info)),
        Err(error) => {
            if cached_profile_has_username(cached_profile) {
                log::warn!(
                    "Falling back to cached GitHub identity because live user lookup failed: {}",
                    error
                );
                Ok(None)
            } else {
                Err(RepositoryPublishingError::Message(format!(
                    "Failed to fetch GitHub user identity: {error}"
                )))
            }
        }
    }
}

fn list_github_organization_logins(token: &str) -> Result<Vec<String>, RepositoryPublishingError> {
    let mut organizations = Vec::new();
    let mut page = 1;

    loop {
        let url = OAuthProvider::GitHub.api_url(&format!(
            "user/orgs?per_page={PUBLISH_TARGET_PAGE_SIZE}&page={page}"
        ));
        let request = http::Request::get(&url)
            .header("Authorization", format!("Bearer {token}"))
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", APP_USER_AGENT)
            .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
            .body(())
            .map_err(|error| {
                RepositoryPublishingError::Message(format!(
                    "Failed to build GitHub publish targets request: {error}"
                ))
            })?;
        let page_records: Vec<GitHubOrganizationRecord> =
            execute_json_request(request, "list GitHub publish targets")?;

        let page_size = page_records.len();
        organizations.extend(
            page_records
                .into_iter()
                .filter_map(|record| normalize_provider_value(&record.login)),
        );

        if page_size < PUBLISH_TARGET_PAGE_SIZE {
            break;
        }

        page += 1;
    }

    Ok(organizations)
}

fn list_gitlab_publish_targets() -> Result<Vec<PublishTarget>, RepositoryPublishingError> {
    let token = require_provider_token(OAuthProvider::GitLab)?;
    let mut records = Vec::new();
    let mut page = 1;

    loop {
        let url = OAuthProvider::GitLab.api_url(&format!(
            "namespaces?per_page={PUBLISH_TARGET_PAGE_SIZE}&page={page}"
        ));
        let request = http::Request::get(&url)
            .header("PRIVATE-TOKEN", &token)
            .header("Accept", "application/json")
            .header("User-Agent", APP_USER_AGENT)
            .body(())
            .map_err(|error| {
                RepositoryPublishingError::Message(format!(
                    "Failed to build GitLab publish targets request: {error}"
                ))
            })?;
        let page_records: Vec<GitLabNamespaceRecord> =
            execute_json_request(request, "list GitLab publish targets")?;
        let page_size = page_records.len();

        records.extend(page_records);

        if page_size < PUBLISH_TARGET_PAGE_SIZE {
            break;
        }

        page += 1;
    }

    Ok(normalize_gitlab_targets(&records))
}

fn list_bitbucket_publish_targets() -> Result<Vec<PublishTarget>, RepositoryPublishingError> {
    let token = require_provider_token(OAuthProvider::Bitbucket)?;
    let mut records = Vec::new();
    let mut next_url = Some(OAuthProvider::Bitbucket.api_url(&format!(
        "user/workspaces?pagelen={PUBLISH_TARGET_PAGE_SIZE}"
    )));

    while let Some(url) = next_url.take() {
        let request = http::Request::get(&url)
            .header("Authorization", format!("Bearer {token}"))
            .header("Accept", "application/json")
            .header("User-Agent", APP_USER_AGENT)
            .body(())
            .map_err(|error| {
                RepositoryPublishingError::Message(format!(
                    "Failed to build Bitbucket publish targets request: {error}"
                ))
            })?;
        let page: BitbucketWorkspaceAccessPage =
            execute_json_request(request, "list Bitbucket publish targets")?;
        next_url = page.next;

        for workspace_access in page.values {
            let workspace = workspace_access.workspace;
            let Some(slug) = normalize_provider_value(&workspace.slug) else {
                continue;
            };
            let display_name = workspace
                .name
                .as_deref()
                .and_then(normalize_provider_value)
                .unwrap_or_else(|| slug.clone());
            let avatar_url = workspace
                .links
                .and_then(|links| links.avatar)
                .and_then(|avatar| normalize_provider_value(&avatar.href));

            records.push(BitbucketWorkspaceRecord {
                slug,
                display_name,
                uuid: workspace.uuid,
                avatar_url,
            });
        }
    }

    Ok(normalize_bitbucket_targets(&records))
}

fn require_provider_token(provider: OAuthProvider) -> Result<String, RepositoryPublishingError> {
    let display_name = provider.display_name().to_string();

    get_oauth_token_for_provider(provider)
        .map_err(|error| RepositoryPublishingError::Message(error.to_string()))?
        .filter(|token| !token.trim().is_empty())
        .ok_or_else(|| {
            RepositoryPublishingError::Message(format!(
                "{display_name} is not connected. Connect {display_name} before listing publish targets."
            ))
        })
}

#[derive(Clone, Debug)]
struct ParsedCreateRemoteTarget {
    kind: String,
    identifier: String,
}

#[derive(Clone, Debug, Deserialize)]
struct GitHubCreatedRepositoryRecord {
    clone_url: String,
    ssh_url: Option<String>,
    html_url: String,
}

#[derive(Clone, Debug, Deserialize)]
struct GitLabCreatedRepositoryRecord {
    http_url_to_repo: String,
    ssh_url_to_repo: Option<String>,
    web_url: String,
}

#[derive(Clone, Debug, Deserialize)]
struct BitbucketCreatedRepositoryRecord {
    links: BitbucketCreatedRepositoryLinks,
}

#[derive(Clone, Debug, Deserialize)]
struct BitbucketCreatedRepositoryLinks {
    #[serde(default)]
    clone: Vec<BitbucketCreatedRepositoryCloneLink>,
    #[serde(default)]
    html: Option<BitbucketLinkRecord>,
}

#[derive(Clone, Debug, Deserialize)]
struct BitbucketCreatedRepositoryCloneLink {
    href: String,
    name: String,
}

pub(crate) fn build_create_remote_request(
    request: &PublishRepositoryRequest,
) -> Result<CreateRemoteRequest, RepositoryPublishingError> {
    validate_publish_request(request)?;

    let provider = parse_publish_provider(&request.provider)?;
    let visibility = parse_publish_visibility(&request.visibility)?;
    let target = parse_create_remote_target(&provider, &request.target_id)?;
    let repo_name = request.repo_name.trim().to_string();
    let repo_slug = normalize_provider_repo_path_segment(&repo_name);

    let (url, body) = match provider {
        PublishProvider::GitHub => {
            let target_path = match target.kind.as_str() {
                "personal" => "user/repos".to_string(),
                "organization" => format!("orgs/{}/repos", target.identifier),
                _ => {
                    return Err(RepositoryPublishingError::InvalidTargetId(
                        request.target_id.trim().to_string(),
                    ));
                }
            };

            (
                OAuthProvider::GitHub.api_url(&target_path),
                serde_json::json!({
                    "name": repo_name,
                    "private": matches!(visibility, PublishVisibility::Private),
                }),
            )
        }
        PublishProvider::GitLab => {
            let namespace_id = target.identifier.parse::<i64>().map_err(|_| {
                RepositoryPublishingError::InvalidTargetId(request.target_id.trim().to_string())
            })?;

            (
                OAuthProvider::GitLab.api_url("projects"),
                serde_json::json!({
                    "name": repo_name,
                    "path": repo_slug,
                    "namespace_id": namespace_id,
                    "visibility": visibility.as_str(),
                }),
            )
        }
        PublishProvider::Bitbucket => (
            OAuthProvider::Bitbucket
                .api_url(&format!("repositories/{}/{}", target.identifier, repo_slug)),
            serde_json::json!({
                "scm": "git",
                "is_private": matches!(visibility, PublishVisibility::Private),
                "name": repo_name,
            }),
        ),
    };

    Ok(CreateRemoteRequest {
        provider,
        url,
        body,
    })
}

pub(crate) fn create_remote_repository(
    request: PublishRepositoryRequest,
) -> Result<CreatedRemoteRepository, RepositoryPublishingError> {
    validate_publish_request(&request)?;

    let create_request = build_create_remote_request(&request)?;
    let provider = create_request.provider.clone();
    let token = require_provider_token(match create_request.provider {
        PublishProvider::GitHub => OAuthProvider::GitHub,
        PublishProvider::GitLab => OAuthProvider::GitLab,
        PublishProvider::Bitbucket => OAuthProvider::Bitbucket,
    })?;
    let http_request = build_create_remote_http_request(&create_request, &token)?;
    let response = execute_create_remote_http_request(http_request, provider.clone())?;

    parse_created_remote_repository(provider, response)
}

fn build_create_remote_http_request(
    request: &CreateRemoteRequest,
    token: &str,
) -> Result<http::Request<String>, RepositoryPublishingError> {
    let body = serde_json::to_string(&request.body).map_err(|error| {
        RepositoryPublishingError::Message(format!(
            "Failed to encode repository creation payload: {error}"
        ))
    })?;

    let builder = http::Request::post(&request.url);
    let builder = match request.provider {
        PublishProvider::GitHub => builder
            .header("Authorization", format!("Bearer {token}"))
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", APP_USER_AGENT)
            .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
            .header("Content-Type", "application/json"),
        PublishProvider::GitLab => builder
            .header("PRIVATE-TOKEN", token)
            .header("Accept", "application/json")
            .header("User-Agent", APP_USER_AGENT)
            .header("Content-Type", "application/json"),
        PublishProvider::Bitbucket => builder
            .header("Authorization", format!("Bearer {token}"))
            .header("Accept", "application/json")
            .header("User-Agent", APP_USER_AGENT)
            .header("Content-Type", "application/json"),
    };

    builder.body(body).map_err(|error| {
        RepositoryPublishingError::Message(format!(
            "Failed to build repository creation request: {error}"
        ))
    })
}

fn execute_create_remote_http_request(
    request: http::Request<String>,
    provider: PublishProvider,
) -> Result<serde_json::Value, RepositoryPublishingError> {
    let config = ureq::config::Config::builder()
        .timeout_global(Some(std::time::Duration::from_secs(10)))
        .http_status_as_error(false)
        .build();
    let agent = ureq::Agent::new_with_config(config);

    let response = agent.run(request).map_err(|error| {
        RepositoryPublishingError::Message(format!(
            "Failed to create {} repository: {error}",
            provider.as_str()
        ))
    })?;
    let status = response.status().as_u16();
    let mut body = String::new();

    response
        .into_body()
        .into_reader()
        .read_to_string(&mut body)
        .map_err(|error| {
            RepositoryPublishingError::Message(format!(
                "Failed to read {} repository creation response: {error}",
                provider.as_str()
            ))
        })?;

    if !(200..300).contains(&status) {
        return Err(normalize_publish_http_error(status, &body));
    }

    serde_json::from_str(&body).map_err(|error| {
        RepositoryPublishingError::Message(format!(
            "Failed to parse {} repository creation response: {error}",
            provider.as_str()
        ))
    })
}

fn parse_created_remote_repository(
    provider: PublishProvider,
    response: serde_json::Value,
) -> Result<CreatedRemoteRepository, RepositoryPublishingError> {
    match provider {
        PublishProvider::GitHub => {
            let record: GitHubCreatedRepositoryRecord =
                serde_json::from_value(response).map_err(|error| {
                    RepositoryPublishingError::Message(format!(
                        "Failed to parse GitHub repository creation response: {error}"
                    ))
                })?;

            Ok(CreatedRemoteRepository {
                clone_url: record.clone_url,
                ssh_clone_url: record.ssh_url,
                web_url: record.html_url,
            })
        }
        PublishProvider::GitLab => {
            let record: GitLabCreatedRepositoryRecord =
                serde_json::from_value(response).map_err(|error| {
                    RepositoryPublishingError::Message(format!(
                        "Failed to parse GitLab repository creation response: {error}"
                    ))
                })?;

            Ok(CreatedRemoteRepository {
                clone_url: record.http_url_to_repo,
                ssh_clone_url: record.ssh_url_to_repo,
                web_url: record.web_url,
            })
        }
        PublishProvider::Bitbucket => {
            let record: BitbucketCreatedRepositoryRecord = serde_json::from_value(response)
                .map_err(|error| {
                    RepositoryPublishingError::Message(format!(
                        "Failed to parse Bitbucket repository creation response: {error}"
                    ))
                })?;

            let mut clone_url = None;
            let mut ssh_clone_url = None;

            for link in record.links.clone {
                let normalized_name = link.name.trim().to_lowercase();
                if normalized_name == "https" {
                    clone_url = Some(link.href.clone());
                }
                if normalized_name == "ssh" {
                    ssh_clone_url = Some(link.href);
                }
            }

            let clone_url = clone_url.ok_or_else(|| {
                RepositoryPublishingError::Message(
                    "Bitbucket repository creation response did not include an HTTPS clone URL"
                        .to_string(),
                )
            })?;
            let web_url = record
                .links
                .html
                .map(|link| link.href)
                .unwrap_or_else(|| clone_url.clone());

            Ok(CreatedRemoteRepository {
                clone_url,
                ssh_clone_url,
                web_url,
            })
        }
    }
}

pub(crate) fn normalize_publish_http_error(status: u16, body: &str) -> RepositoryPublishingError {
    let normalized_body = body.trim();
    let normalized_body_lower = normalized_body.to_lowercase();
    let duplicate_conflict = normalized_body_lower.contains("already exists")
        || normalized_body_lower.contains("already been taken")
        || normalized_body_lower.contains("duplicate")
        || normalized_body_lower.contains("conflict");

    if duplicate_conflict {
        return RepositoryPublishingError::Message(
            "A repository with that name already exists".to_string(),
        );
    }

    RepositoryPublishingError::Message(format!("API returned status {status}: {normalized_body}"))
}

fn normalize_provider_repo_path_segment(value: &str) -> String {
    let mut normalized = String::with_capacity(value.len());
    let mut pending_dash = false;

    for character in value.trim().chars() {
        if character.is_whitespace() {
            pending_dash = !normalized.is_empty();
            continue;
        }

        if pending_dash {
            normalized.push('-');
            pending_dash = false;
        }

        normalized.push(character.to_ascii_lowercase());
    }

    normalized
}

fn parse_create_remote_target(
    provider: &PublishProvider,
    target_id: &str,
) -> Result<ParsedCreateRemoteTarget, RepositoryPublishingError> {
    let trimmed_target_id = target_id.trim();
    let mut parts = trimmed_target_id.split(':');
    let provider_part = parts
        .next()
        .ok_or_else(|| RepositoryPublishingError::InvalidTargetId(trimmed_target_id.to_string()))?;
    let kind_part = parts
        .next()
        .ok_or_else(|| RepositoryPublishingError::InvalidTargetId(trimmed_target_id.to_string()))?;
    let identifier_part = parts
        .next()
        .ok_or_else(|| RepositoryPublishingError::InvalidTargetId(trimmed_target_id.to_string()))?;

    if parts.next().is_some()
        || provider_part.trim() != provider_part
        || kind_part.trim() != kind_part
        || identifier_part.trim() != identifier_part
        || identifier_part.is_empty()
    {
        return Err(RepositoryPublishingError::InvalidTargetId(
            trimmed_target_id.to_string(),
        ));
    }

    let matches_provider_pattern = match provider {
        PublishProvider::GitHub => {
            provider_part == "github" && matches!(kind_part, "personal" | "organization")
        }
        PublishProvider::GitLab => provider_part == "gitlab" && kind_part == "namespace",
        PublishProvider::Bitbucket => provider_part == "bitbucket" && kind_part == "workspace",
    };

    if !matches_provider_pattern {
        return Err(RepositoryPublishingError::InvalidTargetId(
            trimmed_target_id.to_string(),
        ));
    }

    Ok(ParsedCreateRemoteTarget {
        kind: kind_part.to_string(),
        identifier: identifier_part.to_string(),
    })
}

fn normalize_provider_value(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    Some(trimmed.to_string())
}

fn cached_profile_has_username(profile: Option<&ProviderProfile>) -> bool {
    profile
        .and_then(|profile| profile.username.as_deref())
        .and_then(normalize_provider_value)
        .is_some()
}

fn github_profile_needs_refresh(profile: Option<&ProviderProfile>) -> bool {
    let Some(profile) = profile else {
        return true;
    };

    profile
        .username
        .as_deref()
        .and_then(normalize_provider_value)
        .is_none()
        || profile
            .avatar_url
            .as_deref()
            .and_then(normalize_provider_value)
            .is_none()
}

fn resolve_github_identity(
    profile: Option<&ProviderProfile>,
    fetched_user: Option<&ProviderUserInfo>,
) -> Result<(String, Option<String>), RepositoryPublishingError> {
    let username = profile
        .and_then(|profile| profile.username.as_deref())
        .and_then(normalize_provider_value)
        .or_else(|| {
            fetched_user.and_then(|user_info| normalize_provider_value(&user_info.username))
        })
        .ok_or_else(|| {
            RepositoryPublishingError::Message(
                "GitHub username is unavailable. Reconnect GitHub to refresh profile data."
                    .to_string(),
            )
        })?;
    let avatar_url = profile
        .and_then(|profile| profile.avatar_url.as_deref())
        .and_then(normalize_provider_value)
        .or_else(|| {
            fetched_user.and_then(|user_info| {
                user_info
                    .avatar_url
                    .as_deref()
                    .and_then(normalize_provider_value)
            })
        });

    Ok((username, avatar_url))
}

fn execute_json_request<T, B>(
    request: http::Request<B>,
    action: &'static str,
) -> Result<T, RepositoryPublishingError>
where
    T: DeserializeOwned,
    B: ureq::AsSendBody,
{
    let config = ureq::config::Config::builder()
        .timeout_global(Some(std::time::Duration::from_secs(10)))
        .http_status_as_error(false)
        .build();
    let agent = ureq::Agent::new_with_config(config);

    let response = agent.run(request).map_err(|error| {
        RepositoryPublishingError::Message(format!("Failed to {action}: {error}"))
    })?;
    let status = response.status().as_u16();
    let mut body = String::new();

    response
        .into_body()
        .into_reader()
        .read_to_string(&mut body)
        .map_err(|error| {
            RepositoryPublishingError::Message(format!("Failed to read {action} response: {error}"))
        })?;

    if !(200..300).contains(&status) {
        return Err(RepositoryPublishingError::Message(format!(
            "Failed to {action}: API returned status {status}: {body}"
        )));
    }

    serde_json::from_str(&body).map_err(|error| {
        RepositoryPublishingError::Message(format!("Failed to parse {action} response: {error}"))
    })
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::integrations_store::{
        IntegrationsConfig, ProviderConfig, ProviderProfile, StoredToken,
    };
    use crate::oauth::ProviderUserInfo;

    use super::{
        build_create_remote_request, github_publish_targets_require_org_scope,
        normalize_bitbucket_targets, normalize_github_targets, normalize_gitlab_targets,
        normalize_publish_http_error, parse_publish_provider, parse_publish_visibility,
        resolve_github_identity, validate_publish_request, BitbucketWorkspaceRecord,
        GitLabNamespaceRecord, PublishRepositoryRequest, RepositoryPublishingError,
    };

    #[test]
    fn parse_publish_provider_accepts_supported_providers() {
        assert_eq!(
            parse_publish_provider("github").unwrap(),
            super::PublishProvider::GitHub
        );
        assert_eq!(
            parse_publish_provider("GitLab").unwrap(),
            super::PublishProvider::GitLab
        );
        assert_eq!(
            parse_publish_provider("BITBUCKET").unwrap(),
            super::PublishProvider::Bitbucket
        );
    }

    #[test]
    fn parse_publish_provider_rejects_unknown_provider() {
        assert_eq!(
            parse_publish_provider("  sourcehut  ").unwrap_err(),
            RepositoryPublishingError::UnknownProvider("sourcehut".to_string())
        );
    }

    #[test]
    fn parse_publish_visibility_accepts_public_and_private() {
        assert_eq!(
            parse_publish_visibility("public").unwrap(),
            super::PublishVisibility::Public
        );
        assert_eq!(
            parse_publish_visibility(" private ").unwrap(),
            super::PublishVisibility::Private
        );
    }

    #[test]
    fn parse_publish_visibility_rejects_invalid_visibility() {
        assert_eq!(
            parse_publish_visibility("internal").unwrap_err(),
            RepositoryPublishingError::InvalidVisibility
        );
    }

    #[test]
    fn parse_publish_visibility_rejects_blank_visibility() {
        assert_eq!(
            parse_publish_visibility("   ").unwrap_err(),
            RepositoryPublishingError::MissingVisibility
        );
    }

    #[test]
    fn validate_publish_request_rejects_blank_repo_name() {
        let request = PublishRepositoryRequest {
            provider: "github".to_string(),
            target_id: "github:personal:octocat".to_string(),
            repo_name: "   ".to_string(),
            visibility: "private".to_string(),
        };

        let error = validate_publish_request(&request).unwrap_err();
        assert_eq!(error, RepositoryPublishingError::MissingRepositoryName);
    }

    #[test]
    fn validate_publish_request_rejects_blank_target() {
        let request = PublishRepositoryRequest {
            provider: "github".to_string(),
            target_id: "   ".to_string(),
            repo_name: "demo".to_string(),
            visibility: "private".to_string(),
        };

        let error = validate_publish_request(&request).unwrap_err();
        assert_eq!(error, RepositoryPublishingError::MissingTarget);
    }

    #[test]
    fn validate_publish_request_rejects_cross_provider_target_id() {
        let request = PublishRepositoryRequest {
            provider: "github".to_string(),
            target_id: "gitlab:namespace:2".to_string(),
            repo_name: "demo".to_string(),
            visibility: "private".to_string(),
        };

        let error = validate_publish_request(&request).unwrap_err();
        assert_eq!(
            error,
            RepositoryPublishingError::InvalidTargetId("gitlab:namespace:2".to_string())
        );
    }

    #[test]
    fn validate_publish_request_rejects_malformed_target_id() {
        let request = PublishRepositoryRequest {
            provider: "github".to_string(),
            target_id: "github:personal".to_string(),
            repo_name: "demo".to_string(),
            visibility: "private".to_string(),
        };

        let error = validate_publish_request(&request).unwrap_err();
        assert_eq!(
            error,
            RepositoryPublishingError::InvalidTargetId("github:personal".to_string())
        );
    }

    #[test]
    fn validate_publish_request_accepts_valid_request() {
        let request = PublishRepositoryRequest {
            provider: "GitHub".to_string(),
            target_id: "github:personal:octocat".to_string(),
            repo_name: "demo".to_string(),
            visibility: "public".to_string(),
        };

        assert_eq!(validate_publish_request(&request), Ok(()));
    }

    #[test]
    fn validate_publish_request_delegates_repository_name_validation() {
        let request = PublishRepositoryRequest {
            provider: "github".to_string(),
            target_id: "github:personal:octocat".to_string(),
            repo_name: "bad/name".to_string(),
            visibility: "private".to_string(),
        };

        assert_eq!(
            validate_publish_request(&request).unwrap_err(),
            RepositoryPublishingError::InvalidRepositoryName(
                "Repository name cannot contain path separators".to_string()
            )
        );
    }

    #[test]
    fn github_publish_targets_include_personal_and_org_destinations() {
        let targets = normalize_github_targets(
            "octocat",
            Some("https://example.com/me.png".to_string()),
            &["github".to_string(), "acme".to_string()],
        );

        assert_eq!(targets[0].id, "github:personal:octocat");
        assert_eq!(targets[0].kind, "personal");
        assert_eq!(targets[1].id, "github:organization:github");
        assert_eq!(targets[2].id, "github:organization:acme");
    }

    #[test]
    fn gitlab_publish_targets_preserve_group_and_subgroup_paths() {
        let targets = normalize_gitlab_targets(&[
            GitLabNamespaceRecord {
                id: 1,
                full_path: "alex".to_string(),
                kind: "user".to_string(),
                name: "alex".to_string(),
                avatar_url: None,
            },
            GitLabNamespaceRecord {
                id: 2,
                full_path: "acme/platform".to_string(),
                kind: "group".to_string(),
                name: "platform".to_string(),
                avatar_url: None,
            },
        ]);

        assert_eq!(targets[0].id, "gitlab:namespace:1");
        assert_eq!(targets[0].full_path, "alex");
        assert_eq!(targets[0].kind, "user");
        assert_eq!(targets[1].id, "gitlab:namespace:2");
        assert_eq!(targets[1].full_path, "acme/platform");
        assert_eq!(targets[1].kind, "group");
    }

    #[test]
    fn bitbucket_publish_targets_map_workspaces() {
        let targets = normalize_bitbucket_targets(&[BitbucketWorkspaceRecord {
            slug: "acme".to_string(),
            display_name: "Acme".to_string(),
            uuid: "{workspace-1}".to_string(),
            avatar_url: None,
        }]);

        assert_eq!(targets[0].id, "bitbucket:workspace:acme");
        assert_eq!(targets[0].kind, "workspace");
    }

    #[test]
    fn github_publish_targets_reject_stale_scopes_without_read_org() {
        let config = IntegrationsConfig {
            profile_id: "profile_123".to_string(),
            providers: {
                let mut providers = HashMap::new();
                providers.insert(
                    "github".to_string(),
                    ProviderConfig {
                        oauth_token: Some(StoredToken {
                            access_token: "ghp_test123".to_string(),
                            refresh_token: None,
                            expires_at: None,
                            scope: "repo read:user".to_string(),
                        }),
                        profile: Some(ProviderProfile {
                            username: Some("octocat".to_string()),
                            display_name: Some("The Octocat".to_string()),
                            avatar_url: None,
                            emails: Vec::new(),
                        }),
                        ssh_key: None,
                        use_system_agent: true,
                    },
                );
                providers
            },
        };

        let error = github_publish_targets_require_org_scope(&config).unwrap_err();

        assert_eq!(
            error,
            RepositoryPublishingError::Message(
                "Reconnect GitHub to load organization destinations.".to_string()
            )
        );
    }

    #[test]
    fn github_publish_targets_can_resolve_identity_from_live_user_info() {
        let profile = ProviderProfile {
            username: None,
            display_name: Some("The Octocat".to_string()),
            avatar_url: None,
            emails: Vec::new(),
        };
        let fetched_user = ProviderUserInfo {
            username: "octocat".to_string(),
            display_name: "The Octocat".to_string(),
            avatar_url: Some("https://example.com/octocat.png".to_string()),
            emails: Vec::new(),
        };

        let identity =
            resolve_github_identity(Some(&profile), Some(&fetched_user)).expect("identity");

        assert_eq!(identity.0, "octocat");
        assert_eq!(
            identity.1.as_deref(),
            Some("https://example.com/octocat.png")
        );
    }

    #[test]
    fn github_create_request_uses_org_endpoint_for_org_targets() {
        let request = PublishRepositoryRequest {
            provider: "github".to_string(),
            target_id: "github:organization:litgit".to_string(),
            repo_name: "demo".to_string(),
            visibility: "private".to_string(),
        };

        let create_request = build_create_remote_request(&request).expect("request");

        assert_eq!(
            create_request.url,
            "https://api.github.com/orgs/litgit/repos"
        );
        assert_eq!(create_request.body["name"], "demo");
        assert_eq!(create_request.body["private"], true);
    }

    #[test]
    fn gitlab_create_request_uses_namespace_id() {
        let request = PublishRepositoryRequest {
            provider: "gitlab".to_string(),
            target_id: "gitlab:namespace:42".to_string(),
            repo_name: "demo".to_string(),
            visibility: "public".to_string(),
        };

        let create_request = build_create_remote_request(&request).expect("request");

        assert_eq!(create_request.url, "https://gitlab.com/api/v4/projects");
        assert_eq!(create_request.body["name"], "demo");
        assert_eq!(create_request.body["namespace_id"], 42);
        assert_eq!(create_request.body["visibility"], "public");
    }

    #[test]
    fn gitlab_create_request_normalizes_path_for_spaces() {
        let request = PublishRepositoryRequest {
            provider: "gitlab".to_string(),
            target_id: "gitlab:namespace:42".to_string(),
            repo_name: "My Project".to_string(),
            visibility: "private".to_string(),
        };

        let create_request = build_create_remote_request(&request).expect("request");

        assert_eq!(create_request.body["name"], "My Project");
        assert_eq!(create_request.body["path"], "my-project");
    }

    #[test]
    fn bitbucket_create_request_uses_workspace_slug() {
        let request = PublishRepositoryRequest {
            provider: "bitbucket".to_string(),
            target_id: "bitbucket:workspace:acme".to_string(),
            repo_name: "demo".to_string(),
            visibility: "private".to_string(),
        };

        let create_request = build_create_remote_request(&request).expect("request");

        assert_eq!(
            create_request.url,
            "https://api.bitbucket.org/2.0/repositories/acme/demo"
        );
        assert_eq!(create_request.body["scm"], "git");
        assert_eq!(create_request.body["is_private"], true);
    }

    #[test]
    fn bitbucket_create_request_normalizes_repo_slug_for_spaces() {
        let request = PublishRepositoryRequest {
            provider: "bitbucket".to_string(),
            target_id: "bitbucket:workspace:acme".to_string(),
            repo_name: "My Project".to_string(),
            visibility: "public".to_string(),
        };

        let create_request = build_create_remote_request(&request).expect("request");

        assert_eq!(
            create_request.url,
            "https://api.bitbucket.org/2.0/repositories/acme/my-project"
        );
        assert_eq!(create_request.body["name"], "My Project");
    }

    #[test]
    fn normalize_publish_error_maps_conflict_to_duplicate_repository_message() {
        let error = normalize_publish_http_error(409, "repository already exists");

        assert_eq!(
            error,
            RepositoryPublishingError::Message(
                "A repository with that name already exists".to_string()
            )
        );
    }

    #[test]
    fn normalize_publish_error_keeps_generic_409_without_duplicate_body() {
        let error = normalize_publish_http_error(409, "gateway timeout");

        assert_eq!(
            error,
            RepositoryPublishingError::Message(
                "API returned status 409: gateway timeout".to_string()
            )
        );
    }

    #[test]
    fn github_created_repository_response_parses_clone_and_web_urls() {
        let response = serde_json::json!({
            "clone_url": "https://github.com/litgit/demo.git",
            "ssh_url": "git@github.com:litgit/demo.git",
            "html_url": "https://github.com/litgit/demo"
        });

        let repository =
            super::parse_created_remote_repository(super::PublishProvider::GitHub, response)
                .expect("repository");

        assert_eq!(repository.clone_url, "https://github.com/litgit/demo.git");
        assert_eq!(
            repository.ssh_clone_url.as_deref(),
            Some("git@github.com:litgit/demo.git")
        );
        assert_eq!(repository.web_url, "https://github.com/litgit/demo");
    }

    #[test]
    fn bitbucket_created_repository_response_parses_clone_and_web_urls() {
        let response = serde_json::json!({
            "links": {
                "clone": [
                    { "href": "https://bitbucket.org/acme/demo.git", "name": "https" },
                    { "href": "git@bitbucket.org:acme/demo.git", "name": "ssh" }
                ],
                "html": { "href": "https://bitbucket.org/acme/demo", "name": "html" }
            }
        });

        let repository =
            super::parse_created_remote_repository(super::PublishProvider::Bitbucket, response)
                .expect("repository");

        assert_eq!(repository.clone_url, "https://bitbucket.org/acme/demo.git");
        assert_eq!(
            repository.ssh_clone_url.as_deref(),
            Some("git@bitbucket.org:acme/demo.git")
        );
        assert_eq!(repository.web_url, "https://bitbucket.org/acme/demo");
    }
}
