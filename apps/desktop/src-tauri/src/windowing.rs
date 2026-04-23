use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_window_state::{
    AppHandleExt as WindowStateAppHandleExt, StateFlags, WindowExt as WindowStateExt,
};
use tokio::sync::mpsc;

const MAIN_WINDOW_LABEL: &str = "main";
const MAIN_WINDOW_ROUTE: &str = "/";
const DEFAULT_WINDOW_TITLE: &str = "LitGit Desktop";
const DEFAULT_WINDOW_WIDTH: f64 = 1100.0;
const DEFAULT_WINDOW_HEIGHT: f64 = 720.0;
const DEFAULT_MIN_WINDOW_WIDTH: f64 = 1100.0;
const DEFAULT_MIN_WINDOW_HEIGHT: f64 = 720.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimePlatform {
    Linux,
    Macos,
    Unknown,
    Windows,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowChromeMode {
    Custom,
    Native,
    OverlayNativeControls,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LinuxWindowEnvironment {
    pub wayland_display: bool,
    pub xdg_session_type: Option<String>,
    pub xdg_current_desktop: Option<String>,
    pub xdg_session_desktop: Option<String>,
    pub desktop_session: Option<String>,
    pub i3_sock: bool,
    pub litgit_linux_decorations: Option<String>,
    pub litgit_force_decorations: Option<String>,
    pub litgit_no_decorations: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DecorationOverride {
    Auto,
    Native,
    None,
}

impl RuntimePlatform {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Linux => "linux",
            Self::Macos => "macos",
            Self::Unknown => "unknown",
            Self::Windows => "windows",
        }
    }
}

impl WindowChromeMode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Custom => "custom",
            Self::Native => "native",
            Self::OverlayNativeControls => "overlay-native-controls",
        }
    }
}

impl LinuxWindowEnvironment {
    pub fn capture() -> Self {
        Self {
            wayland_display: std::env::var_os("WAYLAND_DISPLAY").is_some(),
            xdg_session_type: std::env::var("XDG_SESSION_TYPE").ok(),
            xdg_current_desktop: std::env::var("XDG_CURRENT_DESKTOP").ok(),
            xdg_session_desktop: std::env::var("XDG_SESSION_DESKTOP").ok(),
            desktop_session: std::env::var("DESKTOP_SESSION").ok(),
            i3_sock: std::env::var_os("I3SOCK").is_some(),
            litgit_linux_decorations: std::env::var("LITGIT_LINUX_DECORATIONS").ok(),
            litgit_force_decorations: std::env::var("LITGIT_FORCE_DECORATIONS").ok(),
            litgit_no_decorations: std::env::var("LITGIT_NO_DECORATIONS").ok(),
        }
    }
}

pub fn runtime_platform() -> RuntimePlatform {
    match std::env::consts::OS {
        "linux" => RuntimePlatform::Linux,
        "macos" => RuntimePlatform::Macos,
        "windows" => RuntimePlatform::Windows,
        _ => RuntimePlatform::Unknown,
    }
}

pub fn window_state_flags() -> StateFlags {
    StateFlags::all() - StateFlags::DECORATIONS - StateFlags::VISIBLE
}

pub fn use_linux_native_decorations(environment: &LinuxWindowEnvironment) -> bool {
    if let Some(mode) = decoration_override(environment.litgit_linux_decorations.as_deref()) {
        return match mode {
            DecorationOverride::Auto => default_use_linux_native_decorations(environment),
            DecorationOverride::Native => true,
            DecorationOverride::None => false,
        };
    }

    if is_truthy(environment.litgit_force_decorations.as_deref()) {
        return true;
    }

    if is_truthy(environment.litgit_no_decorations.as_deref()) {
        return false;
    }

    default_use_linux_native_decorations(environment)
}

pub fn window_chrome_mode(
    platform: RuntimePlatform,
    linux_uses_native_decorations: bool,
) -> WindowChromeMode {
    match platform {
        RuntimePlatform::Windows => WindowChromeMode::OverlayNativeControls,
        RuntimePlatform::Macos => WindowChromeMode::Native,
        RuntimePlatform::Linux => {
            if linux_uses_native_decorations {
                WindowChromeMode::Native
            } else {
                WindowChromeMode::Custom
            }
        }
        RuntimePlatform::Unknown => WindowChromeMode::Native,
    }
}

