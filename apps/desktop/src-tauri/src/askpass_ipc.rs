//! Askpass IPC server for handling communication from the askpass helper binary.
//!
//! This module provides a Unix domain socket server (on Linux/macOS) and named pipe server
//! (on Windows) for secure communication between the askpass helper and the main app.
//! This is more secure than HTTP because:
//! 1. Unix sockets use filesystem permissions (0600 - only owner can access)
//! 2. Named pipes on Windows use ACLs for access control
//! 3. No network exposure - communication stays within the local machine
//! 4. No port binding conflicts or port scanning vulnerabilities
//!
//! The protocol uses newline-delimited JSON (NDJSON) for simple, robust communication.

use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};

#[cfg(unix)]
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
#[cfg(unix)]
use tokio::net::{UnixListener, UnixStream};

#[cfg(windows)]
use tokio::io::{AsyncReadExt, AsyncWriteExt};
#[cfg(windows)]
use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};

use crate::askpass::{
    allow_remember_for_kind, classify_prompt_kind, emit_git_auth_prompt, GitAuthPromptPayload,
};
use crate::askpass_state::GitAuthBrokerState;

const ASKPASS_RESPONSE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

/// Path to the Unix domain socket or Windows named pipe for the askpass server
pub(crate) struct AskpassSocketPath {
    #[cfg(unix)]
    pub(crate) path: PathBuf,
    #[cfg(windows)]
    pub(crate) name: String,
}

#[cfg(unix)]
impl Drop for AskpassSocketPath {
    fn drop(&mut self) {
        // Clean up the socket file when the server shuts down
        let _ = std::fs::remove_file(&self.path);
    }
}

/// Request from the askpass helper to queue a prompt
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct QueuePromptRequest {
    session_id: String,
    secret: String,
    prompt: String,
    host: Option<String>,
    username: Option<String>,
}

/// Response containing the prompt ID
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct QueuePromptResponse {
    prompt_id: String,
}

/// Request to get a prompt response
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct GetResponseRequest {
    session_id: String,
    secret: String,
    prompt_id: String,
}

/// Response containing user credentials
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct PromptResponseBody {
    username: Option<String>,
    secret: Option<String>,
}

/// Error response
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct ErrorResponse {
    error: String,
    code: u16,
}

fn serialize_error_response(error: &str, code: u16) -> String {
    serde_json::json!({
        "error": error,
        "code": code,
    })
    .to_string()
}

fn serialize_ipc_payload<T: Serialize>(payload: &T) -> String {
    serde_json::to_string(payload).unwrap_or_else(|error| {
        serialize_error_response(&format!("Failed to serialize response: {error}"), 500)
    })
}

/// Starts the askpass IPC server
///
/// On Unix: Uses Unix domain sockets
/// On Windows: Uses named pipes
///
/// # Arguments
///
/// * `app_handle` - The Tauri app handle for emitting events
/// * `auth_state` - The shared authentication state
///
/// # Returns
///
/// Returns the socket path/pipe name for the helper to connect to
pub(crate) async fn start_askpass_server(
    app_handle: tauri::AppHandle,
    auth_state: Arc<GitAuthBrokerState>,
) -> Result<PathBuf, String> {
    #[cfg(unix)]
    {
        start_unix_server(app_handle, auth_state).await
    }
    #[cfg(windows)]
    {
        start_windows_server(app_handle, auth_state).await
    }
}

#[cfg(unix)]
async fn start_unix_server(
    app_handle: tauri::AppHandle,
    auth_state: Arc<GitAuthBrokerState>,
) -> Result<PathBuf, String> {
    let socket_name = format!(
        "litgit-askpass-{}-{}.sock",
        std::process::id(),
        random_token()
    );
    let socket_path = std::env::temp_dir().join(&socket_name);

    // Remove any existing socket file
    let _ = std::fs::remove_file(&socket_path);

    let listener = UnixListener::bind(&socket_path)
        .map_err(|e| format!("Failed to bind Unix socket: {}", e))?;

    // Set permissions to 0600 (only owner can read/write)
    use std::os::unix::fs::PermissionsExt;
    let permissions = std::fs::Permissions::from_mode(0o600);
    std::fs::set_permissions(&socket_path, permissions)
        .map_err(|e| format!("Failed to set socket permissions: {}", e))?;

    let path_for_cleanup = socket_path.clone();

    // Spawn the server loop
    tokio::spawn(async move {
        let _cleanup = AskpassSocketPath {
            path: path_for_cleanup,
        };
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let auth_state = auth_state.clone();
                    let app_handle = app_handle.clone();
                    tokio::spawn(handle_unix_connection(stream, auth_state, app_handle));
                }
                Err(e) => {
                    log::error!("Failed to accept connection: {}", e);
                }
            }
        }
    });

    Ok(socket_path)
}

