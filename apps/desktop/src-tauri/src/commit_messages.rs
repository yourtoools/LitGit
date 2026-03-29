use crate::git_support::{
    git_command, git_error_message, git_process_error_message, validate_git_repo,
};
use crate::settings::{
    apply_git_preferences, load_keyring_entry, resolve_ai_provider_secret,
    GitHubIdentityCacheRecord, RepoCommandPreferences, SettingsState, GITHUB_AVATAR_SERVICE,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

const AI_REQUEST_TIMEOUT_SECS: u64 = 20;
const COMMIT_MESSAGE_DEFAULT_OUTPUT_TOKEN_LIMIT: usize = 96;
const COMMIT_MESSAGE_MAX_OUTPUT_TOKEN_LIMIT: usize = 512;
const COMMIT_DIFF_STAT_MIN_BUDGET_CHARS: usize = 160;
const COMMIT_CHANGED_FILES_MIN_BUDGET_CHARS: usize = 128;
const COMMIT_RECENT_TITLES_MIN_BUDGET_CHARS: usize = 64;
const COMMIT_STAGED_DIFF_MIN_BUDGET_CHARS: usize = 512;
const COMMIT_FAST_MODE_DIFF_CHAR_THRESHOLD: usize = 12_000;
const COMMIT_FAST_MODE_FILE_COUNT_THRESHOLD: usize = 40;
const GITHUB_IDENTITY_CACHE_MAX_ENTRIES: usize = 1024;
const GITHUB_IDENTITY_CACHE_TTL: Duration = Duration::from_secs(60 * 60);
const GITHUB_IDENTITY_CACHE_FILE_NAME: &str = "github_identity_cache.json";
const GITHUB_IDENTITY_CACHE_VERSION: u8 = 1;

static AI_HTTP_AGENT: LazyLock<ureq::Agent> = LazyLock::new(|| {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(AI_REQUEST_TIMEOUT_SECS))
        .build()
});

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiModelInfo {
    id: String,
    label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeneratedCommitMessage {
    body: String,
    prompt_mode: String,
    provider_kind: String,
    schema_fallback_used: bool,
    title: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CommitPromptMode {
    Fast,
    Full,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AiRequestKind {
    Anthropic,
    Gemini,
    OpenAiCompatible,
}

#[derive(Clone, Default)]
pub(crate) struct GitHubIdentity {
    pub(crate) avatar_url: Option<String>,
    pub(crate) username: Option<String>,
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
    let cached_entry = state
        .mutate_github_identity_cache(|cache| cache.get(key).cloned())
        .ok()
        .flatten()?;
    let now_unix_seconds_value = now_unix_seconds();

    if is_github_identity_cache_entry_fresh(
        cached_entry.stored_at_unix_seconds,
        now_unix_seconds_value,
    ) {
        return Some(GitHubIdentity {
            avatar_url: cached_entry.avatar_url,
            username: cached_entry.username,
        });
    }

    let _ = state.mutate_github_identity_cache(|cache| {
        cache.remove(key);
    });
    None
}

fn github_identity_cache_file_path(state: &SettingsState) -> Option<PathBuf> {
    state.github_identity_cache_file_path()
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
    let mut entries = if let Ok(entries) = state.mutate_github_identity_cache(|cache| {
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
                    avatar_url: cached_entry.avatar_url.clone(),
                    cached_at_unix_seconds: cached_entry.stored_at_unix_seconds,
                    key: key.clone(),
                    username: cached_entry.username.clone(),
                })
            })
            .collect::<Vec<_>>()
    }) {
        entries
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

pub(crate) fn initialize_github_identity_cache(app: &AppHandle, state: &SettingsState) {
    let Ok(app_data_dir) = app.path().app_data_dir() else {
        return;
    };

    initialize_github_identity_cache_at_path(
        state,
        app_data_dir.join(GITHUB_IDENTITY_CACHE_FILE_NAME),
    );
}

fn initialize_github_identity_cache_at_path(state: &SettingsState, cache_file_path: PathBuf) {
    state.set_github_identity_cache_file_path(Some(cache_file_path.clone()));

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
    let mut restored_cache = std::collections::HashMap::new();

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
            GitHubIdentityCacheRecord {
                avatar_url: identity.avatar_url,
                stored_at_unix_seconds: entry.cached_at_unix_seconds,
                username: identity.username,
            },
        );
    }

    if state
        .mutate_github_identity_cache(move |cache| {
            *cache = restored_cache;
        })
        .is_err()
    {
        log::warn!("Failed to lock GitHub identity cache while initializing");
        return;
    }

    save_github_identity_cache_to_disk(state);
}