pub fn create_main_window(app: &AppHandle) -> Result<WebviewWindow, tauri::Error> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.set_focus();
        let _ = window.unminimize();
        return Ok(window);
    }

    let platform = runtime_platform();
    let linux_native_decorations = if platform == RuntimePlatform::Linux {
        use_linux_native_decorations(&LinuxWindowEnvironment::capture())
    } else {
        true
    };
    let chrome_mode = window_chrome_mode(platform, linux_native_decorations);

    let mut builder = WebviewWindowBuilder::new(
        app,
        MAIN_WINDOW_LABEL,
        WebviewUrl::App(MAIN_WINDOW_ROUTE.into()),
    )
    .title(DEFAULT_WINDOW_TITLE)
    .inner_size(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT)
    .min_inner_size(DEFAULT_MIN_WINDOW_WIDTH, DEFAULT_MIN_WINDOW_HEIGHT)
    .center()
    .resizable(true)
    .fullscreen(false)
    .maximized(true)
    .visible(true)
    .initialization_script(window_bootstrap_script(platform, chrome_mode));

    builder = match platform {
        RuntimePlatform::Windows => {
            #[cfg(target_os = "windows")]
            {
                builder.decorations(false).additional_browser_args(
                    "--proxy-bypass-list=<-loopback> --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection",
                )
            }
            #[cfg(not(target_os = "windows"))]
            {
                builder
            }
        }
        RuntimePlatform::Macos => {
            #[cfg(target_os = "macos")]
            {
                builder
                    .decorations(true)
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true)
                    .traffic_light_position(tauri::LogicalPosition::new(14.0, 18.0))
            }
            #[cfg(not(target_os = "macos"))]
            {
                builder
            }
        }
        RuntimePlatform::Linux => builder.decorations(linux_native_decorations),
        RuntimePlatform::Unknown => builder.decorations(true),
    };

    let window = builder.build()?;
    let _ = window.restore_state(window_state_flags());
    let _ = window.set_focus();
    setup_window_state_listener(app, &window);

    #[cfg(target_os = "windows")]
    if chrome_mode == WindowChromeMode::OverlayNativeControls {
        use tauri_plugin_decorum::WebviewWindowExt;

        let _ = window.create_overlay_titlebar();
    }

    Ok(window)
}

fn window_bootstrap_script(platform: RuntimePlatform, chrome_mode: WindowChromeMode) -> String {
    format!(
        r#"
window.__LITGIT__ ??= {{}};
window.__LITGIT__.runtimePlatform = "{platform}";
window.__LITGIT__.windowChrome = "{chrome_mode}";
"#,
        platform = platform.as_str(),
        chrome_mode = chrome_mode.as_str()
    )
}

fn setup_window_state_listener(app: &AppHandle, window: &WebviewWindow) {
    let (tx, mut rx) = mpsc::channel::<()>(1);

    window.on_window_event(move |event| {
        use tauri::WindowEvent;

        if !matches!(event, WindowEvent::Moved(_) | WindowEvent::Resized(_)) {
            return;
        }

        let _ = tx.try_send(());
    });

    tauri::async_runtime::spawn({
        let app = app.clone();

        async move {
            while rx.recv().await.is_some() {
                tokio::time::sleep(Duration::from_millis(200)).await;
                let handle = app.clone();
                let app = app.clone();

                let _ = handle.run_on_main_thread(move || {
                    let _ = app.save_window_state(window_state_flags());
                });
            }
        }
    });
}

fn default_use_linux_native_decorations(environment: &LinuxWindowEnvironment) -> bool {
    if is_known_tiling_session(environment) {
        return false;
    }

    if !is_wayland_session(environment) {
        return true;
    }

    is_full_desktop_session(environment)
}

