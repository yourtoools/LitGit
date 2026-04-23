use crate::git_support::{
    git_command, git_error_message, git_process_error_message, run_git_output, run_git_status,
    run_git_tool_output, validate_git_repo, GitSupportError,
};
use crate::repository_publishing::{
    create_remote_repository, validate_publish_request, PublishRepositoryRequest,
};
use crate::settings::{
    apply_git_preferences_from_snapshot, apply_git_preferences_with_auth_session_from_snapshot,
    begin_network_operation_with_active_paths, RepoCommandPreferences, SettingsCommandSnapshot,
    SettingsState,
};
use serde::Serialize;
use std::collections::HashMap;
use std::io::Write;
use std::path::Path;
use std::process::Stdio;
use tauri::{Manager, State};
use thiserror::Error;

/// Result payload for pull/fetch operations.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PullActionResult {
    head_changed: bool,
}

/// Result payload for merge/rebase actions.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MergeRepositoryPayload {
    head_changed: bool,
}

/// Result of rewriting a commit message and descendant history.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RewordRepositoryCommitResult {
    head_hash: String,
    updated_commit_hash: String,
}

/// Result of dropping a commit from current HEAD ancestry.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DropRepositoryCommitResult {
    head_hash: String,
    selected_commit_hash: Option<String>,
}

struct CommitRewriteMetadata {
    author_date: String,
    author_email: String,
    author_name: String,
    committer_date: String,
    committer_email: String,
    committer_name: String,
    message: String,
    parents: Vec<String>,
    tree: String,
}

#[derive(Debug, PartialEq, Eq)]
struct PushUpstreamPlan {
    remote_name: String,
    should_set_upstream: bool,
}

type RepositoryActionsResult<T> = Result<T, RepositoryActionsError>;

#[derive(Debug, Error)]
enum RepositoryActionsError {
    #[error("{0}")]
    Message(String),
    #[error("Failed to {action}: {source}")]
    Io {
        action: &'static str,
        #[source]
        source: std::io::Error,
    },
}

impl RepositoryActionsError {
    fn io(action: &'static str, source: std::io::Error) -> Self {
        Self::Io { action, source }
    }

    fn message(message: impl Into<String>) -> Self {
        Self::Message(message.into())
    }
}

fn map_git_support_error(error: GitSupportError) -> RepositoryActionsError {
    match error {
        GitSupportError::Io { action, source } => RepositoryActionsError::Io { action, source },
        GitSupportError::Message(message) => RepositoryActionsError::message(message),
    }
}

fn run_repo_git_output(
    repo_path: &str,
    args: &[&str],
    action: &'static str,
) -> RepositoryActionsResult<std::process::Output> {
    run_git_output(repo_path, args, action).map_err(map_git_support_error)
}

fn run_repo_git_status(
    repo_path: &str,
    args: &[&str],
    action: &'static str,
) -> RepositoryActionsResult<std::process::ExitStatus> {
    run_git_status(repo_path, args, action).map_err(map_git_support_error)
}

fn ensure_repo(repo_path: &str) -> RepositoryActionsResult<()> {
    validate_git_repo(Path::new(repo_path)).map_err(RepositoryActionsError::message)
}

fn resolve_push_upstream_plan(
    branch_name: &str,
    upstream_ref: Option<&str>,
    has_origin_remote: bool,
) -> RepositoryActionsResult<PushUpstreamPlan> {
    let upstream_remote_and_branch = upstream_ref
        .and_then(|value| value.strip_prefix("refs/remotes/"))
        .and_then(|value| value.split_once('/'));

    let remote_name = upstream_remote_and_branch.map_or_else(
        || "origin".to_string(),
        |(remote_name, _)| remote_name.to_string(),
    );
    let upstream_branch_name =
        upstream_remote_and_branch.map(|(_, remote_branch_name)| remote_branch_name);
    let upstream_matches_current_branch =
        upstream_branch_name.is_some_and(|remote_branch_name| remote_branch_name == branch_name);
    let should_set_upstream = upstream_ref.is_none() || !upstream_matches_current_branch;

    if should_set_upstream && upstream_ref.is_none() && !has_origin_remote {
        return Err(RepositoryActionsError::message(
            "No upstream branch found and remote 'origin' is not configured",
        ));
    }

    Ok(PushUpstreamPlan {
        remote_name,
        should_set_upstream,
    })
}

