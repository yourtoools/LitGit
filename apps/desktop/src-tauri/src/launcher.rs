use crate::git_support::validate_repository_path;
use serde::Serialize;
use std::path::{Path, PathBuf};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherApp {
    id: String,
    label: String,
}

fn launcher_app(id: &str, label: &str) -> LauncherApp {
    LauncherApp {
        id: id.to_string(),
        label: label.to_string(),
    }
}

fn path_entries() -> Vec<PathBuf> {
    std::env::var_os("PATH")
        .map(|value| std::env::split_paths(&value).collect())
        .unwrap_or_default()
}

fn resolve_from_candidates(
    path_candidates: &[&str],
    absolute_candidates: &[&str],
) -> Option<PathBuf> {
    let path_dirs = path_entries();

    for candidate in path_candidates {
        for path_dir in &path_dirs {
            let resolved = path_dir.join(candidate);

            if resolved.exists() {
                return Some(resolved);
            }
        }
    }

    for candidate in absolute_candidates {
        let path = PathBuf::from(candidate);

        if path.exists() {
            return Some(path);
        }
    }

    None
}

fn launch_command(command: &mut std::process::Command) -> Result<(), String> {
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to launch process: {error}"))
}

#[cfg(windows)]
fn quoted_powershell_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

#[cfg(windows)]
fn quoted_powershell_array(values: &[String]) -> String {
    let quoted_values = values
        .iter()
        .map(|value| quoted_powershell_literal(value))
        .collect::<Vec<_>>()
        .join(", ");

    format!("@({quoted_values})")
}

#[cfg(windows)]
fn launch_hidden_windows_command(command: &mut std::process::Command) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    command.creation_flags(CREATE_NO_WINDOW);
    launch_command(command)
}

#[cfg(windows)]
fn launch_windows_start_process(
    executable: &Path,
    repo_path: &str,
    arguments: &[String],
) -> Result<(), String> {
    let executable_string = executable.to_string_lossy().into_owned();
    let argument_list = quoted_powershell_array(arguments);
    let command_text = format!(
        "Start-Process -FilePath {} -WorkingDirectory {} -ArgumentList {}",
        quoted_powershell_literal(&executable_string),
        quoted_powershell_literal(repo_path),
        argument_list
    );
    let mut command = std::process::Command::new("powershell.exe");
    command.args(["-NoProfile", "-Command", &command_text]);
    launch_hidden_windows_command(&mut command)
}

#[cfg(windows)]
fn resolve_windows_editor_executable(id: &str) -> Option<PathBuf> {
    match id {
        "antigravity" => resolve_from_candidates(
            &["antigravity.exe", "Antigravity.exe", "antigravity.cmd"],
            &[
                r"C:\Program Files\Antigravity\Antigravity.exe",
                r"C:\Users\Default\AppData\Local\Programs\Antigravity\Antigravity.exe",
            ],
        ),
        "git-bash" => resolve_from_candidates(
            &["git-bash.exe"],
            &[
                r"C:\Program Files\Git\git-bash.exe",
                r"C:\Program Files (x86)\Git\git-bash.exe",
            ],
        ),
        "visual-studio" => resolve_from_candidates(
            &["devenv.exe"],
            &[
                r"C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\devenv.exe",
                r"C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\IDE\devenv.exe",
                r"C:\Program Files\Microsoft Visual Studio\2022\Enterprise\Common7\IDE\devenv.exe",
            ],
        ),
        "vscode" => {
            let resolved = resolve_from_candidates(
                &["code.exe", "Code.exe", "code.cmd"],
                &[
                    r"C:\Program Files\Microsoft VS Code\Code.exe",
                    r"C:\Program Files\Microsoft VS Code Insiders\Code - Insiders.exe",
                ],
            );

            if resolved.is_some() {
                return resolved;
            }

            let local_app_data = std::env::var_os("LOCALAPPDATA")?;
            let local_candidate = PathBuf::from(local_app_data)
                .join("Programs")
                .join("Microsoft VS Code")
                .join("Code.exe");

            local_candidate.exists().then_some(local_candidate)
        }
        "wsl" => resolve_from_candidates(&["wsl.exe"], &[r"C:\Windows\System32\wsl.exe"]),
        _ => None,
    }
}

#[cfg(windows)]
fn normalize_windows_editor_executable(id: &str, executable: PathBuf) -> PathBuf {
    let extension = executable
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());

    if !matches!(extension.as_deref(), Some("cmd") | Some("bat")) {
        return executable;
    }

    let parent_dir = match executable.parent() {
        Some(parent) => parent,
        None => return executable,
    };
    let app_dir = match parent_dir.parent() {
        Some(parent) => parent,
        None => return executable,
    };

    let candidate_names: &[&str] = match id {
        "antigravity" => &["Antigravity.exe"],
        "vscode" => &["Code.exe", "Code - Insiders.exe"],
        _ => &[],
    };

    for candidate in candidate_names {
        let sibling_executable = app_dir.join(candidate);

        if sibling_executable.exists() {
            return sibling_executable;
        }
    }

    executable
}

