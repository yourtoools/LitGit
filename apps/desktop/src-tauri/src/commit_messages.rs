use crate::git_support::{
    git_command, git_error_message, git_process_error_message, validate_git_repo,
};
use crate::settings::{
    apply_git_preferences, resolve_ai_provider_secret, GitHubIdentityCacheRecord,
    RepoCommandPreferences, SettingsState,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};
use thiserror::Error;

/// Error type for commit message operations.
#[derive(Debug, Error)]
pub(crate) enum CommitMessageError {
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

    /// An HTTP error occurred.
    #[error("Failed to {action}: {detail}")]
    Http {
        /// The action that was being attempted.
        action: &'static str,
        /// The error detail.
        detail: String,
    },
}

impl From<CommitMessageError> for String {
    fn from(error: CommitMessageError) -> Self {
        error.to_string()
    }
}

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
const ANTHROPIC_API_VERSION: &str = "2023-06-01";
const PROMPT_BUDGET_PERCENTAGE_STAGED_DIFF: usize = 68;
const PROMPT_BUDGET_PERCENTAGE_DIFF_STAT: usize = 18;
const PROMPT_BUDGET_PERCENTAGE_CHANGED_FILES: usize = 9;
const PROMPT_BUDGET_PERCENTAGE_RECENT_TITLES: usize = 5;
const CHARS_PER_TOKEN_ESTIMATE: usize = 4;

static AI_HTTP_AGENT: OnceLock<ureq::Agent> = OnceLock::new();