fn resolve_head_hash(repo_path: &str) -> RepositoryActionsResult<String> {
    let output = run_repo_git_output(repo_path, &["rev-parse", "HEAD"], "resolve HEAD")?;

    if !output.status.success() {
        return Err(RepositoryActionsError::message(git_error_message(
            &output.stderr,
            "Failed to resolve HEAD",
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn is_missing_remote_repository_message(message: &str) -> bool {
    let normalized = message.to_lowercase();

    normalized.contains("repository not found")
        || normalized.contains("remote repository was not found")
        || normalized.contains("not found") && normalized.contains("repository")
}

fn validate_tag_name(name: &str) -> RepositoryActionsResult<()> {
    let ref_name = format!("refs/tags/{name}");
    let output = run_git_tool_output(&["check-ref-format", &ref_name], "validate tag name")
        .map_err(map_git_support_error)?;

    if !output.status.success() {
        return Err(RepositoryActionsError::message(
            "Enter a valid Git tag name",
        ));
    }

    Ok(())
}

fn run_git_text_command(
    repo_path: &str,
    args: &[&str],
    fallback: &str,
) -> RepositoryActionsResult<String> {
    let output = run_repo_git_output(repo_path, args, "run git command")?;

    if !output.status.success() {
        return Err(RepositoryActionsError::message(git_error_message(
            &output.stderr,
            fallback,
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn resolve_current_branch_name(repo_path: &str) -> RepositoryActionsResult<String> {
    let branch_name = run_git_text_command(
        repo_path,
        &["rev-parse", "--abbrev-ref", "HEAD"],
        "Failed to resolve current branch",
    )?;

    if branch_name.is_empty() || branch_name == "HEAD" {
        return Err(RepositoryActionsError::message(
            "Cannot push from detached HEAD",
        ));
    }

    Ok(branch_name)
}

fn repository_has_any_remote(repo_path: &str) -> RepositoryActionsResult<bool> {
    let remote_output = run_repo_git_output(repo_path, &["remote"], "read repository remotes")?;

    if !remote_output.status.success() {
        return Err(RepositoryActionsError::message(git_error_message(
            &remote_output.stderr,
            "Failed to read repository remotes",
        )));
    }

    Ok(String::from_utf8_lossy(&remote_output.stdout)
        .lines()
        .map(str::trim)
        .any(|remote_name| !remote_name.is_empty()))
}

fn resolve_origin_remote_missing_on_server(
    repo_path: &str,
    command_preferences: &RepoCommandPreferences,
    settings_snapshot: &SettingsCommandSnapshot,
    has_origin_remote: bool,
) -> RepositoryActionsResult<bool> {
    if !has_origin_remote {
        return Ok(false);
    }

    let mut health_check_command = git_command();
    apply_git_preferences_from_snapshot(
        &mut health_check_command,
        command_preferences,
        Some(settings_snapshot),
    )
    .map_err(RepositoryActionsError::message)?;

    let health_check_output = health_check_command
        .args([
            "-C",
            repo_path,
            "ls-remote",
            "--exit-code",
            "origin",
            "HEAD",
        ])
        .output()
        .map_err(|error| RepositoryActionsError::io("check remote repository health", error))?;

    if health_check_output.status.success() {
        return Ok(false);
    }

    let stderr = String::from_utf8_lossy(&health_check_output.stderr).to_string();
    let stdout = String::from_utf8_lossy(&health_check_output.stdout).to_string();

    Ok(is_missing_remote_repository_message(&stderr)
        || is_missing_remote_repository_message(&stdout))
}

fn publish_repository_from_request(
    repo_path: &str,
    publish_request: Option<PublishRepositoryRequest>,
    missing_remote_message: &str,
) -> RepositoryActionsResult<String> {
    let publish_request = resolve_publish_request(publish_request, missing_remote_message)?;
    let created_repository = create_remote_repository(publish_request)
        .map_err(|error| RepositoryActionsError::message(error.to_string()))?;

    configure_origin_remote(repo_path, &created_repository.clone_url)?;

    Ok(created_repository.clone_url)
}

fn resolve_publish_request(
    publish_request: Option<PublishRepositoryRequest>,
    missing_remote_message: &str,
) -> RepositoryActionsResult<PublishRepositoryRequest> {
    let publish_request =
        publish_request.ok_or_else(|| RepositoryActionsError::message(missing_remote_message))?;
    let publish_request = PublishRepositoryRequest {
        provider: publish_request.provider.trim().to_lowercase(),
        target_id: publish_request.target_id.trim().to_string(),
        repo_name: publish_request.repo_name.trim().to_string(),
        visibility: publish_request.visibility.trim().to_lowercase(),
    };

    validate_publish_request(&publish_request)
        .map_err(|error| RepositoryActionsError::message(error.to_string()))?;

    Ok(publish_request)
}

fn configure_origin_remote(repo_path: &str, clone_url: &str) -> RepositoryActionsResult<()> {
    let origin_exists_output = run_repo_git_output(
        repo_path,
        &["remote", "get-url", "origin"],
        "verify origin remote",
    )?;
    let remote_subcommand = if origin_exists_output.status.success() {
        "set-url"
    } else {
        "add"
    };

    let configure_origin_output = run_repo_git_output(
        repo_path,
        &["remote", remote_subcommand, "origin", clone_url],
        "configure origin remote",
    )?;

    if !configure_origin_output.status.success() {
        return Err(RepositoryActionsError::message(git_error_message(
            &configure_origin_output.stderr,
            "Failed to configure origin remote",
        )));
    }

    Ok(())
}

fn resolve_upstream_ref(repo_path: &str) -> RepositoryActionsResult<Option<String>> {
    let upstream_output = run_repo_git_output(
        repo_path,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        "check branch upstream",
    )?;

    if !upstream_output.status.success() {
        return Ok(None);
    }

    let upstream_ref = String::from_utf8_lossy(&upstream_output.stdout)
        .trim()
        .to_string();

    if upstream_ref.is_empty() {
        Ok(None)
    } else {
        Ok(Some(upstream_ref))
    }
}

fn build_commit_message_text(summary: &str, description: &str) -> RepositoryActionsResult<String> {
    let summary_trimmed = summary.trim();

    if summary_trimmed.is_empty() {
        return Err(RepositoryActionsError::message(
            "Commit summary is required",
        ));
    }

    let description_trimmed = description.trim();

    Ok(if description_trimmed.is_empty() {
        summary_trimmed.to_string()
    } else {
        format!("{summary_trimmed}\n\n{description_trimmed}")
    })
}

fn verify_commit_on_head_ancestry_path(
    repo_path: &str,
    target: &str,
    head_hash: &str,
) -> RepositoryActionsResult<()> {
    let ancestor_output = run_repo_git_output(
        repo_path,
        &["merge-base", "--is-ancestor", target, head_hash],
        "verify commit ancestry",
    )?;

    if !ancestor_output.status.success() {
        return Err(RepositoryActionsError::message(
            "The selected commit is not on the current HEAD ancestry path.",
        ));
    }

    Ok(())
}

fn collect_head_descendants(repo_path: &str, target: &str) -> RepositoryActionsResult<Vec<String>> {
    let descendants_output = run_git_text_command(
        repo_path,
        &[
            "rev-list",
            "--reverse",
            "--ancestry-path",
            &format!("{target}..HEAD"),
        ],
        "Failed to collect commits to rewrite",
    )?;

    Ok(descendants_output
        .lines()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(std::string::ToString::to_string)
        .collect())
}

fn resolve_current_head_ref(repo_path: &str) -> RepositoryActionsResult<String> {
    let current_head_ref_output = run_repo_git_output(
        repo_path,
        &["symbolic-ref", "-q", "HEAD"],
        "read current branch ref",
    )?;

    if current_head_ref_output.status.success() {
        let value = String::from_utf8_lossy(&current_head_ref_output.stdout)
            .trim()
            .to_string();

        if !value.is_empty() {
            return Ok(value);
        }
    }

    Ok("HEAD".to_string())
}

fn update_rewritten_history_head(
    repo_path: &str,
    head_hash: &str,
    next_head_hash: &str,
) -> RepositoryActionsResult<()> {
    let update_ref_target = resolve_current_head_ref(repo_path)?;
    let update_ref_output = run_repo_git_output(
        repo_path,
        &["update-ref", &update_ref_target, next_head_hash, head_hash],
        "update rewritten history",
    )?;

    if !update_ref_output.status.success() {
        return Err(RepositoryActionsError::message(git_process_error_message(
            &update_ref_output.stdout,
            &update_ref_output.stderr,
            "Failed to update rewritten history",
        )));
    }

    let _ = run_repo_git_output(
        repo_path,
        &["update-ref", "ORIG_HEAD", head_hash],
        "update ORIG_HEAD",
    );

    Ok(())
}

fn read_commit_rewrite_metadata(
    repo_path: &str,
    commit_hash: &str,
) -> RepositoryActionsResult<CommitRewriteMetadata> {
    let output = run_repo_git_output(
        repo_path,
        &[
            "show",
            "-s",
            "--format=%T%x00%P%x00%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI%x00%B",
            commit_hash,
        ],
        "read commit metadata",
    )?;

    if !output.status.success() {
        return Err(RepositoryActionsError::message(git_error_message(
            &output.stderr,
            "Failed to read commit metadata",
        )));
    }

    let mut fields = output.stdout.splitn(9, |byte| *byte == b'\0');
    let tree = fields
        .next()
        .map(String::from_utf8_lossy)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| RepositoryActionsError::message("Commit metadata did not include a tree"))?;
    let parents = fields
        .next()
        .map(String::from_utf8_lossy)
        .map(|value| {
            value
                .split_whitespace()
                .map(std::string::ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let author_name = fields
        .next()
        .map(String::from_utf8_lossy)
        .map(|value| value.to_string())
        .ok_or_else(|| {
            RepositoryActionsError::message("Commit metadata did not include an author name")
        })?;
    let author_email = fields
        .next()
        .map(String::from_utf8_lossy)
        .map(|value| value.to_string())
        .ok_or_else(|| {
            RepositoryActionsError::message("Commit metadata did not include an author email")
        })?;
    let author_date = fields
        .next()
        .map(String::from_utf8_lossy)
        .map(|value| value.to_string())
        .ok_or_else(|| {
            RepositoryActionsError::message("Commit metadata did not include an author date")
        })?;
    let committer_name = fields
        .next()
        .map(String::from_utf8_lossy)
        .map(|value| value.to_string())
        .ok_or_else(|| {
            RepositoryActionsError::message("Commit metadata did not include a committer name")
        })?;
    let committer_email = fields
        .next()
        .map(String::from_utf8_lossy)
        .map(|value| value.to_string())
        .ok_or_else(|| {
            RepositoryActionsError::message("Commit metadata did not include a committer email")
        })?;
    let committer_date = fields
        .next()
        .map(String::from_utf8_lossy)
        .map(|value| value.to_string())
        .ok_or_else(|| {
            RepositoryActionsError::message("Commit metadata did not include a committer date")
        })?;
    let message = fields
        .next()
        .map(String::from_utf8_lossy)
        .map(|value| value.to_string())
        .ok_or_else(|| {
            RepositoryActionsError::message("Commit metadata did not include a commit message")
        })?;

    Ok(CommitRewriteMetadata {
        author_date,
        author_email,
        author_name,
        committer_date,
        committer_email,
        committer_name,
        message,
        parents,
        tree,
    })
}

fn create_rewritten_commit(
    repo_path: &str,
    metadata: &CommitRewriteMetadata,
    parents: &[String],
    message: &str,
) -> RepositoryActionsResult<String> {
    let mut command = git_command();
    command.args(["-C", repo_path, "commit-tree", &metadata.tree]);

    for parent in parents {
        command.args(["-p", parent]);
    }

    command
        .env("GIT_AUTHOR_NAME", &metadata.author_name)
        .env("GIT_AUTHOR_EMAIL", &metadata.author_email)
        .env("GIT_AUTHOR_DATE", &metadata.author_date)
        .env("GIT_COMMITTER_NAME", &metadata.committer_name)
        .env("GIT_COMMITTER_EMAIL", &metadata.committer_email)
        .env("GIT_COMMITTER_DATE", &metadata.committer_date)
        .stdin(Stdio::piped());
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|error| RepositoryActionsError::io("spawn git commit-tree", error))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(message.as_bytes())
            .map_err(|error| RepositoryActionsError::io("write commit message", error))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| RepositoryActionsError::io("finish git commit-tree", error))?;

    if !output.status.success() {
        return Err(RepositoryActionsError::message(git_process_error_message(
            &output.stdout,
            &output.stderr,
            "Failed to rewrite commit",
        )));
    }

    let rewritten_hash = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if rewritten_hash.is_empty() {
        return Err(RepositoryActionsError::message(
            "Git did not return a rewritten commit hash",
        ));
    }

    Ok(rewritten_hash)
}

fn resolve_rewritten_parent_hash(
    rewritten_by_original: &HashMap<String, String>,
    parent: &str,
) -> String {
    rewritten_by_original
        .get(parent)
        .cloned()
        .unwrap_or_else(|| parent.to_string())
}

/// Checks out a commit in detached HEAD mode.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[tauri::command]
pub(crate) async fn checkout_repository_commit(
    repo_path: String,
    target: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        checkout_repository_commit_inner(repo_path, target)
    })
    .await
    .map_err(|error| format!("Failed to checkout commit: {error}"))?
}

fn checkout_repository_commit_inner(repo_path: String, target: String) -> Result<(), String> {
    (|| -> RepositoryActionsResult<()> {
        ensure_repo(&repo_path)?;

        let trimmed_target = target.trim();

        if trimmed_target.is_empty() {
            return Err(RepositoryActionsError::message(
                "Target reference is required",
            ));
        }

        let output = run_repo_git_output(
            &repo_path,
            &["switch", "--detach", trimmed_target],
            "run git switch --detach",
        )?;

        if !output.status.success() {
            return Err(RepositoryActionsError::message(git_error_message(
                &output.stderr,
                "Failed to checkout commit",
            )));
        }

        Ok(())
    })()
    .map_err(|error| error.to_string())
}

/// Pushes the current branch and can publish a repository when no remote exists.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[tauri::command]
pub(crate) async fn push_repository_branch<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, SettingsState>,
    repo_path: String,
    preferences: Option<RepoCommandPreferences>,
    force_with_lease: Option<bool>,
    publish_request: Option<PublishRepositoryRequest>,
) -> Result<(), String> {
    let settings_snapshot = state
        .inner()
        .command_snapshot()
        .map_err(RepositoryActionsError::message)
        .map_err(|error| error.to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        push_repository_branch_inner(
            app,
            settings_snapshot,
            repo_path,
            preferences,
            force_with_lease,
            publish_request,
        )
    })
    .await
    .map_err(|error| format!("Failed to push branch: {error}"))?
}

fn push_repository_branch_inner<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    settings_snapshot: SettingsCommandSnapshot,
    repo_path: String,
    preferences: Option<RepoCommandPreferences>,
    force_with_lease: Option<bool>,
    publish_request: Option<PublishRepositoryRequest>,
) -> Result<(), String> {
    (|| -> RepositoryActionsResult<()> {
        ensure_repo(&repo_path)?;
        let command_preferences = preferences.unwrap_or_default();
        let _network_operation =
            begin_network_operation_with_active_paths(&settings_snapshot.active_network_repo_paths, &repo_path)
            .map_err(RepositoryActionsError::message)?;
        let branch_name = resolve_current_branch_name(&repo_path)?;
        let has_any_remote = repository_has_any_remote(&repo_path)?;
        let origin_remote_output = if has_any_remote {
            Some(
                run_repo_git_output(
                    &repo_path,
                    &["remote", "get-url", "origin"],
                    "verify origin remote",
                )?,
            )
        } else {
            None
        };

        let mut has_origin_remote =
            origin_remote_output.as_ref().is_some_and(|output| output.status.success());
        let mut origin_remote_url = origin_remote_output
            .as_ref()
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
            .unwrap_or_default();

        if !has_any_remote {
            origin_remote_url = publish_repository_from_request(
                &repo_path,
                publish_request.clone(),
                "No remote is configured. Publish this repository before pushing.",
            )?;
            has_origin_remote = true;
        } else {
            let origin_remote_missing_on_server = resolve_origin_remote_missing_on_server(
                &repo_path,
                &command_preferences,
                &settings_snapshot,
                has_origin_remote,
            )?;

            if origin_remote_missing_on_server {
                let remove_origin_output = run_repo_git_output(
                    &repo_path,
                    &["remote", "remove", "origin"],
                    "remove stale origin remote",
                )?;

                if !remove_origin_output.status.success() {
                    return Err(RepositoryActionsError::message(git_error_message(
                        &remove_origin_output.stderr,
                        "Failed to remove stale origin remote",
                    )));
                }

                origin_remote_url = publish_repository_from_request(
                    &repo_path,
                    publish_request,
                    "Remote repository for 'origin' was not found. Publish this repository to recreate it before pushing.",
                )?;
                has_origin_remote = true;
            }
        }

        let upstream_ref = resolve_upstream_ref(&repo_path)?;
        let push_plan =
            resolve_push_upstream_plan(&branch_name, upstream_ref.as_deref(), has_origin_remote)?;
        let should_force_with_lease = force_with_lease == Some(true);

        let auth_state = app.state::<crate::askpass_state::GitAuthBrokerState>();
        let auth_state_ref: &crate::askpass_state::GitAuthBrokerState = &auth_state;
        let auth_session = auth_state_ref
            .create_session("push")
            .map_err(RepositoryActionsError::message)?;
        let session_id = auth_session.session_id.clone();
        let _session_cleanup =
            crate::askpass_state::SessionCleanupGuard::new(auth_state_ref, session_id.clone());

        // Build credential descriptor for HTTPS URLs
        let credential_descriptor = if origin_remote_url.starts_with("https://") {
            crate::git_support::build_git_credential_descriptor(&origin_remote_url, None)
                .ok()
        } else {
            None
        };

        let mut push_command = git_command();
        apply_git_preferences_with_auth_session_from_snapshot(
            &mut push_command,
            &command_preferences,
            Some(&settings_snapshot),
            Some(&auth_session),
        )
        .map_err(RepositoryActionsError::message)?;

        push_command.args(["-C", &repo_path, "push"]);

        if should_force_with_lease {
            push_command.arg("--force-with-lease");
        }

        if push_plan.should_set_upstream {
            push_command.args(["-u", push_plan.remote_name.as_str(), &branch_name]);
        }

        let push_output = push_command
            .output()
            .map_err(|error| RepositoryActionsError::io("run git push", error))?;

        let push_succeeded = push_output.status.success();
        let auth_failed = !push_succeeded
            && crate::git_support::is_git_authentication_message(&String::from_utf8_lossy(
                &push_output.stderr,
            ));

        // Handle credential approval/rejection based on operation result
        if let Some(descriptor) = credential_descriptor {
            if push_succeeded {
                // Check if user wants to remember credentials
                if let Some(response) = auth_state.take_last_prompt_response(&session_id) {
                    if response.remember {
                        if let Some(secret) = response.secret {
                            // Rebuild descriptor with username if provided
                            let descriptor_with_user = if let Some(username) = response.username {
                                crate::git_support::build_git_credential_descriptor(
                                    &origin_remote_url,
                                    Some(&username),
                                )
                                .ok()
                            } else {
                                Some(descriptor.clone())
                            };
                            if let Some(desc) = descriptor_with_user {
                                let _ = crate::git_support::git_credential_approve(&desc, &secret);
                            }
                        }
                    }
                }
            } else if auth_failed {
                // Auth failed after submitting credentials - reject them
                if let Some(response) = auth_state.take_last_prompt_response(&session_id) {
                    if let Some(secret) = response.secret {
                        let _ = crate::git_support::git_credential_reject(&descriptor, &secret);
                    }
                }
            }
        }

        if !push_succeeded {
            return Err(RepositoryActionsError::message(git_error_message(
                &push_output.stderr,
                "Failed to push branch",
            )));
        }

        Ok(())
    })()
    .map_err(|error| error.to_string())
}

/// Runs pull/fetch action modes and reports whether HEAD changed.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[tauri::command]
pub(crate) async fn pull_repository_action<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, SettingsState>,
    repo_path: String,
    mode: String,
    preferences: Option<RepoCommandPreferences>,
) -> Result<PullActionResult, String> {
    let settings_snapshot = state
        .inner()
        .command_snapshot()
        .map_err(RepositoryActionsError::message)
        .map_err(|error| error.to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        pull_repository_action_inner(app, settings_snapshot, repo_path, mode, preferences)
    })
    .await
    .map_err(|error| format!("Failed to execute pull action: {error}"))?
}

fn pull_repository_action_inner<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    settings_snapshot: SettingsCommandSnapshot,
    repo_path: String,
    mode: String,
    preferences: Option<RepoCommandPreferences>,
) -> Result<PullActionResult, String> {
    (|| -> RepositoryActionsResult<PullActionResult> {
        ensure_repo(&repo_path)?;
        let command_preferences = preferences.unwrap_or_default();
        let _network_operation = begin_network_operation_with_active_paths(
            &settings_snapshot.active_network_repo_paths,
            &repo_path,
        )
        .map_err(RepositoryActionsError::message)?;

        let head_before = resolve_head_hash(&repo_path)?;

        let operation = match mode.as_str() {
            "fetch-all" => "fetch",
            _ => "pull",
        };

        // Get origin remote URL for credential management
        let origin_remote_output = run_repo_git_output(
            &repo_path,
            &["remote", "get-url", "origin"],
            "verify origin remote",
        )?;
        let origin_remote_url = if origin_remote_output.status.success() {
            String::from_utf8_lossy(&origin_remote_output.stdout)
                .trim()
                .to_string()
        } else {
            String::new()
        };

        let auth_state = app.state::<crate::askpass_state::GitAuthBrokerState>();
        let auth_state_ref: &crate::askpass_state::GitAuthBrokerState = &auth_state;
        let auth_session = auth_state
            .create_session(operation)
            .map_err(RepositoryActionsError::message)?;
        let session_id = auth_session.session_id.clone();
        let _session_cleanup =
            crate::askpass_state::SessionCleanupGuard::new(auth_state_ref, session_id.clone());

        // Build credential descriptor for HTTPS URLs
        let credential_descriptor = if origin_remote_url.starts_with("https://") {
            crate::git_support::build_git_credential_descriptor(&origin_remote_url, None).ok()
        } else {
            None
        };

        let mut pull_command = git_command();
        pull_command.args(["-C", &repo_path]);
        apply_git_preferences_with_auth_session_from_snapshot(
            &mut pull_command,
            &command_preferences,
            Some(&settings_snapshot),
            Some(&auth_session),
        )
        .map_err(RepositoryActionsError::message)?;

        match mode.as_str() {
            "fetch-all" => {
                pull_command.args(["fetch", "--all", "--prune"]);
            }
            "pull-ff-possible" => {
                pull_command.arg("pull");
            }
            "pull-ff-only" => {
                pull_command.args(["pull", "--ff-only"]);
            }
            "pull-rebase" => {
                pull_command.args(["pull", "--rebase"]);
            }
            _ => {
                return Err(RepositoryActionsError::message("Unsupported pull mode"));
            }
        }

        let output = pull_command
            .output()
            .map_err(|error| RepositoryActionsError::io("run git pull/fetch", error))?;

        let pull_succeeded = output.status.success();
        let auth_failed = !pull_succeeded
            && crate::git_support::is_git_authentication_message(&String::from_utf8_lossy(
                &output.stderr,
            ));

        // Handle credential approval/rejection based on operation result
        if let Some(descriptor) = credential_descriptor {
            if pull_succeeded {
                // Check if user wants to remember credentials
                if let Some(response) = auth_state.take_last_prompt_response(&session_id) {
                    if response.remember {
                        if let Some(secret) = response.secret {
                            // Rebuild descriptor with username if provided
                            let descriptor_with_user = if let Some(username) = response.username {
                                crate::git_support::build_git_credential_descriptor(
                                    &origin_remote_url,
                                    Some(&username),
                                )
                                .ok()
                            } else {
                                Some(descriptor.clone())
                            };
                            if let Some(desc) = descriptor_with_user {
                                let _ = crate::git_support::git_credential_approve(&desc, &secret);
                            }
                        }
                    }
                }
            } else if auth_failed {
                // Auth failed after submitting credentials - reject them
                if let Some(response) = auth_state.take_last_prompt_response(&session_id) {
                    if let Some(secret) = response.secret {
                        let _ = crate::git_support::git_credential_reject(&descriptor, &secret);
                    }
                }
            }
        }

        if !pull_succeeded {
            return Err(RepositoryActionsError::message(git_error_message(
                &output.stderr,
                "Failed to execute pull action",
            )));
        }

        let head_after = resolve_head_hash(&repo_path)?;

        Ok(PullActionResult {
            head_changed: head_before != head_after,
        })
    })()
    .map_err(|error| error.to_string())
}

/// Runs merge, fast-forward-only merge, or rebase against a target reference.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[tauri::command]
pub(crate) async fn run_repository_merge_action(
    state: State<'_, SettingsState>,
    repo_path: String,
    mode: String,
    target_ref: String,
    preferences: Option<RepoCommandPreferences>,
) -> Result<MergeRepositoryPayload, String> {
    let settings_snapshot = state
        .inner()
        .command_snapshot()
        .map_err(RepositoryActionsError::message)
        .map_err(|error| error.to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        run_repository_merge_action_inner(
            settings_snapshot,
            repo_path,
            mode,
            target_ref,
            preferences,
        )
    })
    .await
    .map_err(|error| format!("Failed to run merge action: {error}"))?
}

fn run_repository_merge_action_inner(
    settings_snapshot: SettingsCommandSnapshot,
    repo_path: String,
    mode: String,
    target_ref: String,
    preferences: Option<RepoCommandPreferences>,
) -> Result<MergeRepositoryPayload, String> {
    (|| -> RepositoryActionsResult<MergeRepositoryPayload> {
        ensure_repo(&repo_path)?;

        let trimmed_target_ref = target_ref.trim();

        if trimmed_target_ref.is_empty() {
            return Err(RepositoryActionsError::message(
                "A target reference is required",
            ));
        }

        let target_resolution = format!("{trimmed_target_ref}^{{commit}}");
        let target_exists = run_repo_git_status(
            &repo_path,
            &["rev-parse", "--verify", "--quiet", &target_resolution],
            "resolve target reference",
        )?
        .success();

        if !target_exists {
            return Err(RepositoryActionsError::message(format!(
                "The target reference '{trimmed_target_ref}' could not be resolved"
            )));
        }

        let current_branch_output = run_repo_git_output(
            &repo_path,
            &["rev-parse", "--abbrev-ref", "HEAD"],
            "inspect current branch",
        )?;

        if !current_branch_output.status.success() {
            return Err(RepositoryActionsError::message(git_error_message(
                &current_branch_output.stderr,
                "Failed to inspect current branch",
            )));
        }

        let current_branch_name = String::from_utf8_lossy(&current_branch_output.stdout)
            .trim()
            .to_string();

        if current_branch_name == "HEAD" {
            return Err(RepositoryActionsError::message(
                "This action requires a checked out branch. Exit detached HEAD and try again.",
            ));
        }

        let command_preferences = preferences.unwrap_or_default();
        let head_before = resolve_head_hash(&repo_path)?;

        let mut command = git_command();
        command.args(["-C", &repo_path]);
        apply_git_preferences_from_snapshot(
            &mut command,
            &command_preferences,
            Some(&settings_snapshot),
        )
        .map_err(RepositoryActionsError::message)?;

        match mode.as_str() {
            "ff-only" => {
                command.args(["merge", "--ff-only", trimmed_target_ref]);
            }
            "merge" => {
                command.args(["merge", trimmed_target_ref]);
            }
            "rebase" => {
                command.args(["rebase", trimmed_target_ref]);
            }
            _ => {
                return Err(RepositoryActionsError::message(
                    "Unsupported merge action mode",
                ));
            }
        }

        let output = command
            .output()
            .map_err(|error| RepositoryActionsError::io("run merge action", error))?;

        if !output.status.success() {
            let fallback_message = match mode.as_str() {
                "ff-only" => "Failed to fast-forward branch",
                "merge" => "Failed to merge branch",
                "rebase" => "Failed to rebase branch",
                _ => "Failed to run merge action",
            };

            return Err(RepositoryActionsError::message(git_error_message(
                &output.stderr,
                fallback_message,
            )));
        }

        let head_after = resolve_head_hash(&repo_path)?;

        Ok(MergeRepositoryPayload {
            head_changed: head_before != head_after,
        })
    })()
    .map_err(|error| error.to_string())
}

/// Cherry-picks a commit onto the current branch.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[tauri::command]
pub(crate) async fn cherry_pick_repository_commit(
    repo_path: String,
    target: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        cherry_pick_repository_commit_inner(repo_path, target)
    })
    .await
    .map_err(|error| format!("Failed to cherry-pick commit: {error}"))?
}