fn cache_github_identity(state: &SettingsState, key: &str, identity: &GitHubIdentity) {
    let now_unix_seconds_value = now_unix_seconds();
    let cache_result = state.mutate_github_identity_cache(|cache| {
        cache.retain(|_, entry| {
            is_github_identity_cache_entry_fresh(
                entry.stored_at_unix_seconds,
                now_unix_seconds_value,
            )
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
            GitHubIdentityCacheRecord {
                avatar_url: identity.avatar_url.clone(),
                stored_at_unix_seconds: now_unix_seconds_value,
                username: identity.username.clone(),
            },
        );
    });

    if cache_result.is_err() {
        log::warn!("Failed to lock GitHub identity cache for update");
        return;
    }

    save_github_identity_cache_to_disk(state);
}

pub(crate) fn clear_github_identity_cache(state: &SettingsState) {
    let changed = state
        .mutate_github_identity_cache(|cache| {
            let changed = !cache.is_empty();
            cache.clear();
            changed
        })
        .unwrap_or(false);

    if changed || github_identity_cache_file_path(state).is_some() {
        save_github_identity_cache_to_disk(state);
    }
}

fn get_github_token(state: &SettingsState) -> Option<String> {
    if let Ok(Some(token)) = load_keyring_entry(GITHUB_AVATAR_SERVICE, "token") {
        return Some(token);
    }

    state.github_session_token()
}

fn fetch_github_user_by_email(email: &str, token: &str) -> Option<GitHubIdentity> {
    let query = ureq::get("https://api.github.com/search/users")
        .query("q", &format!("{email} in:email"))
        .query("per_page", "1")
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/vnd.github+json")
        .set("X-GitHub-Api-Version", "2022-11-28")
        .call()
        .ok()?;

    let body = query.into_string().ok()?;
    let json: serde_json::Value = serde_json::from_str(&body).ok()?;
    let items = json.get("items")?.as_array()?;
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
        .query("q", &format!("{name} in:name"))
        .query("sort", "followers")
        .query("order", "desc")
        .query("per_page", "1")
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/vnd.github+json")
        .set("X-GitHub-Api-Version", "2022-11-28")
        .call()
        .ok()?;

    let body = query.into_string().ok()?;
    let json: serde_json::Value = serde_json::from_str(&body).ok()?;
    let items = json.get("items")?.as_array()?;
    let user = items.first()?;
    let login = user.get("login")?.as_str()?.to_string();
    let avatar_url = user.get("avatar_url")?.as_str()?.to_string();

    Some(GitHubIdentity {
        avatar_url: Some(avatar_url),
        username: Some(login),
    })
}

pub(crate) fn resolve_commit_identity(
    state: &SettingsState,
    email: &str,
    author: &str,
) -> GitHubIdentity {
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
        Some(token) => token,
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

#[tauri::command]
pub(crate) fn commit_repository_changes(
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
                "https://generativelanguage.googleapis.com/v1beta"
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
        .or_else(|| value.get("models").and_then(serde_json::Value::as_array))
        .ok_or_else(|| {
            "The configured AI endpoint did not return a supported model list.".to_string()
        })?;

    let mut models = data
        .iter()
        .filter_map(|entry| {
            let raw_id = entry
                .get("id")
                .and_then(serde_json::Value::as_str)
                .or_else(|| entry.get("name").and_then(serde_json::Value::as_str))?
                .trim();

            let id = raw_id.strip_prefix("models/").unwrap_or(raw_id);
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
        prompt_mode: String::new(),
        provider_kind: String::new(),
        schema_fallback_used: false,
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
    diff_stat: &str,
    changed_files: &str,
    staged_diff: &str,
    recent_titles: &str,
    instruction: &str,
    prompt_mode: CommitPromptMode,
) -> String {
    let diff_section = match prompt_mode {
        CommitPromptMode::Fast => {
            "Git diff hunks omitted because the staged diff is large. Infer the message from file changes and diff stats only.\n"
        }
        CommitPromptMode::Full => staged_diff,
    };

    format!(
        concat!(
            "You generate git commit messages.\n",
            "Rules:\n",
            "- Use staged changes only.\n",
            "- Title must be concise, imperative, and specific.\n",
            "- Body is optional and should be brief.\n",
            "- Do not mention files unless they matter.\n",
            "- If the body is unnecessary, return an empty string.\n\n",
            "User instruction:\n{instruction}\n\n",
            "Recent commit titles for tone/style continuity:\n{recent_titles}\n\n",
            "Changed staged files (git diff --cached --name-status):\n{changed_files}\n\n",
            "Git diff --cached --stat:\n{diff_stat}\n\n",
            "Git diff --cached --unified=0:\n{staged_diff}\n"
        ),
        instruction = instruction.trim(),
        recent_titles = recent_titles,
        changed_files = changed_files,
        diff_stat = diff_stat,
        staged_diff = diff_section
    )
}

fn build_commit_message_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "minLength": 1,
                "description": "A concise, specific, imperative git commit title."
            },
            "body": {
                "type": "string",
                "description": "An optional brief commit body. Return an empty string when unnecessary."
            }
        },
        "required": ["title", "body"],
        "additionalProperties": false
    })
}

