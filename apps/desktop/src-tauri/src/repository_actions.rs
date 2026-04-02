use crate::git_support::{
    background_command, git_command, git_error_message, git_process_error_message,
    validate_git_repo,
};
use crate::repository::validate_repository_name;
use crate::settings::{
    apply_git_preferences, begin_network_operation, RepoCommandPreferences, SettingsState,
};
use serde::Serialize;
use std::collections::HashMap;
use std::io::Write;
use std::path::Path;
use std::process::Stdio;
use tauri::State;
use thiserror::Error;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// Result payload for pull/fetch operations.
pub(crate) struct PullActionResult {
    head_changed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// Result payload for merge/rebase actions.
pub(crate) struct MergeActionResult {
    head_changed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// Result of rewriting a commit message and descendant history.
pub(crate) struct RewordRepositoryCommitResult {
    head_hash: String,
    updated_commit_hash: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// Result of dropping a commit from current HEAD ancestry.
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

fn ensure_repo(repo_path: &str) -> RepositoryActionsResult<()> {
    validate_git_repo(Path::new(repo_path)).map_err(RepositoryActionsError::message)
}

fn resolve_publish_visibility_flag(publish_visibility: Option<&str>) -> &'static str {
    match publish_visibility
        .map(str::trim)
        .map(str::to_lowercase)
        .as_deref()
    {
        Some("public") => "--public",
        _ => "--private",
    }
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
    let output = git_command()
        .args(["-C", repo_path, "rev-parse", "HEAD"])
        .output()
        .map_err(|error| RepositoryActionsError::io("resolve HEAD", error))?;

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
    let output = git_command()
        .args(["check-ref-format", &format!("refs/tags/{name}")])
        .output()
        .map_err(|error| RepositoryActionsError::io("validate tag name", error))?;

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
    let output = git_command()
        .args(["-C", repo_path])
        .args(args)
        .output()
        .map_err(|error| RepositoryActionsError::io("run git command", error))?;

