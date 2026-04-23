//! SSH key management for Git authentication.
//!
//! This module provides SSH key generation, listing, and management
//! capabilities for authenticating with Git remotes via SSH.

use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};

/// Information about an SSH key.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SshKeyInfo {
    pub(crate) path: String,
    pub(crate) name: String,
    pub(crate) fingerprint: String,
    pub(crate) is_encrypted: bool,
    pub(crate) comment: Option<String>,
    pub(crate) key_type: String,
}

/// Supported SSH key types.
#[derive(Clone, Debug)]
pub(crate) enum SshKeyType {
    Ed25519,
    Rsa { bits: u32 },
    Ecdsa { curve: String },
}

impl SshKeyType {
    fn as_str(&self) -> &'static str {
        match self {
            SshKeyType::Ed25519 => "ed25519",
            SshKeyType::Rsa { .. } => "rsa",
            SshKeyType::Ecdsa { .. } => "ecdsa",
        }
    }
}

/// Gets the default SSH directory path.
#[must_use]
pub(crate) fn default_ssh_dir() -> PathBuf {
    dirs::home_dir()
        .map(|home| home.join(".ssh"))
        .unwrap_or_else(|| std::env::temp_dir().join(".ssh"))
}

/// Ensures the SSH directory exists.
pub(crate) fn ensure_ssh_dir() -> Result<PathBuf, String> {
    let ssh_dir = default_ssh_dir();
    if !ssh_dir.exists() {
        std::fs::create_dir_all(&ssh_dir)
            .map_err(|e| format!("Failed to create .ssh directory: {e}"))?;

        // Set proper permissions on Unix (700 - only owner)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let permissions = std::fs::Permissions::from_mode(0o700);
            std::fs::set_permissions(&ssh_dir, permissions)
                .map_err(|e| format!("Failed to set .ssh directory permissions: {e}"))?;
        }
    }
    Ok(ssh_dir)
}

fn provider_ssh_profiles_dir() -> PathBuf {
    dirs::home_dir()
        .map(|home| home.join(".litgit").join("profiles"))
        .unwrap_or_else(|| std::env::temp_dir().join(".litgit").join("profiles"))
}

fn normalize_absolute_path(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("SSH key path must be absolute".to_string());
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                return Err("SSH key path must not contain parent traversal".to_string());
            }
            _ => normalized.push(component.as_os_str()),
        }
    }

    Ok(normalized)
}

fn canonicalize_if_exists(path: &Path) -> Result<PathBuf, String> {
    let normalized = normalize_absolute_path(path)?;
    if normalized.exists() {
        std::fs::canonicalize(&normalized).map_err(|error| {
            format!(
                "Failed to resolve key path {}: {error}",
                normalized.display()
            )
        })
    } else {
        Ok(normalized)
    }
}

fn is_provider_ssh_path(path: &Path, provider_profiles_root: &Path) -> bool {
    if !path.starts_with(provider_profiles_root) {
        return false;
    }

    let Ok(relative) = path.strip_prefix(provider_profiles_root) else {
        return false;
    };

    let mut components = relative.components();
    let Some(Component::Normal(_profile_id)) = components.next() else {
        return false;
    };
    let Some(Component::Normal(segment)) = components.next() else {
        return false;
    };

    segment == "ssh"
}

pub(crate) fn validate_ssh_key_command_path(path: &Path) -> Result<PathBuf, String> {
    let candidate = canonicalize_if_exists(path)?;
    let ssh_root = canonicalize_if_exists(&default_ssh_dir())?;
    let provider_profiles_root = canonicalize_if_exists(&provider_ssh_profiles_dir())?;

    if candidate.starts_with(&ssh_root) || is_provider_ssh_path(&candidate, &provider_profiles_root)
    {
        return Ok(candidate);
    }

    Err(format!(
        "SSH key path must be inside {} or ~/.litgit/profiles/<profile_id>/ssh",
        ssh_root.display()
    ))
}

fn sanitize_key_comment_for_filename(comment: &str) -> String {
    comment.replace([' ', '@'], "_")
}