fn decoration_override(value: Option<&str>) -> Option<DecorationOverride> {
    match value?.trim().to_ascii_lowercase().as_str() {
        "auto" => Some(DecorationOverride::Auto),
        "native" | "system" => Some(DecorationOverride::Native),
        "custom" | "none" | "false" | "off" => Some(DecorationOverride::None),
        _ => None,
    }
}

fn is_truthy(value: Option<&str>) -> bool {
    matches!(
        value.map(|item| item.trim().to_ascii_lowercase()),
        Some(ref item) if matches!(item.as_str(), "1" | "true" | "yes" | "on")
    )
}

fn is_wayland_session(environment: &LinuxWindowEnvironment) -> bool {
    environment.wayland_display
        || matches!(
            environment
                .xdg_session_type
                .as_deref()
                .map(str::trim)
                .map(str::to_ascii_lowercase)
                .as_deref(),
            Some("wayland")
        )
}

fn is_known_tiling_session(environment: &LinuxWindowEnvironment) -> bool {
    environment.i3_sock
        || desktop_tokens(environment).iter().any(|token| {
            matches!(
                token.as_str(),
                "awesome"
                    | "bspwm"
                    | "dwm"
                    | "herbstluftwm"
                    | "hyprland"
                    | "i3"
                    | "i3wm"
                    | "leftwm"
                    | "niri"
                    | "qtile"
                    | "river"
                    | "sway"
                    | "wayfire"
                    | "xmonad"
            )
        })
}

fn is_full_desktop_session(environment: &LinuxWindowEnvironment) -> bool {
    desktop_tokens(environment).iter().any(|token| {
        matches!(
            token.as_str(),
            "budgie"
                | "cinnamon"
                | "cosmic"
                | "deepin"
                | "gnome"
                | "kde"
                | "mate"
                | "pantheon"
                | "plasma"
                | "unity"
                | "xfce"
                | "xfce4"
        )
    })
}

fn desktop_tokens(environment: &LinuxWindowEnvironment) -> Vec<String> {
    [
        environment.xdg_current_desktop.as_deref(),
        environment.xdg_session_desktop.as_deref(),
        environment.desktop_session.as_deref(),
    ]
    .into_iter()
    .flatten()
    .flat_map(|value| value.split([':', ';', ',', ' ']))
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(str::to_ascii_lowercase)
    .collect()
}

#[cfg(test)]
mod tests {
    use super::{
        use_linux_native_decorations, window_chrome_mode, LinuxWindowEnvironment, RuntimePlatform,
        WindowChromeMode,
    };

    #[test]
    fn uses_native_linux_decorations_for_full_desktop_sessions() {
        let environment = LinuxWindowEnvironment {
            xdg_session_type: Some("x11".to_string()),
            xdg_current_desktop: Some("GNOME".to_string()),
            ..LinuxWindowEnvironment::default()
        };

        assert!(use_linux_native_decorations(&environment));
    }

    #[test]
    fn disables_linux_native_decorations_for_tiling_sessions() {
        let environment = LinuxWindowEnvironment {
            wayland_display: true,
            xdg_session_type: Some("wayland".to_string()),
            xdg_current_desktop: Some("sway".to_string()),
            ..LinuxWindowEnvironment::default()
        };

        assert!(!use_linux_native_decorations(&environment));
    }

    #[test]
    fn windows_prefers_overlay_native_controls() {
        assert_eq!(
            window_chrome_mode(RuntimePlatform::Windows, true),
            WindowChromeMode::OverlayNativeControls
        );
    }

    #[test]
    fn linux_with_native_decorations_uses_native_chrome() {
        assert_eq!(
            window_chrome_mode(RuntimePlatform::Linux, true),
            WindowChromeMode::Native
        );
    }

    #[test]
    fn linux_without_native_decorations_uses_custom_chrome() {
        assert_eq!(
            window_chrome_mode(RuntimePlatform::Linux, false),
            WindowChromeMode::Custom
        );
    }

    #[test]
    fn macos_prefers_native_chrome() {
        assert_eq!(
            window_chrome_mode(RuntimePlatform::Macos, true),
            WindowChromeMode::Native
        );
    }
}