fn build_legacy_json_commit_prompt(prompt: &str) -> String {
    format!(
        concat!(
            "Return strict JSON with exactly this shape: ",
            "{{\"title\":\"string\",\"body\":\"string\"}}.\n",
            "Do not wrap the JSON in markdown.\n\n",
            "{prompt}"
        ),
        prompt = prompt
    )
}

fn get_commit_prompt_mode(staged_diff: &str, changed_files: &str) -> CommitPromptMode {
    let changed_file_count = changed_files.lines().count();

    if staged_diff.len() > COMMIT_FAST_MODE_DIFF_CHAR_THRESHOLD
        || changed_file_count > COMMIT_FAST_MODE_FILE_COUNT_THRESHOLD
    {
        return CommitPromptMode::Fast;
    }

    CommitPromptMode::Full
}

fn commit_prompt_mode_label(prompt_mode: CommitPromptMode) -> &'static str {
    match prompt_mode {
        CommitPromptMode::Fast => "fast",
        CommitPromptMode::Full => "full",
    }
}

fn get_ai_request_kind(provider: &str, base_url: &str) -> AiRequestKind {
    match provider.trim() {
        "anthropic" => AiRequestKind::Anthropic,
        "google" => AiRequestKind::Gemini,
        _ if base_url.contains("generativelanguage.googleapis.com") => AiRequestKind::Gemini,
        _ => AiRequestKind::OpenAiCompatible,
    }
}

fn ai_request_kind_label(request_kind: AiRequestKind) -> &'static str {
    match request_kind {
        AiRequestKind::Anthropic => "anthropic",
        AiRequestKind::Gemini => "gemini",
        AiRequestKind::OpenAiCompatible => "openai-compatible",
    }
}

fn create_ai_post_request(url: &str, request_kind: AiRequestKind, secret: &str) -> ureq::Request {
    let request = AI_HTTP_AGENT
        .post(url)
        .set("Accept", "application/json")
        .set("Content-Type", "application/json");

    match request_kind {
        AiRequestKind::Anthropic => request
            .set("x-api-key", secret)
            .set("anthropic-version", "2023-06-01"),
        AiRequestKind::Gemini => request.set("x-goog-api-key", secret),
        AiRequestKind::OpenAiCompatible => {
            request.set("Authorization", &format!("Bearer {secret}"))
        }
    }
}