#[cfg(windows)]
fn resolve_windows_powershell() -> Option<PathBuf> {
    resolve_from_candidates(
        &["pwsh.exe", "powershell.exe"],
        &[
            r"C:\Program Files\PowerShell\7\pwsh.exe",
            r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
        ],
    )
}

#[cfg(windows)]
fn windows_path_to_wsl(path: &str) -> Option<String> {
    let normalized = path.replace('\\', "/");
    let bytes = normalized.as_bytes();

    if bytes.len() < 3 || bytes[1] != b':' || bytes[2] != b'/' {
        return None;
    }

    let drive = normalized.chars().next()?.to_ascii_lowercase();
    let remainder = normalized.get(3..).unwrap_or_default();

    if remainder.is_empty() {
        return Some(format!("/mnt/{drive}"));
    }

    Some(format!("/mnt/{drive}/{remainder}"))
}

#[cfg(windows)]
fn launch_windows_editor(id: &str, repo_path: &str) -> Result<(), String> {
    let executable = resolve_windows_editor_executable(id)
        .ok_or_else(|| format!("{id} executable was not found on this machine"))?;
    let executable = normalize_windows_editor_executable(id, executable);
    let extension = executable
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());

    if matches!(extension.as_deref(), Some("cmd") | Some("bat")) {
        let mut command = std::process::Command::new("cmd.exe");
        command.current_dir(repo_path).args([
            "/c",
            "start",
            "",
            executable.to_string_lossy().as_ref(),
        ]);

        if id == "vscode" {
            command.arg("--new-window");
        }

        command.arg(repo_path);

        return launch_hidden_windows_command(&mut command);
    }

    let launch_target = executable.clone();

    if id == "git-bash" {
        let executable_string = launch_target.to_string_lossy().into_owned();
        let mut command = std::process::Command::new("cmd.exe");
        command.current_dir(repo_path).args([
            "/c",
            "start",
            "",
            &executable_string,
            &format!("--cd={repo_path}"),
        ]);
        return launch_hidden_windows_command(&mut command);
    }

    let mut command = std::process::Command::new(executable);
    command.current_dir(repo_path);

    match id {
        "vscode" => {
            command.args(["--new-window", repo_path]);
        }
        "wsl" => {
            let wsl_path = windows_path_to_wsl(repo_path)
                .ok_or_else(|| "Failed to convert repository path for WSL".to_string())?;
            return launch_windows_start_process(
                &launch_target,
                repo_path,
                &["--cd".to_string(), wsl_path],
            );
        }
        _ => {
            command.arg(repo_path);
        }
    }

    launch_command(&mut command)
}

#[cfg(windows)]
fn available_launcher_apps() -> Vec<LauncherApp> {
    let mut launchers = vec![launcher_app("file-manager", "File Explorer")];

    if resolve_windows_powershell().is_some() {
        launchers.push(launcher_app("terminal", "PowerShell"));
    }

    for (id, label) in [
        ("vscode", "VS Code"),
        ("visual-studio", "Visual Studio"),
        ("antigravity", "Antigravity"),
        ("git-bash", "Git Bash"),
        ("wsl", "WSL"),
    ] {
        if resolve_windows_editor_executable(id).is_some() {
            launchers.push(launcher_app(id, label));
        }
    }

    launchers
}

#[cfg(windows)]
fn open_path_with_windows_application(application: &str, repo_path: &str) -> Result<(), String> {
    match application {
        "file-manager" => {
            let mut command = std::process::Command::new("explorer.exe");
            command.arg(repo_path);
            launch_command(&mut command)
        }
        "terminal" => {
            let executable = resolve_windows_powershell()
                .ok_or_else(|| "PowerShell executable was not found on this machine".to_string())?;
            let executable_string = executable.to_string_lossy().into_owned();
            let command_text = format!(
                "Start-Process -FilePath {} -WorkingDirectory {}",
                quoted_powershell_literal(&executable_string),
                quoted_powershell_literal(repo_path)
            );
            let mut command = std::process::Command::new("powershell.exe");
            command.args(["-NoProfile", "-Command", &command_text]);
            launch_hidden_windows_command(&mut command)
        }
        "antigravity" | "git-bash" | "visual-studio" | "vscode" | "wsl" => {
            launch_windows_editor(application, repo_path)
        }
        _ => Err("Unsupported launcher application".to_string()),
    }
}

#[cfg(target_os = "macos")]
fn macos_app_path_exists(app_name: &str) -> bool {
    PathBuf::from("/Applications")
        .join(format!("{app_name}.app"))
        .exists()
}

#[cfg(target_os = "macos")]
fn available_launcher_apps() -> Vec<LauncherApp> {
    let mut launchers = vec![
        launcher_app("file-manager", "Finder"),
        launcher_app("terminal", "Terminal"),
    ];

    for (id, label, app_name) in [
        ("vscode", "VS Code", "Visual Studio Code"),
        ("antigravity", "Antigravity", "Antigravity"),
    ] {
        if macos_app_path_exists(app_name) {
            launchers.push(launcher_app(id, label));
        }
    }

    launchers
}

