use crate::git_support::{git_command, git_error_message, validate_git_repo};
use crate::repository::validate_branch_name;
use crate::settings::{
    apply_git_preferences, begin_network_operation, load_keyring_entry, RepoCommandPreferences,
    SettingsState, GITHUB_AVATAR_SERVICE,
};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
/// Repository reference entry for local branches, remote branches, and tags.
pub(crate) struct RepositoryBranch {
    ref_type: String,
    is_remote: bool,
    name: String,
    short_hash: String,
    last_commit_date: String,
    is_current: bool,
    ahead_count: Option<usize>,
    behind_count: Option<usize>,
}

fn parse_remote_names_output(stdout: &str) -> Vec<String> {
    stdout
        .lines()
        .map(str::trim)
        .filter(|remote_name| !remote_name.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn parse_remote_urls_output(stdout: &str) -> HashMap<String, String> {
    let mut remote_urls = HashMap::new();

    for line in stdout.lines() {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            continue;
        }

        let mut parts = trimmed.split_whitespace();
        let Some(remote_name) = parts.next() else {
            continue;
        };
        let Some(remote_url) = parts.next() else {
            continue;
        };
        let remote_kind = parts.next().unwrap_or_default();

        if remote_kind == "(fetch)" || !remote_urls.contains_key(remote_name) {
            remote_urls.insert(remote_name.to_string(), remote_url.to_string());
        }
    }

    remote_urls
}

fn parse_github_owner_from_remote_url(remote_url: &str) -> Option<String> {
    fn parse_owner(path: &str) -> Option<String> {
        let normalized = path.trim().trim_start_matches('/');
        let path_without_query = normalized.split(['?', '#']).next().unwrap_or_default();
        let mut segments = path_without_query.split('/');
        let owner = segments.next()?.trim();
        let repository = segments.next()?.trim();

        if owner.is_empty() || repository.is_empty() {
            return None;
        }

        Some(owner.to_string())
    }

    let trimmed = remote_url.trim();

    for prefix in [
        "git@github.com:",
        "ssh://git@github.com/",
        "ssh://github.com/",
        "https://github.com/",
        "http://github.com/",
        "git://github.com/",
    ] {
        if let Some(path) = trimmed.strip_prefix(prefix) {
            return parse_owner(path);
        }
    }

    None
}

fn get_github_token(state: &SettingsState) -> Option<String> {
    if let Ok(Some(token)) = load_keyring_entry(GITHUB_AVATAR_SERVICE, "token") {
        return Some(token);
    }

    state.github_session_token()
}

fn fetch_github_owner_avatar_url(
    owner: &str,
    token: Option<&str>,
) -> Result<Option<String>, String> {
    let endpoint = format!("https://api.github.com/users/{owner}");
    let mut request = ureq::get(&endpoint)
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", "LitGit")
        .set("X-GitHub-Api-Version", "2022-11-28");

    if let Some(token) = token {
        request = request.set("Authorization", &format!("Bearer {token}"));
    }

    let response = request
        .call()
        .map_err(|error| format!("Failed to fetch GitHub avatar for owner {owner}: {error}"))?;
    let body = response.into_string().map_err(|error| {
        format!("Failed to read GitHub avatar response for owner {owner}: {error}")
    })?;
    let payload: serde_json::Value = serde_json::from_str(&body).map_err(|error| {
        format!("Failed to parse GitHub avatar response for owner {owner}: {error}")
    })?;

    Ok(payload
        .get("avatar_url")
        .and_then(serde_json::Value::as_str)
        .map(ToOwned::to_owned))
}

fn parse_branch_sync_counts(stdout: &str) -> Option<(usize, usize)> {
    let mut values = stdout.split_whitespace();
    let ahead = values.next()?.parse::<usize>().ok()?;
    let behind = values.next()?.parse::<usize>().ok()?;
    Some((ahead, behind))
}

fn parse_branch_row(
    row: &str,
    current_branch_sync_counts: Option<(usize, usize)>,
) -> Option<RepositoryBranch> {
    let mut parts = row.trim_end().split('\t');
    let head = parts.next().unwrap_or(" ").trim();
    let full_ref_name = parts.next().unwrap_or("").trim();
    let name = parts.next().unwrap_or("").to_string();
    let short_hash = parts.next().unwrap_or("").to_string();
    let last_commit_date = parts.next().unwrap_or("").to_string();
    let has_full_hash = !parts.next().unwrap_or("").trim().is_empty();
    let upstream_ref = parts.next().unwrap_or("").trim();

    if (full_ref_name.starts_with("refs/remotes/") && full_ref_name.ends_with("/HEAD"))
        || name.is_empty()
        || !has_full_hash
    {
        return None;
    }

    let ref_type = if full_ref_name.starts_with("refs/tags/") {
        "tag".to_string()
    } else {
        "branch".to_string()
    };
    let is_remote = full_ref_name.starts_with("refs/remotes/");
    let (ahead_count, behind_count) = if head == "*" && !upstream_ref.is_empty() && !is_remote {
        current_branch_sync_counts.unwrap_or((0, 0))
    } else {
        (0, 0)
    };

    Some(RepositoryBranch {
        ref_type,
        is_remote,
        name,
        short_hash,
        last_commit_date,
        is_current: head == "*",
        ahead_count: if head == "*" && !is_remote {
            Some(ahead_count)
        } else {
            None
        },
        behind_count: if head == "*" && !is_remote {
            Some(behind_count)
        } else {
            None
        },
    })
}

// Tauri command arguments mirror the frontend invoke payload.
#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Returns sorted repository refs with optional ahead/behind counts for current branch.
pub(crate) fn get_repository_branches(repo_path: String) -> Result<Vec<RepositoryBranch>, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = git_command()
        .args([
            "-C",
            &repo_path,
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(HEAD)\t%(refname)\t%(refname:short)\t%(objectname:short)\t%(committerdate:iso-strict)\t%(objectname)\t%(upstream:short)",
            "refs/heads",
            "refs/remotes",
            "refs/tags",
        ])
        .output()
        .map_err(|error| format!("Failed to run git for-each-ref: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to read repository branches".to_string()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    let current_branch_upstream = stdout.lines().map(str::trim_end).find_map(|row| {
        if row.is_empty() {
            return None;
        }

        let mut parts = row.split('\t');
        if parts.next().map(str::trim) != Some("*") {
            return None;
        }

        let upstream_ref = parts.nth(5).map(str::trim).unwrap_or_default();
        (!upstream_ref.is_empty()).then(|| upstream_ref.to_string())
    });

    let current_branch_sync_counts = if let Some(upstream_ref) = current_branch_upstream.as_deref()
    {
        let sync_count_output = git_command()
            .args([
                "-C",
                &repo_path,
                "rev-list",
                "--left-right",
                "--count",
                &format!("HEAD...{upstream_ref}"),
            ])
            .output()
            .map_err(|error| format!("Failed to run git rev-list: {error}"))?;

        if sync_count_output.status.success() {
            parse_branch_sync_counts(&String::from_utf8_lossy(&sync_count_output.stdout))
        } else {
            None
        }
    } else {
        None
    };

    Ok(stdout
        .lines()
        .filter_map(|row| parse_branch_row(row, current_branch_sync_counts))
        .collect())
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Returns configured remote names for the repository.
pub(crate) fn get_repository_remote_names(repo_path: String) -> Result<Vec<String>, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = git_command()
        .args(["-C", &repo_path, "remote"])
        .output()
        .map_err(|error| format!("Failed to run git remote: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to read repository remotes",
        ));
    }

    Ok(parse_remote_names_output(&String::from_utf8_lossy(
        &output.stdout,
    )))
}

#[tauri::command]
/// Resolves GitHub avatar URLs for remotes that point to GitHub repositories.
pub(crate) async fn get_repository_remote_avatars(
    repo_path: String,
    state: State<'_, SettingsState>,
) -> Result<HashMap<String, Option<String>>, String> {
    validate_git_repo(Path::new(&repo_path))?;
    let github_token = get_github_token(state.inner());

    tauri::async_runtime::spawn_blocking(move || {
        let output = git_command()
            .args(["-C", &repo_path, "remote", "-v"])
            .output()
            .map_err(|error| format!("Failed to run git remote -v: {error}"))?;

        if !output.status.success() {
            return Err(git_error_message(
                &output.stderr,
                "Failed to read repository remotes",
            ));
        }

        let remote_urls = parse_remote_urls_output(&String::from_utf8_lossy(&output.stdout));
        let mut avatars_by_owner: HashMap<String, Option<String>> = HashMap::new();
        let mut avatars_by_remote = HashMap::new();

        for (remote_name, remote_url) in remote_urls {
            let avatar_url = if let Some(owner) = parse_github_owner_from_remote_url(&remote_url) {
                if let Some(cached_avatar_url) = avatars_by_owner.get(&owner) {
                    cached_avatar_url.clone()
                } else {
                    let fetched_avatar_url =
                        fetch_github_owner_avatar_url(&owner, github_token.as_deref())
                            .inspect_err(|error| log::warn!("{error}"))
                            .ok()
                            .flatten();
                    avatars_by_owner.insert(owner, fetched_avatar_url.clone());
                    fetched_avatar_url
                }
            } else {
                None
            };
            avatars_by_remote.insert(remote_name, avatar_url);
        }

        Ok(avatars_by_remote)
    })
    .await
    .map_err(|error| format!("Failed to load repository remote avatars: {error}"))?
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Creates a new local branch from the current HEAD.
pub(crate) fn create_repository_branch(
    repo_path: String,
    branch_name: String,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_branch_name = branch_name.trim();

    if trimmed_branch_name.is_empty() {
        return Err("Branch name is required".to_string());
    }

    validate_branch_name(trimmed_branch_name)?;

    let output = git_command()
        .args(["-C", &repo_path, "switch", "-c", trimmed_branch_name])
        .output()
        .map_err(|error| format!("Failed to run git switch: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to create branch".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Creates a new local branch at a specific target reference.
pub(crate) fn create_repository_branch_at_reference(
    repo_path: String,
    branch_name: String,
    target: String,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_branch_name = branch_name.trim();
    let trimmed_target = target.trim();

    if trimmed_branch_name.is_empty() {
        return Err("Branch name is required".to_string());
    }

    if trimmed_target.is_empty() {
        return Err("Target reference is required".to_string());
    }

    validate_branch_name(trimmed_branch_name)?;

    let output = git_command()
        .args([
            "-C",
            &repo_path,
            "switch",
            "-c",
            trimmed_branch_name,
            trimmed_target,
        ])
        .output()
        .map_err(|error| format!("Failed to run git switch: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to create branch".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Deletes a local branch.
pub(crate) fn delete_repository_branch(
    repo_path: String,
    branch_name: String,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_branch_name = branch_name.trim();

    if trimmed_branch_name.is_empty() {
        return Err("Branch name is required".to_string());
    }

    validate_branch_name(trimmed_branch_name)?;

    let output = git_command()
        .args(["-C", &repo_path, "branch", "-d", trimmed_branch_name])
        .output()
        .map_err(|error| format!("Failed to run git branch: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to delete branch".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Renames a local branch.
pub(crate) fn rename_repository_branch(
    repo_path: String,
    branch_name: String,
    new_branch_name: String,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_branch_name = branch_name.trim();
    let trimmed_new_branch_name = new_branch_name.trim();

    if trimmed_branch_name.is_empty() {
        return Err("Branch name is required".to_string());
    }

    if trimmed_new_branch_name.is_empty() {
        return Err("New branch name is required".to_string());
    }

    validate_branch_name(trimmed_branch_name)?;
    validate_branch_name(trimmed_new_branch_name)?;

    let output = git_command()
        .args([
            "-C",
            &repo_path,
            "branch",
            "-m",
            trimmed_branch_name,
            trimmed_new_branch_name,
        ])
        .output()
        .map_err(|error| format!("Failed to run git branch: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to rename branch".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Deletes a branch from a remote.
pub(crate) fn delete_remote_repository_branch(
    state: State<'_, SettingsState>,
    repo_path: String,
    remote_name: String,
    branch_name: String,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_remote_name = remote_name.trim();
    let trimmed_branch_name = branch_name.trim();

    if trimmed_remote_name.is_empty() {
        return Err("Remote name is required".to_string());
    }

    if trimmed_branch_name.is_empty() {
        return Err("Branch name is required".to_string());
    }

    validate_branch_name(trimmed_branch_name)?;

    let command_preferences = RepoCommandPreferences::default();
    let _network_operation = begin_network_operation(&state, &repo_path)?;

    let mut command = git_command();
    apply_git_preferences(&mut command, &command_preferences, Some(&state))?;
    let output = command
        .args([
            "-C",
            &repo_path,
            "push",
            trimmed_remote_name,
            "--delete",
            trimmed_branch_name,
        ])
        .output()
        .map_err(|error| format!("Failed to run git push --delete: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to delete remote branch",
        ));
    }

    Ok(())
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Sets or publishes upstream tracking for a local branch.
pub(crate) fn set_repository_branch_upstream(
    state: State<'_, SettingsState>,
    repo_path: String,
    local_branch_name: String,
    remote_name: String,
    remote_branch_name: String,
    preferences: Option<RepoCommandPreferences>,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_local_branch_name = local_branch_name.trim();
    let trimmed_remote_name = remote_name.trim();
    let trimmed_remote_branch_name = remote_branch_name.trim();

    if trimmed_local_branch_name.is_empty() {
        return Err("Local branch name is required".to_string());
    }

    if trimmed_remote_name.is_empty() {
        return Err("Remote name is required".to_string());
    }

    if trimmed_remote_branch_name.is_empty() {
        return Err("Remote branch name is required".to_string());
    }

    validate_branch_name(trimmed_local_branch_name)?;
    validate_branch_name(trimmed_remote_branch_name)?;

    let remote_ref = format!("refs/remotes/{trimmed_remote_name}/{trimmed_remote_branch_name}");
    let has_remote_branch = git_command()
        .args([
            "-C",
            &repo_path,
            "show-ref",
            "--verify",
            "--quiet",
            &remote_ref,
        ])
        .status()
        .map_err(|error| format!("Failed to inspect remote branch: {error}"))?
        .success();

    let command_preferences = preferences.unwrap_or_default();
    let _network_operation = begin_network_operation(&state, &repo_path)?;

    let output = if has_remote_branch {
        let mut command = git_command();
        apply_git_preferences(&mut command, &command_preferences, Some(&state))?;

        let upstream = format!("{trimmed_remote_name}/{trimmed_remote_branch_name}");
        command
            .args([
                "-C",
                &repo_path,
                "branch",
                "--set-upstream-to",
                &upstream,
                trimmed_local_branch_name,
            ])
            .output()
            .map_err(|error| format!("Failed to run git branch --set-upstream-to: {error}"))?
    } else {
        let mut command = git_command();
        apply_git_preferences(&mut command, &command_preferences, Some(&state))?;

        let destination = format!("{trimmed_local_branch_name}:{trimmed_remote_branch_name}");
        command
            .args([
                "-C",
                &repo_path,
                "push",
                "-u",
                trimmed_remote_name,
                &destination,
            ])
            .output()
            .map_err(|error| format!("Failed to run git push -u: {error}"))?
    };

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to set branch upstream",
        ));
    }

    Ok(())
}

#[expect(clippy::needless_pass_by_value)]
#[tauri::command]
/// Switches to a local branch or tracks a remote branch.
pub(crate) fn switch_repository_branch(
    repo_path: String,
    branch_name: String,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let is_remote_ref = git_command()
        .args([
            "-C",
            &repo_path,
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/remotes/{branch_name}"),
        ])
        .status()
        .map_err(|error| format!("Failed to run git show-ref: {error}"))?
        .success();

    let output = if is_remote_ref {
        let local_name = branch_name
            .split_once('/')
            .map_or(branch_name.as_str(), |(_, local)| local);
        let local_branch_exists = git_command()
            .args([
                "-C",
                &repo_path,
                "show-ref",
                "--verify",
                "--quiet",
                &format!("refs/heads/{local_name}"),
            ])
            .status()
            .map_err(|error| format!("Failed to run git show-ref: {error}"))?
            .success();

        if local_branch_exists {
            git_command()
                .args(["-C", &repo_path, "switch", local_name])
                .output()
                .map_err(|error| format!("Failed to run git switch: {error}"))?
        } else {
            git_command()
                .args([
                    "-C",
                    &repo_path,
                    "switch",
                    "--track",
                    "-c",
                    local_name,
                    &branch_name,
                ])
                .output()
                .map_err(|error| format!("Failed to run git switch: {error}"))?
        }
    } else {
        git_command()
            .args(["-C", &repo_path, "switch", &branch_name])
            .output()
            .map_err(|error| format!("Failed to run git switch: {error}"))?
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to switch branch".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        create_repository_branch, create_repository_branch_at_reference, delete_repository_branch,
        get_repository_branches, get_repository_remote_names, parse_branch_row,
        parse_branch_sync_counts, parse_github_owner_from_remote_url, parse_remote_names_output,
        parse_remote_urls_output, rename_repository_branch, switch_repository_branch,
    };
    use crate::git_support::git_command;
    use std::env;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn parse_remote_names_output_returns_trimmed_names_in_order() {
        let remote_names = parse_remote_names_output("origin\n upstream \n\n");

        assert_eq!(
            remote_names,
            vec!["origin".to_string(), "upstream".to_string()]
        );
    }

    #[test]
    fn parse_remote_urls_output_prefers_fetch_url_per_remote() {
        let parsed = parse_remote_urls_output(
            "origin\thttps://github.com/litgit/litgit.git (fetch)\norigin\thttps://github.com/litgit/litgit.git (push)\nupstream\tgit@github.com:acme/monorepo.git (push)\nupstream\tgit@github.com:acme/monorepo.git (fetch)\n"
        );

        assert_eq!(
            parsed.get("origin"),
            Some(&"https://github.com/litgit/litgit.git".to_string())
        );
        assert_eq!(
            parsed.get("upstream"),
            Some(&"git@github.com:acme/monorepo.git".to_string())
        );
        assert_eq!(parsed.len(), 2);
    }

    #[test]
    fn parse_github_owner_from_remote_url_supports_github_url_variants() {
        assert_eq!(
            parse_github_owner_from_remote_url("git@github.com:litgit/LitGit.git"),
            Some("litgit".to_string())
        );
        assert_eq!(
            parse_github_owner_from_remote_url("https://github.com/acme/platform"),
            Some("acme".to_string())
        );
        assert_eq!(
            parse_github_owner_from_remote_url("ssh://git@github.com/open-source-org/tooling.git"),
            Some("open-source-org".to_string())
        );
    }

    #[test]
    fn parse_github_owner_from_remote_url_returns_none_for_non_github_or_invalid_urls() {
        assert_eq!(
            parse_github_owner_from_remote_url("https://gitlab.com/litgit/LitGit.git"),
            None
        );
        assert_eq!(
            parse_github_owner_from_remote_url("https://github.com/litgit"),
            None
        );
        assert_eq!(parse_github_owner_from_remote_url(""), None);
    }

    #[test]
    fn parse_branch_sync_counts_returns_none_for_incomplete_or_invalid_output() {
        assert_eq!(parse_branch_sync_counts(""), None);
        assert_eq!(parse_branch_sync_counts("2"), None);
        assert_eq!(parse_branch_sync_counts("left right"), None);
    }

    #[test]
    fn parse_branch_row_sets_sync_counts_only_for_current_local_branch_with_upstream() {
        let row =
            "*\trefs/heads/main\tmain\tabc123\t2026-04-02T00:00:00+00:00\tdeadbeef\torigin/main";

        let branch = parse_branch_row(row, Some((3, 1))).expect("branch row should parse");

        assert_eq!(branch.name, "main");
        assert_eq!(branch.ahead_count, Some(3));
        assert_eq!(branch.behind_count, Some(1));
        assert!(!branch.is_remote);
        assert!(branch.is_current);
    }

    #[test]
    fn parse_branch_row_skips_remote_head_alias_rows() {
        let row = " \trefs/remotes/origin/HEAD\torigin/HEAD\tabc123\t2026-04-02T00:00:00+00:00\tdeadbeef\t";

        assert!(parse_branch_row(row, Some((1, 1))).is_none());
    }

    #[test]
    fn create_repository_branch_creates_a_new_branch() {
        let repo = TempRepository::create();
        repo.write_file("tracked.txt", "initial");
        repo.git(&["add", "tracked.txt"]);
        repo.git(&["commit", "-m", "Initial commit"]);

        create_repository_branch(
            repo.path.to_string_lossy().to_string(),
            "feature".to_string(),
        )
        .expect("branch should be created");

        let current_branch = repo.git_output(&["rev-parse", "--abbrev-ref", "HEAD"]);
        assert_eq!(current_branch.trim(), "feature");
    }

    #[test]
    fn create_repository_branch_rejects_duplicate_names() {
        let repo = TempRepository::create();
        repo.write_file("tracked.txt", "initial");
        repo.git(&["add", "tracked.txt"]);
        repo.git(&["commit", "-m", "Initial commit"]);
        repo.git(&["switch", "-c", "feature"]);
        repo.git(&["switch", "main"]);

        let error = create_repository_branch(
            repo.path.to_string_lossy().to_string(),
            "feature".to_string(),
        )
        .expect_err("duplicate branch should fail");

        assert!(error.contains("already exists"), "{error}");
    }

    #[test]
    fn create_repository_branch_at_reference_uses_requested_target() {
        let repo = TempRepository::create();
        repo.write_file("tracked.txt", "first");
        repo.git(&["add", "tracked.txt"]);
        repo.git(&["commit", "-m", "Initial commit"]);
        let initial_commit = repo.git_output(&["rev-parse", "HEAD"]);

        repo.write_file("tracked.txt", "second");
        repo.git(&["commit", "-am", "Second commit"]);

        create_repository_branch_at_reference(
            repo.path.to_string_lossy().to_string(),
            "release".to_string(),
            initial_commit.trim().to_string(),
        )
        .expect("branch at reference should be created");

        let release_commit = repo.git_output(&["rev-parse", "release"]);
        assert_eq!(release_commit.trim(), initial_commit.trim());
    }

    #[test]
    fn delete_repository_branch_removes_non_current_branch() {
        let repo = TempRepository::create();
        repo.write_file("tracked.txt", "initial");
        repo.git(&["add", "tracked.txt"]);
        repo.git(&["commit", "-m", "Initial commit"]);
        repo.git(&["switch", "-c", "feature"]);
        repo.git(&["switch", "main"]);

        delete_repository_branch(
            repo.path.to_string_lossy().to_string(),
            "feature".to_string(),
        )
        .expect("branch should be deleted");

        let branches = repo.git_output(&["branch", "--format=%(refname:short)"]);
        assert!(!branches.lines().any(|branch| branch == "feature"));
    }

    #[test]
    fn rename_repository_branch_renames_existing_branch() {
        let repo = TempRepository::create();
        repo.write_file("tracked.txt", "initial");
        repo.git(&["add", "tracked.txt"]);
        repo.git(&["commit", "-m", "Initial commit"]);
        repo.git(&["switch", "-c", "feature"]);
        repo.git(&["switch", "main"]);

        rename_repository_branch(
            repo.path.to_string_lossy().to_string(),
            "feature".to_string(),
            "release".to_string(),
        )
        .expect("branch should be renamed");

        let branches = repo.git_output(&["branch", "--format=%(refname:short)"]);
        assert!(branches.lines().any(|branch| branch == "release"));
        assert!(!branches.lines().any(|branch| branch == "feature"));
    }

    #[test]
    fn switch_repository_branch_switches_existing_local_branch() {
        let repo = TempRepository::create();
        repo.write_file("tracked.txt", "initial");
        repo.git(&["add", "tracked.txt"]);
        repo.git(&["commit", "-m", "Initial commit"]);
        repo.git(&["switch", "-c", "feature"]);
        repo.git(&["switch", "main"]);

        switch_repository_branch(
            repo.path.to_string_lossy().to_string(),
            "feature".to_string(),
        )
        .expect("local branch switch should succeed");

        let current_branch = repo.git_output(&["rev-parse", "--abbrev-ref", "HEAD"]);
        assert_eq!(current_branch.trim(), "feature");
    }

    #[test]
    fn switch_repository_branch_tracks_remote_branch_when_local_branch_is_missing() {
        let remote = TempRepository::create_bare("remote");
        let repo = TempRepository::create();
        repo.write_file("tracked.txt", "initial");
        repo.git(&["add", "tracked.txt"]);
        repo.git(&["commit", "-m", "Initial commit"]);
        repo.git(&[
            "remote",
            "add",
            "origin",
            remote.path.to_string_lossy().as_ref(),
        ]);
        repo.git(&["push", "-u", "origin", "main"]);

        repo.git(&["switch", "-c", "feature"]);
        repo.git(&["push", "-u", "origin", "feature"]);
        repo.git(&["switch", "main"]);
        repo.git(&["branch", "-D", "feature"]);
        repo.git(&["fetch", "origin"]);

        switch_repository_branch(
            repo.path.to_string_lossy().to_string(),
            "origin/feature".to_string(),
        )
        .expect("remote branch switch should create a tracking branch");

        let current_branch = repo.git_output(&["rev-parse", "--abbrev-ref", "HEAD"]);
        assert_eq!(current_branch.trim(), "feature");

        let upstream = repo.git_output(&[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ]);
        assert_eq!(upstream.trim(), "origin/feature");
    }

    #[test]
    fn get_repository_remote_names_returns_configured_remotes() {
        let remote = TempRepository::create_bare("origin");
        let repo = TempRepository::create();
        repo.git(&[
            "remote",
            "add",
            "origin",
            remote.path.to_string_lossy().as_ref(),
        ]);
        repo.git(&[
            "remote",
            "add",
            "upstream",
            "https://github.com/litgit/litgit.git",
        ]);

        let remote_names =
            get_repository_remote_names(repo.path.to_string_lossy().to_string()).expect("remotes");

        assert_eq!(
            remote_names,
            vec!["origin".to_string(), "upstream".to_string()]
        );
    }

    #[test]
    fn get_repository_branches_includes_current_branch_tag_and_remote_branch() {
        let remote = TempRepository::create_bare("origin");
        let repo = TempRepository::create();
        repo.write_file("tracked.txt", "initial");
        repo.git(&["add", "tracked.txt"]);
        repo.git(&["commit", "-m", "Initial commit"]);
        repo.git(&["tag", "v1.0.0"]);
        repo.git(&[
            "remote",
            "add",
            "origin",
            remote.path.to_string_lossy().as_ref(),
        ]);
        repo.git(&["push", "-u", "origin", "main"]);
        repo.git(&["fetch", "origin"]);

        let branches =
            get_repository_branches(repo.path.to_string_lossy().to_string()).expect("branches");

        assert!(branches.iter().any(|branch| {
            branch.name == "main"
                && branch.is_current
                && !branch.is_remote
                && branch.ref_type == "branch"
        }));
        assert!(branches
            .iter()
            .any(|branch| branch.name == "origin/main" && branch.is_remote));
        assert!(branches
            .iter()
            .any(|branch| branch.name == "v1.0.0" && branch.ref_type == "tag"));
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
            let unique_suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock should be after unix epoch")
                .as_nanos();
            let path =
                env::temp_dir().join(format!("litgit-branches-test-{label}-{unique_suffix}"));

            fs::create_dir_all(&path).expect("temp repo directory should be created");
            Self::git_in(&path, init_args);

            if !init_args.contains(&"--bare") {
                Self::git_in(&path, &["config", "user.name", "LitGit Tests"]);
                Self::git_in(&path, &["config", "user.email", "tests@example.com"]);
            }

            Self { path }
        }

        fn write_file(&self, relative_path: &str, contents: &str) {
            let file_path = self.path.join(relative_path);
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