fn extract_anthropic_message_content(value: &serde_json::Value) -> Option<String> {
    let content_parts = value.get("content")?.as_array()?;
    let mut combined = String::new();

    for part in content_parts {
        let text = match part.get("type")?.as_str()? {
            "text" => part.get("text").and_then(serde_json::Value::as_str)?,
            _ => continue,
        };

        combined.push_str(text);
    }

    if combined.is_empty() {
        return None;
    }

    Some(combined)
}

fn extract_gemini_message_content(value: &serde_json::Value) -> Option<String> {
    let parts = value
        .get("candidates")?
        .as_array()?
        .first()?
        .get("content")?
        .get("parts")?
        .as_array()?;
    let mut combined = String::new();

    for part in parts {
        let text = part.get("text").and_then(serde_json::Value::as_str)?;
        combined.push_str(text);
    }

    if combined.is_empty() {
        return None;
    }

    Some(combined)
}

fn extract_ai_commit_message_content(
    value: &serde_json::Value,
    request_kind: AiRequestKind,
) -> Option<String> {
    match request_kind {
        AiRequestKind::Anthropic => extract_anthropic_message_content(value),
        AiRequestKind::Gemini => extract_gemini_message_content(value),
        AiRequestKind::OpenAiCompatible => extract_ai_message_content(value),
    }
}

fn send_ai_json_request(
    url: &str,
    request_kind: AiRequestKind,
    secret: &str,
    request_body: &serde_json::Value,
) -> Result<ureq::Response, String> {
    create_ai_post_request(url, request_kind, secret)
        .send_string(&request_body.to_string())
        .map_err(map_ai_http_error)
}

fn truncate_for_ai_budget(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }

    let truncated = value.chars().take(max_chars).collect::<String>();
    format!("{truncated}\n...[truncated]")
}

#[tauri::command]
pub(crate) fn list_ai_models(
    state: State<'_, SettingsState>,
    provider: String,
    custom_endpoint: String,
) -> Result<Vec<AiModelInfo>, String> {
    let secret = resolve_ai_provider_secret(&state, &provider)?;
    let base_url = resolve_ai_base_url(&provider, &custom_endpoint)?;
    let models_url = format!("{base_url}/models");
    let request_kind = get_ai_request_kind(&provider, &base_url);
    let response = match request_kind {
        AiRequestKind::Anthropic => AI_HTTP_AGENT
            .get(&models_url)
            .set("Accept", "application/json")
            .set("x-api-key", &secret)
            .set("anthropic-version", "2023-06-01")
            .call()
            .map_err(map_ai_http_error)?,
        AiRequestKind::Gemini => AI_HTTP_AGENT
            .get(&models_url)
            .set("Accept", "application/json")
            .set("x-goog-api-key", &secret)
            .call()
            .map_err(map_ai_http_error)?,
        AiRequestKind::OpenAiCompatible => AI_HTTP_AGENT
            .get(&models_url)
            .set("Accept", "application/json")
            .set("Authorization", &format!("Bearer {secret}"))
            .call()
            .map_err(map_ai_http_error)?,
    };
    let body = read_ureq_response_string(response)?;
    let payload: serde_json::Value = serde_json::from_str(&body)
        .map_err(|_| "The configured AI endpoint is not OpenAI-compatible.".to_string())?;

    parse_ai_model_list(&payload)
}

