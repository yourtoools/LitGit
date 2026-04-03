use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use encoding_rs::{Encoding, UTF_8};
use std::path::{Component, Path};
use std::process::{Command, Stdio};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const MAX_IMAGE_PREVIEW_BYTES: usize = 64 * 1024 * 1024;

pub(crate) fn resolve_file_extension(file_path: &str) -> Option<String> {
    Path::new(file_path)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
}

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

pub(crate) fn encode_image_data_url(content: &[u8], mime_type: &str) -> Option<String> {
    if content.is_empty() || content.len() > MAX_IMAGE_PREVIEW_BYTES {
        return None;
    }

    let encoded = BASE64_STANDARD.encode(content);
    Some(format!("data:{mime_type};base64,{encoded}"))
}

pub(crate) fn is_probably_text_content(content: Option<&[u8]>) -> bool {
    let Some(content) = content else {
        return true;
    };

    if content.is_empty() {
        return true;
    }

    !content.contains(&0) && std::str::from_utf8(content).is_ok()
}

pub(crate) fn resolve_text_encoding(encoding: Option<&str>) -> Result<&'static Encoding, String> {
    let normalized = encoding.map(str::trim).filter(|value| !value.is_empty());
    let Some(encoding_label) = normalized else {
        return Ok(UTF_8);
    };

    if encoding_label.eq_ignore_ascii_case("utf-8") || encoding_label.eq_ignore_ascii_case("utf8") {
        return Ok(UTF_8);
    }

    Encoding::for_label(encoding_label.as_bytes())
        .ok_or_else(|| format!("Unsupported encoding: {encoding_label}"))
}

pub(crate) fn decode_text_content_with_encoding(
    content: Option<&[u8]>,
    encoding: Option<&str>,
) -> Result<String, String> {
    let Some(bytes) = content else {
        return Ok(String::new());
    };

    if bytes.is_empty() {
        return Ok(String::new());
    }

    let selected_encoding = resolve_text_encoding(encoding)?;
    let (decoded, _, had_errors) = selected_encoding.decode(bytes);

    if had_errors {
        return Err("Failed to decode file with selected encoding".to_string());
    }

    Ok(decoded.into_owned())
}

pub(crate) fn encode_text_with_encoding(
    text: &str,
    encoding: Option<&str>,
) -> Result<Vec<u8>, String> {
    let selected_encoding = resolve_text_encoding(encoding)?;
    let (encoded, _, had_errors) = selected_encoding.encode(text);

    if had_errors {
        return Err("Failed to encode file with selected encoding".to_string());
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

pub(crate) fn background_command(program: &str) -> Command {
    let mut command = Command::new(program);
    apply_background_process_flags(&mut command);
    command
}

pub(crate) fn git_command() -> Command {
    let mut command = background_command("git");
    command.stdin(Stdio::null());
    command
}

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

// Git subprocesses are non-interactive by default so the desktop app fails
// fast instead of hanging on hidden stdin prompts.
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

pub(crate) fn validate_repository_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err("Repository path does not exist".to_string());
    }

    if !path.is_dir() {
        return Err("Repository path is not a folder".to_string());
    }

    Ok(())
}

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

pub(crate) fn validate_git_repo(path: &Path) -> Result<(), String> {
    validate_repository_path(path)?;

    if !is_git_repository_root(path) {
        return Err("Selected folder is not a git repository".to_string());
    }

    Ok(())
}

pub(crate) fn validate_launcher_repository_root(path: &Path) -> Result<(), String> {
    validate_git_repo(path)
}

pub(crate) fn validate_repo_relative_file_path(file_path: &str) -> Result<(), String> {
    let path = Path::new(file_path);

    if path.is_absolute() {
        return Err("File path must be relative to repository root".to_string());
    }

    let contains_parent = path
        .components()
        .any(|component| matches!(component, Component::ParentDir));

    if contains_parent {
        return Err("File path must not contain parent-directory traversal".to_string());
    }

    Ok(())
}

pub(crate) fn is_git_authentication_message(message: &str) -> bool {
    let normalized = message.to_lowercase();

    normalized.contains("terminal prompts disabled")
        || normalized.contains("could not read username")
        || normalized.contains("could not read password")
        || normalized.contains("unable to read askpass response")
        || normalized.contains("authentication failed")
        || normalized.contains("the requested url returned error: 401")
        || normalized.contains("the requested url returned error: 403")
}

#[cfg(test)]
mod tests {
    use encoding_rs::UTF_8;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{
        decode_text_content_with_encoding, encode_image_data_url, encode_text_with_encoding,
        git_error_message, git_process_error_message, is_git_authentication_message,
        is_git_repository_root, is_probably_text_content, resolve_file_extension,
        resolve_image_mime_type, resolve_text_encoding, validate_git_repo,
        validate_launcher_repository_root, validate_repo_relative_file_path,
        validate_repository_path,
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
    fn does_not_misclassify_repository_not_found_as_auth_error() {
        assert!(!is_git_authentication_message(
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
        assert_eq!(result, Err("Repository path is not a folder".to_string()));
    }

    #[test]
    fn validate_git_repo_rejects_directory_without_git_folder() {
        let temp_dir = create_temp_dir("validate-missing-git");

        let result = validate_git_repo(&temp_dir);

        remove_temp_path(&temp_dir);
        assert_eq!(
            result,
            Err("Selected folder is not a git repository".to_string())
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

        assert_eq!(result, Err("Repository path does not exist".to_string()));
    }

    #[test]
    fn validate_launcher_repository_root_rejects_file_paths() {
        let temp_file = create_temp_path("validate-launcher-file");
        fs::write(&temp_file, "content").expect("temp file should be written");

        let result = validate_launcher_repository_root(&temp_file);

        remove_temp_path(&temp_file);
        assert_eq!(result, Err("Repository path is not a folder".to_string()));
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
            Err("Failed to decode file with selected encoding".to_string())
        );
    }

    #[test]
    fn encode_text_with_encoding_returns_error_for_unsupported_encoding() {
        let result = encode_text_with_encoding("hello", Some("not-a-real-encoding"));

        assert_eq!(
            result,
            Err("Unsupported encoding: not-a-real-encoding".to_string())
        );
    }

    #[test]
    fn validate_repo_relative_file_path_rejects_parent_traversal() {
        assert_eq!(
            validate_repo_relative_file_path("../secret.txt"),
            Err("File path must not contain parent-directory traversal".to_string())
        );
    }

    #[test]
    fn validate_repo_relative_file_path_accepts_nested_repo_path() {
        assert_eq!(validate_repo_relative_file_path("src/lib.rs"), Ok(()));
    }

    #[cfg(windows)]
    #[test]
    fn uses_create_no_window_for_background_processes() {
        assert_eq!(super::background_process_creation_flags(), 0x08000000);
    }
}
