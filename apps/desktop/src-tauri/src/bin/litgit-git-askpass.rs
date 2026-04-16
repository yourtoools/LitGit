//! LitGit Askpass Helper
//!
//! This is a standalone binary that serves as a Git/SSH askpass helper.
//! It reads the session credentials from environment variables and communicates
//! with the main LitGit application via Unix domain socket (or named pipe on Windows)
//! to prompt the user for authentication.

use std::env;
use std::io::{self, Write};
use std::process;
use std::time::Duration;

#[cfg(unix)]
use std::os::unix::net::UnixStream;
#[cfg(windows)]
use std::os::windows::io::{FromRawHandle, IntoRawHandle};

/// Request payload for queuing a prompt
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct QueuePromptRequest {
    session_id: String,
    secret: String,
    prompt: String,
    host: Option<String>,
    username: Option<String>,
}

/// Response from queuing a prompt
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueuePromptResponse {
    prompt_id: String,
}

/// Response containing user credentials
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PromptResponse {
    username: Option<String>,
    secret: Option<String>,
}

/// Error response from server
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ErrorResponse {
    error: String,
    code: u16,
}

const ASKPASS_SERVER_READ_TIMEOUT: Duration = Duration::from_secs(305);

fn resolve_prompt_output(prompt: &str, response: PromptResponse) -> Result<String, String> {
    let PromptResponse { username, secret } = response;
    let normalized_prompt = prompt.to_ascii_lowercase();
    let prefers_username = normalized_prompt.contains("username");

    let output = if prefers_username {
        username.or(secret)
    } else {
        secret.or(username)
    };

    output.ok_or_else(|| "No credentials provided".to_string())
}

/// Reads the prompt argument from command line arguments
fn read_prompt_argument(args: &[String]) -> Option<&str> {
    args.get(1).map(String::as_str)
}

/// Extracts host information from the prompt text
fn extract_host_from_prompt(prompt: &str) -> Option<String> {
    // Match patterns like "user@host's password" or "Password for 'https://user@host':"
    if let Some(start) = prompt.find('@') {
        let after_at = &prompt[start + 1..];
        let end = after_at
            .find('\'')
            .or_else(|| after_at.find(' '))
            .or_else(|| after_at.find('\''))
            .unwrap_or(after_at.len());
        let host = &after_at[..end];
        if !host.is_empty() {
            return Some(host.to_string());
        }
    }

    if let Some(start) = prompt.find("for '") {
        let after_for = &prompt[start + 5..];
        if let Some(end) = after_for.find('\'') {
            let url = &after_for[..end];
            if let Some(host_start) = url.find("//") {
                let after_scheme = &url[host_start + 2..];
                let host_end = after_scheme
                    .find('/')
                    .or_else(|| after_scheme.find(':'))
                    .or_else(|| after_scheme.find('@'))
                    .and_then(|at| {
                        let after_at = &after_scheme[at + 1..];
                        after_at.find('/').map(|slash| at + 1 + slash)
                    })
                    .unwrap_or(after_scheme.len());
                let host = &after_scheme[..host_end];
                if !host.is_empty() {
                    return Some(host.to_string());
                }
            }
        }
    }

    None
}

/// Extracts username from the prompt text
fn extract_username_from_prompt(prompt: &str) -> Option<String> {
    if let Some(start) = prompt.find("Username for '") {
        let after_for = &prompt[start + 14..];
        if let Some(end) = after_for.find('\'') {
            let url = &after_for[..end];
            if let Some(at_pos) = url.find('@') {
                let scheme_end = url.find("//").map(|p| p + 2).unwrap_or(0);
                if at_pos > scheme_end {
                    let user = &url[scheme_end..at_pos];
                    if !user.is_empty() {
                        return Some(user.to_string());
                    }
                }
            }
        }
    }

    if let Some(end) = prompt.find('@') {
        let user = &prompt[..end];
        if !user.is_empty() && !user.contains(' ') {
            return Some(user.to_string());
        }
    }

    None
}