#[tauri::command]
pub(crate) fn generate_repository_commit_message(
    state: State<'_, SettingsState>,
    repo_path: String,
    provider: String,
    custom_endpoint: String,
    model: String,
    instruction: String,
    max_input_tokens: usize,
    max_output_tokens: usize,
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

    let changed_files = run_git_text_command(
        &repo_path,
        &["diff", "--cached", "--name-status", "--find-renames"],
        "Failed to inspect staged files",
    )?;
    let staged_diff = run_git_text_command(
        &repo_path,
        &["diff", "--cached", "--unified=0"],
        "Failed to inspect staged diff",
    )?;
    let recent_titles = run_git_text_command(
        &repo_path,
        &["log", "-3", "--pretty=format:%s"],
        "Failed to inspect recent commits",
    )
    .unwrap_or_default();
    let prompt_mode = get_commit_prompt_mode(&staged_diff, &changed_files);
    let input_budget_chars = max_input_tokens.clamp(256, 2048).saturating_mul(4);
    let staged_diff_budget = input_budget_chars.saturating_mul(68) / 100;
    let diff_stat_budget = input_budget_chars.saturating_mul(18) / 100;
    let changed_files_budget = input_budget_chars.saturating_mul(9) / 100;
    let recent_titles_budget = input_budget_chars.saturating_mul(5) / 100;
    let truncated_staged_diff = if prompt_mode == CommitPromptMode::Fast {
        String::new()
    } else {
        truncate_for_ai_budget(
            &staged_diff,
            staged_diff_budget.max(COMMIT_STAGED_DIFF_MIN_BUDGET_CHARS),
        )
    };
    let truncated_diff_stat = truncate_for_ai_budget(
        &diff_stat,
        diff_stat_budget.max(COMMIT_DIFF_STAT_MIN_BUDGET_CHARS),
    );
    let truncated_changed_files = truncate_for_ai_budget(
        &changed_files,
        changed_files_budget.max(COMMIT_CHANGED_FILES_MIN_BUDGET_CHARS),
    );
    let truncated_recent_titles = truncate_for_ai_budget(
        &recent_titles,
        recent_titles_budget.max(COMMIT_RECENT_TITLES_MIN_BUDGET_CHARS),
    );

    let prompt = build_commit_generation_prompt(
        &truncated_diff_stat,
        &truncated_changed_files,
        &truncated_staged_diff,
        &truncated_recent_titles,
        &instruction,
        prompt_mode,
    );
    let secret = resolve_ai_provider_secret(&state, &provider)?;
    let base_url = resolve_ai_base_url(&provider, &custom_endpoint)?;
    let request_kind = get_ai_request_kind(&provider, &base_url);
    let output_token_limit = max_output_tokens
        .max(COMMIT_MESSAGE_DEFAULT_OUTPUT_TOKEN_LIMIT)
        .clamp(32, COMMIT_MESSAGE_MAX_OUTPUT_TOKEN_LIMIT);
    let schema = build_commit_message_schema();
    let (request_url, request_body) = match request_kind {
        AiRequestKind::Anthropic => (
            format!("{base_url}/messages"),
            serde_json::json!({
                "model": trimmed_model,
                "system": [
                    {
                        "type": "text",
                        "text": "You write high-quality git commit messages from staged changes only."
                    },
                    {
                        "type": "text",
                        "text": "Return a concise title and optional brief body.",
                        "cache_control": { "type": "ephemeral" }
                    }
                ],
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "max_tokens": output_token_limit,
                "temperature": 0.2,
                "output_config": {
                    "effort": "low",
                    "format": {
                        "type": "json_schema",
                        "schema": schema
                    }
                }
            }),
        ),
        AiRequestKind::Gemini => (
            format!("{base_url}/models/{trimmed_model}:generateContent"),
            serde_json::json!({
                "system_instruction": {
                    "parts": [
                        {
                            "text": "You write high-quality git commit messages from staged changes only."
                        }
                    ]
                },
                "contents": [
                    {
                        "parts": [
                            {
                                "text": prompt
                            }
                        ]
                    }
                ],
                "generationConfig": {
                    "maxOutputTokens": output_token_limit,
                    "temperature": 0.2,
                    "responseMimeType": "application/json",
                    "responseJsonSchema": schema,
                    "thinkingConfig": {
                        "thinkingLevel": "low"
                    }
                }
            }),
        ),
        AiRequestKind::OpenAiCompatible => (
            format!("{base_url}/chat/completions"),
            serde_json::json!({
                "model": trimmed_model,
                "messages": [
                    {
                        "role": "system",
                        "content": "You write high-quality git commit messages from staged changes only."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "max_tokens": output_token_limit,
                "temperature": 0.2,
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "commit_message",
                        "strict": true,
                        "schema": schema
                    }
                }
            }),
        ),
    };
    let mut schema_fallback_used = false;
    let response = match send_ai_json_request(&request_url, request_kind, &secret, &request_body) {
        Ok(response) => response,
        Err(error)
            if request_kind == AiRequestKind::OpenAiCompatible
                && (error.contains("response_format") || error.contains("json_schema")) =>
        {
            schema_fallback_used = true;
            let fallback_body = serde_json::json!({
                "model": trimmed_model,
                "messages": [
                    {
                        "role": "system",
                        "content": "You write high-quality git commit messages from staged changes only and must respond with strict JSON only."
                    },
                    {
                        "role": "user",
                        "content": build_legacy_json_commit_prompt(&prompt)
                    }
                ],
                "max_tokens": output_token_limit,
                "temperature": 0.2
            });

            send_ai_json_request(&request_url, request_kind, &secret, &fallback_body)?
        }
        Err(error) => return Err(error),
    };
    let body = read_ureq_response_string(response)?;
    let payload: serde_json::Value = serde_json::from_str(&body)
        .map_err(|_| "The configured AI endpoint returned invalid JSON.".to_string())?;
    let content = extract_ai_commit_message_content(&payload, request_kind).ok_or_else(|| {
        "The configured AI endpoint did not return a parseable commit message.".to_string()
    })?;

    let mut generated = parse_generated_commit_message(&content)?;
    generated.prompt_mode = commit_prompt_mode_label(prompt_mode).to_string();
    generated.provider_kind = ai_request_kind_label(request_kind).to_string();
    generated.schema_fallback_used = schema_fallback_used;

    Ok(generated)
}