#[cfg(target_os = "macos")]
fn open_path_with_macos_application(application: &str, repo_path: &str) -> Result<(), String> {
    match application {
        "file-manager" => {
            let mut command = std::process::Command::new("open");
            command.arg(repo_path);
            launch_command(&mut command)
        }
        "terminal" => {
            let command_text = format!(
                "tell application \"Terminal\"\nactivate\ndo script \"cd {}\"\nend tell",
                repo_path.replace('\\', "\\\\").replace('"', "\\\"")
            );
            let mut command = std::process::Command::new("osascript");
            command.args(["-e", &command_text]);
            launch_command(&mut command)
        }
        "vscode" => {
            let mut command = std::process::Command::new("open");
            command.args([
                "-a",
                "Visual Studio Code",
                repo_path,
                "--args",
                "--new-window",
            ]);
            launch_command(&mut command)
        }
        "antigravity" => {
            let mut command = std::process::Command::new("open");
            command.args(["-a", "Antigravity", repo_path]);
            launch_command(&mut command)
        }
        _ => return Err("Unsupported launcher application".to_string()),
    }
}

#[cfg(target_os = "linux")]
fn resolve_linux_editor_executable(id: &str) -> Option<PathBuf> {
    match id {
        "antigravity" => resolve_from_candidates(&["antigravity"], &[]),
        "vscode" => resolve_from_candidates(&["code", "codium"], &[]),
        _ => None,
    }
}

#[cfg(target_os = "linux")]
fn resolve_linux_terminal() -> Option<PathBuf> {
    resolve_from_candidates(
        &[
            "x-terminal-emulator",
            "gnome-terminal",
            "ptyxis",
            "konsole",
            "kitty",
            "alacritty",
            "wezterm",
            "xfce4-terminal",
            "tilix",
        ],
        &[],
    )
}

#[cfg(target_os = "linux")]
fn available_launcher_apps() -> Vec<LauncherApp> {
    let mut launchers = Vec::new();

    if resolve_from_candidates(&["xdg-open"], &[]).is_some() {
        launchers.push(launcher_app("file-manager", "Files"));
    }

    if resolve_linux_terminal().is_some() {
        launchers.push(launcher_app("terminal", "Terminal"));
    }

    for (id, label) in [("vscode", "VS Code"), ("antigravity", "Antigravity")] {
        if resolve_linux_editor_executable(id).is_some() {
            launchers.push(launcher_app(id, label));
        }
    }

    launchers
}

#[cfg(target_os = "linux")]
fn open_path_with_linux_application(application: &str, repo_path: &str) -> Result<(), String> {
    match application {
        "file-manager" => {
            let mut command = std::process::Command::new("xdg-open");
            command.arg(repo_path);
            launch_command(&mut command)
        }
        "terminal" => {
            let executable = resolve_linux_terminal()
                .ok_or_else(|| "A supported terminal executable was not found".to_string())?;
            let executable_name = executable
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_string();
            let mut command = std::process::Command::new(executable);

            match executable_name.as_str() {
                "gnome-terminal" => {
                    command.arg(format!("--working-directory={repo_path}"));
                }
                "ptyxis" => {
                    command.arg(format!("--working-directory={repo_path}"));
                }
                "konsole" => {
                    command.args(["--workdir", repo_path]);
                }
                "xfce4-terminal" => {
                    command.args(["--working-directory", repo_path]);
                }
                "tilix" => {
                    command.args(["--working-directory", repo_path]);
                }
                "kitty" => {
                    command.args(["--directory", repo_path]);
                }
                "alacritty" => {
                    command.args(["--working-directory", repo_path]);
                }
                "wezterm" => {
                    command.args(["start", "--cwd", repo_path]);
                }
                _ => {
                    command.args(["--working-directory", repo_path]);
                }
            }

            launch_command(&mut command)
        }
        "antigravity" | "vscode" => {
            let executable = resolve_linux_editor_executable(application)
                .ok_or_else(|| format!("{application} executable was not found"))?;
            let mut command = std::process::Command::new(executable);

            if application == "vscode" {
                command
                    .current_dir(repo_path)
                    .args(["--new-window", repo_path]);
            } else {
                command.current_dir(repo_path).arg(repo_path);
            }

            launch_command(&mut command)
        }
        _ => Err("Unsupported launcher application".to_string()),
    }
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
fn available_launcher_apps() -> Vec<LauncherApp> {
    Vec::new()
}

#[tauri::command]
pub fn get_launcher_applications() -> Vec<LauncherApp> {
    available_launcher_apps()
}

#[tauri::command]
pub fn open_path_with_application(application: String, path: String) -> Result<(), String> {
    let trimmed_path = path.trim();

    if trimmed_path.is_empty() {
        return Err("Path is required".to_string());
    }

    validate_repository_path(Path::new(trimmed_path))?;

    #[cfg(windows)]
    {
        return open_path_with_windows_application(&application, trimmed_path);
    }

    #[cfg(target_os = "macos")]
    {
        return open_path_with_macos_application(&application, trimmed_path);
    }

    #[cfg(target_os = "linux")]
    {
        return open_path_with_linux_application(&application, trimmed_path);
    }

    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        let _ = application;
        Err("Open with is not supported on this platform".to_string())
    }
}