    if !output.status.success() {
        return Err(RepositoryActionsError::message(git_error_message(
            &output.stderr,
            fallback,
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn run_gh_repo_create(
    repo_path: &str,
    publish_name: &str,
    visibility_flag: &str,
) -> RepositoryActionsResult<()> {
    let mut command = background_command("gh");
    let publish_output = command
        .current_dir(repo_path)
        .env("GH_PROMPT_DISABLED", "1")
        .args([
            "repo",
            "create",
            publish_name,
            "--source",
            ".",
            "--remote",
            "origin",
            visibility_flag,
            "--push",
        ])
        .output()
        .map_err(|error| RepositoryActionsError::io("run gh repo create", error))?;

    if !publish_output.status.success() {
        let stderr = String::from_utf8_lossy(&publish_output.stderr)
            .trim()
            .to_string();
        let stdout = String::from_utf8_lossy(&publish_output.stdout)
            .trim()
            .to_string();

        return Err(RepositoryActionsError::message(if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "Failed to publish repository with GitHub CLI".to_string()
        }));
    }

    Ok(())
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
    let remote_output = git_command()
        .args(["-C", repo_path, "remote"])
        .output()
        .map_err(|error| RepositoryActionsError::io("read repository remotes", error))?;

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
    state: &State<'_, SettingsState>,
    has_origin_remote: bool,
) -> RepositoryActionsResult<bool> {
    if !has_origin_remote {
        return Ok(false);
    }

    let mut health_check_command = git_command();
    apply_git_preferences(&mut health_check_command, command_preferences, Some(state))
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
    publish_repo_name: Option<&str>,
    publish_visibility: Option<&str>,
    missing_remote_message: &str,
) -> RepositoryActionsResult<()> {
    let publish_name = publish_repo_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| RepositoryActionsError::message(missing_remote_message))?;

    validate_repository_name(publish_name).map_err(RepositoryActionsError::message)?;

    let visibility_flag = resolve_publish_visibility_flag(publish_visibility);
    run_gh_repo_create(repo_path, publish_name, visibility_flag)
}

fn resolve_upstream_ref(repo_path: &str) -> RepositoryActionsResult<Option<String>> {
    let upstream_output = git_command()
        .args([
            "-C",
            repo_path,
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{u}",
        ])
        .output()
        .map_err(|error| RepositoryActionsError::io("check branch upstream", error))?;

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

fn run_git_push(
    repo_path: &str,
    command_preferences: &RepoCommandPreferences,
    state: &State<'_, SettingsState>,
    push_plan: &PushUpstreamPlan,
    branch_name: &str,
    should_force_with_lease: bool,
) -> RepositoryActionsResult<()> {
    let mut command = git_command();
    apply_git_preferences(&mut command, command_preferences, Some(state))
        .map_err(RepositoryActionsError::message)?;

    command.args(["-C", repo_path, "push"]);

    if should_force_with_lease {
        command.arg("--force-with-lease");
    }

    if push_plan.should_set_upstream {
        command.args(["-u", push_plan.remote_name.as_str(), branch_name]);
    }

    let push_output = command
        .output()
        .map_err(|error| RepositoryActionsError::io("run git push", error))?;

    if !push_output.status.success() {
        return Err(RepositoryActionsError::message(git_error_message(
            &push_output.stderr,
            "Failed to push branch",
        )));
    }

    Ok(())
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
    let ancestor_output = git_command()
        .args([
            "-C",
            repo_path,
            "merge-base",
            "--is-ancestor",
            target,
            head_hash,
        ])
        .output()
        .map_err(|error| RepositoryActionsError::io("verify commit ancestry", error))?;

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
    let current_head_ref_output = git_command()
        .args(["-C", repo_path, "symbolic-ref", "-q", "HEAD"])
        .output()
        .map_err(|error| RepositoryActionsError::io("read current branch ref", error))?;

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
    let update_ref_output = git_command()
        .args([
            "-C",
            repo_path,
            "update-ref",
            &update_ref_target,
            next_head_hash,
            head_hash,
        ])
        .output()
        .map_err(|error| RepositoryActionsError::io("update rewritten history", error))?;

    if !update_ref_output.status.success() {
        return Err(RepositoryActionsError::message(git_process_error_message(
            &update_ref_output.stdout,
            &update_ref_output.stderr,
            "Failed to update rewritten history",
        )));
    }

    let _ = git_command()
        .args(["-C", repo_path, "update-ref", "ORIG_HEAD", head_hash])
        .output();

    Ok(())
}

fn read_commit_rewrite_metadata(
    repo_path: &str,
    commit_hash: &str,
) -> RepositoryActionsResult<CommitRewriteMetadata> {
    let output = git_command()
        .args([
            "-C",
            repo_path,
            "show",
            "-s",
            "--format=%T%x00%P%x00%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI%x00%B",
            commit_hash,
        ])
        .output()
        .map_err(|error| RepositoryActionsError::io("read commit metadata", error))?;

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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Checks out a commit in detached HEAD mode.
pub(crate) fn checkout_repository_commit(repo_path: String, target: String) -> Result<(), String> {
    (|| -> RepositoryActionsResult<()> {
        ensure_repo(&repo_path)?;

        let trimmed_target = target.trim();

        if trimmed_target.is_empty() {
            return Err(RepositoryActionsError::message(
                "Target reference is required",
            ));
        }

        let output = git_command()
            .args(["-C", &repo_path, "switch", "--detach", trimmed_target])
            .output()
            .map_err(|error| RepositoryActionsError::io("run git switch --detach", error))?;

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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Pushes the current branch and can publish a repository when no remote exists.
pub(crate) fn push_repository_branch(
    state: State<'_, SettingsState>,
    repo_path: String,
    preferences: Option<RepoCommandPreferences>,
    force_with_lease: Option<bool>,
    publish_repo_name: Option<String>,
    publish_visibility: Option<String>,
) -> Result<(), String> {
    (|| -> RepositoryActionsResult<()> {
        ensure_repo(&repo_path)?;
        let command_preferences = preferences.unwrap_or_default();
        let _network_operation = begin_network_operation(&state, &repo_path)
            .map_err(RepositoryActionsError::message)?;
        let branch_name = resolve_current_branch_name(&repo_path)?;
        let has_any_remote = repository_has_any_remote(&repo_path)?;

        if !has_any_remote {
            publish_repository_from_request(
                &repo_path,
                publish_repo_name.as_deref(),
                publish_visibility.as_deref(),
                "No remote is configured. Publish this repository before pushing.",
            )?;
            return Ok(());
        }

        let origin_remote_output = git_command()
            .args(["-C", &repo_path, "remote", "get-url", "origin"])
            .output()
            .map_err(|error| RepositoryActionsError::io("verify origin remote", error))?;

        let has_origin_remote = origin_remote_output.status.success();
        let origin_remote_missing_on_server = resolve_origin_remote_missing_on_server(
            &repo_path,
            &command_preferences,
            &state,
            has_origin_remote,
        )?;

        if origin_remote_missing_on_server {
            let remove_origin_output = git_command()
                .args(["-C", &repo_path, "remote", "remove", "origin"])
                .output()
                .map_err(|error| RepositoryActionsError::io("remove stale origin remote", error))?;

            if !remove_origin_output.status.success() {
                return Err(RepositoryActionsError::message(git_error_message(
                    &remove_origin_output.stderr,
                    "Failed to remove stale origin remote",
                )));
            }

            publish_repository_from_request(
                &repo_path,
                publish_repo_name.as_deref(),
                publish_visibility.as_deref(),
                "Remote repository for 'origin' was not found. Publish this repository to recreate it before pushing.",
            )?;
            return Ok(());
        }

        let upstream_ref = resolve_upstream_ref(&repo_path)?;
        let push_plan =
            resolve_push_upstream_plan(&branch_name, upstream_ref.as_deref(), has_origin_remote)?;
        let should_force_with_lease = force_with_lease == Some(true);

        run_git_push(
            &repo_path,
            &command_preferences,
            &state,
            &push_plan,
            &branch_name,
            should_force_with_lease,
        )
    })()
    .map_err(|error| error.to_string())
}

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Runs pull/fetch action modes and reports whether HEAD changed.
pub(crate) fn pull_repository_action(
    state: State<'_, SettingsState>,
    repo_path: String,
    mode: String,
    preferences: Option<RepoCommandPreferences>,
) -> Result<PullActionResult, String> {
    (|| -> RepositoryActionsResult<PullActionResult> {
        ensure_repo(&repo_path)?;
        let command_preferences = preferences.unwrap_or_default();
        let _network_operation =
            begin_network_operation(&state, &repo_path).map_err(RepositoryActionsError::message)?;

        let head_before = resolve_head_hash(&repo_path)?;

        let mut pull_command = git_command();
        pull_command.args(["-C", &repo_path]);
        apply_git_preferences(&mut pull_command, &command_preferences, Some(&state))
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

        if !output.status.success() {
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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Runs merge, fast-forward-only merge, or rebase against a target reference.
pub(crate) fn run_repository_merge_action(
    state: State<'_, SettingsState>,
    repo_path: String,
    mode: String,
    target_ref: String,
    preferences: Option<RepoCommandPreferences>,
) -> Result<MergeActionResult, String> {
    (|| -> RepositoryActionsResult<MergeActionResult> {
        ensure_repo(&repo_path)?;

        let trimmed_target_ref = target_ref.trim();

        if trimmed_target_ref.is_empty() {
            return Err(RepositoryActionsError::message(
                "A target reference is required",
            ));
        }

        let target_resolution = format!("{trimmed_target_ref}^{{commit}}");
        let target_exists = git_command()
            .args([
                "-C",
                &repo_path,
                "rev-parse",
                "--verify",
                "--quiet",
                &target_resolution,
            ])
            .status()
            .map_err(|error| RepositoryActionsError::io("resolve target reference", error))?
            .success();

        if !target_exists {
            return Err(RepositoryActionsError::message(format!(
                "The target reference '{trimmed_target_ref}' could not be resolved"
            )));
        }

        let current_branch_output = git_command()
            .args(["-C", &repo_path, "rev-parse", "--abbrev-ref", "HEAD"])
            .output()
            .map_err(|error| RepositoryActionsError::io("inspect current branch", error))?;

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
        apply_git_preferences(&mut command, &command_preferences, Some(&state))
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

        Ok(MergeActionResult {
            head_changed: head_before != head_after,
        })
    })()
    .map_err(|error| error.to_string())
}

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Cherry-picks a commit onto the current branch.
pub(crate) fn cherry_pick_repository_commit(
    repo_path: String,
    target: String,
) -> Result<(), String> {
    (|| -> RepositoryActionsResult<()> {
        ensure_repo(&repo_path)?;

        let trimmed_target = target.trim();

        if trimmed_target.is_empty() {
            return Err(RepositoryActionsError::message(
                "Target reference is required",
            ));
        }

        let output = git_command()
            .args(["-C", &repo_path, "cherry-pick", trimmed_target])
            .output()
            .map_err(|error| RepositoryActionsError::io("run git cherry-pick", error))?;

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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Reverts a commit with `--no-edit`.
pub(crate) fn revert_repository_commit(repo_path: String, target: String) -> Result<(), String> {
    (|| -> RepositoryActionsResult<()> {
        ensure_repo(&repo_path)?;

        let trimmed_target = target.trim();

        if trimmed_target.is_empty() {
            return Err(RepositoryActionsError::message(
                "Target reference is required",
            ));
        }

        let output = git_command()
            .args(["-C", &repo_path, "revert", "--no-edit", trimmed_target])
            .output()
            .map_err(|error| RepositoryActionsError::io("run git revert", error))?;

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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Creates lightweight or annotated tags at a target reference.
pub(crate) fn create_repository_tag(
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
            git_command()
                .args([
                    "-C",
                    &repo_path,
                    "tag",
                    "-a",
                    trimmed_tag_name,
                    trimmed_target,
                    "-m",
                    resolved_annotation_message,
                ])
                .output()
                .map_err(|error| RepositoryActionsError::io("run git tag -a", error))?
        } else {
            git_command()
                .args(["-C", &repo_path, "tag", trimmed_tag_name, trimmed_target])
                .output()
                .map_err(|error| RepositoryActionsError::io("run git tag", error))?
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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Rewrites the target commit message and replays descendants on top of rewritten parents.
pub(crate) fn reword_repository_commit(
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

// Tauri commands accept owned payloads because invoke arguments are deserialized by value.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Drops a commit from the current HEAD ancestry by rewriting descendants.
pub(crate) fn drop_repository_commit(
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
        build_commit_message_text, checkout_repository_commit, drop_repository_commit,
        resolve_head_hash, resolve_publish_visibility_flag, resolve_push_upstream_plan,
        reword_repository_commit,
    };
    use crate::git_support::git_command;
    use std::env;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn resolve_publish_visibility_flag_defaults_to_private_for_unknown_values() {
        assert_eq!(resolve_publish_visibility_flag(None), "--private");
        assert_eq!(
            resolve_publish_visibility_flag(Some("internal")),
            "--private"
        );
        assert_eq!(
            resolve_publish_visibility_flag(Some(" public ")),
            "--public"
        );
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

    #[test]
    fn checkout_repository_commit_switches_to_head_commit() {
        let repo_path = TempRepository::create();
        TempRepository::write_file(&repo_path.path, "tracked.txt", "initial");
        repo_path.git(&["add", "tracked.txt"]);
        repo_path.git(&["commit", "-m", "Initial commit"]);

        let head_hash = resolve_head_hash(repo_path.path.to_string_lossy().as_ref())
            .expect("head hash should resolve");

        checkout_repository_commit(repo_path.path.to_string_lossy().to_string(), head_hash)
            .expect("checkout should succeed");

        let detached_head = repo_path.git_output(&["rev-parse", "--abbrev-ref", "HEAD"]);
        assert_eq!(detached_head.trim(), "HEAD");
    }

    #[test]
    fn checkout_repository_commit_rejects_unknown_commit() {
        let repo_path = TempRepository::create();
        TempRepository::write_file(&repo_path.path, "tracked.txt", "initial");
        repo_path.git(&["add", "tracked.txt"]);
        repo_path.git(&["commit", "-m", "Initial commit"]);

        let error = checkout_repository_commit(
            repo_path.path.to_string_lossy().to_string(),
            "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef".to_string(),
        )
        .expect_err("checkout should fail");

        assert!(
            error.contains("fatal") || error.contains("not a valid"),
            "{error}"
        );
    }

    #[test]
    fn reword_repository_commit_rewrites_target_and_descendants() {
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

    #[test]
    fn drop_repository_commit_rewrites_head_and_selects_parent_when_dropping_tip() {
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
                .expect("drop should succeed");

        assert_eq!(result.head_hash, first_hash);
        assert_eq!(
            result.selected_commit_hash.as_deref(),
            Some(first_hash.as_str())
        );

        let current_head = repo_path.git_output(&["rev-parse", "HEAD"]);
        assert_eq!(current_head.trim(), first_hash);
    }

    struct TempRepository {
        path: PathBuf,
    }

    impl TempRepository {
        fn create() -> Self {
            let unique_suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock should be after unix epoch")
                .as_nanos();
            let path =
                env::temp_dir().join(format!("litgit-repository-actions-test-{unique_suffix}"));

            fs::create_dir_all(&path).expect("temp repo directory should be created");
            Self::git_in(&path, &["init", "-b", "main"]);
            Self::git_in(&path, &["config", "user.name", "LitGit Tests"]);
            Self::git_in(&path, &["config", "user.email", "tests@example.com"]);

            Self { path }
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