#[cfg(test)]
mod tests {
    use super::{
        cache_github_identity, clear_github_identity_cache, get_cached_github_identity,
        get_commit_prompt_mode, github_identity_cache_key,
        initialize_github_identity_cache_at_path, is_github_identity_cache_entry_fresh,
        parse_ai_model_list, parse_generated_commit_message, resolve_github_identity_from_email,
        truncate_for_ai_budget, CommitPromptMode, GitHubIdentity,
    };
    use crate::settings::SettingsState;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_temp_path(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time should move forward")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "litgit-commit-messages-{name}-{}-{timestamp}",
            std::process::id()
        ))
    }

    fn create_temp_dir(name: &str) -> PathBuf {
        let path = create_temp_path(name);
        fs::create_dir_all(&path).expect("temp dir should be created");
        path
    }

    fn remove_temp_path(path: &Path) {
        if path.is_dir() {
            let _ = fs::remove_dir_all(path);
            return;
        }

        let _ = fs::remove_file(path);
    }

    #[test]
    fn parse_ai_model_list_parses_openai_payload() {
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
    fn parse_ai_model_list_parses_google_payload() {
        let payload = serde_json::json!({
            "models": [
                { "name": "models/gemini-2.5-flash" },
                { "name": "models/gemini-2.5-pro" }
            ]
        });

        let models = parse_ai_model_list(&payload).expect("google model list should parse");

        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "gemini-2.5-flash");
        assert_eq!(models[1].id, "gemini-2.5-pro");
    }

    #[test]
    fn parse_generated_commit_message_returns_error_for_invalid_payload() {
        assert!(parse_generated_commit_message("not-json").is_err());
        assert!(parse_generated_commit_message(r#"{"body":"Only body"}"#).is_err());
    }

    #[test]
    fn parse_generated_commit_message_returns_title_and_body_for_multiline_message() {
        let generated = parse_generated_commit_message(
            r#"{
                "title":"Add AI commit generation",
                "body":"Wire settings and repo composer.\n\nTrim prompt inputs."
            }"#,
        )
        .expect("generated commit payload should parse");

        assert_eq!(generated.title, "Add AI commit generation");
        assert_eq!(
            generated.body,
            "Wire settings and repo composer.\n\nTrim prompt inputs."
        );
    }

    #[test]
    fn github_identity_cache_key_prefers_email_and_falls_back_to_author() {
        assert_eq!(
            github_identity_cache_key(" User@Example.com ", "Ignored Author")
                .expect("email cache key"),
            "email:user@example.com"
        );
        assert_eq!(
            github_identity_cache_key("   ", " Lit Git ").expect("author cache key"),
            "author:lit git"
        );
    }

    #[test]
    fn github_identity_cache_entry_fresh_returns_false_when_ttl_is_exceeded() {
        assert!(is_github_identity_cache_entry_fresh(100, 100));
        assert!(!is_github_identity_cache_entry_fresh(
            100,
            100 + 60 * 60 + 1
        ));
    }

    #[test]
    fn github_identity_cache_persists_initialize_save_and_clear_lifecycle() {
        let cache_dir = create_temp_dir("github-identity-cache");
        let cache_file_path = cache_dir.join("github_identity_cache.json");
        let initial_state = SettingsState::default();
        let cache_key = "email:dev@example.com";
        let expected_identity = GitHubIdentity {
            avatar_url: Some("https://github.com/litgit-tests.png".to_string()),
            username: Some("litgit-tests".to_string()),
        };

        initialize_github_identity_cache_at_path(&initial_state, cache_file_path.clone());
        cache_github_identity(&initial_state, cache_key, &expected_identity);

        let restored_state = SettingsState::default();
        initialize_github_identity_cache_at_path(&restored_state, cache_file_path.clone());
        let restored_identity =
            get_cached_github_identity(&restored_state, cache_key).expect("cached identity");

        assert_eq!(
            restored_identity.avatar_url.as_deref(),
            Some("https://github.com/litgit-tests.png")
        );
        assert_eq!(restored_identity.username.as_deref(), Some("litgit-tests"));

        clear_github_identity_cache(&restored_state);

        assert!(get_cached_github_identity(&restored_state, cache_key).is_none());

        let persisted_cache = fs::read_to_string(&cache_file_path).expect("persisted cache file");
        let persisted_payload: serde_json::Value =
            serde_json::from_str(&persisted_cache).expect("persisted cache payload");

        assert_eq!(
            persisted_payload
                .get("entries")
                .and_then(serde_json::Value::as_array)
                .map(std::vec::Vec::len),
            Some(0)
        );

        remove_temp_path(&cache_dir);
    }

    #[test]
    fn truncate_for_ai_budget_appends_marker_when_value_exceeds_limit() {
        let truncated = truncate_for_ai_budget("abcdefghijklmnopqrstuvwxyz", 10);

        assert!(truncated.starts_with("abcdefghij"));
        assert!(truncated.contains("[truncated]"));
    }

    #[test]
    fn get_commit_prompt_mode_returns_fast_when_diff_exceeds_fast_threshold() {
        let prompt_mode = get_commit_prompt_mode(&"x".repeat(12_001), "M\tfile.ts");

        assert_eq!(prompt_mode, CommitPromptMode::Fast);
    }

    #[test]
    fn get_commit_prompt_mode_returns_full_for_small_staged_diff() {
        let prompt_mode = get_commit_prompt_mode("@@ -1 +1 @@\n+hello", "M\tfile.ts");

        assert_eq!(prompt_mode, CommitPromptMode::Full);
    }

    #[test]
    fn resolve_github_identity_from_email_returns_avatar_for_numeric_noreply_address() {
        let identity = resolve_github_identity_from_email("12345+litgit@users.noreply.github.com");

        assert_eq!(
            identity.avatar_url.as_deref(),
            Some("https://avatars.githubusercontent.com/u/12345?v=4")
        );
        assert_eq!(identity.username.as_deref(), Some("litgit"));
    }
}