#[cfg(unix)]
async fn handle_unix_connection(
    stream: UnixStream,
    auth_state: Arc<GitAuthBrokerState>,
    app_handle: tauri::AppHandle,
) {
    let (reader, mut writer) = stream.into_split();
    let mut reader = BufReader::new(reader);
    let mut line = String::new();

    // Read the request line (NDJSON format)
    if let Err(e) = reader.read_line(&mut line).await {
        let error_response = ErrorResponse {
            error: format!("Failed to read request: {}", e),
            code: 400,
        };
        let response_json = serialize_ipc_payload(&error_response);
        let _ = writer.write_all(response_json.as_bytes()).await;
        return;
    }

    // Try to parse as QueuePromptRequest first
    if let Ok(request) = serde_json::from_str::<QueuePromptRequest>(&line) {
        let session_id = request.session_id.clone();
        match handle_queue_prompt(request, &auth_state, &app_handle).await {
            Ok(queue_response) => {
                let response_json = serialize_ipc_payload(&queue_response);
                let _ = writer.write_all(response_json.as_bytes()).await;
                let _ = writer.write_all(b"\n").await;

                // Wait for user response using async notification
                if let Some(response) = auth_state
                    .wait_for_prompt_response(
                        &session_id,
                        &queue_response.prompt_id,
                        ASKPASS_RESPONSE_TIMEOUT,
                    )
                    .await
                {
                    let body = PromptResponseBody {
                        username: response.username,
                        secret: response.secret,
                    };
                    let response_json = serialize_ipc_payload(&body);
                    let _ = writer.write_all(response_json.as_bytes()).await;
                    let _ = writer.write_all(b"\n").await;
                    return;
                }

                // Timeout or error
                let error = ErrorResponse {
                    error: "Timeout or cancelled waiting for user response".to_string(),
                    code: 408,
                };
                let response_json = serialize_ipc_payload(&error);
                let _ = writer.write_all(response_json.as_bytes()).await;
                let _ = writer.write_all(b"\n").await;
            }
            Err(error) => {
                let response_json = serialize_ipc_payload(&error);
                let _ = writer.write_all(response_json.as_bytes()).await;
                let _ = writer.write_all(b"\n").await;
            }
        }
    } else if let Ok(request) = serde_json::from_str::<GetResponseRequest>(&line) {
        let response_json = match handle_get_response(request, &auth_state).await {
            Ok(response) => serialize_ipc_payload(&response),
            Err(error) => serialize_ipc_payload(&error),
        };
        let _ = writer.write_all(response_json.as_bytes()).await;
        let _ = writer.write_all(b"\n").await;
    } else {
        let error = ErrorResponse {
            error: "Invalid request format".to_string(),
            code: 400,
        };
        let response_json = serialize_ipc_payload(&error);
        let _ = writer.write_all(response_json.as_bytes()).await;
        let _ = writer.write_all(b"\n").await;
    }
}

#[cfg(windows)]
async fn start_windows_server(
    app_handle: tauri::AppHandle,
    auth_state: Arc<GitAuthBrokerState>,
) -> Result<PathBuf, String> {
    let pipe_name = format!(
        r"\\.\pipe\litgit-askpass-{}-{}",
        std::process::id(),
        random_token()
    );
    let pipe_path = PathBuf::from(&pipe_name);

    // Create the first server instance
    let server = create_windows_pipe(&pipe_name, true)?;

    let pipe_name_clone = pipe_name.clone();

    // Spawn the server loop
    tokio::spawn(async move {
        let mut server = server;
        loop {
            // Wait for client connection
            match server.connect().await {
                Ok(_) => {
                    let auth_state = auth_state.clone();
                    let app_handle = app_handle.clone();
                    let pipe_name_inner = pipe_name_clone.clone();

                    // Spawn handler for this connection
                    tokio::spawn(async move {
                        let _ = handle_windows_connection(server, auth_state, app_handle).await;
                    });

                    // Create a new server instance for the next connection
                    match create_windows_pipe(&pipe_name_inner, false) {
                        Ok(new_server) => {
                            server = new_server;
                        }
                        Err(e) => {
                            log::error!("Failed to create new pipe instance: {}", e);
                            return;
                        }
                    }
                }
                Err(e) => {
                    log::error!("Failed to accept pipe connection: {}", e);
                    // Try to create a new server instance
                    match create_windows_pipe(&pipe_name_clone, false) {
                        Ok(new_server) => server = new_server,
                        Err(e) => {
                            log::error!("Failed to recreate pipe: {}", e);
                            return;
                        }
                    }
                }
            }
        }
    });

    Ok(pipe_path)
}