#[cfg(any(windows, test))]
fn take_next_ndjson_frame(buffer: &mut String) -> Option<String> {
    let line_end = buffer.find('\n')?;
    let frame = buffer[..line_end].trim_end_matches('\r').to_string();
    let remainder = buffer[line_end + 1..].to_string();
    *buffer = remainder;
    Some(frame)
}

#[cfg(unix)]
fn connect_to_server(socket_path: &str) -> Result<UnixStream, String> {
    UnixStream::connect(socket_path).map_err(|e| {
        format!(
            "Failed to connect to askpass server at {}: {}",
            socket_path, e
        )
    })
}

#[cfg(windows)]
fn connect_to_server(pipe_name: &str) -> Result<std::fs::File, String> {
    use std::os::windows::fs::OpenOptionsExt;

    std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .custom_flags(0x80000000) // FILE_FLAG_OVERLAPPED
        .open(pipe_name)
        .map_err(|e| format!("Failed to connect to askpass pipe at {}: {}", pipe_name, e))
}

#[cfg(unix)]
fn run_askpass_unix(socket_path: &str, prompt: &str) -> Result<String, String> {
    let session_id = env::var("LITGIT_ASKPASS_SESSION").ok();
    let secret = env::var("LITGIT_ASKPASS_SECRET").ok();

    let (session_id, secret) = match (session_id, secret) {
        (Some(sid), Some(sec)) => (sid, sec),
        _ => {
            return Err("Missing required environment variables. Ensure LITGIT_ASKPASS_SESSION and LITGIT_ASKPASS_SECRET are set.".to_string());
        }
    };

    if prompt.is_empty() {
        return Err("Empty prompt provided".to_string());
    }

    let host = extract_host_from_prompt(prompt);
    let username = extract_username_from_prompt(prompt);

    // Connect to the Unix socket
    let mut stream = connect_to_server(socket_path)?;

    // Set read timeout for the response polling
    stream
        .set_read_timeout(Some(ASKPASS_SERVER_READ_TIMEOUT))
        .map_err(|e| format!("Failed to set read timeout: {}", e))?;

    // Send the queue prompt request
    let queue_request = QueuePromptRequest {
        session_id: session_id.clone(),
        secret: secret.clone(),
        prompt: prompt.to_string(),
        host: host.clone(),
        username: username.clone(),
    };

    let request_json = serde_json::to_string(&queue_request)
        .map_err(|e| format!("Failed to serialize request: {}", e))?;

    writeln!(stream, "{}", request_json).map_err(|e| format!("Failed to send request: {}", e))?;

    // Read the queue response
    let mut reader = io::BufReader::new(&stream);
    let mut response_line = String::new();

    std::io::BufRead::read_line(&mut reader, &mut response_line)
        .map_err(|e| format!("Failed to read queue response: {}", e))?;

    // Try to parse as QueuePromptResponse
    let _prompt_id = match serde_json::from_str::<QueuePromptResponse>(&response_line) {
        Ok(r) => r.prompt_id,
        Err(_) => {
            // Try to parse as error
            if let Ok(error) = serde_json::from_str::<ErrorResponse>(&response_line) {
                return Err(format!("Server error ({}): {}", error.code, error.error));
            }
            return Err("Invalid response from server".to_string());
        }
    };

    // Read the user response (this will block until user submits or timeout)
    let mut user_response_line = String::new();
    std::io::BufRead::read_line(&mut reader, &mut user_response_line)
        .map_err(|e| format!("Failed to read user response: {}", e))?;

    // Try to parse as PromptResponse
    let user_response = match serde_json::from_str::<PromptResponse>(&user_response_line) {
        Ok(r) => r,
        Err(_) => {
            // Try to parse as error
            if let Ok(error) = serde_json::from_str::<ErrorResponse>(&user_response_line) {
                if error.code == 499 {
                    return Err("Authentication cancelled by user".to_string());
                } else {
                    return Err(format!("Server error ({}): {}", error.code, error.error));
                }
            }
            return Err("Invalid response from server".to_string());
        }
    };

    resolve_prompt_output(prompt, user_response)
}

