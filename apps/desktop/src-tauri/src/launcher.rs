use crate::git_support::validate_launcher_repository_root;
use serde::Serialize;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherApp {
    id: String,
    label: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LauncherApplicationId {
    FileManager,
    Terminal,
    VsCode,
    VisualStudio,
    Antigravity,
    GitBash,
    Wsl,
    Cursor,
}

#[derive(Debug, Error)]
enum LauncherError {
    #[error("Path is required")]
    PathRequired,
    #[error("Unsupported launcher application")]
    UnsupportedApplication,
    #[error("{0}")]
    Message(String),
    #[error("Failed to launch process: {0}")]
    Launch(#[from] std::io::Error),
}

impl LauncherError {
    fn path_required() -> Self {
        Self::PathRequired
    }

    fn unsupported_application() -> Self {
        Self::UnsupportedApplication
    }

    fn message(message: impl Into<String>) -> Self {
        Self::Message(message.into())
    }
}

impl LauncherApplicationId {
    fn parse(value: &str) -> Result<Self, LauncherError> {
        match value {
            "file-manager" => Ok(Self::FileManager),
            "terminal" => Ok(Self::Terminal),
            "vscode" => Ok(Self::VsCode),
            "visual-studio" => Ok(Self::VisualStudio),
            "antigravity" => Ok(Self::Antigravity),
            "git-bash" => Ok(Self::GitBash),
            "wsl" => Ok(Self::Wsl),
            "cursor" => Ok(Self::Cursor),
            _ => Err(LauncherError::unsupported_application()),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::FileManager => "file-manager",
            Self::Terminal => "terminal",
            Self::VsCode => "vscode",
            Self::VisualStudio => "visual-studio",
            Self::Antigravity => "antigravity",
            Self::GitBash => "git-bash",
            Self::Wsl => "wsl",
            Self::Cursor => "cursor",
        }
    }
}

fn launcher_app(id: LauncherApplicationId, label: &str) -> LauncherApp {
    LauncherApp {
        id: id.as_str().to_string(),
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

fn launch_command(command: &mut std::process::Command) -> Result<(), LauncherError> {
    command.spawn()?;
    Ok(())
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
fn launch_hidden_windows_command(command: &mut std::process::Command) -> Result<(), LauncherError> {
    use std::os::windows::process::CommandExt;

    command.creation_flags(CREATE_NO_WINDOW);
    launch_command(command)
}

#[cfg(windows)]
fn launch_windows_start_process(
    executable: &Path,
    repo_path: &str,
    arguments: &[String],
) -> Result<(), LauncherError> {
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
fn resolve_windows_editor_executable(id: LauncherApplicationId) -> Option<PathBuf> {
    match id {
        LauncherApplicationId::Antigravity => resolve_from_candidates(
            &["antigravity.exe", "Antigravity.exe", "antigravity.cmd"],
            &[
                r"C:\Program Files\Antigravity\Antigravity.exe",
                r"C:\Users\Default\AppData\Local\Programs\Antigravity\Antigravity.exe",
            ],
        ),
        LauncherApplicationId::GitBash => resolve_from_candidates(
            &["git-bash.exe"],
            &[
                r"C:\Program Files\Git\git-bash.exe",
                r"C:\Program Files (x86)\Git\git-bash.exe",
            ],
        ),
        LauncherApplicationId::VisualStudio => resolve_from_candidates(
            &["devenv.exe"],
            &[
                r"C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\devenv.exe",
                r"C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\IDE\devenv.exe",
                r"C:\Program Files\Microsoft Visual Studio\2022\Enterprise\Common7\IDE\devenv.exe",
            ],
        ),
        LauncherApplicationId::VsCode => {
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
        LauncherApplicationId::Cursor => {
            let resolved = resolve_from_candidates(&["cursor.exe", "Cursor.exe", "cursor.cmd"], &[]);

            if resolved.is_some() {
                return resolved;
            }

            let local_app_data = std::env::var_os("LOCALAPPDATA")?;
            let local_candidate = PathBuf::from(local_app_data)
                .join("Programs")
                .join("cursor")
                .join("Cursor.exe");

            local_candidate.exists().then_some(local_candidate)
        }
        LauncherApplicationId::Wsl => {
            resolve_from_candidates(&["wsl.exe"], &[r"C:\Windows\System32\wsl.exe"])
        }
        LauncherApplicationId::FileManager | LauncherApplicationId::Terminal => None,
    }
}

#[cfg(windows)]
fn normalize_windows_editor_executable(id: LauncherApplicationId, executable: PathBuf) -> PathBuf {
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
        LauncherApplicationId::Antigravity => &["Antigravity.exe"],
        LauncherApplicationId::VsCode => &["Code.exe", "Code - Insiders.exe"],
        LauncherApplicationId::Cursor => &["Cursor.exe"],
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

#[cfg_attr(not(windows), allow(dead_code))]
fn windows_terminal_candidates() -> Vec<&'static str> {
    vec!["wt.exe", "wt"]
}

#[cfg_attr(not(windows), allow(dead_code))]
fn windows_terminal_user_specific_candidates() -> Vec<String> {
    let mut candidates = Vec::new();

    for base in [
        std::env::var_os("LOCALAPPDATA").map(|value| value.to_string_lossy().into_owned()),
        std::env::var_os("USERPROFILE")
            .map(|value| value.to_string_lossy().into_owned())
            .map(|value| format!(r"{value}\AppData\Local")),
    ] {
        let Some(base) = base else {
            continue;
        };

        let candidate = format!(r"{base}\Microsoft\WindowsApps\wt.exe");

        if !candidates.contains(&candidate) {
            candidates.push(candidate);
        }
    }

    candidates
}

#[cfg_attr(not(windows), allow(dead_code))]
fn windows_terminal_power_shell_candidates() -> Vec<&'static str> {
    vec!["pwsh.exe", "powershell.exe"]
}

#[cfg_attr(not(windows), allow(dead_code))]
fn windows_terminal_power_shell_absolute_candidates() -> Vec<&'static str> {
    vec![
        r"C:\Program Files\PowerShell\7\pwsh.exe",
        r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
    ]
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum WindowsTerminalResolutionCandidate {
    Path(&'static str),
    Absolute(String),
}

#[cfg_attr(not(windows), allow(dead_code))]
fn windows_terminal_resolution_candidates() -> Vec<WindowsTerminalResolutionCandidate> {
    let mut candidates = windows_terminal_candidates()
        .into_iter()
        .map(WindowsTerminalResolutionCandidate::Path)
        .collect::<Vec<_>>();

    candidates.extend(
        windows_terminal_user_specific_candidates()
            .into_iter()
            .map(WindowsTerminalResolutionCandidate::Absolute),
    );

    candidates.extend(
        windows_terminal_power_shell_candidates()
            .into_iter()
            .map(WindowsTerminalResolutionCandidate::Path),
    );

    candidates.extend(
        windows_terminal_power_shell_absolute_candidates()
            .into_iter()
            .map(|candidate| WindowsTerminalResolutionCandidate::Absolute(candidate.to_string())),
    );

    candidates
}

#[cfg_attr(not(windows), allow(dead_code))]
fn resolve_windows_terminal_from_candidates(
    candidates: &[WindowsTerminalResolutionCandidate],
) -> Option<PathBuf> {
    let path_dirs = path_entries();

    for candidate in candidates {
        match candidate {
            WindowsTerminalResolutionCandidate::Path(candidate) => {
                for path_dir in &path_dirs {
                    let resolved = path_dir.join(candidate);

                    if resolved.exists() {
                        return Some(resolved);
                    }
                }
            }
            WindowsTerminalResolutionCandidate::Absolute(candidate) => {
                let path = PathBuf::from(candidate);

                if path.exists() {
                    return Some(path);
                }
            }
        }
    }

    None
}

#[cfg(windows)]
fn resolve_windows_terminal() -> Option<PathBuf> {
    resolve_windows_terminal_from_candidates(&windows_terminal_resolution_candidates())
}

#[cfg_attr(not(windows), allow(dead_code))]
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

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn macos_terminal_script_lines() -> [&'static str; 6] {
    [
        "on run argv",
        "tell application \"Terminal\"",
        "activate",
        "do script \"cd \" & quoted form of item 1 of argv",
        "end tell",
        "end run",
    ]
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn macos_terminal_script_arguments(repo_path: &str) -> Vec<String> {
    let mut arguments = Vec::with_capacity((macos_terminal_script_lines().len() * 2) + 1);

    for line in macos_terminal_script_lines() {
        arguments.push("-e".to_string());
        arguments.push(line.to_string());
    }

    arguments.push(repo_path.to_string());
    arguments
}

#[cfg(target_os = "linux")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LinuxDesktopKind {
    Kde,
    Gnome,
    Cinnamon,
    Xfce,
    Tiling,
    Unknown,
}

#[cfg(target_os = "linux")]
#[derive(Debug, Clone, PartialEq, Eq)]
struct LinuxDesktopContext {
    kind: LinuxDesktopKind,
}

#[cfg(target_os = "linux")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[expect(clippy::enum_variant_names)]
enum LinuxFileManagerStrategy {
    KdeOpen,
    GioOpen,
    XdgOpen,
}

#[cfg(target_os = "linux")]
impl LinuxFileManagerStrategy {
    fn primary_command(self) -> &'static str {
        match self {
            Self::KdeOpen => "kioclient5",
            Self::GioOpen => "gio",
            Self::XdgOpen => "xdg-open",
        }
    }

    fn fallback_commands(self) -> &'static [&'static str] {
        match self {
            Self::KdeOpen => &["kioclient"],
            Self::GioOpen | Self::XdgOpen => &[],
        }
    }
}

#[cfg(target_os = "linux")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LinuxTerminalLaunchStrategy {
    DirectCommand,
    PluginOpener,
}

#[cfg(target_os = "linux")]
fn linux_runtime_config_home() -> PathBuf {
    std::env::var_os("XDG_CONFIG_HOME").map_or_else(
        || {
            std::env::var_os("HOME")
                .map(|home| PathBuf::from(home).join(".config"))
                .unwrap_or_default()
        },
        PathBuf::from,
    )
}

#[cfg(target_os = "linux")]
fn linux_desktop_kind_with(
    xdg_current_desktop: Option<&str>,
    xdg_session_desktop: Option<&str>,
    desktop_session: Option<&str>,
    gdm_session: Option<&str>,
    kde_full_session: Option<&str>,
    has_kde_globals: bool,
) -> LinuxDesktopKind {
    let kind = LinuxDesktopContext::kind_from_value(xdg_current_desktop)
        .or_else(|| LinuxDesktopContext::kind_from_value(xdg_session_desktop))
        .or_else(|| LinuxDesktopContext::kind_from_value(desktop_session))
        .or_else(|| LinuxDesktopContext::kind_from_value(gdm_session));

    if let Some(kind) = kind {
        return kind;
    }

    let kde_session =
        kde_full_session.is_some_and(|value| value.eq_ignore_ascii_case("true") || value == "1");

    if kde_session || has_kde_globals {
        LinuxDesktopKind::Kde
    } else {
        LinuxDesktopKind::Unknown
    }
}

#[cfg(target_os = "linux")]
fn apply_kde_child_environment(command: &mut std::process::Command) {
    command.env_remove("GTK_THEME");

    if std::env::var_os("XDG_CURRENT_DESKTOP").is_none() {
        command.env("XDG_CURRENT_DESKTOP", "KDE");
    }

    if std::env::var_os("XDG_SESSION_DESKTOP").is_none() {
        command.env("XDG_SESSION_DESKTOP", "KDE");
    }

    if std::env::var_os("DESKTOP_SESSION").is_none() {
        command.env("DESKTOP_SESSION", "plasma");
    }

    if std::env::var_os("KDE_FULL_SESSION").is_none() {
        command.env("KDE_FULL_SESSION", "true");
    }

    if std::env::var_os("KDE_SESSION_VERSION").is_none() {
        command.env("KDE_SESSION_VERSION", "6");
    }

    if std::env::var_os("QT_QPA_PLATFORMTHEME").is_none() {
        command.env("QT_QPA_PLATFORMTHEME", "kde");
    }
}

#[cfg(target_os = "linux")]
impl LinuxDesktopContext {
    #[cfg_attr(not(test), allow(dead_code))]
    fn from_values(
        xdg_current_desktop: Option<&str>,
        xdg_session_desktop: Option<&str>,
        desktop_session: Option<&str>,
    ) -> Self {
        let kind = Self::kind_from_value(xdg_current_desktop)
            .or_else(|| Self::kind_from_value(xdg_session_desktop))
            .or_else(|| Self::kind_from_value(desktop_session))
            .unwrap_or(LinuxDesktopKind::Unknown);

        Self { kind }
    }

    fn kind_from_value(value: Option<&str>) -> Option<LinuxDesktopKind> {
        let normalized = value?.to_ascii_lowercase();

        if normalized.contains("kde") || normalized.contains("plasma") {
            Some(LinuxDesktopKind::Kde)
        } else if normalized.contains("gnome")
            || matches!(
                normalized.as_str(),
                "mate" | "budgie" | "pantheon" | "deepin" | "unity" | "cosmic"
            )
        {
            Some(LinuxDesktopKind::Gnome)
        } else if normalized.contains("cinnamon") {
            Some(LinuxDesktopKind::Cinnamon)
        } else if normalized.contains("xfce") {
            Some(LinuxDesktopKind::Xfce)
        } else if matches!(
            normalized.as_str(),
            "niri"
                | "sway"
                | "swayfx"
                | "hyprland"
                | "river"
                | "i3"
                | "i3wm"
                | "bspwm"
                | "dwm"
                | "qtile"
                | "xmonad"
                | "leftwm"
                | "dwl"
                | "awesome"
                | "herbstluftwm"
                | "spectrwm"
                | "worm"
                | "i3-gnome"
        ) {
            Some(LinuxDesktopKind::Tiling)
        } else {
            None
        }
    }

    fn detect() -> Self {
        let xdg_current_desktop = std::env::var("XDG_CURRENT_DESKTOP").ok();
        let xdg_session_desktop = std::env::var("XDG_SESSION_DESKTOP").ok();
        let desktop_session = std::env::var("DESKTOP_SESSION").ok();
        let gdm_session = std::env::var("GDMSESSION").ok();
        let kde_full_session = std::env::var("KDE_FULL_SESSION").ok();
        let has_kde_globals = linux_runtime_config_home().join("kdeglobals").exists();

        Self {
            kind: linux_desktop_kind_with(
                xdg_current_desktop.as_deref(),
                xdg_session_desktop.as_deref(),
                desktop_session.as_deref(),
                gdm_session.as_deref(),
                kde_full_session.as_deref(),
                has_kde_globals,
            ),
        }
    }
}

#[cfg(windows)]
fn launch_windows_editor(
    application: LauncherApplicationId,
    repo_path: &str,
) -> Result<(), LauncherError> {
    let executable = resolve_windows_editor_executable(application).ok_or_else(|| {
        LauncherError::message(format!(
            "{} executable was not found on this machine",
            application.as_str()
        ))
    })?;
    let executable = normalize_windows_editor_executable(application, executable);
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

        if matches!(application, LauncherApplicationId::VsCode | LauncherApplicationId::Cursor) {
            command.arg("--new-window");
        }

        command.arg(repo_path);

        return launch_hidden_windows_command(&mut command);
    }

    let launch_target = executable.clone();

    if matches!(application, LauncherApplicationId::GitBash) {
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

    match application {
        LauncherApplicationId::VsCode | LauncherApplicationId::Cursor => {
            command.args(["--new-window", repo_path]);
        }
        LauncherApplicationId::Wsl => {
            let wsl_path = windows_path_to_wsl(repo_path).ok_or_else(|| {
                LauncherError::message("Failed to convert repository path for WSL")
            })?;
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
    let mut launchers = vec![launcher_app(
        LauncherApplicationId::FileManager,
        "File Explorer",
    )];

    if resolve_windows_terminal().is_some() {
        launchers.push(launcher_app(LauncherApplicationId::Terminal, "PowerShell"));
    }

    for (id, label) in [
        (LauncherApplicationId::VsCode, "VS Code"),
        (LauncherApplicationId::Cursor, "Cursor"),
        (LauncherApplicationId::VisualStudio, "Visual Studio"),
        (LauncherApplicationId::Antigravity, "Antigravity"),
        (LauncherApplicationId::GitBash, "Git Bash"),
        (LauncherApplicationId::Wsl, "WSL"),
    ] {
        if resolve_windows_editor_executable(id).is_some() {
            launchers.push(launcher_app(id, label));
        }
    }

    launchers
}

#[cfg(windows)]
fn open_path_with_windows_application(
    application: LauncherApplicationId,
    repo_path: &str,
) -> Result<(), LauncherError> {
    match application {
        LauncherApplicationId::Terminal => {
            let executable = resolve_windows_terminal().ok_or_else(|| {
                LauncherError::message(
                    "A supported terminal executable was not found on this machine",
                )
            })?;
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
        LauncherApplicationId::VsCode
        | LauncherApplicationId::Cursor
        | LauncherApplicationId::VisualStudio
        | LauncherApplicationId::Antigravity
        | LauncherApplicationId::GitBash
        | LauncherApplicationId::Wsl => launch_windows_editor(application, repo_path),
        LauncherApplicationId::FileManager => {
            let mut command = std::process::Command::new("explorer.exe");
            command.arg(repo_path);
            launch_command(&mut command)
        }
    }
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn macos_app_location_candidates(app_name: &str, home_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut candidates = vec![
        PathBuf::from("/Applications").join(format!("{app_name}.app")),
        PathBuf::from("/System/Applications").join(format!("{app_name}.app")),
    ];

    if let Some(home_dir) = home_dir {
        candidates.push(
            home_dir
                .join("Applications")
                .join(format!("{app_name}.app")),
        );
    }

    candidates
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn macos_app_path_exists_with(
    app_name: &str,
    home_dir: Option<&Path>,
    path_exists: impl Fn(&Path) -> bool,
    path_has_app: impl Fn(&str) -> bool,
) -> bool {
    for candidate in macos_app_location_candidates(app_name, home_dir) {
        if path_exists(&candidate) {
            return true;
        }
    }

    path_has_app(app_name)
}

#[cfg(target_os = "macos")]
fn macos_app_path_exists(app_name: &str) -> bool {
    let home_dir = std::env::var_os("HOME").map(PathBuf::from);

    macos_app_path_exists_with(app_name, home_dir.as_deref(), Path::exists, |binary| {
        std::process::Command::new("which")
            .arg(binary)
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    })
}

#[cfg(target_os = "macos")]
fn available_launcher_apps() -> Vec<LauncherApp> {
    let mut launchers = vec![
        launcher_app(LauncherApplicationId::FileManager, "Finder"),
        launcher_app(LauncherApplicationId::Terminal, "Terminal"),
    ];

    for (id, label, app_name) in [
        (
            LauncherApplicationId::VsCode,
            "VS Code",
            "Visual Studio Code",
        ),
        (LauncherApplicationId::Cursor, "Cursor", "Cursor"),
        (
            LauncherApplicationId::Antigravity,
            "Antigravity",
            "Antigravity",
        ),
    ] {
        if macos_app_path_exists(app_name) {
            launchers.push(launcher_app(id, label));
        }
    }

    launchers
}

#[cfg(target_os = "macos")]
fn open_path_with_macos_application(
    application: LauncherApplicationId,
    repo_path: &str,
) -> Result<(), LauncherError> {
    match application {
        LauncherApplicationId::FileManager => {
            let mut command = std::process::Command::new("open");
            command.arg(repo_path);
            launch_command(&mut command)
        }
        LauncherApplicationId::Terminal => {
            let mut command = std::process::Command::new("osascript");
            command.args(macos_terminal_script_arguments(repo_path));
            launch_command(&mut command)
        }
        LauncherApplicationId::VsCode | LauncherApplicationId::Cursor => {
            let app_name = if matches!(application, LauncherApplicationId::VsCode) {
                "Visual Studio Code"
            } else {
                "Cursor"
            };
            let mut command = std::process::Command::new("open");
            command.args(["-a", app_name, repo_path, "--args", "--new-window"]);
            launch_command(&mut command)
        }
        LauncherApplicationId::Antigravity => {
            let mut command = std::process::Command::new("open");
            command.args(["-a", "Antigravity", repo_path]);
            launch_command(&mut command)
        }
        LauncherApplicationId::VisualStudio
        | LauncherApplicationId::GitBash
        | LauncherApplicationId::Wsl => Err(LauncherError::unsupported_application()),
    }
}

#[cfg(target_os = "linux")]
fn resolve_linux_editor_executable(id: LauncherApplicationId) -> Option<PathBuf> {
    match id {
        LauncherApplicationId::Antigravity => resolve_from_candidates(&["antigravity"], &[]),
        LauncherApplicationId::VsCode => resolve_from_candidates(&["code", "codium"], &[]),
        LauncherApplicationId::Cursor => resolve_from_candidates(&["cursor"], &[]),
        _ => None,
    }
}

#[cfg(target_os = "linux")]
fn linux_terminal_candidates(kind: LinuxDesktopKind) -> Vec<&'static str> {
    let mut candidates = match kind {
        LinuxDesktopKind::Kde => vec!["konsole", "x-terminal-emulator"],
        LinuxDesktopKind::Gnome => vec!["gnome-terminal", "ptyxis", "x-terminal-emulator"],
        LinuxDesktopKind::Cinnamon => vec!["gnome-terminal", "x-terminal-emulator"],
        LinuxDesktopKind::Xfce => vec!["xfce4-terminal", "x-terminal-emulator"],
        LinuxDesktopKind::Tiling => vec!["x-terminal-emulator"],
        LinuxDesktopKind::Unknown => vec!["x-terminal-emulator"],
    };

    for fallback in [
        "ptyxis",
        "konsole",
        "kitty",
        "alacritty",
        "wezterm",
        "xfce4-terminal",
        "tilix",
    ] {
        if !candidates.contains(&fallback) {
            candidates.push(fallback);
        }
    }

    candidates
}

#[cfg(target_os = "linux")]
fn linux_terminal_open_with(executable: &Path) -> Result<String, LauncherError> {
    executable
        .file_name()
        .and_then(|value| value.to_str())
        .map(ToString::to_string)
        .ok_or_else(|| {
            LauncherError::message("Failed to derive terminal application name for opener")
        })
}

#[cfg(target_os = "linux")]
fn linux_terminal_launch_strategy(
    kind: LinuxDesktopKind,
    executable: &Path,
) -> LinuxTerminalLaunchStrategy {
    let executable_name = executable
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();

    let is_native_terminal = match kind {
        LinuxDesktopKind::Kde => executable_name == "konsole",
        LinuxDesktopKind::Gnome | LinuxDesktopKind::Cinnamon => {
            matches!(executable_name, "gnome-terminal" | "ptyxis" | "tilix")
        }
        LinuxDesktopKind::Xfce => executable_name == "xfce4-terminal",
        LinuxDesktopKind::Tiling => {
            matches!(
                executable_name,
                "kitty" | "alacritty" | "wezterm" | "x-terminal-emulator"
            )
        }
        LinuxDesktopKind::Unknown => false,
    };

    if is_native_terminal {
        LinuxTerminalLaunchStrategy::DirectCommand
    } else {
        LinuxTerminalLaunchStrategy::PluginOpener
    }
}

#[cfg(target_os = "linux")]
fn spawn_linux_terminal(executable: &Path, repo_path: &str) -> Result<(), LauncherError> {
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

    if executable_name == "konsole" {
        apply_kde_child_environment(&mut command);
    }

    launch_command(&mut command)
}

#[cfg(target_os = "linux")]
fn linux_file_manager_strategy_with(
    kind: LinuxDesktopKind,
    has_command: impl Fn(&str) -> bool,
) -> LinuxFileManagerStrategy {
    if matches!(kind, LinuxDesktopKind::Kde)
        && std::iter::once(LinuxFileManagerStrategy::KdeOpen.primary_command())
            .chain(
                LinuxFileManagerStrategy::KdeOpen
                    .fallback_commands()
                    .iter()
                    .copied(),
            )
            .any(&has_command)
    {
        LinuxFileManagerStrategy::KdeOpen
    } else if has_command(LinuxFileManagerStrategy::GioOpen.primary_command()) {
        LinuxFileManagerStrategy::GioOpen
    } else {
        LinuxFileManagerStrategy::XdgOpen
    }
}

#[cfg(target_os = "linux")]
fn linux_file_manager_strategy() -> LinuxFileManagerStrategy {
    let desktop = LinuxDesktopContext::detect();
    linux_file_manager_strategy_with(desktop.kind, |command| {
        resolve_from_candidates(&[command], &[]).is_some()
    })
}

#[cfg(target_os = "linux")]
fn resolve_linux_file_manager_commands() -> Vec<(LinuxFileManagerStrategy, PathBuf)> {
    let mut commands = Vec::new();
    let desktop = LinuxDesktopContext::detect();
    let mut strategies = vec![linux_file_manager_strategy()];

    if matches!(desktop.kind, LinuxDesktopKind::Kde) {
        strategies.push(LinuxFileManagerStrategy::KdeOpen);
    }

    strategies.push(LinuxFileManagerStrategy::GioOpen);
    strategies.push(LinuxFileManagerStrategy::XdgOpen);

    for strategy in strategies {
        let candidates = std::iter::once(strategy.primary_command())
            .chain(strategy.fallback_commands().iter().copied())
            .collect::<Vec<_>>();

        if let Some(executable) = resolve_from_candidates(&candidates, &[]) {
            if !commands
                .iter()
                .any(|(existing_strategy, _)| *existing_strategy == strategy)
            {
                commands.push((strategy, executable));
            }
        }
    }

    commands
}

#[cfg(target_os = "linux")]
fn try_linux_file_manager_command(
    strategy: LinuxFileManagerStrategy,
    executable: &Path,
    repo_path: &str,
) -> Result<(), LauncherError> {
    use std::process::Stdio;

    let mut command = std::process::Command::new(executable);
    command.stdin(Stdio::null());

    match strategy {
        LinuxFileManagerStrategy::KdeOpen => {
            command.args(["exec", repo_path]);
        }
        LinuxFileManagerStrategy::GioOpen => {
            command.args(["open", repo_path]);
        }
        LinuxFileManagerStrategy::XdgOpen => {
            command.arg(repo_path);
        }
    }

    if executable
        .file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value == "dolphin")
    {
        apply_kde_child_environment(&mut command);
    }

    let output = command.output()?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    Err(LauncherError::message(if stderr.is_empty() {
        format!("Failed to open path with {}", strategy.primary_command())
    } else {
        stderr
    }))
}

#[cfg(target_os = "linux")]
fn resolve_linux_kde_file_manager() -> Option<PathBuf> {
    resolve_from_candidates(&["dolphin"], &[])
}

#[cfg(target_os = "linux")]
fn open_path_with_linux_file_manager(repo_path: &str) -> Result<(), LauncherError> {
    let desktop = LinuxDesktopContext::detect();

    if matches!(desktop.kind, LinuxDesktopKind::Kde) {
        if let Some(executable) = resolve_linux_kde_file_manager() {
            let mut command = std::process::Command::new(executable);
            command.arg(repo_path);
            apply_kde_child_environment(&mut command);
            if launch_command(&mut command).is_ok() {
                return Ok(());
            }
        }
    }

    if tauri_plugin_opener::open_path(repo_path, None::<&str>).is_ok() {
        return Ok(());
    }

    let commands = resolve_linux_file_manager_commands();

    if commands.is_empty() {
        return Err(LauncherError::message(
            "A supported file manager opener was not found",
        ));
    }

    let mut last_error = None;

    for (strategy, executable) in commands {
        match try_linux_file_manager_command(strategy, &executable, repo_path) {
            Ok(()) => return Ok(()),
            Err(error) => last_error = Some(error),
        }
    }

    Err(last_error
        .unwrap_or_else(|| LauncherError::message("A supported file manager opener was not found")))
}

#[cfg(target_os = "linux")]
fn resolve_linux_terminal() -> Option<PathBuf> {
    let desktop = LinuxDesktopContext::detect();
    let candidates = linux_terminal_candidates(desktop.kind);
    resolve_from_candidates(&candidates, &[])
}

#[cfg(target_os = "linux")]
fn available_launcher_apps() -> Vec<LauncherApp> {
    let mut launchers = vec![launcher_app(LauncherApplicationId::FileManager, "Files")];

    if resolve_linux_terminal().is_some() {
        launchers.push(launcher_app(LauncherApplicationId::Terminal, "Terminal"));
    }

    for (id, label) in [
        (LauncherApplicationId::VsCode, "VS Code"),
        (LauncherApplicationId::Cursor, "Cursor"),
        (LauncherApplicationId::Antigravity, "Antigravity"),
    ] {
        if resolve_linux_editor_executable(id).is_some() {
            launchers.push(launcher_app(id, label));
        }
    }

    launchers
}

#[cfg(target_os = "linux")]
fn open_path_with_linux_application(
    application: LauncherApplicationId,
    repo_path: &str,
) -> Result<(), LauncherError> {
    match application {
        LauncherApplicationId::FileManager => open_path_with_linux_file_manager(repo_path),
        LauncherApplicationId::Terminal => {
            let executable = resolve_linux_terminal().ok_or_else(|| {
                LauncherError::message("A supported terminal executable was not found")
            })?;
            let desktop = LinuxDesktopContext::detect();

            match linux_terminal_launch_strategy(desktop.kind, &executable) {
                LinuxTerminalLaunchStrategy::DirectCommand => {
                    return spawn_linux_terminal(&executable, repo_path);
                }
                LinuxTerminalLaunchStrategy::PluginOpener => {
                    if let Ok(open_with) = linux_terminal_open_with(&executable) {
                        if tauri_plugin_opener::open_path(repo_path, Some(open_with.as_str()))
                            .is_ok()
                        {
                            return Ok(());
                        }
                    }
                }
            }

            spawn_linux_terminal(&executable, repo_path)
        }
        LauncherApplicationId::Antigravity | LauncherApplicationId::VsCode | LauncherApplicationId::Cursor => {
            let executable = resolve_linux_editor_executable(application).ok_or_else(|| {
                LauncherError::message(format!("{} executable was not found", application.as_str()))
            })?;
            let mut command = std::process::Command::new(executable);

            if matches!(application, LauncherApplicationId::VsCode | LauncherApplicationId::Cursor) {
                command
                    .current_dir(repo_path)
                    .args(["--new-window", repo_path]);
            } else {
                command.current_dir(repo_path).arg(repo_path);
            }

            launch_command(&mut command)
        }
        LauncherApplicationId::VisualStudio
        | LauncherApplicationId::GitBash
        | LauncherApplicationId::Wsl => Err(LauncherError::unsupported_application()),
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
    open_path_with_application_impl(application, path).map_err(|error| error.to_string())
}

fn open_path_with_application_impl(application: String, path: String) -> Result<(), LauncherError> {
    let trimmed_path = path.trim();

    if trimmed_path.is_empty() {
        return Err(LauncherError::path_required());
    }

    validate_launcher_repository_root(Path::new(trimmed_path)).map_err(LauncherError::message)?;

    #[cfg(any(windows, target_os = "macos", target_os = "linux"))]
    let application_id = LauncherApplicationId::parse(&application)?;

    #[cfg(windows)]
    {
        return open_path_with_windows_application(application_id, trimmed_path);
    }

    #[cfg(target_os = "macos")]
    {
        return open_path_with_macos_application(application_id, trimmed_path);
    }

    #[cfg(target_os = "linux")]
    {
        open_path_with_linux_application(application_id, trimmed_path)
    }

    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        let _ = application;
        Err(LauncherError::message(
            "Open with is not supported on this platform",
        ))
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    use serde_json::json;

    use super::{launcher_app, LauncherApplicationId, LauncherError};

    fn create_temp_directory(prefix: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("{prefix}-{timestamp}"));
        fs::create_dir_all(&path).expect("failed to create temporary directory");
        path
    }

    fn create_temp_git_repository(prefix: &str) -> PathBuf {
        let path = create_temp_directory(prefix);

        let status = Command::new("git")
            .args(["init", "--quiet", path.to_string_lossy().as_ref()])
            .status()
            .expect("failed to run git init");

        assert!(status.success(), "git init should succeed");
        path
    }

    #[cfg(windows)]
    fn create_temp_executable_directory(prefix: &str, executables: &[&str]) -> PathBuf {
        let path = create_temp_directory(prefix);

        for executable in executables {
            let executable_path = path.join(executable);
            fs::write(&executable_path, []).expect("failed to create temporary executable");
        }

        path
    }

    #[cfg(target_os = "linux")]
    fn create_temp_executable_directory(prefix: &str, executables: &[&str]) -> PathBuf {
        let path = create_temp_directory(prefix);

        for executable in executables {
            let executable_path = path.join(executable);
            fs::write(&executable_path, []).expect("failed to create temporary executable");

            #[cfg(target_os = "linux")]
            {
                use std::os::unix::fs::PermissionsExt;

                let mut permissions = fs::metadata(&executable_path)
                    .expect("temporary executable metadata should be readable")
                    .permissions();
                permissions.set_mode(0o755);
                fs::set_permissions(&executable_path, permissions)
                    .expect("failed to mark temporary executable as executable");
            }
        }

        path
    }

    #[cfg(windows)]
    fn assert_windows_terminal_candidate_prefix(expected_prefix: &[&str]) {
        let candidates = super::windows_terminal_candidates();

        assert!(
            candidates.len() >= expected_prefix.len(),
            "candidate list should include the expected prefix",
        );
        assert_eq!(&candidates[..expected_prefix.len()], expected_prefix);
    }

    #[cfg(windows)]
    fn assert_windows_terminal_candidates_have_no_duplicates() {
        let candidates = super::windows_terminal_candidates();
        let mut unique_candidates = candidates.clone();

        unique_candidates.sort_unstable();
        unique_candidates.dedup();

        assert_eq!(
            unique_candidates.len(),
            candidates.len(),
            "terminal candidates should not contain duplicates",
        );
    }

    #[cfg_attr(not(windows), allow(dead_code))]
    fn assert_windows_terminal_user_specific_candidate_prefix(expected_prefix: &[&str]) {
        let candidates = super::windows_terminal_user_specific_candidates();

        assert!(
            candidates.len() >= expected_prefix.len(),
            "candidate list should include the expected prefix",
        );
        assert_eq!(&candidates[..expected_prefix.len()], expected_prefix);
    }

    #[cfg_attr(not(windows), allow(dead_code))]
    fn assert_windows_terminal_user_specific_candidates_have_no_duplicates() {
        let candidates = super::windows_terminal_user_specific_candidates();
        let mut unique_candidates = candidates.clone();

        unique_candidates.sort_unstable();
        unique_candidates.dedup();

        assert_eq!(
            unique_candidates.len(),
            candidates.len(),
            "terminal absolute candidates should not contain duplicates",
        );
    }

    fn candidate_label(candidate: &super::WindowsTerminalResolutionCandidate) -> String {
        match candidate {
            super::WindowsTerminalResolutionCandidate::Path(value) => value.to_string(),
            super::WindowsTerminalResolutionCandidate::Absolute(value) => value.clone(),
        }
    }

    #[cfg(target_os = "linux")]
    fn assert_terminal_candidate_prefix(kind: super::LinuxDesktopKind, expected_prefix: &[&str]) {
        let candidates = super::linux_terminal_candidates(kind);

        assert!(
            candidates.len() >= expected_prefix.len(),
            "candidate list should include the expected prefix",
        );
        assert_eq!(&candidates[..expected_prefix.len()], expected_prefix);
    }

    #[cfg(target_os = "linux")]
    fn assert_terminal_candidates_have_no_duplicates(kind: super::LinuxDesktopKind) {
        let candidates = super::linux_terminal_candidates(kind);
        let mut unique_candidates = candidates.clone();

        unique_candidates.sort_unstable();
        unique_candidates.dedup();

        assert_eq!(
            unique_candidates.len(),
            candidates.len(),
            "terminal candidates should not contain duplicates",
        );
    }

    #[cfg(target_os = "linux")]
    fn assert_linux_file_manager_strategy(
        kind: super::LinuxDesktopKind,
        gio_open_exists: bool,
        xdg_open_exists: bool,
        expected: super::LinuxFileManagerStrategy,
    ) {
        let strategy = super::linux_file_manager_strategy_with(kind, |command| match command {
            "kioclient5" | "kioclient" => false,
            "gio" => gio_open_exists,
            "xdg-open" => xdg_open_exists,
            _ => false,
        });

        assert_eq!(strategy, expected);
    }

    #[cfg(target_os = "linux")]
    fn assert_linux_file_manager_strategy_from_path(
        prefix: &str,
        executables: &[&str],
        expected: super::LinuxFileManagerStrategy,
    ) {
        const SUBPROCESS_ENV: &str = "LITGIT_LINUX_FILE_MANAGER_STRATEGY_TEST";

        if std::env::var_os(SUBPROCESS_ENV).is_some() {
            let strategy = super::linux_file_manager_strategy();
            assert_eq!(strategy, expected);
            return;
        }

        let temp_dir = create_temp_executable_directory(prefix, executables);
        let current_executable =
            std::env::current_exe().expect("current test executable should be available");
        let test_name = match expected {
            super::LinuxFileManagerStrategy::XdgOpen => {
                "launcher::tests::linux_file_manager_strategy_falls_back_to_xdg_open_when_gio_is_missing"
            }
            super::LinuxFileManagerStrategy::GioOpen => {
                "launcher::tests::linux_file_manager_strategy_prefers_gio_open_when_available"
            }
            super::LinuxFileManagerStrategy::KdeOpen => {
                "launcher::tests::linux_file_manager_strategy_prefers_kde_open_when_available_in_memory"
            }
        };
        let status = Command::new(current_executable)
            .arg("--exact")
            .arg(test_name)
            .arg("--nocapture")
            .env(SUBPROCESS_ENV, "1")
            .env("PATH", &temp_dir)
            .status()
            .expect("subprocess test should start");

        fs::remove_dir_all(temp_dir).expect("failed to remove temporary directory");
        assert!(status.success(), "subprocess strategy check should pass");
    }

    #[test]
    fn launcher_application_id_parses_supported_values() {
        let cases = [
            ("file-manager", LauncherApplicationId::FileManager),
            ("terminal", LauncherApplicationId::Terminal),
            ("vscode", LauncherApplicationId::VsCode),
            ("visual-studio", LauncherApplicationId::VisualStudio),
            ("antigravity", LauncherApplicationId::Antigravity),
            ("git-bash", LauncherApplicationId::GitBash),
            ("wsl", LauncherApplicationId::Wsl),
            ("cursor", LauncherApplicationId::Cursor),
        ];

        for (value, expected) in cases {
            let parsed = LauncherApplicationId::parse(value);
            assert!(matches!(parsed, Ok(id) if id == expected));
        }
    }

    #[test]
    fn launcher_application_id_rejects_unknown_value() {
        let parsed = LauncherApplicationId::parse("unknown-launcher");
        assert!(matches!(parsed, Err(LauncherError::UnsupportedApplication)));
    }

    #[test]
    fn launcher_error_path_required_has_expected_message() {
        assert_eq!(
            LauncherError::path_required().to_string(),
            "Path is required"
        );
    }

    #[test]
    fn launcher_error_unsupported_application_has_expected_message() {
        assert_eq!(
            LauncherError::unsupported_application().to_string(),
            "Unsupported launcher application"
        );
    }

    #[test]
    fn launcher_application_id_as_str_roundtrips_supported_values() {
        let cases = [
            LauncherApplicationId::FileManager,
            LauncherApplicationId::Terminal,
            LauncherApplicationId::VsCode,
            LauncherApplicationId::VisualStudio,
            LauncherApplicationId::Antigravity,
            LauncherApplicationId::GitBash,
            LauncherApplicationId::Wsl,
            LauncherApplicationId::Cursor,
        ];

        for id in cases {
            let value = id.as_str();
            let reparsed = LauncherApplicationId::parse(value);
            assert!(matches!(reparsed, Ok(parsed_id) if parsed_id == id));
        }
    }

    #[test]
    fn launcher_app_serializes_expected_id_and_label() {
        let app = launcher_app(LauncherApplicationId::FileManager, "File Explorer");
        let serialized = serde_json::to_value(app).expect("launcher app should serialize");

        assert_eq!(
            serialized,
            json!({
                "id": "file-manager",
                "label": "File Explorer",
            })
        );
    }

    #[test]
    fn launcher_application_id_open_path_with_application_rejects_invalid_id() {
        let temp_dir = create_temp_git_repository("launcher-invalid-id-test");
        let path = temp_dir.to_string_lossy().to_string();

        let result = super::open_path_with_application("invalid-id".to_string(), path);
        assert_eq!(result, Err("Unsupported launcher application".to_string()));

        fs::remove_dir_all(temp_dir).expect("failed to remove temporary directory");
    }

    #[test]
    fn open_path_with_application_impl_rejects_empty_path() {
        let result =
            super::open_path_with_application_impl("invalid-id".to_string(), "   ".to_string());

        assert!(matches!(result, Err(LauncherError::PathRequired)));
    }

    #[test]
    fn open_path_with_application_impl_prioritizes_invalid_path_over_application() {
        let temp_dir = create_temp_directory("launcher-non-git-repo-test");
        let result = super::open_path_with_application_impl(
            "invalid-id".to_string(),
            temp_dir.to_string_lossy().to_string(),
        );

        assert!(matches!(
            result,
            Err(LauncherError::Message(message))
                if message == "Selected folder is not a git repository"
        ));

        fs::remove_dir_all(temp_dir).expect("failed to remove temporary directory");
    }

    #[test]
    fn open_path_with_application_impl_rejects_invalid_application_for_git_repository() {
        let temp_repo = create_temp_git_repository("launcher-git-repo-test");
        let path = temp_repo.to_string_lossy().to_string();

        let result = super::open_path_with_application_impl("invalid-id".to_string(), path);

        assert!(matches!(result, Err(LauncherError::UnsupportedApplication)));

        fs::remove_dir_all(temp_repo).expect("failed to remove temporary directory");
    }

    #[test]
    fn windows_path_to_wsl_converts_drive_letter_paths() {
        assert_eq!(
            super::windows_path_to_wsl(r"C:\Users\example\project"),
            Some("/mnt/c/Users/example/project".to_string())
        );
        assert_eq!(
            super::windows_path_to_wsl(r"D:\"),
            Some("/mnt/d".to_string())
        );
    }

    #[test]
    fn windows_path_to_wsl_rejects_non_windows_paths() {
        assert_eq!(super::windows_path_to_wsl("/home/example/project"), None);
        assert_eq!(super::windows_path_to_wsl(r"relative\path"), None);
    }

    #[test]
    fn macos_terminal_script_launch_arguments_keep_path_as_separate_argument() {
        let repo_path = "/tmp/quoted path/$HOME/`pwd`/repo's";
        let arguments = super::macos_terminal_script_arguments(repo_path);
        let expected_script_lines = super::macos_terminal_script_lines();

        assert_eq!(
            arguments,
            vec![
                "-e".to_string(),
                expected_script_lines[0].to_string(),
                "-e".to_string(),
                expected_script_lines[1].to_string(),
                "-e".to_string(),
                expected_script_lines[2].to_string(),
                "-e".to_string(),
                expected_script_lines[3].to_string(),
                "-e".to_string(),
                expected_script_lines[4].to_string(),
                "-e".to_string(),
                expected_script_lines[5].to_string(),
                repo_path.to_string(),
            ]
        );
    }

    #[test]
    fn launcher_error_launch_has_expected_message() {
        let error = LauncherError::from(std::io::Error::other("process spawn failed"));

        assert_eq!(
            error.to_string(),
            "Failed to launch process: process spawn failed"
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_terminal_candidates_prefer_windows_terminal_before_powershell() {
        assert_windows_terminal_candidate_prefix(&["wt.exe", "wt"]);
        assert_windows_terminal_candidates_have_no_duplicates();
    }

    #[test]
    fn windows_terminal_user_specific_candidates_prefer_localappdata_before_userprofile() {
        const SUBPROCESS_ENV: &str = "LITGIT_WINDOWS_TERMINAL_USER_SPECIFIC_CANDIDATES_TEST";

        if std::env::var_os(SUBPROCESS_ENV).is_some() {
            assert_windows_terminal_user_specific_candidate_prefix(&[
                r"C:\Users\Example\AppData\Local\Microsoft\WindowsApps\wt.exe",
                r"C:\Users\AnotherUser\AppData\Local\Microsoft\WindowsApps\wt.exe",
            ]);
            assert_windows_terminal_user_specific_candidates_have_no_duplicates();
            return;
        }

        let current_executable =
            std::env::current_exe().expect("current test executable should be available");
        let status = Command::new(current_executable)
            .arg("--exact")
            .arg(
                "launcher::tests::windows_terminal_user_specific_candidates_prefer_localappdata_before_userprofile",
            )
            .arg("--nocapture")
            .env(SUBPROCESS_ENV, "1")
            .env("LOCALAPPDATA", r"C:\Users\Example\AppData\Local")
            .env("USERPROFILE", r"C:\Users\AnotherUser")
            .status()
            .expect("subprocess test should start");

        assert!(
            status.success(),
            "subprocess user-specific candidate check should pass"
        );
    }

    #[test]
    fn windows_terminal_resolution_candidates_prefer_user_specific_windows_terminal_before_powershell(
    ) {
        const SUBPROCESS_ENV: &str = "LITGIT_WINDOWS_TERMINAL_RESOLUTION_CANDIDATES_TEST";

        if std::env::var_os(SUBPROCESS_ENV).is_some() {
            let candidates = super::windows_terminal_resolution_candidates();
            let labels = candidates.iter().map(candidate_label).collect::<Vec<_>>();

            assert_eq!(
                labels,
                vec![
                    "wt.exe".to_string(),
                    "wt".to_string(),
                    r"C:\Users\Example\AppData\Local\Microsoft\WindowsApps\wt.exe".to_string(),
                    r"C:\Users\AnotherUser\AppData\Local\Microsoft\WindowsApps\wt.exe".to_string(),
                    "pwsh.exe".to_string(),
                    "powershell.exe".to_string(),
                    r"C:\Program Files\PowerShell\7\pwsh.exe".to_string(),
                    r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe".to_string(),
                ]
            );
            return;
        }

        let current_executable =
            std::env::current_exe().expect("current test executable should be available");
        let status = Command::new(current_executable)
            .arg("--exact")
            .arg(
                "launcher::tests::windows_terminal_resolution_candidates_prefer_user_specific_windows_terminal_before_powershell",
            )
            .arg("--nocapture")
            .env(SUBPROCESS_ENV, "1")
            .env("LOCALAPPDATA", r"C:\Users\Example\AppData\Local")
            .env("USERPROFILE", r"C:\Users\AnotherUser")
            .status()
            .expect("subprocess test should start");

        assert!(
            status.success(),
            "subprocess resolution candidate check should pass"
        );
    }

    #[test]
    fn resolve_windows_terminal_prefers_user_specific_windows_terminal_absolute_candidate_before_powershell_on_path(
    ) {
        const SUBPROCESS_ENV: &str = "LITGIT_RESOLVE_WINDOWS_TERMINAL_ABSOLUTE_TEST";

        if std::env::var_os(SUBPROCESS_ENV).is_some() {
            let candidates = super::windows_terminal_resolution_candidates();
            let resolved = super::resolve_windows_terminal_from_candidates(&candidates).expect(
                "Windows Terminal absolute fallback should resolve before PowerShell on PATH",
            );

            let expected = PathBuf::from(format!(
                r"{}\Microsoft\WindowsApps\wt.exe",
                std::env::var("LOCALAPPDATA").expect("LOCALAPPDATA should be set in subprocess")
            ));

            assert_eq!(resolved, expected);
            return;
        }

        let temp_dir = create_temp_directory("launcher-windows-terminal-absolute-fallback-test");
        let path_dir = temp_dir.join("path");
        let local_app_data_dir = temp_dir.join("local-app-data");

        fs::create_dir_all(&path_dir).expect("failed to create PATH directory");
        fs::create_dir_all(&local_app_data_dir).expect("failed to create LOCALAPPDATA directory");

        let powershell_executable = path_dir.join("powershell.exe");
        fs::write(&powershell_executable, []).expect("failed to create powershell executable");

        let local_app_data_value = local_app_data_dir.to_string_lossy().to_string();
        let wt_absolute_path = PathBuf::from(format!(
            r"{local_app_data_value}\Microsoft\WindowsApps\wt.exe"
        ));
        if let Some(parent) = wt_absolute_path.parent() {
            fs::create_dir_all(parent).expect("failed to create Windows Terminal parent path");
        }
        fs::write(&wt_absolute_path, []).expect("failed to create Windows Terminal executable");

        let current_executable =
            std::env::current_exe().expect("current test executable should be available");
        let status = Command::new(current_executable)
            .arg("--exact")
            .arg(
                "launcher::tests::resolve_windows_terminal_prefers_user_specific_windows_terminal_absolute_candidate_before_powershell_on_path",
            )
            .arg("--nocapture")
            .env(SUBPROCESS_ENV, "1")
            .env("PATH", path_dir.to_string_lossy().as_ref())
            .env("LOCALAPPDATA", &local_app_data_value)
            .env_remove("USERPROFILE")
            .status()
            .expect("subprocess test should start");

        fs::remove_dir_all(temp_dir).expect("failed to remove temporary directory");
        assert!(
            status.success(),
            "subprocess absolute fallback check should pass"
        );
    }

    #[cfg(windows)]
    #[test]
    fn resolve_windows_terminal_prefers_windows_terminal_from_path() {
        const SUBPROCESS_ENV: &str = "LITGIT_RESOLVE_WINDOWS_TERMINAL_TEST";

        if std::env::var_os(SUBPROCESS_ENV).is_some() {
            let executable = super::resolve_windows_terminal()
                .expect("windows terminal should resolve from subprocess PATH");
            let executable_name = executable
                .file_name()
                .and_then(|value| value.to_str())
                .expect("resolved executable should have a valid file name");

            assert_eq!(executable_name, "wt.exe");
            return;
        }

        let temp_dir = create_temp_executable_directory(
            "launcher-windows-terminal-path-test",
            &["wt.exe", "powershell.exe"],
        );
        let current_executable =
            std::env::current_exe().expect("current test executable should be available");
        let status = Command::new(current_executable)
            .arg("--exact")
            .arg("launcher::tests::resolve_windows_terminal_prefers_windows_terminal_from_path")
            .arg("--nocapture")
            .env(SUBPROCESS_ENV, "1")
            .env("PATH", &temp_dir)
            .status()
            .expect("subprocess test should start");

        fs::remove_dir_all(temp_dir).expect("failed to remove temporary directory");
        assert!(status.success(), "subprocess resolver check should pass");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_desktop_kind_prefers_xdg_current_desktop_when_values_conflict() {
        let desktop =
            super::LinuxDesktopContext::from_values(Some("KDE"), Some("gnome"), Some("xfce"));
        assert_eq!(desktop.kind, super::LinuxDesktopKind::Kde);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_desktop_kind_prefers_xdg_current_desktop() {
        let desktop = super::LinuxDesktopContext::from_values(Some("KDE"), None, Some("plasma"));
        assert_eq!(desktop.kind, super::LinuxDesktopKind::Kde);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_desktop_kind_falls_back_to_xdg_session_desktop_before_desktop_session() {
        let desktop = super::LinuxDesktopContext::from_values(None, Some("xfce"), Some("gnome"));
        assert_eq!(desktop.kind, super::LinuxDesktopKind::Xfce);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_desktop_kind_falls_back_to_desktop_session() {
        let desktop = super::LinuxDesktopContext::from_values(None, None, Some("xfce"));
        assert_eq!(desktop.kind, super::LinuxDesktopKind::Xfce);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_desktop_kind_maps_other_full_desktops_to_supported_launch_profiles() {
        let cases = [
            ("mate", super::LinuxDesktopKind::Gnome),
            ("budgie", super::LinuxDesktopKind::Gnome),
            ("pantheon", super::LinuxDesktopKind::Gnome),
            ("deepin", super::LinuxDesktopKind::Gnome),
            ("unity", super::LinuxDesktopKind::Gnome),
            ("cosmic", super::LinuxDesktopKind::Gnome),
            ("lxqt", super::LinuxDesktopKind::Unknown),
        ];

        for (value, expected) in cases {
            let desktop = super::LinuxDesktopContext::from_values(Some(value), None, None);
            assert_eq!(
                desktop.kind, expected,
                "desktop value {value} should map consistently"
            );
        }
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_desktop_kind_maps_known_tiling_sessions_to_tiling_profile() {
        let cases = [
            "sway", "hyprland", "river", "i3", "i3wm", "niri", "leftwm", "qtile", "xmonad",
        ];

        for value in cases {
            let desktop = super::LinuxDesktopContext::from_values(Some(value), None, None);
            assert_eq!(
                desktop.kind,
                super::LinuxDesktopKind::Tiling,
                "desktop value {value} should map to tiling profile"
            );
        }
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_desktop_kind_defaults_to_unknown() {
        let desktop = super::LinuxDesktopContext::from_values(None, None, None);
        assert_eq!(desktop.kind, super::LinuxDesktopKind::Unknown);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_desktop_kind_detects_kde_from_gdm_session() {
        let kind =
            super::linux_desktop_kind_with(None, None, None, Some("plasma"), Some("true"), false);

        assert_eq!(kind, super::LinuxDesktopKind::Kde);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn apply_kde_child_environment_sets_expected_overrides() {
        let mut command = std::process::Command::new("konsole");
        command.env("GTK_THEME", "SomeTheme");

        super::apply_kde_child_environment(&mut command);

        let envs = command
            .get_envs()
            .map(|(key, value)| {
                (
                    key.to_string_lossy().into_owned(),
                    value.map(|value| value.to_string_lossy().into_owned()),
                )
            })
            .collect::<Vec<_>>();

        assert!(envs.contains(&("GTK_THEME".to_string(), None)));
        assert!(envs.contains(&("QT_QPA_PLATFORMTHEME".to_string(), Some("kde".to_string()))));
    }

    #[test]
    fn macos_app_location_candidates_include_system_and_user_locations() {
        let candidates = super::macos_app_location_candidates(
            "Visual Studio Code",
            Some(std::path::Path::new("/Users/example")),
        );

        assert_eq!(
            candidates,
            vec![
                PathBuf::from("/Applications/Visual Studio Code.app"),
                PathBuf::from("/System/Applications/Visual Studio Code.app"),
                PathBuf::from("/Users/example/Applications/Visual Studio Code.app"),
            ]
        );
    }

    #[test]
    fn macos_app_path_exists_checks_path_when_bundle_locations_are_missing() {
        let resolved = super::macos_app_path_exists_with(
            "Visual Studio Code",
            Some(std::path::Path::new("/Users/example")),
            |_| false,
            |binary| binary == "Visual Studio Code",
        );

        assert!(resolved, "PATH fallback should mark app as available");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_terminal_candidates_prefer_konsole_for_kde() {
        assert_terminal_candidate_prefix(
            super::LinuxDesktopKind::Kde,
            &["konsole", "x-terminal-emulator"],
        );
        assert_terminal_candidates_have_no_duplicates(super::LinuxDesktopKind::Kde);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_terminal_candidates_prefer_gnome_terminal_for_gnome() {
        assert_terminal_candidate_prefix(
            super::LinuxDesktopKind::Gnome,
            &["gnome-terminal", "ptyxis", "x-terminal-emulator"],
        );
        assert_terminal_candidates_have_no_duplicates(super::LinuxDesktopKind::Gnome);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_terminal_candidates_prefer_gnome_terminal_for_cinnamon() {
        assert_terminal_candidate_prefix(
            super::LinuxDesktopKind::Cinnamon,
            &["gnome-terminal", "x-terminal-emulator"],
        );
        assert_terminal_candidates_have_no_duplicates(super::LinuxDesktopKind::Cinnamon);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_terminal_candidates_prefer_xfce4_terminal_for_xfce() {
        assert_terminal_candidate_prefix(
            super::LinuxDesktopKind::Xfce,
            &["xfce4-terminal", "x-terminal-emulator"],
        );
        assert_terminal_candidates_have_no_duplicates(super::LinuxDesktopKind::Xfce);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_terminal_candidates_keep_full_fallback_order_for_unknown() {
        assert_terminal_candidate_prefix(
            super::LinuxDesktopKind::Unknown,
            &["x-terminal-emulator"],
        );
        assert_terminal_candidates_have_no_duplicates(super::LinuxDesktopKind::Unknown);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_terminal_candidates_keep_generic_prefix_for_tiling_sessions() {
        assert_terminal_candidate_prefix(super::LinuxDesktopKind::Tiling, &["x-terminal-emulator"]);
        assert_terminal_candidates_have_no_duplicates(super::LinuxDesktopKind::Tiling);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_terminal_open_with_uses_executable_file_name_for_plugin_opener() {
        let open_with = super::linux_terminal_open_with(std::path::Path::new("/usr/bin/konsole"))
            .expect("terminal opener target should resolve from executable name");

        assert_eq!(open_with, "konsole");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_file_manager_strategy_prefers_gio_open_when_available_in_memory() {
        assert_linux_file_manager_strategy(
            super::LinuxDesktopKind::Gnome,
            true,
            true,
            super::LinuxFileManagerStrategy::GioOpen,
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_file_manager_strategy_prefers_kde_open_when_available_in_memory() {
        let strategy =
            super::linux_file_manager_strategy_with(super::LinuxDesktopKind::Kde, |command| {
                matches!(command, "kioclient5" | "kioclient")
            });

        assert_eq!(strategy, super::LinuxFileManagerStrategy::KdeOpen);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_file_manager_strategy_falls_back_to_xdg_open_when_gio_is_missing_in_memory() {
        assert_linux_file_manager_strategy(
            super::LinuxDesktopKind::Gnome,
            false,
            true,
            super::LinuxFileManagerStrategy::XdgOpen,
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_file_manager_strategy_uses_xdg_open_when_only_xdg_is_available() {
        assert_linux_file_manager_strategy(
            super::LinuxDesktopKind::Unknown,
            false,
            true,
            super::LinuxFileManagerStrategy::XdgOpen,
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_file_manager_strategy_primary_command_matches_strategy() {
        assert_eq!(
            super::LinuxFileManagerStrategy::XdgOpen.primary_command(),
            "xdg-open",
        );
        assert_eq!(
            super::LinuxFileManagerStrategy::GioOpen.primary_command(),
            "gio",
        );
        assert_eq!(
            super::LinuxFileManagerStrategy::KdeOpen.primary_command(),
            "kioclient5",
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_terminal_launch_strategy_prefers_direct_konsole_for_kde() {
        let strategy = super::linux_terminal_launch_strategy(
            super::LinuxDesktopKind::Kde,
            std::path::Path::new("/usr/bin/konsole"),
        );

        assert!(matches!(
            strategy,
            super::LinuxTerminalLaunchStrategy::DirectCommand
        ));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_terminal_launch_strategy_prefers_direct_gnome_terminal_for_gnome() {
        let strategy = super::linux_terminal_launch_strategy(
            super::LinuxDesktopKind::Gnome,
            std::path::Path::new("/usr/bin/gnome-terminal"),
        );

        assert!(matches!(
            strategy,
            super::LinuxTerminalLaunchStrategy::DirectCommand
        ));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_terminal_launch_strategy_uses_plugin_opener_for_unknown_terminal() {
        let strategy = super::linux_terminal_launch_strategy(
            super::LinuxDesktopKind::Unknown,
            std::path::Path::new("/usr/bin/custom-terminal"),
        );

        assert!(matches!(
            strategy,
            super::LinuxTerminalLaunchStrategy::PluginOpener
        ));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_file_manager_strategy_prefers_gio_open_when_available() {
        assert_linux_file_manager_strategy_from_path(
            "launcher-linux-file-manager-gio-open-test",
            &["gio", "xdg-open"],
            super::LinuxFileManagerStrategy::GioOpen,
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_file_manager_strategy_falls_back_to_xdg_open_when_gio_is_missing() {
        assert_linux_file_manager_strategy_from_path(
            "launcher-linux-file-manager-xdg-open-test",
            &["xdg-open"],
            super::LinuxFileManagerStrategy::XdgOpen,
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn available_launcher_apps_always_include_file_manager() {
        let launchers = super::available_launcher_apps();
        let has_file_manager = launchers
            .iter()
            .any(|app| app.id == LauncherApplicationId::FileManager.as_str());

        assert!(
            has_file_manager,
            "file manager launcher should always be available on Linux",
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn resolve_linux_terminal_prefers_detected_desktop_candidate_from_path() {
        const SUBPROCESS_ENV: &str = "LITGIT_RESOLVE_LINUX_TERMINAL_TEST";

        if std::env::var_os(SUBPROCESS_ENV).is_some() {
            let executable = super::resolve_linux_terminal()
                .expect("linux terminal should resolve from subprocess PATH");
            let executable_name = executable
                .file_name()
                .and_then(|value| value.to_str())
                .expect("resolved executable should have a valid file name");

            assert_eq!(executable_name, "konsole");
            return;
        }

        let temp_dir = create_temp_executable_directory(
            "launcher-linux-terminal-path-test",
            &["konsole", "x-terminal-emulator"],
        );
        let current_executable =
            std::env::current_exe().expect("current test executable should be available");
        let status = Command::new(current_executable)
            .arg("--exact")
            .arg(
                "launcher::tests::resolve_linux_terminal_prefers_detected_desktop_candidate_from_path",
            )
            .arg("--nocapture")
            .env(SUBPROCESS_ENV, "1")
            .env("XDG_CURRENT_DESKTOP", "KDE")
            .env_remove("DESKTOP_SESSION")
            .env("PATH", &temp_dir)
            .status()
            .expect("subprocess test should start");

        fs::remove_dir_all(temp_dir).expect("failed to remove temporary directory");
        assert!(status.success(), "subprocess resolver check should pass");
    }
}