fn cherry_pick_repository_commit_inner(repo_path: String, target: String) -> Result<(), String> {
    (|| -> RepositoryActionsResult<()> {
        ensure_repo(&repo_path)?;

        let trimmed_target = target.trim();

        if trimmed_target.is_empty() {
            return Err(RepositoryActionsError::message(
                "Target reference is required",
            ));
        }

        let output = run_repo_git_output(
            &repo_path,
            &["cherry-pick", trimmed_target],
            "run git cherry-pick",
        )?;

        if !output.status.success() {
            return Err(RepositoryActionsError::message(git_process_error_message(
                &output.stdout,
                &output.stderr,
                "Failed to cherry-pick commit",
            )));
        }

        Ok(())
    })()
    .map_err(|error| error.to_string())
}

/// Reverts a commit with `--no-edit`.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[tauri::command]
pub(crate) async fn revert_repository_commit(
    repo_path: String,
    target: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || revert_repository_commit_inner(repo_path, target))
        .await
        .map_err(|error| format!("Failed to revert commit: {error}"))?
}

fn revert_repository_commit_inner(repo_path: String, target: String) -> Result<(), String> {
    (|| -> RepositoryActionsResult<()> {
        ensure_repo(&repo_path)?;

        let trimmed_target = target.trim();

        if trimmed_target.is_empty() {
            return Err(RepositoryActionsError::message(
                "Target reference is required",
            ));
        }

        let output = run_repo_git_output(
            &repo_path,
            &["revert", "--no-edit", trimmed_target],
            "run git revert",
        )?;

        if !output.status.success() {
            return Err(RepositoryActionsError::message(git_process_error_message(
                &output.stdout,
                &output.stderr,
                "Failed to revert commit",
            )));
        }

        Ok(())
    })()
    .map_err(|error| error.to_string())
}