/// Gets detailed information about an SSH key.
pub(crate) fn get_ssh_key_info(key_path: &Path) -> Result<SshKeyInfo, String> {
    let file_name = key_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Get fingerprint using ssh-keygen
    let output = Command::new("ssh-keygen")
        .args(["-lf", key_path.to_string_lossy().as_ref()])
        .output()
        .map_err(|e| format!("Failed to get key fingerprint: {e}"))?;

    let fingerprint = if output.status.success() {
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .map(|line| {
                // Parse output like: 256 SHA256:... comment (ED25519)
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    parts[1].to_string()
                } else {
                    "unknown".to_string()
                }
            })
            .unwrap_or_else(|| "unknown".to_string())
    } else {
        "unknown".to_string()
    };

    // Determine if key is encrypted by checking if we can get the public key without password
    let pub_path = key_path.with_extension("pub");
    let is_encrypted = if pub_path.exists() {
        // If we can't load the public key from the private key without passphrase, it's encrypted
        let test_output = Command::new("ssh-keygen")
            .args(["-y", "-f", key_path.to_string_lossy().as_ref()])
            .env("SSH_ASKPASS", "")
            .env("DISPLAY", "")
            .output()
            .map_err(|e| format!("Failed to check key encryption: {e}"))?;
        !test_output.status.success()
    } else {
        false
    };

    // Read the public key to get comment and type
    let (comment, key_type) = if pub_path.exists() {
        let pub_content = std::fs::read_to_string(&pub_path).unwrap_or_default();
        let parts: Vec<&str> = pub_content.split_whitespace().collect();
        let key_type = parts
            .first()
            .map(|s| s.to_string())
            .unwrap_or_else(|| "unknown".to_string());
        let comment = parts.get(2).map(|s| s.to_string());
        (comment, key_type)
    } else {
        (None, "unknown".to_string())
    };

    Ok(SshKeyInfo {
        path: key_path.to_string_lossy().to_string(),
        name: file_name,
        fingerprint,
        is_encrypted,
        comment,
        key_type,
    })
}

/// Tauri command to list all SSH keys.
#[tauri::command]
pub(crate) async fn list_ssh_keys() -> Result<Vec<SshKeyInfo>, String> {
    tauri::async_runtime::spawn_blocking(list_ssh_keys_inner)
        .await
        .map_err(|error| format!("Failed to list SSH keys: {error}"))?
}

fn list_ssh_keys_inner() -> Result<Vec<SshKeyInfo>, String> {
    let ssh_dir = default_ssh_dir();
    if !ssh_dir.exists() {
        return Ok(Vec::new());
    }

    let mut keys = Vec::new();
    let entries =
        std::fs::read_dir(&ssh_dir).map_err(|e| format!("Failed to read .ssh directory: {e}"))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {e}"))?;

        let path = entry.path();
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        // Skip public key files (.pub) - we'll process them with their private keys
        if file_name.ends_with(".pub")
            || file_name.starts_with("known_hosts")
            || file_name.starts_with("config")
            || file_name.starts_with("authorized_keys")
        {
            continue;
        }

        // Check if this is a private key file (has a corresponding .pub file)
        let pub_path = path.with_extension("pub");
        if pub_path.exists() {
            if let Ok(info) = get_ssh_key_info(&path) {
                keys.push(info);
            }
        }
    }

    Ok(keys)
}

/// Tauri command to generate a new SSH key.
#[tauri::command]
pub(crate) async fn generate_ssh_key(
    key_type: String,
    comment: Option<String>,
    passphrase: Option<String>,
) -> Result<SshKeyInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        generate_ssh_key_inner(key_type, comment, passphrase)
    })
    .await
    .map_err(|error| format!("Failed to generate SSH key: {error}"))?
}

