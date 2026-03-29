use crate::git_support::{git_command, git_error_message, validate_git_repo};
use crate::repository::validate_branch_name;
use crate::settings::{
    apply_git_preferences, begin_network_operation, RepoCommandPreferences, SettingsState,
};
use serde::Serialize;
use std::path::Path;
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryBranch {
    ref_type: String,
    is_remote: bool,
    name: String,
    short_hash: String,
    last_commit_date: String,
    is_current: bool,
    commit_count: Option<usize>,
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

#[tauri::command]
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

    let mut current_branch_upstream: Option<String> = None;
    for row in stdout.lines() {
        let trimmed = row.trim_end();

        if trimmed.is_empty() {
            continue;
        }

        let mut parts = trimmed.split('\t');
        let head = parts.next().unwrap_or(" ").trim();
        let _full_ref_name = parts.next().unwrap_or("").trim();
        let _name = parts.next().unwrap_or("").trim();
        let _short_hash = parts.next().unwrap_or("").trim();
        let _last_commit_date = parts.next().unwrap_or("").trim();
        let _full_hash = parts.next().unwrap_or("").trim();
        let upstream_ref = parts.next().unwrap_or("").trim();

        if head == "*" && !upstream_ref.is_empty() {
            current_branch_upstream = Some(upstream_ref.to_string());
            break;
        }
    }

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
            let counts = String::from_utf8_lossy(&sync_count_output.stdout);
            let mut values = counts.split_whitespace();
            let ahead = values.next().unwrap_or("0").parse::<usize>().unwrap_or(0);
            let behind = values.next().unwrap_or("0").parse::<usize>().unwrap_or(0);
            Some((ahead, behind))
        } else {
            None
        }
    } else {
        None
    };

    let mut branches = Vec::new();

    for row in stdout.lines() {
        let trimmed = row.trim_end();

        if trimmed.is_empty() {
            continue;
        }

        let mut parts = trimmed.split('\t');
        let head = parts.next().unwrap_or(" ").trim();
        let full_ref_name = parts.next().unwrap_or("").trim();
        let name = parts.next().unwrap_or("").to_string();
        let short_hash = parts.next().unwrap_or("").to_string();
        let last_commit_date = parts.next().unwrap_or("").to_string();
        let full_hash = parts.next().unwrap_or("").to_string();
        let upstream_ref = parts.next().unwrap_or("").trim().to_string();

        if full_ref_name.starts_with("refs/remotes/") && full_ref_name.ends_with("/HEAD") {
            continue;
        }

        if name.is_empty() || full_hash.is_empty() {
            continue;
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

        branches.push(RepositoryBranch {
            ref_type,
            is_remote,
            name,
            short_hash,
            last_commit_date,
            is_current: head == "*",
            commit_count: None,
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
        });
    }

    Ok(branches)
}

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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
    use super::{create_repository_branch, parse_remote_names_output};
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
    fn create_repository_branch_creates_a_new_branch_and_rejects_duplicates() {
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

        let error = create_repository_branch(
            repo.path.to_string_lossy().to_string(),
            "feature".to_string(),
        )
        .expect_err("duplicate branch should fail");

        assert!(error.contains("already exists"), "{error}");
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
            let path = env::temp_dir().join(format!("litgit-branches-test-{unique_suffix}"));

            fs::create_dir_all(&path).expect("temp repo directory should be created");
            Self::git_in(&path, &["init", "-b", "main"]);
            Self::git_in(&path, &["config", "user.name", "LitGit Tests"]);
            Self::git_in(&path, &["config", "user.email", "tests@example.com"]);

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