/// Creates lightweight or annotated tags at a target reference.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[tauri::command]
pub(crate) async fn create_repository_tag(
    repo_path: String,
    tag_name: String,
    target: String,
    annotated: Option<bool>,
    annotation_message: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        create_repository_tag_inner(repo_path, tag_name, target, annotated, annotation_message)
    })
    .await
    .map_err(|error| format!("Failed to create tag: {error}"))?
}

fn create_repository_tag_inner(
    repo_path: String,
    tag_name: String,
    target: String,
    annotated: Option<bool>,
    annotation_message: Option<String>,
) -> Result<(), String> {
    (|| -> RepositoryActionsResult<()> {
        ensure_repo(&repo_path)?;

        let trimmed_tag_name = tag_name.trim();
        let trimmed_target = target.trim();

        if trimmed_tag_name.is_empty() {
            return Err(RepositoryActionsError::message("Tag name is required"));
        }

        if trimmed_target.is_empty() {
            return Err(RepositoryActionsError::message(
                "Target reference is required",
            ));
        }

        validate_tag_name(trimmed_tag_name)?;

        let is_annotated = annotated.unwrap_or(false);
        let resolved_annotation_message = annotation_message
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(trimmed_tag_name);

        let output = if is_annotated {
            run_repo_git_output(
                &repo_path,
                &[
                    "tag",
                    "-a",
                    trimmed_tag_name,
                    trimmed_target,
                    "-m",
                    resolved_annotation_message,
                ],
                "run git tag -a",
            )?
        } else {
            run_repo_git_output(
                &repo_path,
                &["tag", trimmed_tag_name, trimmed_target],
                "run git tag",
            )?
        };

        if !output.status.success() {
            return Err(RepositoryActionsError::message(git_error_message(
                &output.stderr,
                "Failed to create tag",
            )));
        }

        Ok(())
    })()
    .map_err(|error| error.to_string())
}