#[cfg(windows)]
fn create_windows_pipe(
    pipe_name: &str,
    is_first_instance: bool,
) -> Result<NamedPipeServer, String> {
    let mut options = ServerOptions::new();
    if is_first_instance {
        options.first_pipe_instance(true);
    }

    options
        .reject_remote_clients(true)
        .create(pipe_name)
        .map_err(|e| format!("Failed to create named pipe: {}", e))
}

#[cfg(windows)]
async fn handle_windows_connection(
    mut stream: NamedPipeServer,
    auth_state: Arc<GitAuthBrokerState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let mut buffer = vec![0u8; 4096];
    let mut line = String::new();

    // Read request
    loop {
        match stream.read(&mut buffer).await {
            Ok(0) => break,
            Ok(n) => {
                line.push_str(&String::from_utf8_lossy(&buffer[..n]));
                if line.contains('\n') {
                    break;
                }
            }
            Err(e) => {
                let error_response = ErrorResponse {
                    error: format!("Failed to read request: {}", e),
                    code: 400,
                };
                let response_json = serialize_ipc_payload(&error_response);
                let _ = stream.write_all(response_json.as_bytes()).await;
                return Err(format!("Read error: {}", e));
            }
        }
    }

    // Try to parse as QueuePromptRequest first
    if let Ok(request) = serde_json::from_str::<QueuePromptRequest>(&line) {
        let session_id = request.session_id.clone();
        match handle_queue_prompt(request, &auth_state, &app_handle).await {
            Ok(queue_response) => {
                let response_json = serialize_ipc_payload(&queue_response);
                let _ = stream.write_all(response_json.as_bytes()).await;
                let _ = stream.write_all(b"\n").await;

                // Wait for user response using async notification
                if let Some(response) = auth_state
                    .wait_for_prompt_response(
                        &session_id,
                        &queue_response.prompt_id,
                        ASKPASS_RESPONSE_TIMEOUT,
                    )
                    .await
                {
                    let body = PromptResponseBody {
                        username: response.username,
                        secret: response.secret,
                    };
                    let response_json = serialize_ipc_payload(&body);
                    let _ = stream.write_all(response_json.as_bytes()).await;
                    let _ = stream.write_all(b"\n").await;
                    return Ok(());
                }

                // Timeout or error
                let error = ErrorResponse {
                    error: "Timeout or cancelled waiting for user response".to_string(),
                    code: 408,
                };
                let response_json = serialize_ipc_payload(&error);
                let _ = stream.write_all(response_json.as_bytes()).await;
                let _ = stream.write_all(b"\n").await;
            }
            Err(error) => {
                let response_json = serialize_ipc_payload(&error);
                let _ = stream.write_all(response_json.as_bytes()).await;
                let _ = stream.write_all(b"\n").await;
            }
        }
    } else if let Ok(request) = serde_json::from_str::<GetResponseRequest>(&line) {
        let response_json = match handle_get_response(request, &auth_state).await {
            Ok(response) => serialize_ipc_payload(&response),
            Err(error) => serialize_ipc_payload(&error),
        };
        let _ = stream.write_all(response_json.as_bytes()).await;
        let _ = stream.write_all(b"\n").await;
    } else {
        let error = ErrorResponse {
            error: "Invalid request format".to_string(),
            code: 400,
        };
        let response_json = serialize_ipc_payload(&error);
        let _ = stream.write_all(response_json.as_bytes()).await;
        let _ = stream.write_all(b"\n").await;
    }

    Ok(())
}

/// Handles a queue prompt request
async fn handle_queue_prompt(
    request: QueuePromptRequest,
    auth_state: &GitAuthBrokerState,
    app_handle: &tauri::AppHandle,
) -> Result<QueuePromptResponse, ErrorResponse> {
    // Verify the session secret
    if !auth_state.verify_session_secret(&request.session_id, &request.secret) {
        return Err(ErrorResponse {
            error: "Invalid session or secret".to_string(),
            code: 401,
        });
    }

    // Classify the prompt
    let kind = classify_prompt_kind(&request.prompt);
    let allow_remember = allow_remember_for_kind(kind);

    // Queue the prompt
    let prompt_id = match auth_state.queue_prompt(
        &request.session_id,
        &request.prompt,
        request.host.as_deref(),
        request.username.as_deref(),
    ) {
        Ok(id) => id,
        Err(e) => {
            return Err(ErrorResponse {
                error: format!("Failed to queue prompt: {}", e),
                code: 500,
            });
        }
    };

    // Get the operation type
    let operation = auth_state
        .get_session_operation(&request.session_id)
        .unwrap_or_else(|| "git-operation".to_string());

    // Emit event to frontend
    let payload = GitAuthPromptPayload {
        session_id: request.session_id.clone(),
        prompt_id: prompt_id.clone(),
        operation,
        prompt: request.prompt.clone(),
        host: request.host.clone(),
        username: request.username.clone(),
        kind: kind.to_string(),
        allow_remember,
    };

    if let Err(e) = emit_git_auth_prompt(app_handle, &payload) {
        return Err(ErrorResponse {
            error: format!("Failed to emit event: {}", e),
            code: 500,
        });
    }

    Ok(QueuePromptResponse { prompt_id })
}

