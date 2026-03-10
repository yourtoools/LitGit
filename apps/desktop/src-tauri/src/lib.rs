use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::Write;
use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::State;
use tauri::{AppHandle, Emitter};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PickedRepository {
    has_initial_commit: bool,
    is_git_repository: bool,
    name: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryCommit {
    hash: String,
    short_hash: String,
    parent_hashes: Vec<String>,
    message: String,
    author: String,
    author_email: Option<String>,
    author_username: Option<String>,
    author_avatar_url: Option<String>,
    date: String,
    refs: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryBranch {
    ref_type: String,
    is_remote: bool,
    name: String,
    short_hash: String,
    last_commit_date: String,
    is_current: bool,
    commit_count: usize,
    ahead_count: usize,
    behind_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryStash {
    message: String,
    r#ref: String,
    short_hash: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryWorkingTreeStatus {
    has_changes: bool,
    staged_count: usize,
    unstaged_count: usize,
    untracked_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryWorkingTreeItem {
    path: String,
    staged_status: String,
    unstaged_status: String,
    is_untracked: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryFileDiff {
    path: String,
    old_text: String,
    new_text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryCommitFile {
    status: String,
    path: String,
    previous_path: Option<String>,
    additions: usize,
    deletions: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryCommitFileDiff {
    commit_hash: String,
    path: String,
    old_text: String,
    new_text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PullActionResult {
    head_changed: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CloneRepositoryProgress {
    phase: String,
    message: String,
    percent: Option<u8>,
    received_objects: Option<usize>,
    resolved_objects: Option<usize>,
    total_objects: Option<usize>,
}

#[tauri::command]
fn pick_git_repository() -> Result<Option<PickedRepository>, String> {
    let folder = match rfd::FileDialog::new().pick_folder() {
        Some(folder) => folder,
        None => return Ok(None),
    };

    let path = folder.to_string_lossy().to_string();
    let name = folder_name(&folder).unwrap_or_else(|| "repository".to_string());
    let is_git_repository = folder.join(".git").exists();
    let has_initial_commit = if is_git_repository {
        repository_has_initial_commit(&path)?
    } else {
        false
    };

    Ok(Some(PickedRepository {
        has_initial_commit,
        is_git_repository,
        name,
        path,
    }))
}

#[tauri::command]
fn pick_clone_destination_folder() -> Result<Option<String>, String> {
    let folder = match rfd::FileDialog::new().pick_folder() {
        Some(folder) => folder,
        None => return Ok(None),
    };

    Ok(Some(folder.to_string_lossy().to_string()))
}

#[tauri::command]
fn create_local_repository(
    name: String,
    destination_parent: String,
    default_branch: String,
    gitignore_template_key: Option<String>,
    gitignore_template_content: Option<String>,
    license_template_key: Option<String>,
    license_template_content: Option<String>,
) -> Result<PickedRepository, String> {
    let trimmed_name = name.trim();
    let trimmed_parent = destination_parent.trim();
    let trimmed_branch = default_branch.trim();

    if trimmed_name.is_empty() {
        return Err("Repository name is required".to_string());
    }

    if trimmed_parent.is_empty() {
        return Err("Initialize in folder is required".to_string());
    }

    if trimmed_branch.is_empty() {
        return Err("Default branch name is required".to_string());
    }

    validate_repository_name(trimmed_name)?;
    validate_branch_name(trimmed_branch)?;

    let destination_parent_path = Path::new(trimmed_parent);
    validate_repository_path(destination_parent_path)?;

    let repo_path = destination_parent_path.join(trimmed_name);

    if repo_path.exists() {
        return Err("A folder with that repository name already exists".to_string());
    }

    fs::create_dir(&repo_path)
        .map_err(|error| format!("Failed to create repository folder: {error}"))?;

    let creation_result = (|| -> Result<(), String> {
        initialize_git_repository(&repo_path, trimmed_branch)?;
        write_repository_files(
            &repo_path,
            trimmed_name,
            gitignore_template_key.as_deref(),
            gitignore_template_content.as_deref(),
            license_template_key.as_deref(),
            license_template_content.as_deref(),
        )?;
        create_initial_commit(&repo_path)?;
        Ok(())
    })();

    if let Err(error) = creation_result {
        let _ = fs::remove_dir_all(&repo_path);
        return Err(error);
    }

    let path = repo_path.to_string_lossy().to_string();
    let name = folder_name(&repo_path).unwrap_or_else(|| trimmed_name.to_string());

    Ok(PickedRepository {
        has_initial_commit: true,
        is_git_repository: true,
        name,
        path,
    })
}

#[tauri::command]
async fn clone_git_repository(
    app: AppHandle,
    repository_url: String,
    destination_parent: String,
    destination_folder_name: String,
    recurse_submodules: bool,
) -> Result<PickedRepository, String> {
    let trimmed_url = repository_url.trim();
    let trimmed_parent = destination_parent.trim();
    let trimmed_folder = destination_folder_name.trim();

    if trimmed_url.is_empty() {
        return Err("Repository URL is required".to_string());
    }

    if trimmed_parent.is_empty() {
        return Err("Destination folder is required".to_string());
    }

    if trimmed_folder.is_empty() {
        return Err("Repository folder name is required".to_string());
    }

    validate_clone_repository_url(trimmed_url)?;
    validate_clone_destination_folder_name(trimmed_folder)?;

    let destination_parent_path = Path::new(trimmed_parent);
    validate_repository_path(destination_parent_path)?;

    let destination_path = destination_parent_path.join(trimmed_folder);

    if destination_path.exists() {
        return Err("Destination folder already exists".to_string());
    }

    emit_clone_progress(
        &app,
        CloneRepositoryProgress {
            phase: "preparing".to_string(),
            message: format!("Preparing to clone into {}", destination_path.display()),
            percent: Some(2),
            received_objects: None,
            resolved_objects: None,
            total_objects: None,
        },
    );

    let mut clone_command = Command::new("git");
    clone_command.args([
        "clone",
        "--progress",
        trimmed_url,
        destination_path.to_string_lossy().as_ref(),
    ]);

    if recurse_submodules {
        clone_command.arg("--recurse-submodules");
    }

    let mut child = clone_command
        .stderr(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to run git clone: {error}"))?;

    if let Some(stderr) = child.stderr.take() {
        let stderr_reader = BufReader::new(stderr);

        for line_result in stderr_reader.lines() {
            let line =
                line_result.map_err(|error| format!("Failed to read git clone output: {error}"))?;
            if let Some(progress) = parse_clone_progress(&line) {
                emit_clone_progress(&app, progress);
            }
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Failed to finalize git clone: {error}"))?;

    if !output.status.success() {
        remove_partial_clone_destination(&destination_path);
        return Err(git_error_message(
            &output.stderr,
            "Failed to clone repository",
        ));
    }

    let path = destination_path.to_string_lossy().to_string();
    let has_initial_commit = repository_has_initial_commit(&path)?;
    let name = folder_name(&destination_path).unwrap_or_else(|| "repository".to_string());

    emit_clone_progress(
        &app,
        CloneRepositoryProgress {
            phase: "complete".to_string(),
            message: format!("Clone complete: {}", destination_path.display()),
            percent: Some(100),
            received_objects: None,
            resolved_objects: None,
            total_objects: None,
        },
    );

    Ok(PickedRepository {
        has_initial_commit,
        is_git_repository: true,
        name,
        path,
    })
}

#[tauri::command]
fn validate_opened_repositories(repo_paths: Vec<String>) -> Result<Vec<String>, String> {
    let valid_paths = repo_paths
        .into_iter()
        .filter(|repo_path| {
            let path = Path::new(repo_path);
            path.exists() && path.join(".git").exists()
        })
        .collect();

    Ok(valid_paths)
}

#[tauri::command]
fn create_repository_initial_commit(repo_path: String) -> Result<(), String> {
    validate_repository_path(Path::new(&repo_path))?;

    if !Path::new(&repo_path).join(".git").exists() {
        let init_output = Command::new("git")
            .args(["-C", &repo_path, "init"])
            .output()
            .map_err(|error| format!("Failed to run git init: {error}"))?;

        if !init_output.status.success() {
            return Err(git_error_message(
                &init_output.stderr,
                "Failed to initialize repository",
            ));
        }
    }

    if repository_has_initial_commit(&repo_path)? {
        return Ok(());
    }

    let repo_name = folder_name(Path::new(&repo_path)).unwrap_or_else(|| "repository".to_string());
    let readme_path = Path::new(&repo_path).join("README.md");

    if !readme_path.exists() {
        std::fs::write(&readme_path, format!("# {repo_name}\n"))
            .map_err(|error| format!("Failed to create README.md: {error}"))?;
    }

    let add_output = Command::new("git")
        .args(["-C", &repo_path, "add", "--", "README.md"])
        .output()
        .map_err(|error| format!("Failed to run git add: {error}"))?;

    if !add_output.status.success() {
        return Err(git_error_message(
            &add_output.stderr,
            "Failed to stage README.md",
        ));
    }

    let commit_output = Command::new("git")
        .args([
            "-C",
            &repo_path,
            "commit",
            "--allow-empty",
            "-m",
            "Initial commit",
        ])
        .output()
        .map_err(|error| format!("Failed to run git commit: {error}"))?;

    if !commit_output.status.success() {
        return Err(git_error_message(
            &commit_output.stderr,
            "Failed to create initial commit",
        ));
    }

    Ok(())
}

#[tauri::command]
fn get_repository_history(repo_path: String) -> Result<Vec<RepositoryCommit>, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = Command::new("git")
        .args([
            "-C",
            &repo_path,
            "log",
            "--decorate=short",
            "--date=iso-strict",
            "--max-count=150",
            "--pretty=format:%H%x1f%h%x1f%P%x1f%s%x1f%an%x1f%ae%x1f%ad%x1f%D%x1e",
        ])
        .output()
        .map_err(|error| format!("Failed to run git log: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to read repository history".to_string()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    let commits = stdout
        .split('\x1e')
        .filter_map(|row| {
            let trimmed = row.trim();

            if trimmed.is_empty() {
                return None;
            }

            let mut parts = trimmed.split('\x1f');

            let hash = parts.next()?.to_string();
            let short_hash = parts.next()?.to_string();
            let parents_raw = parts.next()?.to_string();
            let message = parts.next()?.to_string();
            let author = parts.next()?.to_string();
            let author_email_raw = parts.next().unwrap_or("").trim().to_string();
            let author_email = if author_email_raw.is_empty() {
                None
            } else {
                Some(author_email_raw)
            };
            let github_identity = author_email
                .as_deref()
                .map(resolve_github_identity_from_email)
                .unwrap_or_default();
            let date = parts.next()?.to_string();
            let refs_raw = parts.next().unwrap_or("").to_string();

            let parent_hashes = if parents_raw.trim().is_empty() {
                Vec::new()
            } else {
                parents_raw
                    .split_whitespace()
                    .map(std::string::ToString::to_string)
                    .collect()
            };

            let refs = refs_raw
                .split(", ")
                .filter(|reference| !reference.trim().is_empty())
                .map(std::string::ToString::to_string)
                .collect();

            Some(RepositoryCommit {
                hash,
                short_hash,
                parent_hashes,
                message,
                author,
                author_email: author_email.clone(),
                author_username: github_identity.username,
                author_avatar_url: github_identity.avatar_url,
                date,
                refs,
            })
        })
        .collect();

    Ok(commits)
}

#[tauri::command]
fn get_repository_branches(repo_path: String) -> Result<Vec<RepositoryBranch>, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = Command::new("git")
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

        let commit_count_output = Command::new("git")
            .args(["-C", &repo_path, "rev-list", "--count", &full_hash])
            .output()
            .map_err(|error| format!("Failed to run git rev-list: {error}"))?;

        if !commit_count_output.status.success() {
            continue;
        }

        let commit_count = String::from_utf8_lossy(&commit_count_output.stdout)
            .trim()
            .parse::<usize>()
            .unwrap_or(0);

        let (ahead_count, behind_count) = if upstream_ref.is_empty() {
            (0, 0)
        } else {
            let sync_count_output = Command::new("git")
                .args([
                    "-C",
                    &repo_path,
                    "rev-list",
                    "--left-right",
                    "--count",
                    &format!("{full_hash}...{upstream_ref}"),
                ])
                .output()
                .map_err(|error| format!("Failed to run git rev-list: {error}"))?;

            if !sync_count_output.status.success() {
                (0, 0)
            } else {
                let counts = String::from_utf8_lossy(&sync_count_output.stdout);
                let mut values = counts.split_whitespace();
                let ahead = values.next().unwrap_or("0").parse::<usize>().unwrap_or(0);
                let behind = values.next().unwrap_or("0").parse::<usize>().unwrap_or(0);

                (ahead, behind)
            }
        };

        let ref_type = if full_ref_name.starts_with("refs/tags/") {
            "tag".to_string()
        } else {
            "branch".to_string()
        };
        let is_remote = full_ref_name.starts_with("refs/remotes/");

        branches.push(RepositoryBranch {
            ref_type,
            is_remote,
            name,
            short_hash,
            last_commit_date,
            is_current: head == "*",
            commit_count,
            ahead_count,
            behind_count,
        });
    }

    Ok(branches)
}

#[tauri::command]
fn switch_repository_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let is_remote_ref = Command::new("git")
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
        let local_branch_exists = Command::new("git")
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
            Command::new("git")
                .args(["-C", &repo_path, "switch", local_name])
                .output()
                .map_err(|error| format!("Failed to run git switch: {error}"))?
        } else {
            Command::new("git")
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
        Command::new("git")
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

#[tauri::command]
fn push_repository_branch(repo_path: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let branch_output = Command::new("git")
        .args(["-C", &repo_path, "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|error| format!("Failed to resolve current branch: {error}"))?;

    if !branch_output.status.success() {
        return Err(git_error_message(
            &branch_output.stderr,
            "Failed to resolve current branch",
        ));
    }

    let branch_name = String::from_utf8_lossy(&branch_output.stdout)
        .trim()
        .to_string();

    if branch_name.is_empty() || branch_name == "HEAD" {
        return Err("Cannot push from detached HEAD".to_string());
    }

    let has_upstream = Command::new("git")
        .args([
            "-C",
            &repo_path,
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{u}",
        ])
        .output()
        .map_err(|error| format!("Failed to check branch upstream: {error}"))?
        .status
        .success();

    let push_output = if has_upstream {
        Command::new("git")
            .args(["-C", &repo_path, "push"])
            .output()
            .map_err(|error| format!("Failed to run git push: {error}"))?
    } else {
        Command::new("git")
            .args(["-C", &repo_path, "push", "-u", "origin", &branch_name])
            .output()
            .map_err(|error| format!("Failed to run git push: {error}"))?
    };

    if !push_output.status.success() {
        return Err(git_error_message(
            &push_output.stderr,
            "Failed to push branch",
        ));
    }

    Ok(())
}

#[tauri::command]
fn pull_repository_action(repo_path: String, mode: String) -> Result<PullActionResult, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let head_before = resolve_head_hash(&repo_path)?;

    let mut pull_command = Command::new("git");
    pull_command.args(["-C", &repo_path]);

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
            return Err("Unsupported pull mode".to_string());
        }
    }

    let output = pull_command
        .output()
        .map_err(|error| format!("Failed to run git pull/fetch: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to execute pull action",
        ));
    }

    let head_after = resolve_head_hash(&repo_path)?;

    Ok(PullActionResult {
        head_changed: head_before != head_after,
    })
}

#[tauri::command]
fn get_repository_stashes(repo_path: String) -> Result<Vec<RepositoryStash>, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = Command::new("git")
        .args([
            "-C",
            &repo_path,
            "stash",
            "list",
            "--format=%gd%x1f%gs%x1f%h%x1e",
        ])
        .output()
        .map_err(|error| format!("Failed to run git stash list: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to read repository stashes",
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    let stashes = stdout
        .split('\x1e')
        .filter_map(|row| {
            let trimmed = row.trim();

            if trimmed.is_empty() {
                return None;
            }

            let mut parts = trimmed.split('\x1f');
            let stash_ref = parts.next().unwrap_or("").trim().to_string();
            let message = parts.next().unwrap_or("").trim().to_string();
            let short_hash = parts.next().unwrap_or("").trim().to_string();

            if stash_ref.is_empty() {
                return None;
            }

            Some(RepositoryStash {
                message,
                r#ref: stash_ref,
                short_hash,
            })
        })
        .collect();

    Ok(stashes)
}

#[tauri::command]
fn apply_repository_stash(repo_path: String, stash_ref: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = Command::new("git")
        .args(["-C", &repo_path, "stash", "apply", &stash_ref])
        .output()
        .map_err(|error| format!("Failed to run git stash apply: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(&output.stderr, "Failed to apply stash"));
    }

    Ok(())
}

#[tauri::command]
fn pop_repository_stash(repo_path: String, stash_ref: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = Command::new("git")
        .args(["-C", &repo_path, "stash", "pop", &stash_ref])
        .output()
        .map_err(|error| format!("Failed to run git stash pop: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(&output.stderr, "Failed to pop stash"));
    }

    Ok(())
}

#[tauri::command]
fn drop_repository_stash(repo_path: String, stash_ref: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = Command::new("git")
        .args(["-C", &repo_path, "stash", "drop", &stash_ref])
        .output()
        .map_err(|error| format!("Failed to run git stash drop: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(&output.stderr, "Failed to delete stash"));
    }

    Ok(())
}
#[tauri::command]
fn commit_repository_changes(
    repo_path: String,
    summary: String,
    description: String,
    include_all: bool,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let summary_trimmed = summary.trim();

    if summary_trimmed.is_empty() {
        return Err("Commit summary is required".to_string());
    }

    if include_all {
        let add_output = Command::new("git")
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
    let mut commit_command = Command::new("git");

    commit_command.args(["-C", &repo_path, "commit", "-m", summary_trimmed]);

    if !description_trimmed.is_empty() {
        commit_command.args(["-m", description_trimmed]);
    }

    let output = commit_command
        .output()
        .map_err(|error| format!("Failed to run git commit: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to create commit".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[tauri::command]
fn stage_all_repository_changes(repo_path: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = Command::new("git")
        .args(["-C", &repo_path, "add", "-A"])
        .output()
        .map_err(|error| format!("Failed to run git add: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to stage all changes".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[tauri::command]
fn unstage_all_repository_changes(repo_path: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = Command::new("git")
        .args(["-C", &repo_path, "reset", "HEAD", "--", "."])
        .output()
        .map_err(|error| format!("Failed to run git reset: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to unstage all changes".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[tauri::command]
fn stage_repository_file(repo_path: String, file_path: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = Command::new("git")
        .args(["-C", &repo_path, "add", "-A", "--", &file_path])
        .output()
        .map_err(|error| format!("Failed to run git add: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to stage file".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[tauri::command]
fn unstage_repository_file(repo_path: String, file_path: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = Command::new("git")
        .args(["-C", &repo_path, "reset", "HEAD", "--", &file_path])
        .output()
        .map_err(|error| format!("Failed to run git reset: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to unstage file".to_string()
        } else {
            stderr
        });
    }

    Ok(())
}

#[tauri::command]
fn add_repository_ignore_rule(repo_path: String, pattern: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let trimmed_pattern = pattern.trim();
    if trimmed_pattern.is_empty() {
        return Err("Ignore rule cannot be empty".to_string());
    }

    let gitignore_path = Path::new(&repo_path).join(".gitignore");
    let mut existing_contents = fs::read_to_string(&gitignore_path).unwrap_or_default();

    if existing_contents
        .lines()
        .any(|line| line.trim() == trimmed_pattern)
    {
        return Ok(());
    }

    if !existing_contents.is_empty() && !existing_contents.ends_with('\n') {
        existing_contents.push('\n');
    }

    existing_contents.push_str(trimmed_pattern);
    existing_contents.push('\n');

    fs::write(&gitignore_path, existing_contents)
        .map_err(|error| format!("Failed to update .gitignore: {error}"))?;

    Ok(())
}
#[tauri::command]
fn discard_repository_path_changes(repo_path: String, file_path: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let restore_output = Command::new("git")
        .args([
            "-C",
            &repo_path,
            "restore",
            "--source=HEAD",
            "--staged",
            "--worktree",
            "--",
            &file_path,
        ])
        .output()
        .map_err(|error| format!("Failed to run git restore: {error}"))?;

    if restore_output.status.success() {
        return Ok(());
    }

    let clean_output = Command::new("git")
        .args(["-C", &repo_path, "clean", "-fd", "--", &file_path])
        .output()
        .map_err(|error| format!("Failed to run git clean: {error}"))?;

    if clean_output.status.success() {
        return Ok(());
    }

    let restore_stderr = String::from_utf8_lossy(&restore_output.stderr)
        .trim()
        .to_string();
    if !restore_stderr.is_empty() {
        return Err(restore_stderr);
    }

    let clean_stderr = String::from_utf8_lossy(&clean_output.stderr)
        .trim()
        .to_string();
    if !clean_stderr.is_empty() {
        return Err(clean_stderr);
    }

    Err("Failed to discard changes".to_string())
}
#[tauri::command]
fn discard_all_repository_changes(repo_path: String) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let reset_output = Command::new("git")
        .args(["-C", &repo_path, "reset", "--hard", "HEAD"])
        .output()
        .map_err(|error| format!("Failed to run git reset --hard: {error}"))?;

    if !reset_output.status.success() {
        let stderr = String::from_utf8_lossy(&reset_output.stderr).trim().to_string();

        if !stderr.is_empty() {
            return Err(stderr);
        }

        return Err("Failed to discard tracked changes".to_string());
    }

    let clean_output = Command::new("git")
        .args(["-C", &repo_path, "clean", "-fd"])
        .output()
        .map_err(|error| format!("Failed to run git clean: {error}"))?;

    if !clean_output.status.success() {
        let stderr = String::from_utf8_lossy(&clean_output.stderr).trim().to_string();

        if !stderr.is_empty() {
            return Err(stderr);
        }

        return Err("Failed to discard untracked changes".to_string());
    }

    Ok(())
}

#[tauri::command]
fn get_repository_commit_files(
    repo_path: String,
    commit_hash: String,
) -> Result<Vec<RepositoryCommitFile>, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = Command::new("git")
        .args([
            "-C",
            &repo_path,
            "show",
            "--pretty=format:",
            "--name-status",
            "--find-renames",
            "--find-copies",
            &commit_hash,
        ])
        .output()
        .map_err(|error| format!("Failed to run git show for commit files: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to load commit file list",
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut files: Vec<RepositoryCommitFile> = Vec::new();

    for row in stdout.lines() {
        let trimmed = row.trim();

        if trimmed.is_empty() {
            continue;
        }

        let parts: Vec<&str> = trimmed.split('\t').collect();
        if parts.len() < 2 {
            continue;
        }

        let status_token = parts[0];
        let status_char = status_token.chars().next().unwrap_or('M');
        let status = status_char.to_string();

        let (path, previous_path) = if status_char == 'R' || status_char == 'C' {
            if parts.len() < 3 {
                continue;
            }

            (parts[2].to_string(), Some(parts[1].to_string()))
        } else {
            (parts[1].to_string(), None)
        };

        let numstat_output = Command::new("git")
            .args([
                "-C",
                &repo_path,
                "show",
                "--pretty=format:",
                "--numstat",
                &commit_hash,
                "--",
                &path,
            ])
            .output()
            .map_err(|error| format!("Failed to run git show --numstat: {error}"))?;

        let mut additions: usize = 0;
        let mut deletions: usize = 0;

        if numstat_output.status.success() {
            let numstat_stdout = String::from_utf8_lossy(&numstat_output.stdout);
            for numstat_row in numstat_stdout.lines() {
                let numstat_trimmed = numstat_row.trim();
                if numstat_trimmed.is_empty() {
                    continue;
                }

                let numstat_parts: Vec<&str> = numstat_trimmed.split('\t').collect();
                if numstat_parts.len() < 3 {
                    continue;
                }

                additions = numstat_parts[0].parse::<usize>().unwrap_or(0);
                deletions = numstat_parts[1].parse::<usize>().unwrap_or(0);
                break;
            }
        }

        files.push(RepositoryCommitFile {
            status,
            path,
            previous_path,
            additions,
            deletions,
        });
    }

    Ok(files)
}

#[tauri::command]
fn get_repository_commit_file_diff(
    repo_path: String,
    commit_hash: String,
    file_path: String,
) -> Result<RepositoryCommitFileDiff, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let old_output = Command::new("git")
        .args([
            "-C",
            &repo_path,
            "show",
            &format!("{commit_hash}^:{file_path}"),
        ])
        .output()
        .map_err(|error| format!("Failed to run git show for previous commit file: {error}"))?;

    let old_text = if old_output.status.success() {
        String::from_utf8_lossy(&old_output.stdout).to_string()
    } else {
        String::new()
    };

    let new_output = Command::new("git")
        .args([
            "-C",
            &repo_path,
            "show",
            &format!("{commit_hash}:{file_path}"),
        ])
        .output()
        .map_err(|error| format!("Failed to run git show for commit file: {error}"))?;

    let new_text = if new_output.status.success() {
        String::from_utf8_lossy(&new_output.stdout).to_string()
    } else {
        String::new()
    };

    Ok(RepositoryCommitFileDiff {
        commit_hash,
        path: file_path,
        old_text,
        new_text,
    })
}

#[tauri::command]
fn get_repository_file_diff(
    repo_path: String,
    file_path: String,
) -> Result<RepositoryFileDiff, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let old_output = Command::new("git")
        .args(["-C", &repo_path, "show", &format!("HEAD:{file_path}")])
        .output()
        .map_err(|error| format!("Failed to run git show: {error}"))?;

    let old_text = if old_output.status.success() {
        String::from_utf8_lossy(&old_output.stdout).to_string()
    } else {
        String::new()
    };

    let full_path = Path::new(&repo_path).join(&file_path);
    let new_text = std::fs::read_to_string(&full_path).unwrap_or_default();

    Ok(RepositoryFileDiff {
        path: file_path,
        old_text,
        new_text,
    })
}

#[tauri::command]
fn get_repository_working_tree_status(
    repo_path: String,
) -> Result<RepositoryWorkingTreeStatus, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = Command::new("git")
        .args([
            "-C",
            &repo_path,
            "status",
            "--porcelain",
            "--untracked-files=all",
        ])
        .output()
        .map_err(|error| format!("Failed to run git status: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to read repository status".to_string()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut staged_count = 0;
    let mut unstaged_count = 0;
    let mut untracked_count = 0;

    for row in stdout.lines() {
        if row.len() < 2 {
            continue;
        }

        let mut chars = row.chars();
        let x = chars.next().unwrap_or(' ');
        let y = chars.next().unwrap_or(' ');

        if x == '?' && y == '?' {
            untracked_count += 1;
            continue;
        }

        if x != ' ' {
            staged_count += 1;
        }

        if y != ' ' {
            unstaged_count += 1;
        }
    }

    Ok(RepositoryWorkingTreeStatus {
        has_changes: staged_count + unstaged_count + untracked_count > 0,
        staged_count,
        unstaged_count,
        untracked_count,
    })
}

#[tauri::command]
fn get_repository_working_tree_items(
    repo_path: String,
) -> Result<Vec<RepositoryWorkingTreeItem>, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = Command::new("git")
        .args([
            "-C",
            &repo_path,
            "status",
            "--porcelain",
            "--untracked-files=all",
        ])
        .output()
        .map_err(|error| format!("Failed to run git status: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Failed to read repository status items".to_string()
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    let items = stdout
        .lines()
        .filter_map(|row| {
            if row.len() < 3 {
                return None;
            }

            let mut chars = row.chars();
            let staged = chars.next().unwrap_or(' ');
            let unstaged = chars.next().unwrap_or(' ');

            let path = row.get(3..).unwrap_or("").trim().replace(" -> ", " -> ");

            if path.is_empty() {
                return None;
            }

            let is_untracked = staged == '?' && unstaged == '?';

            Some(RepositoryWorkingTreeItem {
                path,
                staged_status: staged.to_string(),
                unstaged_status: unstaged.to_string(),
                is_untracked,
            })
        })
        .collect();

    Ok(items)
}

fn repository_has_initial_commit(repo_path: &str) -> Result<bool, String> {
    let output = Command::new("git")
        .args(["-C", repo_path, "rev-parse", "--verify", "HEAD"])
        .output()
        .map_err(|error| format!("Failed to check repository history: {error}"))?;

    Ok(output.status.success())
}

fn emit_clone_progress(app: &AppHandle, payload: CloneRepositoryProgress) {
    let _ = app.emit("clone-repository-progress", payload);
}

fn parse_clone_progress(line: &str) -> Option<CloneRepositoryProgress> {
    let trimmed = line.trim();

    if trimmed.is_empty() {
        return None;
    }

    if let Some((percent, current, total)) = parse_progress_counts(trimmed, "Receiving objects:") {
        return Some(CloneRepositoryProgress {
            phase: "receiving".to_string(),
            message: trimmed.to_string(),
            percent: Some(percent),
            received_objects: Some(current),
            resolved_objects: None,
            total_objects: Some(total),
        });
    }

    if let Some((percent, current, total)) = parse_progress_counts(trimmed, "Resolving deltas:") {
        return Some(CloneRepositoryProgress {
            phase: "resolving".to_string(),
            message: trimmed.to_string(),
            percent: Some(percent),
            received_objects: None,
            resolved_objects: Some(current),
            total_objects: Some(total),
        });
    }

    if trimmed.starts_with("Cloning into") {
        return Some(CloneRepositoryProgress {
            phase: "preparing".to_string(),
            message: trimmed.to_string(),
            percent: Some(4),
            received_objects: None,
            resolved_objects: None,
            total_objects: None,
        });
    }

    None
}

fn parse_progress_counts(line: &str, prefix: &str) -> Option<(u8, usize, usize)> {
    let remainder = line.strip_prefix(prefix)?.trim();
    let percent = remainder.split('%').next()?.trim().parse::<u8>().ok()?;

    let start = remainder.find('(')?;
    let end = remainder[start..].find(')')? + start;
    let counts = &remainder[start + 1..end];
    let mut parts = counts.split('/');
    let current = parts.next()?.trim().parse::<usize>().ok()?;
    let total = parts.next()?.trim().parse::<usize>().ok()?;

    Some((percent, current, total))
}

fn resolve_head_hash(repo_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["-C", repo_path, "rev-parse", "HEAD"])
        .output()
        .map_err(|error| format!("Failed to resolve HEAD: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(&output.stderr, "Failed to resolve HEAD"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
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


#[derive(Default)]
struct GitHubIdentity {
    avatar_url: Option<String>,
    username: Option<String>,
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
            Some(format!("https://avatars.githubusercontent.com/u/{left}?v=4"))
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

fn git_error_message(stderr: &[u8], fallback: &str) -> String {
    let message = String::from_utf8_lossy(stderr).trim().to_string();

    if message.is_empty() {
        fallback.to_string()
    } else {
        message
    }
}

fn validate_repository_name(name: &str) -> Result<(), String> {
    if name == "." || name == ".." {
        return Err("Repository name must be more specific".to_string());
    }

    if name.contains('/') || name.contains('\\') {
        return Err("Repository name cannot contain path separators".to_string());
    }

    if name.chars().any(is_invalid_path_character) {
        return Err("Repository name contains unsupported characters".to_string());
    }

    Ok(())
}

fn validate_branch_name(name: &str) -> Result<(), String> {
    let output = Command::new("git")
        .args(["check-ref-format", "--branch", name])
        .output()
        .map_err(|error| format!("Failed to validate default branch name: {error}"))?;

    if !output.status.success() {
        return Err("Enter a valid Git branch name".to_string());
    }

    Ok(())
}

fn validate_clone_repository_url(repository_url: &str) -> Result<(), String> {
    if repository_url.starts_with("file://") {
        return Err("Local file clone URLs are not supported".to_string());
    }

    if repository_url.starts_with("https://")
        || repository_url.starts_with("ssh://")
        || is_scp_style_ssh_repository_url(repository_url)
    {
        return Ok(());
    }

    Err("Enter a valid HTTPS or SSH repository URL".to_string())
}

fn validate_clone_destination_folder_name(name: &str) -> Result<(), String> {
    validate_repository_name(name)?;

    if name.ends_with('.') || name.ends_with(' ') {
        return Err("Folder name cannot end with a dot or space".to_string());
    }

    Ok(())
}

fn is_invalid_path_character(character: char) -> bool {
    character.is_control() || matches!(character, '<' | '>' | ':' | '"' | '|' | '?' | '*')
}

fn is_scp_style_ssh_repository_url(repository_url: &str) -> bool {
    if repository_url.contains(char::is_whitespace) {
        return false;
    }

    let Some((user_host, repository_path)) = repository_url.split_once(':') else {
        return false;
    };

    let Some((user, host)) = user_host.split_once('@') else {
        return false;
    };

    !user.is_empty()
        && !host.is_empty()
        && !repository_path.is_empty()
        && !repository_path.starts_with('/')
}

fn remove_partial_clone_destination(path: &Path) {
    if path.exists() {
        let _ = fs::remove_dir_all(path);
    }
}

fn initialize_git_repository(repo_path: &Path, default_branch: &str) -> Result<(), String> {
    let init_output = Command::new("git")
        .args(["-C", repo_path.to_string_lossy().as_ref(), "init"])
        .output()
        .map_err(|error| format!("Failed to run git init: {error}"))?;

    if !init_output.status.success() {
        return Err(git_error_message(
            &init_output.stderr,
            "Failed to initialize repository",
        ));
    }

    let default_head = format!("refs/heads/{default_branch}");
    let head_output = Command::new("git")
        .args([
            "-C",
            repo_path.to_string_lossy().as_ref(),
            "symbolic-ref",
            "HEAD",
            &default_head,
        ])
        .output()
        .map_err(|error| format!("Failed to set default branch: {error}"))?;

    if !head_output.status.success() {
        return Err(git_error_message(
            &head_output.stderr,
            "Failed to set default branch",
        ));
    }

    Ok(())
}

fn write_repository_files(
    repo_path: &Path,
    repository_name: &str,
    gitignore_template_key: Option<&str>,
    gitignore_template_content: Option<&str>,
    license_template_key: Option<&str>,
    license_template_content: Option<&str>,
) -> Result<(), String> {
    let readme_path = repo_path.join("README.md");
    fs::write(&readme_path, format!("# {repository_name}\n"))
        .map_err(|error| format!("Failed to create README.md: {error}"))?;

    if let Some(gitignore_contents) =
        gitignore_template_content.filter(|value| !value.trim().is_empty())
    {
        fs::write(repo_path.join(".gitignore"), gitignore_contents)
            .map_err(|error| format!("Failed to create .gitignore: {error}"))?;
    } else if gitignore_template_key.is_some() {
        return Err("Selected .gitignore template content is empty".to_string());
    }

    if let Some(license_contents) =
        license_template_content.filter(|value| !value.trim().is_empty())
    {
        fs::write(repo_path.join("LICENSE"), license_contents)
            .map_err(|error| format!("Failed to create LICENSE: {error}"))?;
    } else if license_template_key.is_some() {
        return Err("Selected license template content is empty".to_string());
    }

    Ok(())
}

fn create_initial_commit(repo_path: &Path) -> Result<(), String> {
    let repo_path_string = repo_path.to_string_lossy().to_string();

    let add_output = Command::new("git")
        .args(["-C", &repo_path_string, "add", "-A"])
        .output()
        .map_err(|error| format!("Failed to run git add: {error}"))?;

    if !add_output.status.success() {
        return Err(git_error_message(
            &add_output.stderr,
            "Failed to stage repository files",
        ));
    }

    let commit_output = Command::new("git")
        .args(["-C", &repo_path_string, "commit", "-m", "Initial commit"])
        .output()
        .map_err(|error| format!("Failed to run git commit: {error}"))?;

    if !commit_output.status.success() {
        return Err(git_error_message(
            &commit_output.stderr,
            "Failed to create initial commit",
        ));
    }

    Ok(())
}

fn validate_repository_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err("Repository path does not exist".to_string());
    }

    if !path.is_dir() {
        return Err("Repository path is not a folder".to_string());
    }

    Ok(())
}

fn validate_git_repo(path: &Path) -> Result<(), String> {
    validate_repository_path(path)?;

    if !path.join(".git").exists() {
        return Err("Selected folder is not a git repository".to_string());
    }

    Ok(())
}

fn folder_name(path: &Path) -> Option<String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(std::string::ToString::to_string)
}

static NEXT_TERMINAL_SESSION_ID: AtomicUsize = AtomicUsize::new(1);

struct TerminalSession {
    child: Box<dyn portable_pty::Child + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
}

#[derive(Default)]
struct TerminalState {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalOutputPayload {
    data: String,
}

fn default_shell() -> String {
    if cfg!(windows) {
        env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    } else {
        env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

#[tauri::command]
fn create_terminal_session(
    app: AppHandle,
    state: State<'_, TerminalState>,
    cwd: String,
) -> Result<String, String> {
    let trimmed_cwd = cwd.trim();
    let pty_system = native_pty_system();
    let pty_pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("Failed to open pty: {error}"))?;

    let shell = default_shell();
    let mut command = CommandBuilder::new(shell);

    if !trimmed_cwd.is_empty() {
        let cwd_path = Path::new(trimmed_cwd);

        if !cwd_path.exists() {
            return Err("Terminal working directory does not exist".to_string());
        }

        if !cwd_path.is_dir() {
            return Err("Terminal working directory is not a folder".to_string());
        }

        command.cwd(cwd_path);
    }

    let child = pty_pair
        .slave
        .spawn_command(command)
        .map_err(|error| format!("Failed to start shell: {error}"))?;
    let writer = pty_pair
        .master
        .take_writer()
        .map_err(|error| format!("Failed to create terminal writer: {error}"))?;
    let mut reader = pty_pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("Failed to create terminal reader: {error}"))?;

    let session_id = format!(
        "terminal-{}",
        NEXT_TERMINAL_SESSION_ID.fetch_add(1, Ordering::Relaxed)
    );
    let event_name = format!("terminal-output:{session_id}");
    let output_app = app.clone();

    std::thread::spawn(move || {
        let mut buffer = vec![0_u8; 8192];

        loop {
            let bytes_read = match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => size,
                Err(_) => break,
            };

            let chunk = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();

            if output_app
                .emit(&event_name, TerminalOutputPayload { data: chunk })
                .is_err()
            {
                break;
            }
        }
    });

    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to acquire terminal state lock".to_string())?;

    sessions.insert(
        session_id.clone(),
        TerminalSession {
            child,
            master: pty_pair.master,
            writer,
        },
    );

    Ok(session_id)
}

#[tauri::command]
fn write_terminal_session(
    state: State<'_, TerminalState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to acquire terminal state lock".to_string())?;

    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| "Terminal session not found".to_string())?;

    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|error| format!("Failed to write to terminal: {error}"))?;
    session
        .writer
        .flush()
        .map_err(|error| format!("Failed to flush terminal input: {error}"))?;

    Ok(())
}

#[tauri::command]
fn resize_terminal_session(
    state: State<'_, TerminalState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to acquire terminal state lock".to_string())?;

    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| "Terminal session not found".to_string())?;

    session
        .master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("Failed to resize terminal: {error}"))?;

    Ok(())
}

#[tauri::command]
fn close_terminal_session(
    state: State<'_, TerminalState>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to acquire terminal state lock".to_string())?;

    let mut session = sessions
        .remove(&session_id)
        .ok_or_else(|| "Terminal session not found".to_string())?;

    let _ = session.child.kill();
    let _ = session.child.wait();

    Ok(())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(TerminalState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_git_repository,
            pick_clone_destination_folder,
            create_local_repository,
            clone_git_repository,
            validate_opened_repositories,
            create_repository_initial_commit,
            get_repository_history,
            get_repository_branches,
            get_repository_stashes,
            switch_repository_branch,
            pull_repository_action,
            push_repository_branch,
            apply_repository_stash,
            pop_repository_stash,
            drop_repository_stash,
            commit_repository_changes,
            add_repository_ignore_rule,
            stage_all_repository_changes,
            unstage_all_repository_changes,
            stage_repository_file,
            unstage_repository_file,
            discard_repository_path_changes,
            discard_all_repository_changes,
            get_repository_file_diff,
            get_repository_commit_files,
            get_repository_commit_file_diff,
            get_repository_working_tree_status,
            get_repository_working_tree_items,
            create_terminal_session,
            write_terminal_session,
            resize_terminal_session,
            close_terminal_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}