/// Rewrites the target commit message and replays descendants on top of rewritten parents.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[tauri::command]
pub(crate) async fn reword_repository_commit(
    repo_path: String,
    target: String,
    summary: String,
    description: String,
) -> Result<RewordRepositoryCommitResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        reword_repository_commit_inner(repo_path, target, summary, description)
    })
    .await
    .map_err(|error| format!("Failed to reword commit: {error}"))?
}

fn reword_repository_commit_inner(
    repo_path: String,
    target: String,
    summary: String,
    description: String,
) -> Result<RewordRepositoryCommitResult, String> {
    (|| -> RepositoryActionsResult<RewordRepositoryCommitResult> {
        ensure_repo(&repo_path)?;

        let next_message = build_commit_message_text(&summary, &description)?;
        let head_hash =
            run_git_text_command(&repo_path, &["rev-parse", "HEAD"], "Failed to read HEAD")?;
        verify_commit_on_head_ancestry_path(&repo_path, &target, &head_hash)?;
        let descendants = collect_head_descendants(&repo_path, &target)?;
        let mut commits_to_rewrite = vec![target.clone()];
        commits_to_rewrite.extend(descendants);

        let mut rewritten_by_original = HashMap::new();

        for original_hash in &commits_to_rewrite {
            let metadata = read_commit_rewrite_metadata(&repo_path, original_hash)?;
            let rewritten_parents = metadata
                .parents
                .iter()
                .map(|parent| resolve_rewritten_parent_hash(&rewritten_by_original, parent))
                .collect::<Vec<_>>();
            let commit_message = if original_hash == &target {
                next_message.as_str()
            } else {
                metadata.message.as_str()
            };
            let rewritten_hash =
                create_rewritten_commit(&repo_path, &metadata, &rewritten_parents, commit_message)?;
            rewritten_by_original.insert(original_hash.clone(), rewritten_hash);
        }

        let updated_commit_hash = rewritten_by_original.get(&target).cloned().ok_or_else(|| {
            RepositoryActionsError::message("Failed to determine rewritten commit hash")
        })?;
        let next_head_hash = rewritten_by_original
            .get(&head_hash)
            .cloned()
            .ok_or_else(|| {
                RepositoryActionsError::message("Failed to determine rewritten HEAD hash")
            })?;
        update_rewritten_history_head(&repo_path, &head_hash, &next_head_hash)?;

        Ok(RewordRepositoryCommitResult {
            head_hash: next_head_hash,
            updated_commit_hash,
        })
    })()
    .map_err(|error| error.to_string())
}