/// Handles a get response request
async fn handle_get_response(
    request: GetResponseRequest,
    auth_state: &GitAuthBrokerState,
) -> Result<PromptResponseBody, ErrorResponse> {
    // Verify the session secret
    if !auth_state.verify_session_secret(&request.session_id, &request.secret) {
        return Err(ErrorResponse {
            error: "Invalid session or secret".to_string(),
            code: 401,
        });
    }

    // Try to get the response
    if let Some(response) = auth_state.take_prompt_response(&request.session_id, &request.prompt_id)
    {
        if response.cancelled {
            return Err(ErrorResponse {
                error: "Authentication cancelled".to_string(),
                code: 499,
            });
        }

        Ok(PromptResponseBody {
            username: response.username,
            secret: response.secret,
        })
    } else {
        Err(ErrorResponse {
            error: "No response found".to_string(),
            code: 404,
        })
    }
}

/// Generates a random alphanumeric token
fn random_token() -> String {
    crate::random_token()
}

#[cfg(test)]
mod tests {
    use super::{
        serialize_ipc_payload, ErrorResponse, PromptResponseBody, QueuePromptRequest,
        QueuePromptResponse,
    };
    use serde_json::json;

    struct FailingPayload;

    impl serde::Serialize for FailingPayload {
        fn serialize<S>(&self, _serializer: S) -> Result<S::Ok, S::Error>
        where
            S: serde::Serializer,
        {
            Err(serde::ser::Error::custom("boom"))
        }
    }

    #[test]
    fn queue_prompt_response_serializes_correctly() {
        let response = QueuePromptResponse {
            prompt_id: "test-prompt-123".to_string(),
        };

        let json_str = serde_json::to_string(&response).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json_str).unwrap();

        assert_eq!(value, json!({"promptId":"test-prompt-123"}));
    }

    #[test]
    fn prompt_response_body_serializes_correctly() {
        let body = PromptResponseBody {
            username: Some("test-user".to_string()),
            secret: Some("test-pass".to_string()),
        };

        let json_str = serde_json::to_string(&body).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json_str).unwrap();

        assert_eq!(value, json!({"username":"test-user","secret":"test-pass"}));
    }

    #[test]
    fn error_response_serializes_correctly() {
        let error = ErrorResponse {
            error: "Test error".to_string(),
            code: 401,
        };

        let json_str = serde_json::to_string(&error).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json_str).unwrap();

        assert_eq!(value, json!({"error":"Test error","code":401}));
    }

    #[test]
    fn queue_prompt_request_deserializes_correctly() {
        let json_str = r#"{"sessionId":"test-session","secret":"test-secret","prompt":"Password for 'https://github.com':","host":"github.com","username":null}"#;
        let request: QueuePromptRequest = serde_json::from_str(json_str).unwrap();

        assert_eq!(request.session_id, "test-session");
        assert_eq!(request.secret, "test-secret");
        assert_eq!(request.prompt, "Password for 'https://github.com':");
        assert_eq!(request.host, Some("github.com".to_string()));
        assert_eq!(request.username, None);
    }

    #[test]
    fn queue_prompt_request_without_optional_fields_deserializes_correctly() {
        let json_str =
            r#"{"sessionId":"test-session","secret":"test-secret","prompt":"Password:"}"#;
        let request: QueuePromptRequest = serde_json::from_str(json_str).unwrap();

        assert_eq!(request.session_id, "test-session");
        assert_eq!(request.secret, "test-secret");
        assert_eq!(request.prompt, "Password:");
        assert_eq!(request.host, None);
        assert_eq!(request.username, None);
    }

    #[test]
    fn serialize_ipc_payload_returns_error_payload_when_serialization_fails() {
        let json_str = serialize_ipc_payload(&FailingPayload);
        let value: serde_json::Value = serde_json::from_str(&json_str).unwrap();

        assert_eq!(value.get("code"), Some(&json!(500)));
        assert_eq!(
            value.get("error").and_then(serde_json::Value::as_str),
            Some("Failed to serialize response: boom")
        );
    }
}
