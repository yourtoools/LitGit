use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use encoding_rs::{Encoding, UTF_8};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Component, Path};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const MAX_IMAGE_PREVIEW_BYTES: usize = 64 * 1024 * 1024;

/// Error type for git support operations.
#[derive(Debug, Error)]
pub(crate) enum GitSupportError {
    #[error("{0}")]
    Message(String),
    #[error("Failed to {action}: {source}")]
    Io {
        action: &'static str,
        source: std::io::Error,
    },
}

impl PartialEq for GitSupportError {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Message(a), Self::Message(b)) => a == b,
            (Self::Io { action: a, .. }, Self::Io { action: b, .. }) => a == b,
            _ => false,
        }
    }
}

impl From<GitSupportError> for String {
    fn from(error: GitSupportError) -> Self {
        error.to_string()
    }
}

/// Extracts and lowercases the file extension from a path string.
///
/// Returns `None` when the path has no extension or the extension contains
/// non-UTF-8 bytes.
#[must_use]
pub(crate) fn resolve_file_extension(file_path: &str) -> Option<String> {
    Path::new(file_path)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
}

/// Maps a lowercase file extension to its MIME type for image formats.
///
/// Returns `None` for non-image extensions.
#[must_use]
pub(crate) fn resolve_image_mime_type(extension: &str) -> Option<&'static str> {
    match extension {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        "avif" => Some("image/avif"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

/// Encodes binary image content as a base64 data URL.
///
/// Returns `None` when content is empty or exceeds `MAX_IMAGE_PREVIEW_BYTES`.
#[must_use]
pub(crate) fn encode_image_data_url(content: &[u8], mime_type: &str) -> Option<String> {
    if content.is_empty() || content.len() > MAX_IMAGE_PREVIEW_BYTES {
        return None;
    }

    let encoded = BASE64_STANDARD.encode(content);
    Some(format!("data:{mime_type};base64,{encoded}"))
}

/// Heuristic check for whether bytes likely represent human-readable text.
///
/// Returns `true` for `None` or empty slices. Returns `false` if any byte
/// is a NUL character or if the content is not valid UTF-8.
#[must_use]
pub(crate) fn is_probably_text_content(content: Option<&[u8]>) -> bool {
    let Some(content) = content else {
        return true;
    };

    if content.is_empty() {
        return true;
    }

    !content.contains(&0) && std::str::from_utf8(content).is_ok()
}

/// Resolves a text encoding label to an `encoding_rs` static encoding.
///
/// Defaults to UTF-8 when `encoding` is `None` or blank.
pub(crate) fn resolve_text_encoding(
    encoding: Option<&str>,
) -> Result<&'static Encoding, GitSupportError> {
    let normalized = encoding.map(str::trim).filter(|value| !value.is_empty());
    let Some(encoding_label) = normalized else {
        return Ok(UTF_8);
    };

    if encoding_label.eq_ignore_ascii_case("utf-8") || encoding_label.eq_ignore_ascii_case("utf8") {
        return Ok(UTF_8);
    }

    Encoding::for_label(encoding_label.as_bytes())
        .ok_or_else(|| GitSupportError::Message(format!("Unsupported encoding: {encoding_label}")))
}

/// Decodes raw bytes into a `String` using the specified text encoding.
///
/// Returns an empty string for `None` or empty content. Returns an error
/// when the encoding label is unknown or decoding produces errors.
pub(crate) fn decode_text_content_with_encoding(
    content: Option<&[u8]>,
    encoding: Option<&str>,
) -> Result<String, GitSupportError> {
    let Some(bytes) = content else {
        return Ok(String::new());
    };

    if bytes.is_empty() {
        return Ok(String::new());
    }

    let selected_encoding = resolve_text_encoding(encoding)?;
    let (decoded, _, had_errors) = selected_encoding.decode(bytes);

    if had_errors {
        return Err(GitSupportError::Message(
            "Failed to decode file with selected encoding".to_string(),
        ));
    }

    Ok(decoded.into_owned())
}

/// Encodes a `String` into raw bytes using the specified text encoding.
///
/// Returns an error when the encoding label is unknown or encoding fails.
pub(crate) fn encode_text_with_encoding(
    text: &str,
    encoding: Option<&str>,
) -> Result<Vec<u8>, GitSupportError> {
    let selected_encoding = resolve_text_encoding(encoding)?;
    let (encoded, _, had_errors) = selected_encoding.encode(text);

    if had_errors {
        return Err(GitSupportError::Message(
            "Failed to encode file with selected encoding".to_string(),
        ));
    }

    Ok(encoded.into_owned())
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
fn background_process_creation_flags() -> u32 {
    CREATE_NO_WINDOW
}

#[cfg(windows)]
fn apply_background_process_flags(command: &mut Command) {
    command.creation_flags(background_process_creation_flags());
}

#[cfg(not(windows))]
fn apply_background_process_flags(_command: &mut Command) {}

/// Creates a `Command` for the given program with platform-specific flags
/// to suppress console windows on Windows.
pub(crate) fn background_command(program: &str) -> Command {
    let mut command = Command::new(program);
    apply_background_process_flags(&mut command);
    command
}

/// Creates a `Command` preconfigured for running `git` with stdin suppressed.
pub(crate) fn git_command() -> Command {
    let mut command = background_command("git");
    command.stdin(Stdio::null());
    command
}

/// Extracts a human-readable error message from git stderr.
///
/// Detects authentication failures and returns a user-friendly message.
/// Falls back to the provided `fallback` string when stderr is empty.
#[must_use]
pub(crate) fn git_error_message(stderr: &[u8], fallback: &str) -> String {
    let message = String::from_utf8_lossy(stderr).trim().to_string();

    if message.is_empty() {
        return fallback.to_string();
    }

    if is_git_authentication_message(&message) {
        return "Authentication required or credentials were rejected for this HTTPS remote. Configure a Git credential helper or use SSH, then try again.".to_string();
    }

    message
}

/// Extracts an error message from git stdout and stderr.
///
/// Prioritises stderr over stdout. Detects authentication failures and
/// returns a user-friendly message. Falls back to `fallback` when both
/// streams are empty.
#[must_use]
pub(crate) fn git_process_error_message(stdout: &[u8], stderr: &[u8], fallback: &str) -> String {
    let stderr_message = String::from_utf8_lossy(stderr).trim().to_string();

    if !stderr_message.is_empty() {
        return git_error_message(stderr, fallback);
    }

    let stdout_message = String::from_utf8_lossy(stdout).trim().to_string();

    if !stdout_message.is_empty() {
        return stdout_message;
    }

    fallback.to_string()
}

/// Validates that a path exists and is a directory.
pub(crate) fn validate_repository_path(path: &Path) -> Result<(), GitSupportError> {
    if !path.exists() {
        return Err(GitSupportError::Message(
            "Repository path does not exist".to_string(),
        ));
    }

    if !path.is_dir() {
        return Err(GitSupportError::Message(
            "Repository path is not a folder".to_string(),
        ));
    }

    Ok(())
}

/// Checks whether the given path is the root of a Git repository.
///
/// Uses `git rev-parse --show-toplevel` to verify that the canonical top-level
/// directory matches the supplied path.
pub(crate) fn is_git_repository_root(path: &Path) -> bool {
    let canonical_path = match path.canonicalize() {
        Ok(path) => path,
        Err(_) => return false,
    };

    let output = match git_command()
        .args([
            "-C",
            canonical_path.to_string_lossy().as_ref(),
            "rev-parse",
            "--show-toplevel",
        ])
        .output()
    {
        Ok(output) => output,
        Err(_) => return false,
    };

    if !output.status.success() {
        return false;
    }

    let top_level = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let top_level_path = match Path::new(&top_level).canonicalize() {
        Ok(path) => path,
        Err(_) => return false,
    };

    top_level_path == canonical_path
}

/// Validates that a path exists, is a directory, and contains a Git repo.
pub(crate) fn validate_git_repo(path: &Path) -> Result<(), GitSupportError> {
    validate_repository_path(path)?;

    if !is_git_repository_root(path) {
        return Err(GitSupportError::Message(
            "Selected folder is not a git repository".to_string(),
        ));
    }

    Ok(())
}

/// Alias for `validate_git_repo`, used by the launcher module.
pub(crate) fn validate_launcher_repository_root(path: &Path) -> Result<(), GitSupportError> {
    validate_git_repo(path)
}

/// Validates that a file path is relative and does not traverse parent directories.
pub(crate) fn validate_repo_relative_file_path(file_path: &str) -> Result<(), GitSupportError> {
    let path = Path::new(file_path);

    if path.is_absolute() {
        return Err(GitSupportError::Message(
            "File path must be relative to repository root".to_string(),
        ));
    }

    let contains_parent = path
        .components()
        .any(|component| matches!(component, Component::ParentDir));

    if contains_parent {
        return Err(GitSupportError::Message(
            "File path must not contain parent-directory traversal".to_string(),
        ));
    }

    Ok(())
}

/// Detects whether an error message indicates a Git authentication failure.
///
/// Checks for common credential-prompt and HTTP 401/403 response patterns.
#[must_use]
pub(crate) fn is_git_authentication_message(message: &str) -> bool {
    let normalized = message.to_lowercase();

    normalized.contains("terminal prompts disabled")
        || normalized.contains("could not read username")
        || normalized.contains("could not read password")
        || normalized.contains("unable to read askpass response")
        || normalized.contains("authentication failed")
        || normalized.contains("the requested url returned error: 401")
        || normalized.contains("the requested url returned error: 403")
        || normalized.contains("repository not found")
        || (normalized.contains("fatal: remote error:") && normalized.contains("not found"))
}

/// Builds a Git credential descriptor for the credential helper protocol.
///
/// Returns a string in the format expected by Git's credential helpers:
/// ```text
/// protocol=https
/// host=github.com
/// path=org/repo.git
/// username=<optional>
/// ```
pub(crate) fn build_git_credential_descriptor(
    remote_url: &str,
    username: Option<&str>,
) -> Result<String, GitSupportError> {
    let parsed = url::Url::parse(remote_url)
        .map_err(|_| GitSupportError::Message("HTTPS remote URL is required".to_string()))?;

    if parsed.scheme() != "https" {
        return Err(GitSupportError::Message(
            "HTTPS remote URL is required".to_string(),
        ));
    }

    let mut lines = vec![
        format!("protocol={}", parsed.scheme()),
        format!("host={}", parsed.host_str().unwrap_or_default()),
        format!("path={}", parsed.path().trim_start_matches('/')),
    ];

    if let Some(value) = username.filter(|value| !value.trim().is_empty()) {
        lines.push(format!("username={value}"));
    }

    lines.push(String::new());
    Ok(lines.join("\n"))
}

/// Retrieves stored credentials from the OS keychain via git credential fill.
///
/// Takes a credential descriptor and queries Git's credential helper system.
/// Returns the full response string if credentials are found, or None if not.
pub(crate) fn git_credential_fill(descriptor: &str) -> Result<Option<String>, GitSupportError> {
    let mut child = background_command("git")
        .args(["credential", "fill"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Prevent interactive terminal prompts — this runs inside a GUI app,
        // so any prompt on /dev/tty blocks the Tauri event loop and freezes the UI.
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "")
        .env("SSH_ASKPASS", "")
        .spawn()
        .map_err(|error| GitSupportError::Io {
            action: "spawn git credential fill",
            source: error,
        })?;

    // Write the descriptor to stdin
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(descriptor.as_bytes())
            .map_err(|error| GitSupportError::Io {
                action: "write to git credential fill stdin",
                source: error,
            })?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| GitSupportError::Io {
            action: "run git credential fill",
            source: error,
        })?;

    // If the command succeeded and returned content, we have credentials
    if output.status.success() && !output.stdout.is_empty() {
        let response = String::from_utf8_lossy(&output.stdout);
        // Only return if we actually got a username or password
        if response.contains("username=") || response.contains("password=") {
            return Ok(Some(response.to_string()));
        }
    }

    Ok(None)
}

/// Stores credentials in the OS keychain via git credential approve.
///
/// Takes a credential descriptor and a secret (password/token), adds the secret
/// to the descriptor, and submits it to Git's credential helper for storage.
pub(crate) fn git_credential_approve(
    descriptor: &str,
    secret: &str,
) -> Result<(), GitSupportError> {
    // Parse the descriptor to extract or use existing username
    let username = extract_username_from_descriptor(descriptor).unwrap_or_default();

    // Build the approve input: descriptor + username + password
    let mut approve_input = descriptor.to_string();
    if !approve_input.ends_with('\n') {
        approve_input.push('\n');
    }
    approve_input.push_str(&format!("username={username}\n"));
    approve_input.push_str(&format!("password={secret}\n"));

    let mut child = background_command("git")
        .args(["credential", "approve"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| GitSupportError::Io {
            action: "spawn git credential approve",
            source: error,
        })?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(approve_input.as_bytes())
            .map_err(|error| GitSupportError::Io {
                action: "write to git credential approve stdin",
                source: error,
            })?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| GitSupportError::Io {
            action: "run git credential approve",
            source: error,
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(GitSupportError::Message(format!(
            "Failed to approve credentials: {stderr}"
        )));
    }

    Ok(())
}

/// Removes invalid credentials from the OS keychain via git credential reject.
///
/// Takes a credential descriptor and submits it to Git's credential helper
/// to remove matching stored credentials.
pub(crate) fn git_credential_reject(
    descriptor: &str,
    _secret: &str,
) -> Result<(), GitSupportError> {
    let mut child = background_command("git")
        .args(["credential", "reject"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| GitSupportError::Io {
            action: "spawn git credential reject",
            source: error,
        })?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(descriptor.as_bytes())
            .map_err(|error| GitSupportError::Io {
                action: "write to git credential reject stdin",
                source: error,
            })?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| GitSupportError::Io {
            action: "run git credential reject",
            source: error,
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(GitSupportError::Message(format!(
            "Failed to reject credentials: {stderr}"
        )));
    }

    Ok(())
}

/// Checks if credentials exist for common Git hosts in the OS keychain.
///
/// Returns a HashMap mapping host names to their credential status.
/// Used during onboarding to show users which hosts already have
/// stored credentials.
///
/// # Returns
///
/// HashMap with keys: "GitHub", "GitLab", "Bitbucket"
/// Values: true if credentials exist, false otherwise
#[tauri::command]
pub(crate) fn check_git_credentials_status() -> HashMap<&'static str, bool> {
    let hosts = vec![
        ("github.com", "GitHub"),
        ("gitlab.com", "GitLab"),
        ("bitbucket.org", "Bitbucket"),
    ];

    hosts
        .into_iter()
        .map(|(host, name)| {
            let descriptor = format!("protocol=https\nhost={host}\n\n");
            // Use non-interactive check to prevent terminal prompts
            let exists = git_credential_fill_non_interactive(&descriptor)
                .ok()
                .flatten()
                .is_some();
            (name, exists)
        })
        .collect()
}

/// Non-interactive version of git credential fill that prevents terminal prompts.
///
/// Uses environment variables to disable interactive prompts, ensuring the
/// command returns quickly without hanging if no credential exists.
fn git_credential_fill_non_interactive(
    descriptor: &str,
) -> Result<Option<String>, GitSupportError> {
    let mut child = background_command("git")
        .args(["credential", "fill"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Prevent Git from prompting for credentials in the terminal
        .env("GIT_TERMINAL_PROMPT", "0")
        // Disable any askpass helper that might try to show a dialog
        .env("GIT_ASKPASS", "")
        .env("SSH_ASKPASS", "")
        .spawn()
        .map_err(|error| GitSupportError::Io {
            action: "spawn git credential fill",
            source: error,
        })?;

    // Write the descriptor to stdin
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(descriptor.as_bytes())
            .map_err(|error| GitSupportError::Io {
                action: "write to git credential fill stdin",
                source: error,
            })?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| GitSupportError::Io {
            action: "run git credential fill",
            source: error,
        })?;

    // If the command succeeded and returned content, we have credentials
    if output.status.success() && !output.stdout.is_empty() {
        let response = String::from_utf8_lossy(&output.stdout);
        // Only return if we actually got a username or password
        if response.contains("username=") || response.contains("password=") {
            return Ok(Some(response.to_string()));
        }
    }

    Ok(None)
}

/// Extracts the username from a credential descriptor string.
fn extract_username_from_descriptor(descriptor: &str) -> Option<String> {
    descriptor
        .lines()
        .find(|line| line.starts_with("username="))
        .and_then(|line| line.strip_prefix("username="))
        .map(String::from)
}

/// Type alias for a pair of old/new file content blobs.
pub(crate) type FileContentPair = (Option<Vec<u8>>, Option<Vec<u8>>);

/// Writes bytes to a temporary file and returns its path.
///
/// Returns `None` when the system temp directory is unavailable or the write fails.
/// The caller is responsible for cleaning up the file.
pub(crate) fn write_temp_bytes(prefix: &str, content: &[u8]) -> Option<std::path::PathBuf> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).ok()?;
    let path = std::env::temp_dir().join(format!(
        "litgit-{prefix}-{}-{}.tmp",
        std::process::id(),
        now.as_nanos()
    ));
    fs::write(&path, content).ok()?;
    Some(path)
}

/// Loads the HEAD version and working-tree version of a file.
///
/// Returns `(old_content, new_content)` where each side is `None` if the file
/// doesn't exist in that state.
pub(crate) fn load_working_tree_contents(
    repo_path: &str,
    file_path: &str,
) -> Result<FileContentPair, GitSupportError> {
    validate_repo_relative_file_path(file_path)?;

    let old_output = git_command()
        .args(["-C", repo_path, "show", &format!("HEAD:{file_path}")])
        .output()
        .map_err(|error| GitSupportError::Io {
            action: "run git show",
            source: error,
        })?;
    let old_content = old_output.status.success().then_some(old_output.stdout);

    let new_content = fs::read(Path::new(repo_path).join(file_path)).ok();
    Ok((old_content, new_content))
}

/// Loads the previous-commit version and current-commit version of a file.
///
/// Returns `(old_content, new_content)` where each side is `None` if the file
/// doesn't exist in that state.
pub(crate) fn load_commit_contents(
    repo_path: &str,
    commit_hash: &str,
    file_path: &str,
) -> Result<FileContentPair, GitSupportError> {
    validate_repo_relative_file_path(file_path)?;

    let old_output = git_command()
        .args([
            "-C",
            repo_path,
            "show",
            &format!("{commit_hash}^:{file_path}"),
        ])
        .output()
        .map_err(|error| GitSupportError::Io {
            action: "run git show for previous commit file",
            source: error,
        })?;
    let old_content = old_output.status.success().then_some(old_output.stdout);

    let new_output = git_command()
        .args([
            "-C",
            repo_path,
            "show",
            &format!("{commit_hash}:{file_path}"),
        ])
        .output()
        .map_err(|error| GitSupportError::Io {
            action: "run git show for commit file",
            source: error,
        })?;
    let new_content = new_output.status.success().then_some(new_output.stdout);

    Ok((old_content, new_content))
}

#[cfg(test)]
mod tests {
    use encoding_rs::UTF_8;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{
        build_git_credential_descriptor, decode_text_content_with_encoding, encode_image_data_url,
        encode_text_with_encoding, git_error_message, git_process_error_message,
        is_git_authentication_message, is_git_repository_root, is_probably_text_content,
        load_commit_contents, load_working_tree_contents, resolve_file_extension,
        resolve_image_mime_type, resolve_text_encoding, validate_git_repo,
        validate_launcher_repository_root, validate_repo_relative_file_path,
        validate_repository_path, write_temp_bytes, GitSupportError,
    };

    fn create_temp_path(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time should move forward")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "litgit-git-support-{name}-{}-{timestamp}",
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
    fn resolve_text_encoding_returns_utf8_when_encoding_is_not_provided() {
        let resolved = resolve_text_encoding(None).expect("expected utf-8 fallback");

        assert_eq!(resolved, UTF_8);
    }

    #[test]
    fn resolve_image_mime_type_returns_png_mime_when_extension_is_png() {
        let resolved = resolve_image_mime_type("png");

        assert_eq!(resolved, Some("image/png"));
    }

    #[test]
    fn resolve_file_extension_normalizes_mixed_case_suffixes() {
        let extension = resolve_file_extension("assets/Logo.PNG");

        assert_eq!(extension.as_deref(), Some("png"));
    }

    #[test]
    fn encode_image_data_url_returns_none_when_content_is_empty() {
        let encoded = encode_image_data_url(&[], "image/png");

        assert_eq!(encoded, None);
    }

    #[test]
    fn is_probably_text_content_returns_true_when_bytes_are_missing() {
        assert!(is_probably_text_content(None));
    }

    #[test]
    fn is_probably_text_content_returns_false_for_binary_bytes() {
        assert!(!is_probably_text_content(Some(b"hello\0world")));
    }

    #[test]
    fn detects_terminal_prompts_disabled_as_auth_error() {
        assert!(is_git_authentication_message(
            "fatal: could not read Username for 'https://github.com': terminal prompts disabled"
        ));
    }

    #[test]
    fn classifies_repository_not_found_as_auth_error() {
        assert!(is_git_authentication_message(
            "remote: Repository not found. fatal: repository 'https://github.com/owner/repo.git/' not found"
        ));
    }

    #[test]
    fn git_error_message_returns_actionable_message_for_auth_error() {
        let message = git_error_message(
            b"fatal: could not read Username for 'https://github.com': terminal prompts disabled",
            "Fallback error",
        );

        assert_eq!(
            message,
            "Authentication required or credentials were rejected for this HTTPS remote. Configure a Git credential helper or use SSH, then try again."
        );
    }

    #[test]
    fn git_error_message_returns_fallback_when_stderr_is_empty() {
        let message = git_error_message(b"", "Fallback error");

        assert_eq!(message, "Fallback error");
    }

    #[test]
    fn git_process_error_message_falls_back_to_stdout_when_stderr_is_empty() {
        assert_eq!(
            git_process_error_message(
                b"husky - pre-commit hook exited with code 1",
                b"",
                "Fallback error",
            ),
            "husky - pre-commit hook exited with code 1"
        );
    }

    #[test]
    fn validate_repository_path_accepts_existing_directory() {
        let temp_dir = create_temp_dir("validate-directory");

        let result = validate_repository_path(&temp_dir);

        remove_temp_path(&temp_dir);
        assert_eq!(result, Ok(()));
    }

    #[test]
    fn validate_repository_path_rejects_file_paths() {
        let temp_file = create_temp_path("validate-file");
        fs::write(&temp_file, "content").expect("temp file should be written");

        let result = validate_repository_path(&temp_file);

        remove_temp_path(&temp_file);
        assert_eq!(
            result,
            Err(GitSupportError::Message(
                "Repository path is not a folder".to_string()
            ))
        );
    }

    #[test]
    fn validate_git_repo_rejects_directory_without_git_folder() {
        let temp_dir = create_temp_dir("validate-missing-git");

        let result = validate_git_repo(&temp_dir);

        remove_temp_path(&temp_dir);
        assert_eq!(
            result,
            Err(GitSupportError::Message(
                "Selected folder is not a git repository".to_string()
            ))
        );
    }

    #[test]
    fn validate_git_repo_accepts_directory_with_git_folder() {
        let temp_dir = create_temp_dir("validate-git");
        Command::new("git")
            .args(["init", "--quiet", temp_dir.to_string_lossy().as_ref()])
            .output()
            .expect("git init should run");

        let result = validate_git_repo(&temp_dir);

        remove_temp_path(&temp_dir);
        assert_eq!(result, Ok(()));
    }

    #[test]
    fn validate_launcher_repository_root_rejects_missing_path() {
        let missing_path = create_temp_path("validate-launcher-missing");

        let result = validate_launcher_repository_root(&missing_path);

        assert_eq!(
            result,
            Err(GitSupportError::Message(
                "Repository path does not exist".to_string()
            ))
        );
    }

    #[test]
    fn is_git_repository_root_rejects_directory_with_invalid_git_file() {
        let temp_dir = create_temp_dir("validate-invalid-git-file");
        fs::write(temp_dir.join(".git"), "gitdir: /missing/location")
            .expect("git file should be created");

        let result = is_git_repository_root(&temp_dir);

        remove_temp_path(&temp_dir);
        assert!(!result);
    }

    #[test]
    fn encode_and_decode_text_round_trip_with_windows1252() {
        let encoded =
            encode_text_with_encoding("Hi €", Some("windows-1252")).expect("text should encode");
        let decoded = decode_text_content_with_encoding(Some(&encoded), Some("windows-1252"))
            .expect("text should decode");

        assert_eq!(decoded, "Hi €");
    }

    #[test]
    fn decode_text_content_with_encoding_returns_error_for_invalid_utf8() {
        let result = decode_text_content_with_encoding(Some(&[0xFF]), Some("utf-8"));

        assert_eq!(
            result,
            Err(GitSupportError::Message(
                "Failed to decode file with selected encoding".to_string()
            ))
        );
    }

    #[test]
    fn encode_text_with_encoding_returns_error_for_unsupported_encoding() {
        let result = encode_text_with_encoding("hello", Some("not-a-real-encoding"));

        assert_eq!(
            result,
            Err(GitSupportError::Message(
                "Unsupported encoding: not-a-real-encoding".to_string()
            ))
        );
    }

    #[test]
    fn validate_repo_relative_file_path_rejects_parent_traversal() {
        assert_eq!(
            validate_repo_relative_file_path("../secret.txt"),
            Err(GitSupportError::Message(
                "File path must not contain parent-directory traversal".to_string()
            ))
        );
    }

    #[test]
    fn validate_repo_relative_file_path_accepts_nested_repo_path() {
        assert_eq!(validate_repo_relative_file_path("src/lib.rs"), Ok(()));
    }

    #[test]
    fn write_temp_bytes_persists_content_to_temp_file() {
        let temp_path = write_temp_bytes("git-support-test", b"preview payload")
            .expect("temp file path should be created");
        let written = fs::read(&temp_path).expect("temp file should be readable");

        remove_temp_path(&temp_path);
        assert_eq!(written, b"preview payload");
    }

    #[test]
    fn load_working_tree_contents_returns_head_and_working_tree_versions() {
        let temp_dir = create_temp_dir("working-tree-contents");
        Command::new("git")
            .args(["init", "--quiet", temp_dir.to_string_lossy().as_ref()])
            .output()
            .expect("git init should run");
        Command::new("git")
            .args([
                "-C",
                temp_dir.to_string_lossy().as_ref(),
                "config",
                "user.name",
                "LitGit Tests",
            ])
            .output()
            .expect("git config name should run");
        Command::new("git")
            .args([
                "-C",
                temp_dir.to_string_lossy().as_ref(),
                "config",
                "user.email",
                "tests@example.com",
            ])
            .output()
            .expect("git config email should run");

        let tracked_path = temp_dir.join("tracked.txt");
        fs::write(&tracked_path, "before").expect("tracked file should be written");
        Command::new("git")
            .args([
                "-C",
                temp_dir.to_string_lossy().as_ref(),
                "add",
                "tracked.txt",
            ])
            .output()
            .expect("git add should run");
        Command::new("git")
            .args([
                "-C",
                temp_dir.to_string_lossy().as_ref(),
                "commit",
                "--quiet",
                "-m",
                "Initial",
            ])
            .output()
            .expect("git commit should run");

        fs::write(&tracked_path, "after").expect("tracked file should update");

        let (old_content, new_content) =
            load_working_tree_contents(temp_dir.to_string_lossy().as_ref(), "tracked.txt")
                .expect("working tree contents should load");

        remove_temp_path(&temp_dir);
        assert_eq!(old_content.as_deref(), Some("before".as_bytes()));
        assert_eq!(new_content.as_deref(), Some("after".as_bytes()));
    }

    #[test]
    fn load_commit_contents_returns_previous_and_current_commit_versions() {
        let temp_dir = create_temp_dir("commit-contents");
        Command::new("git")
            .args(["init", "--quiet", temp_dir.to_string_lossy().as_ref()])
            .output()
            .expect("git init should run");
        Command::new("git")
            .args([
                "-C",
                temp_dir.to_string_lossy().as_ref(),
                "config",
                "user.name",
                "LitGit Tests",
            ])
            .output()
            .expect("git config name should run");
        Command::new("git")
            .args([
                "-C",
                temp_dir.to_string_lossy().as_ref(),
                "config",
                "user.email",
                "tests@example.com",
            ])
            .output()
            .expect("git config email should run");

        let tracked_path = temp_dir.join("tracked.txt");
        fs::write(&tracked_path, "before").expect("tracked file should be written");
        Command::new("git")
            .args([
                "-C",
                temp_dir.to_string_lossy().as_ref(),
                "add",
                "tracked.txt",
            ])
            .output()
            .expect("git add should run");
        Command::new("git")
            .args([
                "-C",
                temp_dir.to_string_lossy().as_ref(),
                "commit",
                "--quiet",
                "-m",
                "Initial",
            ])
            .output()
            .expect("git commit should run");

        fs::write(&tracked_path, "after").expect("tracked file should update");
        Command::new("git")
            .args([
                "-C",
                temp_dir.to_string_lossy().as_ref(),
                "add",
                "tracked.txt",
            ])
            .output()
            .expect("git add should run");
        Command::new("git")
            .args([
                "-C",
                temp_dir.to_string_lossy().as_ref(),
                "commit",
                "--quiet",
                "-m",
                "Update",
            ])
            .output()
            .expect("git commit should run");

        let head_commit = Command::new("git")
            .args([
                "-C",
                temp_dir.to_string_lossy().as_ref(),
                "rev-parse",
                "HEAD",
            ])
            .output()
            .expect("git rev-parse should run");
        let commit_hash = String::from_utf8_lossy(&head_commit.stdout)
            .trim()
            .to_string();

        let (old_content, new_content) = load_commit_contents(
            temp_dir.to_string_lossy().as_ref(),
            &commit_hash,
            "tracked.txt",
        )
        .expect("commit contents should load");

        remove_temp_path(&temp_dir);
        assert_eq!(old_content.as_deref(), Some("before".as_bytes()));
        assert_eq!(new_content.as_deref(), Some("after".as_bytes()));
    }

    #[cfg(windows)]
    #[test]
    fn uses_create_no_window_for_background_processes() {
        assert_eq!(super::background_process_creation_flags(), 0x08000000);
    }

    #[test]
    fn build_git_credential_descriptor_extracts_https_parts() {
        let descriptor =
            build_git_credential_descriptor("https://github.com/example/repo.git", Some("octocat"))
                .expect("descriptor should build");

        assert!(descriptor.contains("protocol=https"));
        assert!(descriptor.contains("host=github.com"));
        assert!(descriptor.contains("path=example/repo.git"));
        assert!(descriptor.contains("username=octocat"));
    }

    #[test]
    fn auth_failure_message_detects_credential_rejection() {
        let message = git_error_message(
            b"fatal: Authentication failed for 'https://github.com/example/repo.git/'",
            "fallback",
        );

        assert!(message.contains("Authentication required"));
    }

    #[test]
    fn build_git_credential_descriptor_includes_path_for_helper_context() {
        let descriptor =
            build_git_credential_descriptor("https://github.com/example/repo.git", None)
                .expect("descriptor");

        assert!(descriptor.contains("path=example/repo.git"));
    }
}