fn ai_http_agent() -> &'static ureq::Agent {
    AI_HTTP_AGENT.get_or_init(|| {
        ureq::AgentBuilder::new()
            .timeout(Duration::from_secs(AI_REQUEST_TIMEOUT_SECS))
            .build()
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// AI model descriptor returned by provider model-list endpoints.
pub(crate) struct AiModelInfo {
    id: String,
    label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// Generated commit message payload returned by AI-assisted commit flows.
pub(crate) struct GeneratedCommitMessage {
    body: String,
    prompt_mode: String,
    provider_kind: String,
    schema_fallback_used: bool,
    title: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
/// Input payload for AI commit message generation.
pub(crate) struct GenerateRepositoryCommitMessageRequest {
    custom_endpoint: String,
    instruction: String,
    max_input_tokens: usize,
    max_output_tokens: usize,
    model: String,
    provider: String,
    repo_path: String,
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
/// Derived GitHub identity for commit author rendering.
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
        .mutate_github_identity_cache(|cache| {
            cache.get(key).map(|cached_entry| {
                (
                    cached_entry.stored_at_unix_seconds,
                    GitHubIdentity {
                        avatar_url: cached_entry.avatar_url.clone(),
                        username: cached_entry.username.clone(),
                    },
                )
            })
        })
        .ok()
        .flatten()?;
    let now_unix_seconds_value = now_unix_seconds();

    if is_github_identity_cache_entry_fresh(cached_entry.0, now_unix_seconds_value) {
        return Some(cached_entry.1);
    }

    let _ = state.mutate_github_identity_cache(|cache| {
        cache.remove(key);
    });
    None
}

fn github_identity_cache_file_path(state: &SettingsState) -> Option<PathBuf> {
    state.github_identity_cache_file_path()
}

fn write_text_file_atomically(path: &Path, contents: &str) -> Result<(), CommitMessageError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| CommitMessageError::Message(format!(
            "Failed to create GitHub identity cache directory: {error}"
        )))?;
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
        .map_err(|error| CommitMessageError::Message(format!("Failed to write temporary cache file: {error}")))?;

    match fs::rename(&temp_file_path, path) {
        Ok(()) => Ok(()),
        Err(rename_error) => {
            let _ = fs::remove_file(path);
            fs::rename(&temp_file_path, path).map_err(|fallback_error| {
                let _ = fs::remove_file(&temp_file_path);
                CommitMessageError::Message(format!(
                    "Failed to replace cache file (rename error: {rename_error}; fallback error: {fallback_error})"
                ))
            })
        }
    }
}

fn save_github_identity_cache_to_disk(state: &SettingsState) {
    let Some(cache_file_path) = github_identity_cache_file_path(state) else {
        return;
    };

    let now_unix_seconds_value = now_unix_seconds();
    let Ok(mut entries) = state.mutate_github_identity_cache(|cache| {
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
    }) else {
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
        app_data_dir.join(GITHUB_IDENTITY_CACHE_FILE_NAME).as_path(),
    );
}

fn initialize_github_identity_cache_at_path(state: &SettingsState, cache_file_path: &Path) {
    state.set_github_identity_cache_file_path(Some(cache_file_path.to_path_buf()));

    let contents = match fs::read_to_string(cache_file_path) {
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

#[cfg(test)]
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

pub(crate) fn resolve_commit_identity_for_history(
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
        return github_identity;
    }

    GitHubIdentity::default()
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

// Tauri command arguments mirror the frontend invoke payload.
#[tauri::command]
/// Creates a commit from staged changes using summary/description and command preferences.
pub(crate) fn commit_repository_changes(
    repo_path: String,
    summary: String,
    description: String,
    include_all: bool,
    amend: bool,
    skip_hooks: bool,
    preferences: Option<RepoCommandPreferences>,
) -> Result<(), String> {
    commit_repository_changes_inner(
        repo_path, summary, description, include_all, amend, skip_hooks, preferences,
    )
    .map_err(|e| e.to_string())
}

fn commit_repository_changes_inner(
    repo_path: String,
    summary: String,
    description: String,
    include_all: bool,
    amend: bool,
    skip_hooks: bool,
    preferences: Option<RepoCommandPreferences>,
) -> Result<(), CommitMessageError> {
    validate_git_repo(Path::new(&repo_path)).map_err(|e| CommitMessageError::Message(e.to_string()))?;
    let command_preferences = preferences.unwrap_or_default();

    let summary_trimmed = summary.trim();
    if summary_trimmed.is_empty() {
        return Err(CommitMessageError::Message("Commit summary is required".to_string()));
    }

    if include_all {
        let add_output = git_command()
            .args(["-C", &repo_path, "add", "-A"])
            .output()
            .map_err(|error| CommitMessageError::GitCommand {
                action: "run git add",
                source: error,
            })?;

        if !add_output.status.success() {
            let stderr = String::from_utf8_lossy(&add_output.stderr)
                .trim()
                .to_string();
            return Err(CommitMessageError::Message(if stderr.is_empty() {
                "Failed to stage changes".to_string()
            } else {
                stderr
            }));
        }
    }

    let description_trimmed = description.trim();
    let mut commit_command = git_command();
    commit_command.args(["-C", &repo_path]);
    apply_git_preferences(&mut commit_command, &command_preferences, None).map_err(|e| CommitMessageError::Message(e.to_string()))?;

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
        .map_err(|error| CommitMessageError::GitCommand {
            action: "run git commit",
            source: error,
        })?;

    if !output.status.success() {
        return Err(CommitMessageError::Message(git_process_error_message(
            &output.stdout,
            &output.stderr,
            "Failed to create commit",
        )));
    }

    Ok(())
}

fn resolve_ai_base_url(provider: &str, custom_endpoint: &str) -> Result<String, CommitMessageError> {
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
                return Err(CommitMessageError::Message("Azure requires a custom OpenAI-compatible base URL".to_string()));
            }

            trimmed_endpoint
        }
        "custom" => {
            if trimmed_endpoint.is_empty() {
                return Err(CommitMessageError::Message("Custom AI endpoint is required".to_string()));
            }

            trimmed_endpoint
        }
        _ => {
            if trimmed_endpoint.is_empty() {
                return Err(CommitMessageError::Message("Unsupported AI provider".to_string()));
            }

            trimmed_endpoint
        }
    };

    if !(base_url.starts_with("http://") || base_url.starts_with("https://")) {
        return Err(CommitMessageError::Message("AI endpoint must start with http:// or https://".to_string()));
    }

    Ok(base_url.to_string())
}

fn read_ureq_response_string(response: ureq::Response) -> Result<String, CommitMessageError> {
    response
        .into_string()
        .map_err(|error| CommitMessageError::Http {
            action: "read AI response body",
            detail: format!("{error}"),
        })
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

fn parse_ai_model_list(value: &serde_json::Value) -> Result<Vec<AiModelInfo>, CommitMessageError> {
    let data = value
        .get("data")
        .and_then(serde_json::Value::as_array)
        .or_else(|| value.get("models").and_then(serde_json::Value::as_array))
        .ok_or_else(|| CommitMessageError::Message(
            "The configured AI endpoint did not return a supported model list.".to_string()
        ))?;

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

fn parse_generated_commit_message(content: &str) -> Result<GeneratedCommitMessage, CommitMessageError> {
    let parsed: serde_json::Value = serde_json::from_str(content.trim())
        .map_err(|_| CommitMessageError::Message("AI response was not valid JSON.".to_string()))?;
    let title = parsed
        .get("title")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| CommitMessageError::Message("AI response did not include a valid commit title.".to_string()))?;
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

fn run_git_text_command(repo_path: &str, args: &[&str], fallback: &str) -> Result<String, CommitMessageError> {
    let output = git_command()
        .args(["-C", repo_path])
        .args(args)
        .output()
        .map_err(|error| CommitMessageError::GitCommand {
            action: "run git command",
            source: error,
        })?;

    if !output.status.success() {
        return Err(CommitMessageError::Message(git_error_message(&output.stderr, fallback)));
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
    let request = ai_http_agent()
        .post(url)
        .set("Accept", "application/json")
        .set("Content-Type", "application/json");

    match request_kind {
        AiRequestKind::Anthropic => request
            .set("x-api-key", secret)
            .set("anthropic-version", ANTHROPIC_API_VERSION),
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
) -> Result<ureq::Response, CommitMessageError> {
    create_ai_post_request(url, request_kind, secret)
        .send_string(&request_body.to_string())
        .map_err(|e| CommitMessageError::Message(map_ai_http_error(e)))
}

struct CommitPromptInputs {
    changed_files: String,
    diff_stat: String,
    prompt_mode: CommitPromptMode,
    recent_titles: String,
    staged_diff: String,
}

fn collect_commit_prompt_inputs(repo_path: &str) -> Result<CommitPromptInputs, CommitMessageError> {
    let diff_stat = run_git_text_command(
        repo_path,
        &["diff", "--cached", "--stat"],
        "Failed to inspect staged diff",
    )?;
    if diff_stat.trim().is_empty() {
        return Err(CommitMessageError::Message("Stage changes before generating a commit message".to_string()));
    }

    let changed_files = run_git_text_command(
        repo_path,
        &["diff", "--cached", "--name-status", "--find-renames"],
        "Failed to inspect staged files",
    )?;
    let staged_diff = run_git_text_command(
        repo_path,
        &["diff", "--cached", "--unified=0"],
        "Failed to inspect staged diff",
    )?;
    let recent_titles = run_git_text_command(
        repo_path,
        &["log", "-3", "--pretty=format:%s"],
        "Failed to inspect recent commits",
    )
    .unwrap_or_default();
    let prompt_mode = get_commit_prompt_mode(&staged_diff, &changed_files);

    Ok(CommitPromptInputs {
        changed_files,
        diff_stat,
        prompt_mode,
        recent_titles,
        staged_diff,
    })
}

fn build_commit_generation_prompt_with_budget(
    inputs: &CommitPromptInputs,
    instruction: &str,
    max_input_tokens: usize,
) -> String {
    let input_budget_chars = max_input_tokens.clamp(256, 2048).saturating_mul(CHARS_PER_TOKEN_ESTIMATE);
    let staged_diff_budget = input_budget_chars.saturating_mul(PROMPT_BUDGET_PERCENTAGE_STAGED_DIFF) / 100;
    let diff_stat_budget = input_budget_chars.saturating_mul(PROMPT_BUDGET_PERCENTAGE_DIFF_STAT) / 100;
    let changed_files_budget = input_budget_chars.saturating_mul(PROMPT_BUDGET_PERCENTAGE_CHANGED_FILES) / 100;
    let recent_titles_budget = input_budget_chars.saturating_mul(PROMPT_BUDGET_PERCENTAGE_RECENT_TITLES) / 100;
    let truncated_staged_diff = if inputs.prompt_mode == CommitPromptMode::Fast {
        String::new()
    } else {
        truncate_for_ai_budget(
            &inputs.staged_diff,
            staged_diff_budget.max(COMMIT_STAGED_DIFF_MIN_BUDGET_CHARS),
        )
    };
    let truncated_diff_stat = truncate_for_ai_budget(
        &inputs.diff_stat,
        diff_stat_budget.max(COMMIT_DIFF_STAT_MIN_BUDGET_CHARS),
    );
    let truncated_changed_files = truncate_for_ai_budget(
        &inputs.changed_files,
        changed_files_budget.max(COMMIT_CHANGED_FILES_MIN_BUDGET_CHARS),
    );
    let truncated_recent_titles = truncate_for_ai_budget(
        &inputs.recent_titles,
        recent_titles_budget.max(COMMIT_RECENT_TITLES_MIN_BUDGET_CHARS),
    );

    build_commit_generation_prompt(
        &truncated_diff_stat,
        &truncated_changed_files,
        &truncated_staged_diff,
        &truncated_recent_titles,
        instruction,
        inputs.prompt_mode,
    )
}

fn build_commit_message_request_payload(
    request_kind: AiRequestKind,
    base_url: &str,
    model: &str,
    prompt: &str,
    output_token_limit: usize,
) -> (String, serde_json::Value) {
    let schema = build_commit_message_schema();
    match request_kind {
        AiRequestKind::Anthropic => (
            format!("{base_url}/messages"),
            serde_json::json!({
                "model": model,
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
            format!("{base_url}/models/{model}:generateContent"),
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
                "model": model,
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
    }
}

fn request_generated_commit_message(
    request_url: &str,
    request_kind: AiRequestKind,
    secret: &str,
    request_body: &serde_json::Value,
    model: &str,
    prompt: &str,
    output_token_limit: usize,
) -> Result<(String, bool), CommitMessageError> {
    let mut schema_fallback_used = false;
    let response = match send_ai_json_request(request_url, request_kind, secret, request_body) {
        Ok(response) => response,
        Err(error)
            if request_kind == AiRequestKind::OpenAiCompatible
                && (error.to_string().contains("response_format") || error.to_string().contains("json_schema")) =>
        {
            schema_fallback_used = true;
            let fallback_body = serde_json::json!({
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": "You write high-quality git commit messages from staged changes only and must respond with strict JSON only."
                    },
                    {
                        "role": "user",
                        "content": build_legacy_json_commit_prompt(prompt)
                    }
                ],
                "max_tokens": output_token_limit,
                "temperature": 0.2
            });

            send_ai_json_request(request_url, request_kind, secret, &fallback_body)?
        }
        Err(error) => return Err(error),
    };
    let body = read_ureq_response_string(response)?;
    Ok((body, schema_fallback_used))
}

fn truncate_for_ai_budget(value: &str, max_chars: usize) -> String {
    for (char_count, (byte_idx, _)) in value.char_indices().enumerate() {
        if char_count >= max_chars {
            return format!("{}\n...[truncated]", &value[..byte_idx]);
        }
    }
    
    // If we processed all chars without exceeding limit, return original
    value.to_string()
}

fn list_ai_models_with_secret(
    provider: &str,
    base_url: &str,
    secret: &str,
) -> Result<Vec<AiModelInfo>, CommitMessageError> {
    let models_url = format!("{base_url}/models");
    let request_kind = get_ai_request_kind(provider, base_url);
    let response = match request_kind {
        AiRequestKind::Anthropic => ai_http_agent()
            .get(&models_url)
            .set("Accept", "application/json")
            .set("x-api-key", secret)
            .set("anthropic-version", ANTHROPIC_API_VERSION)
            .call()
            .map_err(|e| CommitMessageError::Message(map_ai_http_error(e)))?,
        AiRequestKind::Gemini => ai_http_agent()
            .get(&models_url)
            .set("Accept", "application/json")
            .set("x-goog-api-key", secret)
            .call()
            .map_err(|e| CommitMessageError::Message(map_ai_http_error(e)))?,
        AiRequestKind::OpenAiCompatible => ai_http_agent()
            .get(&models_url)
            .set("Accept", "application/json")
            .set("Authorization", &format!("Bearer {secret}"))
            .call()
            .map_err(|e| CommitMessageError::Message(map_ai_http_error(e)))?,
    };
    let body = read_ureq_response_string(response)?;
    let payload: serde_json::Value = serde_json::from_str(&body)
        .map_err(|_| CommitMessageError::Message("The configured AI endpoint is not OpenAI-compatible.".to_string()))?;

    parse_ai_model_list(&payload)
}

#[tauri::command]
/// Lists available AI models for the selected provider and endpoint.
pub(crate) async fn list_ai_models(
    state: State<'_, SettingsState>,
    provider: String,
    custom_endpoint: String,
) -> Result<Vec<AiModelInfo>, String> {
    let secret = resolve_ai_provider_secret(&state, &provider).map_err(|e| e.to_string())?;
    let base_url = resolve_ai_base_url(&provider, &custom_endpoint).map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        list_ai_models_with_secret(&provider, &base_url, &secret).map_err(|e| e.to_string())
    })
    .await
    .map_err(|error| format!("Failed to list AI models: {error}"))?
}

#[expect(clippy::too_many_arguments)]
fn generate_repository_commit_message_with_secret(
    repo_path: &str,
    provider: &str,
    base_url: &str,
    secret: &str,
    model: &str,
    instruction: &str,
    max_input_tokens: usize,
    max_output_tokens: usize,
) -> Result<GeneratedCommitMessage, CommitMessageError> {
    validate_git_repo(Path::new(repo_path)).map_err(|e| CommitMessageError::Message(e.to_string()))?;

    let trimmed_model = model.trim();
    if trimmed_model.is_empty() {
        return Err(CommitMessageError::Message("Select an AI model before generating a commit message".to_string()));
    }

    let prompt_inputs = collect_commit_prompt_inputs(repo_path)?;
    let prompt =
        build_commit_generation_prompt_with_budget(&prompt_inputs, instruction, max_input_tokens);
    let request_kind = get_ai_request_kind(provider, base_url);
    let output_token_limit = max_output_tokens
        .max(COMMIT_MESSAGE_DEFAULT_OUTPUT_TOKEN_LIMIT)
        .clamp(32, COMMIT_MESSAGE_MAX_OUTPUT_TOKEN_LIMIT);
    let (request_url, request_body) = build_commit_message_request_payload(
        request_kind,
        base_url,
        trimmed_model,
        &prompt,
        output_token_limit,
    );
    let (body, schema_fallback_used) = request_generated_commit_message(
        &request_url,
        request_kind,
        secret,
        &request_body,
        trimmed_model,
        &prompt,
        output_token_limit,
    )?;
    let payload: serde_json::Value = serde_json::from_str(&body)
        .map_err(|_| CommitMessageError::Message("The configured AI endpoint returned invalid JSON.".to_string()))?;
    let content = extract_ai_commit_message_content(&payload, request_kind).ok_or_else(|| {
        CommitMessageError::Message("The configured AI endpoint did not return a parseable commit message.".to_string())
    })?;

    let mut generated = parse_generated_commit_message(&content)?;
    generated.prompt_mode = commit_prompt_mode_label(prompt_inputs.prompt_mode).to_string();
    generated.provider_kind = ai_request_kind_label(request_kind).to_string();
    generated.schema_fallback_used = schema_fallback_used;

    Ok(generated)
}

#[tauri::command]
/// Generates a commit message from staged changes using the configured AI provider.
pub(crate) async fn generate_repository_commit_message(
    state: State<'_, SettingsState>,
    input: GenerateRepositoryCommitMessageRequest,
) -> Result<GeneratedCommitMessage, String> {
    let GenerateRepositoryCommitMessageRequest {
        custom_endpoint,
        instruction,
        max_input_tokens,
        max_output_tokens,
        model,
        provider,
        repo_path,
    } = input;
    let secret = resolve_ai_provider_secret(&state, &provider).map_err(|e| e.to_string())?;
    let base_url = resolve_ai_base_url(&provider, &custom_endpoint).map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        generate_repository_commit_message_with_secret(
            &repo_path,
            &provider,
            &base_url,
            &secret,
            &model,
            &instruction,
            max_input_tokens,
            max_output_tokens,
        ).map_err(|e| e.to_string())
    })
    .await
    .map_err(|error| format!("Failed to generate commit message: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{
        cache_github_identity, clear_github_identity_cache, extract_ai_message_content,
        get_cached_github_identity, get_commit_prompt_mode, github_identity_cache_key,
        initialize_github_identity_cache_at_path, is_github_identity_cache_entry_fresh,
        parse_ai_model_list, parse_generated_commit_message, resolve_ai_base_url,
        resolve_github_identity_from_email, truncate_for_ai_budget, CommitPromptMode,
        GenerateRepositoryCommitMessageRequest, GitHubIdentity,
    };
    use crate::settings::SettingsState;
    use serde_json::json;
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
    fn resolve_ai_base_url_returns_openai_default_when_endpoint_is_blank() {
        let base_url = resolve_ai_base_url("openai", "   ").expect("openai default base url");

        assert_eq!(base_url, "https://api.openai.com/v1");
    }

    #[test]
    fn resolve_ai_base_url_rejects_custom_provider_without_endpoint() {
        let error =
            resolve_ai_base_url("custom", "   ").expect_err("custom endpoint should be required");

        assert_eq!(error.to_string(), "Custom AI endpoint is required");
    }

    #[test]
    fn extract_ai_message_content_joins_openai_content_parts() {
        let payload = json!({
            "choices": [
                {
                    "message": {
                        "content": [
                            { "text": "{\"title\":\"Add" },
                            { "text": " tests\",\"body\":\"\"}" }
                        ]
                    }
                }
            ]
        });

        let content = extract_ai_message_content(&payload).expect("ai content should exist");

        assert_eq!(content, "{\"title\":\"Add tests\",\"body\":\"\"}");
    }

    #[test]
    fn parse_generated_commit_message_returns_error_when_payload_is_not_json() {
        let Err(error) = parse_generated_commit_message("not-json") else {
            panic!("payload should be rejected");
        };

        assert_eq!(error.to_string(), "AI response was not valid JSON.");
    }

    #[test]
    fn parse_generated_commit_message_returns_error_when_title_is_missing() {
        let Err(error) = parse_generated_commit_message(r#"{"body":"Only body"}"#) else {
            panic!("title-less payload should be rejected");
        };

        assert_eq!(error.to_string(), "AI response did not include a valid commit title.");
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
    fn generate_repository_commit_message_request_deserializes_frontend_camel_case_payload() {
        let payload = json!({
            "repoPath": "/tmp/repo",
            "provider": "openai",
            "customEndpoint": "https://api.openai.com/v1",
            "model": "gpt-5-mini",
            "instruction": "Focus on staged changes",
            "maxInputTokens": 1200,
            "maxOutputTokens": 96
        });

        let request: GenerateRepositoryCommitMessageRequest =
            serde_json::from_value(payload).expect("request should deserialize");

        assert_eq!(request.repo_path, "/tmp/repo");
        assert_eq!(request.provider, "openai");
        assert_eq!(request.custom_endpoint, "https://api.openai.com/v1");
        assert_eq!(request.model, "gpt-5-mini");
        assert_eq!(request.instruction, "Focus on staged changes");
        assert_eq!(request.max_input_tokens, 1200);
        assert_eq!(request.max_output_tokens, 96);
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

        initialize_github_identity_cache_at_path(&initial_state, &cache_file_path);
        cache_github_identity(&initial_state, cache_key, &expected_identity);

        let restored_state = SettingsState::default();
        initialize_github_identity_cache_at_path(&restored_state, &cache_file_path);
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
    fn truncate_for_ai_budget_preserves_utf8_boundaries_for_multibyte_text() {
        let truncated = truncate_for_ai_budget("naive cafe e\u{301}lan", 12);

        assert_eq!(truncated, "naive cafe e\n...[truncated]");
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

    #[test]
    fn commit_repository_changes_rejects_empty_summary() {
        let repo_path = create_temp_git_repo();

        let error = super::commit_repository_changes(
            repo_path.to_string_lossy().to_string(),
            "   ".to_string(),
            String::new(),
            false,
            false,
            false,
            None,
        )
        .expect_err("commit should fail with empty summary");

        assert_eq!(error, "Commit summary is required");

        remove_temp_path(&repo_path);
    }

    #[test]
    fn commit_repository_changes_creates_commit_with_summary() {
        let repo_path = create_temp_git_repo();
        fs::write(repo_path.join("test.txt"), "content").expect("write file");
        git_in(&repo_path, &["add", "test.txt"]);

        super::commit_repository_changes(
            repo_path.to_string_lossy().to_string(),
            "Test commit".to_string(),
            String::new(),
            false,
            false,
            false,
            None,
        )
        .expect("commit should succeed");

        let log = git_output(&repo_path, &["log", "--oneline"]);
        assert!(log.contains("Test commit"));

        remove_temp_path(&repo_path);
    }

    #[test]
    fn commit_repository_changes_includes_all_when_flag_is_set() {
        let repo_path = create_temp_git_repo();
        fs::write(repo_path.join("test.txt"), "initial").expect("write file");
        git_in(&repo_path, &["add", "test.txt"]);
        git_in(&repo_path, &["commit", "-m", "Initial"]);

        fs::write(repo_path.join("test.txt"), "updated").expect("update file");

        super::commit_repository_changes(
            repo_path.to_string_lossy().to_string(),
            "Update file".to_string(),
            String::new(),
            true,
            false,
            false,
            None,
        )
        .expect("commit with include_all should succeed");

        let log = git_output(&repo_path, &["log", "--oneline"]);
        assert!(log.contains("Update file"));

        remove_temp_path(&repo_path);
    }

    fn create_temp_git_repo() -> PathBuf {
        let repo_path = create_temp_dir("commit-test");
        git_in(&repo_path, &["init"]);
        git_in(&repo_path, &["config", "user.name", "Test User"]);
        git_in(&repo_path, &["config", "user.email", "test@example.com"]);
        repo_path
    }

    fn git_in(repo_path: &Path, args: &[&str]) {
        let output = crate::git_support::git_command()
            .args(["-C", repo_path.to_string_lossy().as_ref()])
            .args(args)
            .output()
            .expect("git command should run");

        assert!(
            output.status.success(),
            "git failed: {}\nstderr: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn git_output(repo_path: &Path, args: &[&str]) -> String {
        let output = crate::git_support::git_command()
            .args(["-C", repo_path.to_string_lossy().as_ref()])
            .args(args)
            .output()
            .expect("git command should run");

        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );

        String::from_utf8_lossy(&output.stdout).to_string()
    }
}