fn generate_ssh_key_inner(
    key_type: String,
    comment: Option<String>,
    passphrase: Option<String>,
) -> Result<SshKeyInfo, String> {
    let key_type_enum = match key_type.as_str() {
        "ed25519" => SshKeyType::Ed25519,
        "rsa" => SshKeyType::Rsa { bits: 4096 },
        "ecdsa" => SshKeyType::Ecdsa {
            curve: "521".to_string(),
        },
        _ => return Err(format!("Unsupported key type: {}", key_type)),
    };

    let ssh_dir = ensure_ssh_dir()?;

    // Generate unique filename
    let base_name = comment
        .as_ref()
        .map(|comment| sanitize_key_comment_for_filename(comment))
        .unwrap_or_else(|| "litgit_key".to_string());

    let mut key_path = ssh_dir.join(format!("id_{}_{}", key_type_enum.as_str(), base_name));
    let mut counter = 0;

    while key_path.exists() {
        counter += 1;
        key_path = ssh_dir.join(format!(
            "id_{}_{}_{}",
            key_type_enum.as_str(),
            base_name,
            counter
        ));
    }

    // Build ssh-keygen command
    let mut cmd = Command::new("ssh-keygen");
    cmd.arg("-t").arg(key_type_enum.as_str());

    match &key_type_enum {
        SshKeyType::Rsa { bits } => {
            cmd.arg("-b").arg(bits.to_string());
        }
        SshKeyType::Ecdsa { curve } => {
            cmd.arg("-b").arg(curve);
        }
        _ => {}
    }

    cmd.arg("-f").arg(&key_path);
    cmd.arg("-N").arg(passphrase.as_deref().unwrap_or(""));

    if let Some(comment) = &comment {
        cmd.arg("-C").arg(comment);
    }

    cmd.stdin(Stdio::null());

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to generate SSH key: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ssh-keygen failed: {}", stderr));
    }

    // Set proper permissions on the private key
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(&key_path, permissions)
            .map_err(|e| format!("Failed to set key permissions: {e}"))?;
    }

    get_ssh_key_info(&key_path)
}

/// Tauri command to delete an SSH key.
#[tauri::command]
pub(crate) fn delete_ssh_key(key_path: String) -> Result<(), String> {
    let requested_path = PathBuf::from(key_path);
    let path = validate_ssh_key_command_path(&requested_path)?;

    // Delete the private key
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Failed to delete private key: {e}"))?;
    }

    // Delete the public key
    let pub_path = validate_ssh_key_command_path(&path.with_extension("pub"))?;
    if pub_path.exists() {
        std::fs::remove_file(&pub_path).map_err(|e| format!("Failed to delete public key: {e}"))?;
    }

    Ok(())
}

/// Tauri command to copy a public key to clipboard.
#[tauri::command]
pub(crate) fn copy_public_key(key_path: String) -> Result<String, String> {
    let requested_path = PathBuf::from(key_path);
    let path = validate_ssh_key_command_path(&requested_path)?;
    let pub_path = validate_ssh_key_command_path(&path.with_extension("pub"))?;

    if !pub_path.exists() {
        return Err("Public key file not found".to_string());
    }

    let content = std::fs::read_to_string(&pub_path)
        .map_err(|e| format!("Failed to read public key: {e}"))?;

    Ok(content.trim().to_string())
}

/// Tauri command to test SSH connection to a host.
#[tauri::command]
pub(crate) async fn test_ssh_connection(
    host: String,
    key_path: Option<String>,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || test_ssh_connection_inner(host, key_path))
        .await
        .map_err(|error| format!("Failed to test SSH connection: {error}"))?
}

fn test_ssh_connection_inner(host: String, key_path: Option<String>) -> Result<bool, String> {
    let mut cmd = Command::new("ssh");
    cmd.arg("-o").arg("StrictHostKeyChecking=no");
    cmd.arg("-o").arg("BatchMode=yes");
    cmd.arg("-o").arg("ConnectTimeout=10");

    if let Some(key) = key_path {
        let validated_path = validate_ssh_key_command_path(Path::new(&key))?;
        cmd.arg("-i").arg(validated_path);
    }

    cmd.arg(format!("git@{}", host));
    cmd.arg("git-upload-pack '--help'");
    cmd.stdin(Stdio::null());

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to test SSH connection: {e}"))?;

    // If we get a non-zero exit but it's not a connection/auth failure, that's actually success
    // The git-upload-pack --help will fail but show the help output
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);

    let response = format!("{}{}", stdout, stderr);

    // Check for auth failure indicators
    let auth_failed = response.contains("Permission denied")
        || response.contains("Authentication failed")
        || response.contains("Could not resolve hostname")
        || response.contains("Connection refused")
        || response.contains("Connection timed out");

    Ok(!auth_failed)
}