/// Drops a commit from the current HEAD ancestry by rewriting descendants.
// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[tauri::command]
pub(crate) async fn drop_repository_commit(
    repo_path: String,
    target: String,
) -> Result<DropRepositoryCommitResult, String> {
    tauri::async_runtime::spawn_blocking(move || drop_repository_commit_inner(repo_path, target))
        .await
        .map_err(|error| format!("Failed to drop commit: {error}"))?
}

fn drop_repository_commit_inner(
    repo_path: String,
    target: String,
) -> Result<DropRepositoryCommitResult, String> {
    (|| -> RepositoryActionsResult<DropRepositoryCommitResult> {
        ensure_repo(&repo_path)?;

        let head_hash =
            run_git_text_command(&repo_path, &["rev-parse", "HEAD"], "Failed to read HEAD")?;
        verify_commit_on_head_ancestry_path(&repo_path, &target, &head_hash)?;

        let target_metadata = read_commit_rewrite_metadata(&repo_path, &target)?;
        let descendants = collect_head_descendants(&repo_path, &target)?;
        let first_descendant = descendants.first().cloned();

        if descendants.is_empty() && target_metadata.parents.is_empty() {
            return Err(RepositoryActionsError::message(
                "The root commit cannot be dropped because it would leave the branch empty.",
            ));
        }

        let mut rewritten_by_original = HashMap::new();

        for original_hash in &descendants {
            let metadata = read_commit_rewrite_metadata(&repo_path, original_hash)?;
            let mut rewritten_parents = Vec::new();

            for parent in &metadata.parents {
                if parent == &target {
                    for target_parent in &target_metadata.parents {
                        let replacement_parent =
                            resolve_rewritten_parent_hash(&rewritten_by_original, target_parent);

                        if !rewritten_parents.contains(&replacement_parent) {
                            rewritten_parents.push(replacement_parent);
                        }
                    }
                    continue;
                }

                let rewritten_parent =
                    resolve_rewritten_parent_hash(&rewritten_by_original, parent);

                if !rewritten_parents.contains(&rewritten_parent) {
                    rewritten_parents.push(rewritten_parent);
                }
            }

            let rewritten_hash = create_rewritten_commit(
                &repo_path,
                &metadata,
                &rewritten_parents,
                metadata.message.as_str(),
            )?;
            rewritten_by_original.insert(original_hash.clone(), rewritten_hash);
        }

        let next_head_hash = if target == head_hash {
            first_descendant
                .as_ref()
                .and_then(|hash| rewritten_by_original.get(hash))
                .cloned()
                .or_else(|| target_metadata.parents.first().cloned())
                .ok_or_else(|| {
                    RepositoryActionsError::message("Failed to determine rewritten HEAD hash")
                })?
        } else {
            rewritten_by_original
                .get(&head_hash)
                .cloned()
                .ok_or_else(|| {
                    RepositoryActionsError::message("Failed to determine rewritten HEAD hash")
                })?
        };
        let selected_commit_hash = first_descendant
            .as_ref()
            .and_then(|hash| rewritten_by_original.get(hash))
            .cloned()
            .or_else(|| target_metadata.parents.first().cloned());

        update_rewritten_history_head(&repo_path, &head_hash, &next_head_hash)?;

        Ok(DropRepositoryCommitResult {
            head_hash: next_head_hash,
            selected_commit_hash: selected_commit_hash.filter(|hash| hash != &target),
        })
    })()
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        build_commit_message_text, checkout_repository_commit, cherry_pick_repository_commit,
        create_repository_tag, drop_repository_commit, pull_repository_action,
        push_repository_branch, resolve_head_hash, resolve_publish_request,
        resolve_push_upstream_plan, revert_repository_commit, reword_repository_commit,
        run_repository_merge_action,
    };
    use crate::askpass_state::GitAuthBrokerState;
    use crate::git_support::git_command;
    use crate::repository_publishing::PublishRepositoryRequest;
    use crate::settings::{RepoCommandPreferences, SettingsState};
    use std::env;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};
    use tauri::Manager;

    #[test]
    fn push_repository_branch_requires_publish_request_when_no_remote_exists() {
        let error = resolve_publish_request(
            None,
            "No remote is configured. Publish this repository before pushing.",
        )
        .expect_err("missing publish request should be rejected");

        assert_eq!(
            error.to_string(),
            "No remote is configured. Publish this repository before pushing."
        );
    }

    #[test]
    fn resolve_publish_request_accepts_provider_target_repo_and_visibility() {
        let request = resolve_publish_request(
            Some(PublishRepositoryRequest {
                provider: " github ".to_string(),
                target_id: "github:organization:litgit".to_string(),
                repo_name: "litgit-desktop".to_string(),
                visibility: " public ".to_string(),
            }),
            "publish request is required",
        )
        .expect("publish request should validate");

        assert_eq!(request.provider, "github");
        assert_eq!(request.target_id, "github:organization:litgit");
        assert_eq!(request.repo_name, "litgit-desktop");
        assert_eq!(request.visibility, "public");
    }

    #[test]
    fn resolve_push_upstream_plan_uses_origin_when_branch_has_no_upstream() {
        let plan = resolve_push_upstream_plan("main", None, true).expect("plan should resolve");

        assert_eq!(plan.remote_name, "origin");
        assert!(plan.should_set_upstream);
    }

    #[test]
    fn resolve_push_upstream_plan_skips_upstream_flag_when_tracking_current_branch() {
        let plan = resolve_push_upstream_plan("main", Some("refs/remotes/upstream/main"), true)
            .expect("plan should resolve");

        assert_eq!(plan.remote_name, "upstream");
        assert!(!plan.should_set_upstream);
    }

    #[test]
    fn resolve_push_upstream_plan_requires_origin_when_no_upstream_exists() {
        let error = resolve_push_upstream_plan("main", None, false)
            .expect_err("missing origin should be rejected");

        assert_eq!(
            error.to_string(),
            "No upstream branch found and remote 'origin' is not configured"
        );
    }

    #[test]
    fn build_commit_message_text_returns_error_when_summary_is_blank() {
        let error =
            build_commit_message_text("   ", "Body").expect_err("blank summary should be rejected");

        assert_eq!(error.to_string(), "Commit summary is required");
    }

    #[test]
    fn build_commit_message_text_joins_trimmed_summary_and_description() {
        let message = build_commit_message_text("  Add tests  ", "  Cover edge cases  ")
            .expect("commit message text should build");

        assert_eq!(message, "Add tests\n\nCover edge cases");
    }

    #[tokio::test]
    async fn checkout_repository_commit_switches_to_head_commit() {
        let repo_path = TempRepository::create();
        TempRepository::write_file(&repo_path.path, "tracked.txt", "initial");
        repo_path.git(&["add", "tracked.txt"]);
        repo_path.git(&["commit", "-m", "Initial commit"]);

        let head_hash = resolve_head_hash(repo_path.path.to_string_lossy().as_ref())
            .expect("head hash should resolve");

        checkout_repository_commit(repo_path.path.to_string_lossy().to_string(), head_hash)
            .await
            .expect("checkout should succeed");

        let detached_head = repo_path.git_output(&["rev-parse", "--abbrev-ref", "HEAD"]);
        assert_eq!(detached_head.trim(), "HEAD");
    }

    #[tokio::test]
    async fn checkout_repository_commit_rejects_unknown_commit() {
        let repo_path = TempRepository::create();
        TempRepository::write_file(&repo_path.path, "tracked.txt", "initial");
        repo_path.git(&["add", "tracked.txt"]);
        repo_path.git(&["commit", "-m", "Initial commit"]);

        let error = checkout_repository_commit(
            repo_path.path.to_string_lossy().to_string(),
            "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef".to_string(),
        )
        .await
        .expect_err("checkout should fail");

        assert!(
            error.contains("fatal") || error.contains("not a valid"),
            "{error}"
        );
    }

    #[tokio::test]
    async fn push_repository_branch_pushes_to_origin_and_sets_upstream() {
        let remote = TempRepository::create_bare("push-remote");
        let repo = TempRepository::create();
        TempRepository::write_file(&repo.path, "tracked.txt", "initial");
        repo.git(&["add", "tracked.txt"]);
        repo.git(&["commit", "-m", "Initial commit"]);
        repo.git(&[
            "remote",
            "add",
            "origin",
            remote.path.to_string_lossy().as_ref(),
        ]);

        let app = tauri::test::mock_builder()
            .manage(SettingsState::default())
            .manage(GitAuthBrokerState::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("repository actions test app should build");
        let settings_state = app.state::<SettingsState>();
        settings_state.set_askpass_socket_path(
            std::env::temp_dir().join("litgit-repository-actions-push.sock"),
        );

        push_repository_branch(
            app.handle().clone(),
            app.state::<SettingsState>(),
            repo.path.to_string_lossy().to_string(),
            None,
            None,
            None,
        )
        .await
        .expect("push should succeed");

        let remote_head = remote.git_output(&["rev-parse", "refs/heads/main"]);
        let local_head = repo.git_output(&["rev-parse", "HEAD"]);
        assert_eq!(remote_head.trim(), local_head.trim());

        let upstream = repo.git_output(&[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ]);
        assert_eq!(upstream.trim(), "origin/main");
    }

    #[tokio::test]
    async fn pull_repository_action_fast_forwards_when_remote_has_new_commit() {
        let remote = TempRepository::create_bare("pull-remote");
        let repo = TempRepository::create();
        TempRepository::write_file(&repo.path, "tracked.txt", "initial");
        repo.git(&["add", "tracked.txt"]);
        repo.git(&["commit", "-m", "Initial commit"]);
        repo.git(&[
            "remote",
            "add",
            "origin",
            remote.path.to_string_lossy().as_ref(),
        ]);
        repo.git(&["push", "-u", "origin", "main"]);

        let clone = TempRepository::create();
        clone.git(&[
            "remote",
            "add",
            "origin",
            remote.path.to_string_lossy().as_ref(),
        ]);
        clone.git(&["fetch", "origin", "main"]);
        clone.git(&["switch", "-c", "main", "--track", "origin/main"]);
        TempRepository::write_file(&clone.path, "tracked.txt", "updated upstream");
        clone.git(&["commit", "-am", "Remote update"]);
        clone.git(&["push", "origin", "main"]);

        let app = tauri::test::mock_builder()
            .manage(SettingsState::default())
            .manage(GitAuthBrokerState::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("repository actions test app should build");
        let settings_state = app.state::<SettingsState>();
        settings_state.set_askpass_socket_path(
            std::env::temp_dir().join("litgit-repository-actions-pull.sock"),
        );

        let result = pull_repository_action(
            app.handle().clone(),
            app.state::<SettingsState>(),
            repo.path.to_string_lossy().to_string(),
            "pull-ff-only".to_string(),
            None,
        )
        .await
        .expect("pull should succeed");

        assert!(result.head_changed);
        assert_eq!(
            fs::read_to_string(repo.path.join("tracked.txt")).unwrap(),
            "updated upstream"
        );
    }

    #[tokio::test]
    async fn run_repository_merge_action_merges_target_branch_into_current_branch() {
        let repo = TempRepository::create();
        TempRepository::write_file(&repo.path, "tracked.txt", "initial");
        repo.git(&["add", "tracked.txt"]);
        repo.git(&["commit", "-m", "Initial commit"]);
        repo.git(&["switch", "-c", "feature"]);
        TempRepository::write_file(&repo.path, "tracked.txt", "feature change");
        repo.git(&["commit", "-am", "Feature commit"]);
        let feature_head = repo.git_output(&["rev-parse", "HEAD"]);
        repo.git(&["switch", "main"]);

        let app = tauri::test::mock_builder()
            .manage(SettingsState::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("repository actions test app should build");

        let result = run_repository_merge_action(
            app.state::<SettingsState>(),
            repo.path.to_string_lossy().to_string(),
            "merge".to_string(),
            "feature".to_string(),
            None,
        )
        .await
        .expect("merge should succeed");

        assert!(result.head_changed);
        let head = repo.git_output(&["rev-parse", "HEAD"]);
        assert_eq!(head.trim(), feature_head.trim());
    }

    #[tokio::test]
    async fn cherry_pick_repository_commit_applies_target_commit_to_current_branch() {
        let repo = TempRepository::create();
        TempRepository::write_file(&repo.path, "tracked.txt", "initial");
        repo.git(&["add", "tracked.txt"]);
        repo.git(&["commit", "-m", "Initial commit"]);
        repo.git(&["switch", "-c", "feature"]);
        TempRepository::write_file(&repo.path, "tracked.txt", "feature change");
        repo.git(&["commit", "-am", "Feature commit"]);
        let feature_commit = repo.git_output(&["rev-parse", "HEAD"]);
        repo.git(&["switch", "main"]);

        cherry_pick_repository_commit(
            repo.path.to_string_lossy().to_string(),
            feature_commit.trim().to_string(),
        )
        .await
        .expect("cherry-pick should succeed");

        assert_eq!(
            fs::read_to_string(repo.path.join("tracked.txt")).unwrap(),
            "feature change"
        );
        let message = repo.git_output(&["show", "-s", "--format=%s", "HEAD"]);
        assert_eq!(message.trim(), "Feature commit");
    }

    #[tokio::test]
    async fn revert_repository_commit_creates_inverse_commit_for_target() {
        let repo = TempRepository::create();
        TempRepository::write_file(&repo.path, "tracked.txt", "initial");
        repo.git(&["add", "tracked.txt"]);
        repo.git(&["commit", "-m", "Initial commit"]);
        TempRepository::write_file(&repo.path, "tracked.txt", "second");
        repo.git(&["commit", "-am", "Second commit"]);
        let second_commit = repo.git_output(&["rev-parse", "HEAD"]);

        revert_repository_commit(
            repo.path.to_string_lossy().to_string(),
            second_commit.trim().to_string(),
        )
        .await
        .expect("revert should succeed");

        assert_eq!(
            fs::read_to_string(repo.path.join("tracked.txt")).unwrap(),
            "initial"
        );
        let message = repo.git_output(&["show", "-s", "--format=%s", "HEAD"]);
        assert!(message.trim().starts_with("Revert \"Second commit\""));
    }

    #[tokio::test]
    async fn create_repository_tag_creates_annotated_tag_with_message() {
        let repo = TempRepository::create();
        TempRepository::write_file(&repo.path, "tracked.txt", "initial");
        repo.git(&["add", "tracked.txt"]);
        repo.git(&["commit", "-m", "Initial commit"]);

        create_repository_tag(
            repo.path.to_string_lossy().to_string(),
            "v1.0.0".to_string(),
            "HEAD".to_string(),
            Some(true),
            Some("Release v1.0.0".to_string()),
        )
        .await
        .expect("tag should succeed");

        let message =
            repo.git_output(&["for-each-ref", "refs/tags/v1.0.0", "--format=%(contents)"]);
        assert_eq!(message.trim(), "Release v1.0.0");
    }

    #[tokio::test]
    async fn reword_repository_commit_rewrites_target_and_descendants() {
        let repo_path = TempRepository::create();
        TempRepository::write_file(&repo_path.path, "tracked.txt", "one");
        repo_path.git(&["add", "tracked.txt"]);
        repo_path.git(&["commit", "-m", "First"]);
        let first_hash = repo_path
            .git_output(&["rev-parse", "HEAD"])
            .trim()
            .to_string();

        TempRepository::write_file(&repo_path.path, "tracked.txt", "two");
        repo_path.git(&["commit", "-am", "Second"]);
        let old_head_hash = repo_path
            .git_output(&["rev-parse", "HEAD"])
            .trim()
            .to_string();

        let result = reword_repository_commit(
            repo_path.path.to_string_lossy().to_string(),
            first_hash.clone(),
            "First rewritten".to_string(),
            "Updated body".to_string(),
        )
        .await
        .expect("reword should succeed");

        assert_ne!(result.head_hash, old_head_hash);
        assert_ne!(result.updated_commit_hash, first_hash);

        let rewritten_message = repo_path.git_output(&[
            "show",
            "-s",
            "--format=%s%n%b",
            result.updated_commit_hash.as_str(),
        ]);
        assert!(rewritten_message.contains("First rewritten"));
        assert!(rewritten_message.contains("Updated body"));

        let current_head = repo_path.git_output(&["rev-parse", "HEAD"]);
        assert_eq!(current_head.trim(), result.head_hash);
    }

    #[tokio::test]
    async fn drop_repository_commit_rewrites_head_and_selects_parent_when_dropping_tip() {
        let repo_path = TempRepository::create();
        TempRepository::write_file(&repo_path.path, "tracked.txt", "one");
        repo_path.git(&["add", "tracked.txt"]);
        repo_path.git(&["commit", "-m", "First"]);
        let first_hash = repo_path
            .git_output(&["rev-parse", "HEAD"])
            .trim()
            .to_string();

        TempRepository::write_file(&repo_path.path, "tracked.txt", "two");
        repo_path.git(&["commit", "-am", "Second"]);
        let second_hash = repo_path
            .git_output(&["rev-parse", "HEAD"])
            .trim()
            .to_string();

        let result =
            drop_repository_commit(repo_path.path.to_string_lossy().to_string(), second_hash)
                .await
                .expect("drop should succeed");

        assert_eq!(result.head_hash, first_hash);
        assert_eq!(
            result.selected_commit_hash.as_deref(),
            Some(first_hash.as_str())
        );

        let current_head = repo_path.git_output(&["rev-parse", "HEAD"]);
        assert_eq!(current_head.trim(), first_hash);
    }

    #[tokio::test]
    async fn drop_repository_commit_rejects_dropping_the_only_root_commit() {
        let repo = TempRepository::create();
        TempRepository::write_file(&repo.path, "tracked.txt", "initial");
        repo.git(&["add", "tracked.txt"]);
        repo.git(&["commit", "-m", "Initial commit"]);
        let root_commit = repo.git_output(&["rev-parse", "HEAD"]);

        let error = drop_repository_commit(
            repo.path.to_string_lossy().to_string(),
            root_commit.trim().to_string(),
        )
        .await
        .err()
        .expect("dropping root commit should fail");

        assert_eq!(
            error,
            "The root commit cannot be dropped because it would leave the branch empty."
        );
    }

    #[test]
    fn existing_repo_network_commands_can_apply_auth_session_env() {
        let mut command = crate::git_support::git_command();
        let preferences = RepoCommandPreferences::default();
        let settings_state = crate::settings::SettingsState::default();
        let session = crate::askpass_state::GitAuthSessionHandle {
            session_id: "push-session".to_string(),
            secret: "push-secret".to_string(),
            operation: "push".to_string(),
        };
        settings_state.set_askpass_socket_path(std::env::temp_dir().join("litgit-test.sock"));

        crate::settings::apply_auth_session_environment(
            &mut command,
            Some(&settings_state),
            Some(&session),
        )
        .expect("preferences should apply");
        crate::settings::apply_git_preferences(&mut command, &preferences, None)
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

        assert_eq!(
            envs.get("LITGIT_ASKPASS_OPERATION"),
            Some(&Some("push".to_string()))
        );
    }

    struct TempRepository {
        path: PathBuf,
    }

    impl TempRepository {
        fn create() -> Self {
            Self::create_with_args("repo", &["init", "-b", "main"])
        }

        fn create_bare(label: &str) -> Self {
            Self::create_with_args(label, &["init", "--bare"])
        }

        fn create_with_args(label: &str, init_args: &[&str]) -> Self {
            let path = Self::temp_path(label);

            fs::create_dir_all(&path).expect("temp repo directory should be created");
            Self::git_in(&path, init_args);

            if !init_args.contains(&"--bare") {
                Self::git_in(&path, &["config", "user.name", "LitGit Tests"]);
                Self::git_in(&path, &["config", "user.email", "tests@example.com"]);
            }

            Self { path }
        }

        fn temp_path(label: &str) -> PathBuf {
            let unique_suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock should be after unix epoch")
                .as_nanos();
            env::temp_dir().join(format!(
                "litgit-repository-actions-test-{label}-{unique_suffix}"
            ))
        }

        fn write_file(repo_path: &Path, relative_path: &str, contents: &str) {
            let file_path = repo_path.join(relative_path);
            fs::write(file_path, contents).expect("repo file should be written");
        }

        fn git(&self, args: &[&str]) {
            Self::git_in(&self.path, args);
        }

        fn git_output(&self, args: &[&str]) -> String {
            let output = git_command()
                .args(["-C", self.path.to_string_lossy().as_ref()])
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

        fn git_in(path: &Path, args: &[&str]) {
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