#[cfg(windows)]
fn run_askpass_windows(pipe_name: &str, prompt: &str) -> Result<String, String> {
    use std::io::Write;

    let session_id = env::var("LITGIT_ASKPASS_SESSION").ok();
    let secret = env::var("LITGIT_ASKPASS_SECRET").ok();

    let (session_id, secret) = match (session_id, secret) {
        (Some(sid), Some(sec)) => (sid, sec),
        _ => {
            return Err("Missing required environment variables. Ensure LITGIT_ASKPASS_SESSION and LITGIT_ASKPASS_SECRET are set.".to_string());
        }
    };

    if prompt.is_empty() {
        return Err("Empty prompt provided".to_string());
    }

    let host = extract_host_from_prompt(prompt);
    let username = extract_username_from_prompt(prompt);

    // Connect to the named pipe
    let mut stream = connect_to_server(pipe_name)?;

    // Send the queue prompt request
    let queue_request = QueuePromptRequest {
        session_id: session_id.clone(),
        secret: secret.clone(),
        prompt: prompt.to_string(),
        host: host.clone(),
        username: username.clone(),
    };

    let request_json = serde_json::to_string(&queue_request)
        .map_err(|e| format!("Failed to serialize request: {}", e))?;

    stream
        .write_all(request_json.as_bytes())
        .map_err(|e| format!("Failed to send request: {}", e))?;
    stream
        .write_all(b"\n")
        .map_err(|e| format!("Failed to send newline: {}", e))?;

    let mut pending = String::new();
    let response_line = read_next_pipe_frame(
        &mut stream,
        &mut pending,
        "queue response",
        Some(ASKPASS_SERVER_READ_TIMEOUT),
    )?;

    // Try to parse as QueuePromptResponse
    let _prompt_id = match serde_json::from_str::<QueuePromptResponse>(&response_line) {
        Ok(r) => r.prompt_id,
        Err(_) => {
            if let Ok(error) = serde_json::from_str::<ErrorResponse>(&response_line) {
                return Err(format!("Server error ({}): {}", error.code, error.error));
            }
            return Err("Invalid response from server".to_string());
        }
    };

    let user_response_line = read_next_pipe_frame(
        &mut stream,
        &mut pending,
        "user response",
        Some(ASKPASS_SERVER_READ_TIMEOUT),
    )?;

    // Try to parse as PromptResponse
    let user_response = match serde_json::from_str::<PromptResponse>(&user_response_line) {
        Ok(r) => r,
        Err(_) => {
            if let Ok(error) = serde_json::from_str::<ErrorResponse>(&user_response_line) {
                if error.code == 499 {
                    return Err("Authentication cancelled by user".to_string());
                } else {
                    return Err(format!("Server error ({}): {}", error.code, error.error));
                }
            }
            return Err("Invalid response from server".to_string());
        }
    };

    resolve_prompt_output(prompt, user_response)
}

