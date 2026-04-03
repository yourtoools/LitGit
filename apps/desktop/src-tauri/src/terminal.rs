use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::env;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use thiserror::Error;

const DEFAULT_TERMINAL_ROWS: u16 = 24;
const DEFAULT_TERMINAL_COLS: u16 = 80;
const TERMINAL_READ_BUFFER_SIZE: usize = 8192;

static NEXT_TERMINAL_SESSION_ID: AtomicUsize = AtomicUsize::new(1);

pub(crate) struct TerminalSession {
    child: Box<dyn portable_pty::Child + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
}

#[derive(Default)]
/// Shared terminal session registry for interactive shell sessions.
pub(crate) struct TerminalState {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalOutputPayload {
    data: String,
}

#[derive(Debug, Error)]
enum TerminalError {
    #[error("{0}")]
    Message(String),
    #[error("Failed to {action}: {detail}")]
    Io {
        action: &'static str,
        detail: String,
    },
}

fn default_shell() -> String {
    if cfg!(windows) {
        env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    } else {
        env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

fn resolve_terminal_cwd(cwd: &str) -> Result<Option<PathBuf>, TerminalError> {
    let trimmed_cwd = cwd.trim();
    if trimmed_cwd.is_empty() {
        return Ok(None);
    }

    let cwd_path = PathBuf::from(trimmed_cwd);

    if !cwd_path.exists() {
        return Err(TerminalError::Message(
            "Terminal working directory does not exist".to_string(),
        ));
    }

    if !cwd_path.is_dir() {
        return Err(TerminalError::Message(
            "Terminal working directory is not a folder".to_string(),
        ));
    }

    Ok(Some(cwd_path))
}

#[tauri::command]
/// Creates a new interactive shell session and returns its session identifier.
pub(crate) fn create_terminal_session(
    app: AppHandle,
    state: State<'_, TerminalState>,
    cwd: String,
) -> Result<String, String> {
    create_terminal_session_inner(app, state, cwd).map_err(|e| e.to_string())
}

fn create_terminal_session_inner(
    app: AppHandle,
    state: State<'_, TerminalState>,
    cwd: String,
) -> Result<String, TerminalError> {
    let pty_system = native_pty_system();
    let pty_pair = pty_system
        .openpty(PtySize {
            rows: DEFAULT_TERMINAL_ROWS,
            cols: DEFAULT_TERMINAL_COLS,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| TerminalError::Io {
            action: "open pty",
            detail: error.to_string(),
        })?;

    let mut command = CommandBuilder::new(default_shell());

    if let Some(cwd_path) = resolve_terminal_cwd(&cwd)? {
        command.cwd(cwd_path);
    }

    let child = pty_pair
        .slave
        .spawn_command(command)
        .map_err(|error| TerminalError::Io {
            action: "start shell",
            detail: error.to_string(),
        })?;
    let writer = pty_pair
        .master
        .take_writer()
        .map_err(|error| TerminalError::Io {
            action: "create terminal writer",
            detail: error.to_string(),
        })?;
    let mut reader = pty_pair
        .master
        .try_clone_reader()
        .map_err(|error| TerminalError::Io {
            action: "create terminal reader",
            detail: error.to_string(),
        })?;

    let session_id = format!(
        "terminal-{}",
        NEXT_TERMINAL_SESSION_ID.fetch_add(1, Ordering::Relaxed)
    );
    let event_name = format!("terminal-output:{session_id}");
    let output_app = app.clone();

    std::thread::spawn(move || {
        let mut buffer = vec![0_u8; TERMINAL_READ_BUFFER_SIZE];

        loop {
            let bytes_read = match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(size) => size,
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
        .map_err(|_| TerminalError::Message("Failed to acquire terminal state lock".to_string()))?;

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
/// Writes input data to an active terminal session.
pub(crate) fn write_terminal_session(
    state: State<'_, TerminalState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    write_terminal_session_inner(state, session_id, data).map_err(|e| e.to_string())
}

fn write_terminal_session_inner(
    state: State<'_, TerminalState>,
    session_id: String,
    data: String,
) -> Result<(), TerminalError> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| TerminalError::Message("Failed to acquire terminal state lock".to_string()))?;

    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| TerminalError::Message("Terminal session not found".to_string()))?;

    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|error| TerminalError::Io {
            action: "write to terminal",
            detail: error.to_string(),
        })?;
    session.writer.flush().map_err(|error| TerminalError::Io {
        action: "flush terminal input",
        detail: error.to_string(),
    })?;

    Ok(())
}

#[tauri::command]
/// Resizes an active terminal session pseudo-terminal.
pub(crate) fn resize_terminal_session(
    state: State<'_, TerminalState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    resize_terminal_session_inner(state, session_id, cols, rows).map_err(|e| e.to_string())
}

fn resize_terminal_session_inner(
    state: State<'_, TerminalState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), TerminalError> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| TerminalError::Message("Failed to acquire terminal state lock".to_string()))?;

    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| TerminalError::Message("Terminal session not found".to_string()))?;

    session
        .master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| TerminalError::Io {
            action: "resize terminal",
            detail: error.to_string(),
        })?;

    Ok(())
}

#[tauri::command]
/// Closes an active terminal session and terminates its child process.
pub(crate) fn close_terminal_session(
    state: State<'_, TerminalState>,
    session_id: String,
) -> Result<(), String> {
    close_terminal_session_inner(state, session_id).map_err(|e| e.to_string())
}

fn close_terminal_session_inner(
    state: State<'_, TerminalState>,
    session_id: String,
) -> Result<(), TerminalError> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| TerminalError::Message("Failed to acquire terminal state lock".to_string()))?;

    let mut session = sessions
        .remove(&session_id)
        .ok_or_else(|| TerminalError::Message("Terminal session not found".to_string()))?;

    let _ = session.child.kill();
    let _ = session.child.wait();

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::resolve_terminal_cwd;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_temp_path(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time should move forward")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "litgit-terminal-{name}-{}-{timestamp}",
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
    fn resolve_terminal_cwd_returns_none_when_input_is_blank() {
        assert!(resolve_terminal_cwd("   ")
            .expect("blank cwd should succeed")
            .is_none());
    }

    #[test]
    fn resolve_terminal_cwd_returns_directory_when_path_exists() {
        let temp_dir = create_temp_dir("existing-dir");

        let cwd = resolve_terminal_cwd(temp_dir.to_string_lossy().as_ref())
            .expect("existing cwd should resolve");

        assert_eq!(cwd.as_deref(), Some(temp_dir.as_path()));

        remove_temp_path(&temp_dir);
    }

    #[test]
    fn resolve_terminal_cwd_returns_error_when_directory_does_not_exist() {
        let missing_path = create_temp_path("missing-dir");

        assert_eq!(
            resolve_terminal_cwd(missing_path.to_string_lossy().as_ref())
                .unwrap_err()
                .to_string(),
            "Terminal working directory does not exist"
        );
    }

    #[test]
    fn resolve_terminal_cwd_returns_error_when_path_is_not_a_directory() {
        let temp_dir = create_temp_dir("file-path");
        let file_path = temp_dir.join("cwd.txt");
        fs::write(&file_path, "cwd").expect("temp file should be written");

        assert_eq!(
            resolve_terminal_cwd(file_path.to_string_lossy().as_ref())
                .unwrap_err()
                .to_string(),
            "Terminal working directory is not a folder"
        );

        remove_temp_path(&temp_dir);
    }
}
