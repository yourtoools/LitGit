use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::env;
use std::fs;
use std::io::Write;
use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use tauri::State;
use tauri::{AppHandle, Emitter};
use ureq::Proxy;

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LatestRepositoryCommitMessage {
    summary: String,
    description: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsBackendCapabilities {
    runtime_platform: String,
    secure_storage_available: bool,
    session_secrets_supported: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SecretStatusPayload {
    has_stored_value: bool,
    storage_mode: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HttpCredentialEntryMetadata {
    host: String,
    id: String,
    port: Option<u16>,
    protocol: String,
    username: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProxyTestResult {
    message: String,
    ok: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PickedFilePath {
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SigningKeyInfo {
    id: String,
    label: String,
    r#type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemFontFamily {
    family: String,
}

#[derive(Clone)]
struct StoredSecretValue {
    storage_mode: String,
    value: String,
}

impl StoredSecretValue {
    fn session(value: &str) -> Self {
        Self {
            storage_mode: "session".to_string(),
            value: value.to_string(),
        }
    }
}

#[derive(Clone)]
struct StoredHttpCredential {
    host: String,
    port: Option<u16>,
    protocol: String,
    secret: StoredSecretValue,
    username: String,
}

struct NetworkOperationGuard<'a> {
    active_operations: &'a Arc<Mutex<HashSet<String>>>,
    repo_path: String,
}

impl Drop for NetworkOperationGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut active_operations) = self.active_operations.lock() {
            active_operations.remove(&self.repo_path);
        }
    }
}

const AI_SECRET_SERVICE: &str = "litgit.ai.provider";
const PROXY_SECRET_SERVICE: &str = "litgit.proxy.auth";

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoCommandPreferences {
    enable_proxy: Option<bool>,
    gpg_program_path: Option<String>,
    proxy_auth_password: Option<String>,
    proxy_auth_enabled: Option<bool>,
    proxy_host: Option<String>,
    proxy_port: Option<u16>,
    proxy_type: Option<String>,
    proxy_username: Option<String>,
    ssh_private_key_path: Option<String>,
    ssh_public_key_path: Option<String>,
    signing_format: Option<String>,
    signing_key: Option<String>,
    sign_commits_by_default: Option<bool>,
    ssl_verification: Option<bool>,
    use_git_credential_manager: Option<bool>,
    use_local_ssh_agent: Option<bool>,
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
fn pick_settings_file() -> Result<Option<PickedFilePath>, String> {
    let file = match rfd::FileDialog::new().pick_file() {
        Some(file) => file,
        None => return Ok(None),
    };

    Ok(Some(PickedFilePath {
        path: file.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
fn generate_ssh_keypair(file_name: String) -> Result<PickedFilePath, String> {
    let trimmed_name = file_name.trim();

    if trimmed_name.is_empty() {
        return Err("Key file name is required".to_string());
    }

    let home = env::var("HOME").map_err(|_| "HOME is not available".to_string())?;
    let ssh_dir = Path::new(&home).join(".ssh");
    fs::create_dir_all(&ssh_dir)
        .map_err(|error| format!("Failed to create ~/.ssh directory: {error}"))?;

    let key_path = ssh_dir.join(trimmed_name);

    let output = Command::new("ssh-keygen")
        .args([
            "-t",
            "ed25519",
            "-N",
            "",
            "-f",
            key_path.to_string_lossy().as_ref(),
        ])
        .output()
        .map_err(|error| format!("Failed to run ssh-keygen: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to generate SSH keypair",
        ));
    }

    Ok(PickedFilePath {
        path: key_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn list_signing_keys() -> Result<Vec<SigningKeyInfo>, String> {
    let mut keys = Vec::new();

    let gpg_output = Command::new("gpg")
        .args([
            "--list-secret-keys",
            "--keyid-format",
            "LONG",
            "--with-colons",
        ])
        .output();

    if let Ok(output) = gpg_output {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);

            let mut current_key_id: Option<String> = None;

            for line in stdout.lines() {
                let parts: Vec<&str> = line.split(':').collect();

                if parts.is_empty() {
                    continue;
                }

                match parts[0] {
                    "sec" => {
                        current_key_id = parts.get(4).map(|value| value.to_string());
                    }
                    "uid" => {
                        if let Some(key_id) = current_key_id.clone() {
                            let label = parts.get(9).unwrap_or(&"GPG key").to_string();
                            keys.push(SigningKeyInfo {
                                id: key_id,
                                label,
                                r#type: "gpg".to_string(),
                            });
                            current_key_id = None;
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    let home = env::var("HOME").unwrap_or_default();
    let ssh_dir = Path::new(&home).join(".ssh");

    if ssh_dir.exists() {
        let entries = fs::read_dir(&ssh_dir)
            .map_err(|error| format!("Failed to read ~/.ssh directory: {error}"))?;

        for entry in entries.flatten() {
            let path = entry.path();

            if path.extension().and_then(|value| value.to_str()) == Some("pub") {
                let label = path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("SSH public key")
                    .to_string();

                keys.push(SigningKeyInfo {
                    id: path.to_string_lossy().to_string(),
                    label,
                    r#type: "ssh".to_string(),
                });
            }
        }
    }

    Ok(keys)
}

#[tauri::command]
fn list_system_font_families() -> Result<Vec<SystemFontFamily>, String> {
    let mut database = fontdb::Database::new();
    database.load_system_fonts();

    let families = database
        .faces()
        .flat_map(|face| face.families.iter())
        .map(|(family, _language)| family.trim())
        .filter(|family| !family.is_empty())
        .collect::<HashSet<_>>();

    let mut font_families = families
        .into_iter()
        .map(|family| SystemFontFamily {
            family: family.to_string(),
        })
        .collect::<Vec<_>>();

    font_families.sort_by(|left, right| left.family.cmp(&right.family));

    Ok(font_families)
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
    state: State<'_, SettingsState>,
    repository_url: String,
    destination_parent: String,
    destination_folder_name: String,
    recurse_submodules: bool,
    preferences: Option<RepoCommandPreferences>,
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
    let command_preferences = preferences.unwrap_or_default();

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
    apply_git_preferences(&mut clone_command, &command_preferences, Some(&state))?;
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
fn get_latest_repository_commit_message(
    repo_path: String,
) -> Result<LatestRepositoryCommitMessage, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = Command::new("git")
        .args([
            "-C",
            &repo_path,
            "log",
            "-1",
            "--pretty=format:%s%x1f%b",
        ])
        .output()
        .map_err(|error| format!("Failed to run git log: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to read latest commit message",
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut parts = stdout.splitn(2, '\x1f');
    let summary = parts.next().unwrap_or("").trim().to_string();

    if summary.is_empty() {
        return Err("No commit message available".to_string());
    }

    let description = parts.next().unwrap_or("").trim().to_string();

    Ok(LatestRepositoryCommitMessage {
        summary,
        description,
    })
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
fn get_repository_remote_names(repo_path: String) -> Result<Vec<String>, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let output = Command::new("git")
        .args(["-C", &repo_path, "remote"])
        .output()
        .map_err(|error| format!("Failed to run git remote: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(
            &output.stderr,
            "Failed to read repository remotes",
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let remote_names = stdout
        .lines()
        .map(str::trim)
        .filter(|remote_name| !remote_name.is_empty())
        .map(ToOwned::to_owned)
        .collect();

    Ok(remote_names)
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
fn push_repository_branch(
    state: State<'_, SettingsState>,
    repo_path: String,
    preferences: Option<RepoCommandPreferences>,
    force_with_lease: Option<bool>,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;
    let command_preferences = preferences.unwrap_or_default();
    let _network_operation = begin_network_operation(&state, &repo_path)?;

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

    let should_force_with_lease = force_with_lease == Some(true);

    let push_output = if has_upstream {
        let mut command = Command::new("git");
        apply_git_preferences(&mut command, &command_preferences, Some(&state))?;

        command.args(["-C", &repo_path, "push"]);

        if should_force_with_lease {
            command.arg("--force-with-lease");
        }

        command
            .output()
            .map_err(|error| format!("Failed to run git push: {error}"))?
    } else {
        let mut command = Command::new("git");
        apply_git_preferences(&mut command, &command_preferences, Some(&state))?;

        command.args(["-C", &repo_path, "push"]);

        if should_force_with_lease {
            command.arg("--force-with-lease");
        }

        command
            .args(["-u", "origin", &branch_name])
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
fn pull_repository_action(
    state: State<'_, SettingsState>,
    repo_path: String,
    mode: String,
    preferences: Option<RepoCommandPreferences>,
) -> Result<PullActionResult, String> {
    validate_git_repo(Path::new(&repo_path))?;
    let command_preferences = preferences.unwrap_or_default();
    let _network_operation = begin_network_operation(&state, &repo_path)?;

    let head_before = resolve_head_hash(&repo_path)?;

    let mut pull_command = Command::new("git");
    pull_command.args(["-C", &repo_path]);
    apply_git_preferences(&mut pull_command, &command_preferences, Some(&state))?;

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
fn create_repository_stash(
    repo_path: String,
    stash_message: String,
    include_untracked: bool,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let stash_message_trimmed = stash_message.trim();

    if stash_message_trimmed.is_empty() {
        return Err("Stash title is required".to_string());
    }

    let mut stash_command = Command::new("git");
    stash_command.args(["-C", &repo_path, "stash", "push"]);

    if include_untracked {
        stash_command.arg("--include-untracked");
    }

    stash_command.args(["-m", stash_message_trimmed]);

    let output = stash_command
        .output()
        .map_err(|error| format!("Failed to run git stash push: {error}"))?;

    if !output.status.success() {
        return Err(git_error_message(&output.stderr, "Failed to create stash"));
    }

    Ok(())
}
#[tauri::command]
fn commit_repository_changes(
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

fn build_http_credential_entry_id(
    protocol: &str,
    host: &str,
    port: Option<u16>,
    username: &str,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(protocol.as_bytes());
    hasher.update(b"|");
    hasher.update(host.as_bytes());
    hasher.update(b"|");
    hasher.update(port.unwrap_or_default().to_string().as_bytes());
    hasher.update(b"|");
    hasher.update(username.as_bytes());

    format!("{:x}", hasher.finalize())
}

fn load_keyring_entry(service: &str, account: &str) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(service, account)
        .map_err(|error| format!("Failed to access secure storage: {error}"))?;

    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Failed to read secure storage: {error}")),
    }
}

fn save_keyring_entry(service: &str, account: &str, secret: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(service, account)
        .map_err(|error| format!("Failed to access secure storage: {error}"))?;

    entry
        .set_password(secret)
        .map_err(|error| format!("Failed to save secure secret: {error}"))
}

fn clear_keyring_entry(service: &str, account: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(service, account)
        .map_err(|error| format!("Failed to access secure storage: {error}"))?;

    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Failed to clear secure secret: {error}")),
    }
}

fn get_proxy_secret_from_session(
    state: &SettingsState,
    username: &str,
) -> Result<Option<String>, String> {
    let credentials = state
        .http_credentials
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    Ok(credentials
        .values()
        .find(|entry| entry.protocol == "proxy" && entry.username == username)
        .map(|entry| entry.secret.value.clone()))
}

fn resolve_proxy_secret(
    state: Option<&State<'_, SettingsState>>,
    username: &str,
    supplied_secret: Option<&str>,
) -> Result<Option<String>, String> {
    if let Some(secret) = supplied_secret.filter(|value| !value.trim().is_empty()) {
        return Ok(Some(secret.trim().to_string()));
    }

    if let Some(secret) = load_keyring_entry(PROXY_SECRET_SERVICE, username)? {
        return Ok(Some(secret));
    }

    let Some(state) = state else {
        return Ok(None);
    };

    get_proxy_secret_from_session(state.inner(), username)
}

fn configure_git_ssh_command(preferences: &RepoCommandPreferences) -> Option<String> {
    if preferences.use_local_ssh_agent != Some(false) {
        return None;
    }

  let private_key_path = preferences
    .ssh_private_key_path
    .as_ref()
    .filter(|value| !value.trim().is_empty())?;
    let public_key_path = preferences
        .ssh_public_key_path
        .as_ref()
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().to_string());

    if let Some(public_key_path) = public_key_path {
        let expected_public_key_path = format!("{}.pub", private_key_path.trim());

        if public_key_path != expected_public_key_path {
            return None;
        }
    }

    Some(format!(
        "ssh -i '{}' -o IdentitiesOnly=yes -o IdentityAgent=none",
        private_key_path.trim().replace('\'', "'\\''")
    ))
}

fn apply_git_preferences(
    command: &mut Command,
    preferences: &RepoCommandPreferences,
    settings_state: Option<&State<'_, SettingsState>>,
) -> Result<(), String> {
    if preferences.use_local_ssh_agent == Some(false) {
        command.env("SSH_AUTH_SOCK", "");
    }

    if preferences.ssl_verification == Some(false) {
        command.env("GIT_SSL_NO_VERIFY", "true");
    }

    if preferences.use_git_credential_manager == Some(true) {
        command.env("GIT_TERMINAL_PROMPT", "1");
    }

    if let Some(ssh_command) = configure_git_ssh_command(preferences) {
        command.env("GIT_SSH_COMMAND", ssh_command);
        command.env("SSH_AUTH_SOCK", "");
    }

    if preferences.enable_proxy == Some(true) {
        if let Some(host) = preferences.proxy_host.as_ref().filter(|value| !value.trim().is_empty()) {
            let scheme = preferences
                .proxy_type
                .clone()
                .unwrap_or_else(|| "http".to_string());
            let port = preferences.proxy_port.unwrap_or(80);

            if preferences.proxy_auth_enabled == Some(true) {
                if let Some(username) = preferences
                    .proxy_username
                    .as_ref()
                    .filter(|value| !value.trim().is_empty())
                {
                    if let Some(secret) =
                        resolve_proxy_secret(
                            settings_state,
                            username.trim(),
                            preferences.proxy_auth_password.as_deref(),
                        )?
                    {
                        command.env("LITGIT_PROXY_USERNAME", username.trim());
                        command.env("LITGIT_PROXY_PASSWORD", secret);
                    }
                }
            }

            command.env("LITGIT_PROXY_HOST", host.trim());
            command.env("LITGIT_PROXY_PORT", port.to_string());
            command.env("LITGIT_PROXY_TYPE", scheme);
        }
    }

    if let Some(gpg_program_path) = preferences
        .gpg_program_path
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        command.args(["-c", &format!("gpg.program={}", gpg_program_path.trim())]);
    }

    Ok(())
}

#[tauri::command]
fn get_settings_backend_capabilities() -> Result<SettingsBackendCapabilities, String> {
    let secure_storage_available = keyring::Entry::new(AI_SECRET_SERVICE, "capability-check")
        .is_ok();
    let runtime_platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "ios") {
        "ios"
    } else if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    };

    Ok(SettingsBackendCapabilities {
        runtime_platform: runtime_platform.to_string(),
        secure_storage_available,
        session_secrets_supported: true,
    })
}

#[tauri::command]
fn save_ai_provider_secret(
    state: State<'_, SettingsState>,
    provider: String,
    secret: String,
) -> Result<SecretStatusPayload, String> {
    let trimmed_provider = provider.trim();
    let trimmed_secret = secret.trim();

    if trimmed_provider.is_empty() {
        return Err("Provider is required".to_string());
    }

    if trimmed_secret.is_empty() {
        return Err("Secret is required".to_string());
    }

    if save_keyring_entry(AI_SECRET_SERVICE, trimmed_provider, trimmed_secret).is_ok() {
        return Ok(SecretStatusPayload {
            has_stored_value: true,
            storage_mode: "secure".to_string(),
        });
    }

    let mut secrets = state
        .ai_secrets
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    secrets.insert(
        trimmed_provider.to_string(),
        StoredSecretValue::session(trimmed_secret),
    );

    Ok(SecretStatusPayload {
        has_stored_value: true,
        storage_mode: "session".to_string(),
    })
}

#[tauri::command]
fn get_ai_provider_secret_status(
    state: State<'_, SettingsState>,
    provider: String,
) -> Result<SecretStatusPayload, String> {
    if load_keyring_entry(AI_SECRET_SERVICE, provider.trim())?.is_some() {
        return Ok(SecretStatusPayload {
            has_stored_value: true,
            storage_mode: "secure".to_string(),
        });
    }

    let secrets = state
        .ai_secrets
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    let status = secrets.get(provider.trim());

    Ok(SecretStatusPayload {
        has_stored_value: status.is_some(),
        storage_mode: status
            .map(|value| value.storage_mode.clone())
            .unwrap_or_else(|| "session".to_string()),
    })
}

#[tauri::command]
fn clear_ai_provider_secret(
    state: State<'_, SettingsState>,
    provider: String,
) -> Result<(), String> {
    let trimmed_provider = provider.trim();

    if trimmed_provider.is_empty() {
        return Ok(());
    }

    let _ = clear_keyring_entry(AI_SECRET_SERVICE, trimmed_provider);

    let mut secrets = state
        .ai_secrets
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;
    secrets.remove(trimmed_provider);

    Ok(())
}

#[tauri::command]
fn save_proxy_auth_secret(
    state: State<'_, SettingsState>,
    username: String,
    secret: String,
) -> Result<SecretStatusPayload, String> {
    let trimmed_username = username.trim();
    let trimmed_secret = secret.trim();

    if trimmed_username.is_empty() {
        return Err("Proxy username is required".to_string());
    }

    if trimmed_secret.is_empty() {
        return Err("Proxy password is required".to_string());
    }

    if save_keyring_entry(PROXY_SECRET_SERVICE, trimmed_username, trimmed_secret).is_ok() {
        return Ok(SecretStatusPayload {
            has_stored_value: true,
            storage_mode: "secure".to_string(),
        });
    }

    let mut credentials = state
        .http_credentials
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    let entry_id = build_http_credential_entry_id("proxy", "proxy", None, trimmed_username);
    credentials.insert(
        entry_id,
        StoredHttpCredential {
            host: "proxy".to_string(),
            port: None,
            protocol: "proxy".to_string(),
            secret: StoredSecretValue::session(trimmed_secret),
            username: trimmed_username.to_string(),
        },
    );

    Ok(SecretStatusPayload {
        has_stored_value: true,
        storage_mode: "session".to_string(),
    })
}

#[tauri::command]
fn get_proxy_auth_secret_status(
    state: State<'_, SettingsState>,
    username: String,
) -> Result<SecretStatusPayload, String> {
    let trimmed_username = username.trim();

    if trimmed_username.is_empty() {
        return Ok(SecretStatusPayload {
            has_stored_value: false,
            storage_mode: "session".to_string(),
        });
    }

    if load_keyring_entry(PROXY_SECRET_SERVICE, trimmed_username)?.is_some() {
        return Ok(SecretStatusPayload {
            has_stored_value: true,
            storage_mode: "secure".to_string(),
        });
    }

    let credentials = state
        .http_credentials
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    let has_session_value = credentials
        .values()
        .any(|entry| entry.protocol == "proxy" && entry.username == trimmed_username);

    Ok(SecretStatusPayload {
        has_stored_value: has_session_value,
        storage_mode: "session".to_string(),
    })
}

#[tauri::command]
fn clear_proxy_auth_secret(
    state: State<'_, SettingsState>,
    username: String,
) -> Result<(), String> {
    let trimmed_username = username.trim();

    if trimmed_username.is_empty() {
        return Ok(());
    }

    let _ = clear_keyring_entry(PROXY_SECRET_SERVICE, trimmed_username);

    let mut credentials = state
        .http_credentials
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;
    credentials.retain(|_, entry| !(entry.protocol == "proxy" && entry.username == trimmed_username));
    Ok(())
}

fn begin_network_operation<'a>(
    state: &'a State<'_, SettingsState>,
    repo_path: &str,
) -> Result<NetworkOperationGuard<'a>, String> {
    let mut active_operations = state
        .active_network_repo_paths
        .lock()
        .map_err(|_| "Failed to access scheduler state".to_string())?;

    if active_operations.contains(repo_path) {
        return Err("Another network operation is already running for this repository".to_string());
    }

    active_operations.insert(repo_path.to_string());

    Ok(NetworkOperationGuard {
        active_operations: &state.active_network_repo_paths,
        repo_path: repo_path.to_string(),
    })
}

#[tauri::command]
fn list_http_credential_entries(
    state: State<'_, SettingsState>,
) -> Result<Vec<HttpCredentialEntryMetadata>, String> {
    let credentials = state
        .http_credentials
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    Ok(credentials
        .iter()
        .map(|(entry_id, credential)| HttpCredentialEntryMetadata {
            host: credential.host.clone(),
            id: entry_id.clone(),
            port: credential.port,
            protocol: credential.protocol.clone(),
            username: credential.username.clone(),
        })
        .collect())
}

#[tauri::command]
fn clear_http_credential_entry(
    state: State<'_, SettingsState>,
    entry_id: String,
) -> Result<(), String> {
    let mut credentials = state
        .http_credentials
        .lock()
        .map_err(|_| "Failed to access settings state".to_string())?;

    credentials.remove(entry_id.trim());
    Ok(())
}

#[tauri::command]
fn test_proxy_connection(
    host: String,
    port: u16,
    proxy_type: String,
    username: Option<String>,
    password: Option<String>,
) -> Result<ProxyTestResult, String> {
    let trimmed_host = host.trim();

    if trimmed_host.is_empty() {
        return Err("Proxy host is required".to_string());
    }

    let supported = matches!(proxy_type.as_str(), "http" | "https" | "socks5");

    if !supported {
        return Err("Unsupported proxy type".to_string());
    }

    let proxy_url = if let (Some(username), Some(password)) = (username, password) {
        format!("{}://{}:{}@{}:{}", proxy_type, username, password, trimmed_host, port)
    } else {
        format!("{}://{}:{}", proxy_type, trimmed_host, port)
    };
    let proxy = Proxy::new(&proxy_url)
        .map_err(|error| format!("Failed to configure proxy: {error}"))?;
    let agent = ureq::AgentBuilder::new()
        .proxy(proxy)
        .timeout(std::time::Duration::from_secs(10))
        .build();

    let response = agent
        .get("https://example.com/")
        .call()
        .map_err(|error| format!("Proxy request failed: {error}"))?;

    let status = response.status();

    if !(200..400).contains(&status) {
        return Ok(ProxyTestResult {
            message: format!("Proxy responded with unexpected status code {status}"),
            ok: false,
        });
    }

    Ok(ProxyTestResult {
        message: format!(
            "Proxy request to https://example.com/ succeeded via {}://{}:{}",
            proxy_type, trimmed_host, port,
        ),
        ok: true,
    })
}

#[tauri::command]
fn start_auto_fetch_scheduler(
    state: State<'_, SettingsState>,
    interval_minutes: u64,
    repo_path: String,
    preferences: Option<RepoCommandPreferences>,
) -> Result<(), String> {
    validate_git_repo(Path::new(&repo_path))?;

    let mut scheduler = state
        .auto_fetch_scheduler
        .lock()
        .map_err(|_| "Failed to access scheduler state".to_string())?;

    if let Some(existing) = scheduler.take() {
        let _ = existing.shutdown_tx.send(());
        let _ = existing.worker.join();
    }

    if interval_minutes == 0 {
        return Ok(());
    }

    let active_network_repo_paths = Arc::clone(&state.active_network_repo_paths);

    let (shutdown_tx, shutdown_rx) = std::sync::mpsc::channel::<()>();
    let repo_path_for_worker = repo_path.clone();
    let worker_preferences = preferences.unwrap_or_default();
    let worker = std::thread::spawn(move || {
        let interval = std::time::Duration::from_secs(interval_minutes.saturating_mul(60));

        loop {
            match shutdown_rx.recv_timeout(interval) {
                Ok(()) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    break;
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    let network_operation = match active_network_repo_paths.lock() {
                        Ok(mut active_operations) => {
                            if active_operations.contains(&repo_path_for_worker) {
                                None
                            } else {
                                active_operations.insert(repo_path_for_worker.clone());
                                Some(NetworkOperationGuard {
                                    active_operations: &active_network_repo_paths,
                                    repo_path: repo_path_for_worker.clone(),
                                })
                            }
                        }
                        Err(_) => None,
                    };

                    if network_operation.is_none() {
                        continue;
                    }

                    let _ = run_network_git_command(
                        &repo_path_for_worker,
                        &["fetch", "--all", "--prune"],
                        &worker_preferences,
                    );
                    drop(network_operation);
                }
            }
        }
    });

    *scheduler = Some(AutoFetchSchedulerHandle {
        shutdown_tx,
        worker,
    });

    Ok(())
}

#[tauri::command]
fn stop_auto_fetch_scheduler(state: State<'_, SettingsState>) -> Result<(), String> {
    let mut scheduler = state
        .auto_fetch_scheduler
        .lock()
        .map_err(|_| "Failed to access scheduler state".to_string())?;

    if let Some(existing) = scheduler.take() {
        let _ = existing.shutdown_tx.send(());
        let _ = existing.worker.join();
    }

    Ok(())
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

struct SettingsState {
    ai_secrets: Mutex<HashMap<String, StoredSecretValue>>,
    http_credentials: Mutex<HashMap<String, StoredHttpCredential>>,
    active_network_repo_paths: Arc<Mutex<HashSet<String>>>,
    auto_fetch_scheduler: Mutex<Option<AutoFetchSchedulerHandle>>,
}

impl Default for SettingsState {
    fn default() -> Self {
        Self {
            ai_secrets: Mutex::default(),
            http_credentials: Mutex::default(),
            active_network_repo_paths: Arc::new(Mutex::new(HashSet::new())),
            auto_fetch_scheduler: Mutex::default(),
        }
    }
}

struct AutoFetchSchedulerHandle {
    shutdown_tx: std::sync::mpsc::Sender<()>,
    worker: JoinHandle<()>,
}

fn run_network_git_command(
    repo_path: &str,
    args: &[&str],
    preferences: &RepoCommandPreferences,
) -> Result<std::process::Output, String> {
    let mut command = Command::new("git");
    apply_git_preferences(&mut command, preferences, None)?;
    command.args(["-C", repo_path]);
    command.args(args);
    command
        .output()
        .map_err(|error| format!("Failed to run git command: {error}"))
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
        .manage(SettingsState::default())
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
            pick_settings_file,
            generate_ssh_keypair,
            list_signing_keys,
            list_system_font_families,
            create_local_repository,
            clone_git_repository,
            validate_opened_repositories,
            create_repository_initial_commit,
            get_repository_history,
            get_latest_repository_commit_message,
            get_repository_branches,
            get_repository_remote_names,
            get_repository_stashes,
            switch_repository_branch,
            pull_repository_action,
            push_repository_branch,
            create_repository_stash,
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
            get_settings_backend_capabilities,
            save_ai_provider_secret,
            get_ai_provider_secret_status,
            clear_ai_provider_secret,
            save_proxy_auth_secret,
            get_proxy_auth_secret_status,
            clear_proxy_auth_secret,
            list_http_credential_entries,
            clear_http_credential_entry,
            test_proxy_connection,
            start_auto_fetch_scheduler,
            stop_auto_fetch_scheduler,
            create_terminal_session,
            write_terminal_session,
            resize_terminal_session,
            close_terminal_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