#[cfg(windows)]
fn read_next_pipe_frame(
    stream: &mut std::fs::File,
    pending: &mut String,
    context: &str,
    timeout: Option<Duration>,
) -> Result<String, String> {
    use std::io::Read as _;

    if let Some(frame) = take_next_ndjson_frame(pending) {
        return Ok(frame);
    }

    let start_time = std::time::Instant::now();
    let mut buffer = [0u8; 1024];

    loop {
        match stream.read(&mut buffer) {
            Ok(0) => {
                if let Some(frame) = take_next_ndjson_frame(pending) {
                    return Ok(frame);
                }

                if timeout.is_some_and(|limit| start_time.elapsed() >= limit) {
                    return Err(format!("Timeout waiting for {context}"));
                }

                std::thread::sleep(Duration::from_millis(100));
            }
            Ok(bytes_read) => {
                pending.push_str(&String::from_utf8_lossy(&buffer[..bytes_read]));
                if let Some(frame) = take_next_ndjson_frame(pending) {
                    return Ok(frame);
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                if timeout.is_some_and(|limit| start_time.elapsed() >= limit) {
                    return Err(format!("Timeout waiting for {context}"));
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(error) => return Err(format!("Failed to read {context}: {error}")),
        }
    }
}

fn main() {
    let args = env::args().collect::<Vec<_>>();
    let Some(prompt) = read_prompt_argument(&args) else {
        eprintln!("Usage: litgit-git-askpass <prompt>");
        process::exit(1);
    };

    #[cfg(unix)]
    let socket_path = env::var("LITGIT_ASKPASS_SOCKET").ok();
    #[cfg(windows)]
    let pipe_name = env::var("LITGIT_ASKPASS_SOCKET").ok();

    #[cfg(unix)]
    let result = match socket_path {
        Some(path) => run_askpass_unix(&path, prompt),
        None => Err("LITGIT_ASKPASS_SOCKET environment variable not set".to_string()),
    };

    #[cfg(windows)]
    let result = match pipe_name {
        Some(name) => run_askpass_windows(&name, prompt),
        None => Err("LITGIT_ASKPASS_SOCKET environment variable not set".to_string()),
    };

    match result {
        Ok(output) => {
            if writeln!(io::stdout(), "{}", output).is_err() {
                eprintln!("Failed to write to stdout");
                process::exit(1);
            }
        }
        Err(e) => {
            eprintln!("{}", e);
            process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        extract_host_from_prompt, extract_username_from_prompt, read_prompt_argument,
        resolve_prompt_output, take_next_ndjson_frame, PromptResponse,
    };

    #[test]
    fn test_read_prompt_argument_returns_first_prompt() {
        let args = vec!["askpass".to_string(), "Password for host".to_string()];
        assert_eq!(read_prompt_argument(&args), Some("Password for host"));
    }

    #[test]
    fn test_extract_host_from_ssh_prompt() {
        let prompt = "git@github.com's password:";
        assert_eq!(
            extract_host_from_prompt(prompt),
            Some("github.com".to_string())
        );
    }

    #[test]
    fn test_extract_host_from_https_prompt() {
        let prompt = "Password for 'https://github.com':";
        assert_eq!(
            extract_host_from_prompt(prompt),
            Some("github.com".to_string())
        );
    }

    #[test]
    fn test_extract_host_from_https_with_user() {
        let prompt = "Password for 'https://user@github.com':";
        assert_eq!(
            extract_host_from_prompt(prompt),
            Some("github.com".to_string())
        );
    }

    #[test]
    fn test_extract_username_from_prompt() {
        let prompt = "Username for 'https://myuser@github.com':";
        assert_eq!(
            extract_username_from_prompt(prompt),
            Some("myuser".to_string())
        );
    }

    #[test]
    fn test_extract_username_from_ssh_style() {
        let prompt = "myuser@github.com's password:";
        assert_eq!(
            extract_username_from_prompt(prompt),
            Some("myuser".to_string())
        );
    }

    #[test]
    fn test_take_next_ndjson_frame_splits_buffer_by_newline() {
        let mut pending = "{\"promptId\":\"first\"}\n{\"secret\":\"second\"}\n".to_string();

        let first = take_next_ndjson_frame(&mut pending);
        let second = take_next_ndjson_frame(&mut pending);
        let third = take_next_ndjson_frame(&mut pending);

        assert_eq!(first.as_deref(), Some("{\"promptId\":\"first\"}"));
        assert_eq!(second.as_deref(), Some("{\"secret\":\"second\"}"));
        assert!(third.is_none());
    }

    #[test]
    fn test_resolve_prompt_output_prefers_username_for_username_prompt() {
        let response = PromptResponse {
            username: Some("octocat".to_string()),
            secret: Some("super-secret".to_string()),
        };

        let output = resolve_prompt_output("Username for 'https://github.com':", response)
            .expect("username should be selected");
        assert_eq!(output, "octocat");
    }

    #[test]
    fn test_resolve_prompt_output_prefers_secret_for_password_prompt() {
        let response = PromptResponse {
            username: Some("octocat".to_string()),
            secret: Some("super-secret".to_string()),
        };

        let output = resolve_prompt_output("Password for 'https://github.com':", response)
            .expect("secret should be selected");
        assert_eq!(output, "super-secret");
    }

    #[test]
    fn test_resolve_prompt_output_rejects_empty_response() {
        let response = PromptResponse {
            username: None,
            secret: None,
        };

        let result = resolve_prompt_output("Password for 'https://github.com':", response);
        assert!(result.is_err());
    }
}