/// Generates a new SSH key specifically for LitGit at ~/.ssh/litgit_rsa.
///
/// This command creates an ED25519 key pair at the default SSH location
/// with the name `litgit_rsa`. If a key already exists at this location,
/// an error is returned.
#[tauri::command]
pub(crate) async fn generate_litgit_key_with_dialog() -> Result<SshKeyInfo, String> {
    tauri::async_runtime::spawn_blocking(generate_litgit_key_with_dialog_inner)
        .await
        .map_err(|error| format!("Failed to generate LitGit SSH key: {error}"))?
}

fn generate_litgit_key_with_dialog_inner() -> Result<SshKeyInfo, String> {
    let ssh_dir = ensure_ssh_dir()?;
    let key_path = ssh_dir.join("litgit_rsa");

    if key_path.exists() {
        return Err(
            "Key already exists at ~/.ssh/litgit_rsa. Remove it first or choose a different name."
                .to_string(),
        );
    }

    let mut cmd = Command::new("ssh-keygen");
    cmd.arg("-t").arg("ed25519");
    cmd.arg("-f").arg(&key_path);
    cmd.arg("-N").arg(""); // No passphrase
    cmd.arg("-C").arg("litgit@localhost");
    cmd.stdin(Stdio::null());

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to generate SSH key: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ssh-keygen failed: {stderr}"));
    }

    // Set proper permissions on the private key (owner read/write only)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(&key_path, permissions)
            .map_err(|e| format!("Failed to set key permissions: {e}"))?;
    }

    get_ssh_key_info(&key_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_key_comment_for_filename_replaces_spaces_and_at_signs() {
        assert_eq!(
            sanitize_key_comment_for_filename("Jane Doe@example.com"),
            "Jane_Doe_example.com"
        );
    }

    #[test]
    fn default_ssh_dir_returns_ssh_subdirectory() {
        let ssh_dir = default_ssh_dir();
        assert!(ssh_dir.to_string_lossy().contains(".ssh"));
    }

    #[test]
    fn ssh_key_types_can_be_created() {
        let ed25519 = SshKeyType::Ed25519;
        let rsa = SshKeyType::Rsa { bits: 4096 };
        let ecdsa = SshKeyType::Ecdsa {
            curve: "521".to_string(),
        };

        assert_eq!(ed25519.as_str(), "ed25519");
        assert_eq!(rsa.as_str(), "rsa");
        assert_eq!(ecdsa.as_str(), "ecdsa");
    }

    #[test]
    fn validate_ssh_key_command_path_accepts_default_ssh_directory() {
        let path = default_ssh_dir().join("id_ed25519_litgit");
        let validated = validate_ssh_key_command_path(&path).expect("default ssh path");

        assert!(validated.starts_with(default_ssh_dir()));
    }

    #[test]
    fn validate_ssh_key_command_path_accepts_provider_ssh_directory() {
        let path = provider_ssh_profiles_dir()
            .join("test_profile")
            .join("ssh")
            .join("litgit_github_123");
        let validated = validate_ssh_key_command_path(&path).expect("provider ssh path");

        assert!(is_provider_ssh_path(
            &validated,
            &provider_ssh_profiles_dir()
        ));
    }

    #[test]
    fn validate_ssh_key_command_path_rejects_relative_paths() {
        let result = validate_ssh_key_command_path(Path::new("id_ed25519"));
        assert!(result.is_err());
    }

    #[test]
    fn validate_ssh_key_command_path_rejects_paths_outside_allowed_roots() {
        let ssh_dir = default_ssh_dir();
        let outside_path = ssh_dir
            .parent()
            .map(|parent| parent.join("outside_allowed_root"))
            .unwrap_or_else(|| std::env::temp_dir().join("outside_allowed_root"));

        let result = validate_ssh_key_command_path(&outside_path);
        assert!(result.is_err());
    }
}
