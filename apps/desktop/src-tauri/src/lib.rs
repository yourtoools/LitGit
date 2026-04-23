//! LitGit desktop application — a Tauri-based Git client.
//!
//! This crate exposes a `run` function that bootstraps the Tauri app
//! and registers all IPC commands for the frontend.

#![deny(missing_docs)]

use serde::Serialize;
use tauri::{Emitter, Listener, Manager};

mod diff_preview;
use diff_preview::{
    get_repository_commit_file_content, get_repository_commit_file_preflight,
    get_repository_file_content, get_repository_file_preflight,
};
mod diff_workspace;
use diff_workspace::{
    detect_repository_file_encoding, get_repository_commit_file_hunks, get_repository_file_blame,
    get_repository_file_history, get_repository_file_hunks, get_repository_file_text,
    save_repository_file_text,
};
mod launcher;
use history::{
    get_latest_repository_commit_message, get_repository_commit_files, get_repository_history,
};
use launcher::{get_launcher_applications, open_path_with_application};
mod branches;
use branches::{
    create_repository_branch, create_repository_branch_at_reference,
    delete_remote_repository_branch, delete_repository_branch, get_repository_branches,
    get_repository_remote_avatars, get_repository_remote_names, rename_repository_branch,
    set_repository_branch_upstream, switch_repository_branch,
};
mod commit_messages;
use commit_messages::{
    commit_repository_changes, generate_repository_commit_message,
    initialize_github_identity_cache, list_ai_models,
};
mod git_support;
use git_support::check_git_credentials_status;
mod git_host_auth;
mod history;
mod repository;
mod repository_publishing;
use repository::{
    clone_git_repository, create_local_repository, create_repository_initial_commit,
    pick_clone_destination_folder, pick_git_repository, pick_settings_file,
    validate_opened_repositories,
};
use repository_publishing::list_publish_targets;
mod repository_actions;
use repository_actions::{
    checkout_repository_commit, cherry_pick_repository_commit, create_repository_tag,
    drop_repository_commit, pull_repository_action, push_repository_branch,
    revert_repository_commit, reword_repository_commit, run_repository_merge_action,
};
mod settings;
use settings::{
    clear_ai_provider_secret, clear_http_credential_entry, clear_proxy_auth_secret,
    generate_ssh_keypair, get_ai_provider_secret_status, get_git_identity,
    get_proxy_auth_secret_status, get_settings_backend_capabilities, list_http_credential_entries,
    list_signing_keys, list_system_font_families, save_ai_provider_secret, save_proxy_auth_secret,
    set_git_identity, start_auto_fetch_scheduler, stop_auto_fetch_scheduler, test_proxy_connection,
    SettingsState,
};
mod stashes;
use stashes::{
    apply_repository_stash, create_repository_stash, drop_repository_stash, get_repository_stashes,
    pop_repository_stash,
};
mod terminal;
use terminal::{
    close_terminal_session, create_terminal_session, resize_terminal_session,
    write_terminal_session, TerminalState,
};
mod windowing;
use windowing::{create_main_window, window_state_flags};
mod working_tree;
use working_tree::{
    add_repository_ignore_rule, discard_all_repository_changes, discard_repository_path_changes,
    get_repository_files, get_repository_working_tree_items, get_repository_working_tree_status,
    reset_repository_to_reference, stage_all_repository_changes, stage_repository_file,
    unstage_all_repository_changes, unstage_repository_file,
};

mod askpass;
use askpass::{cancel_git_auth_prompt, submit_git_auth_prompt_response};

mod askpass_ipc;
use askpass_ipc::start_askpass_server;

mod askpass_state;
use askpass_state::GitAuthBrokerState;

mod ssh_auth;
use ssh_auth::{
    copy_public_key, delete_ssh_key, generate_litgit_key_with_dialog, generate_ssh_key,
    list_ssh_keys, test_ssh_connection,
};

mod integrations_store;

mod oauth;
use oauth::{
    complete_oauth_flow, disconnect_provider_cmd, get_provider_status, redeem_oauth_handoff_token,
    redeem_oauth_handoff_token_impl, start_oauth_flow, OAuthFlowManager,
    PendingOAuthCallbackManager, PendingOAuthHandoffManager,
};

mod provider_ssh;
use provider_ssh::{
    generate_provider_ssh_key, get_provider_ssh_status_cmd, remove_provider_ssh_key_cmd,
    set_provider_custom_ssh_key_cmd, set_provider_ssh_use_system_agent,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryFileDiff {
    path: String,
    old_text: String,
    new_text: String,
    viewer_kind: String,
    old_image_data_url: Option<String>,
    new_image_data_url: Option<String>,
    unsupported_extension: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryCommitFileDiff {
    commit_hash: String,
    path: String,
    old_text: String,
    new_text: String,
    viewer_kind: String,
    old_image_data_url: Option<String>,
    new_image_data_url: Option<String>,
    unsupported_extension: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
struct OAuthDeepLinkPayload {
    token: String,
}

fn parse_oauth_deep_link(url: &str) -> Option<OAuthDeepLinkPayload> {
    let parsed = url::Url::parse(url).ok()?;

    if parsed.scheme() != "litgit"
        || parsed.host_str() != Some("oauth")
        || parsed.path() != "/callback"
    {
        return None;
    }

    let mut token = None;

    for (key, value) in parsed.query_pairs() {
        if key.as_ref() == "token" {
            token = Some(value.into_owned());
        }
    }

    Some(OAuthDeepLinkPayload { token: token? })
}

/// Generates a random alphanumeric token of 24 characters.
pub(crate) fn random_token() -> String {
    use rand::distributions::Alphanumeric;
    use rand::Rng;

    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(24)
        .map(char::from)
        .collect()
}

macro_rules! desktop_invoke_handler {
    () => {
        tauri::generate_handler![
            pick_git_repository,
            pick_clone_destination_folder,
            pick_settings_file,
            generate_ssh_keypair,
            list_signing_keys,
            list_system_font_families,
            create_local_repository,
            get_git_identity,
            set_git_identity,
            clone_git_repository,
            validate_opened_repositories,
            create_repository_initial_commit,
            get_repository_history,
            get_latest_repository_commit_message,
            get_repository_branches,
            get_repository_remote_names,
            get_repository_remote_avatars,
            get_repository_stashes,
            create_repository_branch,
            create_repository_branch_at_reference,
            delete_repository_branch,
            rename_repository_branch,
            delete_remote_repository_branch,
            set_repository_branch_upstream,
            switch_repository_branch,
            checkout_repository_commit,
            pull_repository_action,
            run_repository_merge_action,
            push_repository_branch,
            create_repository_stash,
            apply_repository_stash,
            pop_repository_stash,
            drop_repository_stash,
            commit_repository_changes,
            reword_repository_commit,
            drop_repository_commit,
            add_repository_ignore_rule,
            stage_all_repository_changes,
            unstage_all_repository_changes,
            stage_repository_file,
            unstage_repository_file,
            discard_repository_path_changes,
            discard_all_repository_changes,
            reset_repository_to_reference,
            cherry_pick_repository_commit,
            revert_repository_commit,
            create_repository_tag,
            get_repository_file_preflight,
            get_repository_file_content,
            get_repository_file_hunks,
            get_repository_file_history,
            get_repository_file_blame,
            get_repository_file_text,
            detect_repository_file_encoding,
            save_repository_file_text,
            get_repository_commit_files,
            get_repository_commit_file_preflight,
            get_repository_commit_file_content,
            get_repository_commit_file_hunks,
            get_repository_working_tree_status,
            get_repository_working_tree_items,
            get_repository_files,
            get_settings_backend_capabilities,
            save_ai_provider_secret,
            get_ai_provider_secret_status,
            clear_ai_provider_secret,
            list_ai_models,
            generate_repository_commit_message,
            check_git_credentials_status,
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
            close_terminal_session,
            get_launcher_applications,
            open_path_with_application,
            submit_git_auth_prompt_response,
            cancel_git_auth_prompt,
            list_publish_targets,
            list_ssh_keys,
            generate_ssh_key,
            delete_ssh_key,
            copy_public_key,
            test_ssh_connection,
            generate_litgit_key_with_dialog,
            start_oauth_flow,
            complete_oauth_flow,
            disconnect_provider_cmd,
            get_provider_status,
            generate_provider_ssh_key,
            remove_provider_ssh_key_cmd,
            get_provider_ssh_status_cmd,
            set_provider_ssh_use_system_agent,
            set_provider_custom_ssh_key_cmd,
            redeem_oauth_handoff_token
        ]
    };
}

/// Starts the Tauri desktop application and registers its commands and shared state.
///
/// If the Tauri runtime fails to initialize or run, the process exits with status code `1`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
// Tauri command registration stays centralized here so the desktop entrypoint is easy to audit.
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(window_state_flags())
                .build(),
        )
        .manage(TerminalState::default())
        .manage(SettingsState::default())
        .manage(GitAuthBrokerState::default())
        .manage(OAuthFlowManager::default())
        .manage(PendingOAuthCallbackManager::default())
        .manage(PendingOAuthHandoffManager::default());

    #[cfg(target_os = "windows")]
    let builder = builder.plugin(tauri_plugin_decorum::init());

    let result = builder
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(error) = app.deep_link().register_all() {
                    log::warn!(
                        "Could not auto-register deep-link schemes from config in dev mode: {}",
                        error
                    );

                    if let Err(fallback_error) = app.deep_link().register("litgit") {
                        log::warn!(
                            "Could not fallback-register litgit:// deep-link scheme: {}",
                            fallback_error
                        );
                    }
                }
            }

            // Start the askpass IPC server before setup completes so auth commands
            // never race a missing socket path on first use.
            let auth_state = app.state::<GitAuthBrokerState>();
            let app_handle_for_server = app.handle().clone();
            let auth_state_clone = std::sync::Arc::new(auth_state.inner().clone());
            match tauri::async_runtime::block_on(start_askpass_server(
                app_handle_for_server,
                auth_state_clone,
            )) {
                Ok(socket_path) => {
                    app.state::<SettingsState>()
                        .set_askpass_socket_path(socket_path);
                }
                Err(error) => {
                    log::error!("Failed to start askpass server: {}", error);
                }
            }

            initialize_github_identity_cache(app.handle(), app.state::<SettingsState>().inner());

            // Set up deep link handler for OAuth callbacks
            // The deep-link plugin emits "deep-link://new-url" events when URLs are received
            let app_handle = app.handle().clone();
            let emit_handle = app_handle.clone();
            let deep_link_listener = app_handle.clone();
            deep_link_listener.listen("deep-link://new-url", move |event: tauri::Event| {
                if let Ok(urls) = serde_json::from_str::<Vec<String>>(event.payload()) {
                    for url in urls {
                        if let Some(payload) = parse_oauth_deep_link(&url) {
                            let pending_callbacks =
                                app_handle.state::<PendingOAuthCallbackManager>();
                            let pending_handoffs = app_handle.state::<PendingOAuthHandoffManager>();

                            if let Ok(confirmed) = redeem_oauth_handoff_token_impl(
                                &payload.token,
                                &pending_callbacks,
                                &pending_handoffs,
                            ) {
                                let _ = emit_handle.emit(
                                    "oauth-callback",
                                    serde_json::json!({
                                        "code": confirmed.code,
                                        "state": confirmed.state
                                    }),
                                );
                            } else {
                                log::warn!(
                                    "Ignoring OAuth deep link with invalid/expired handoff token"
                                );
                            }
                        }
                    }
                }
            });

            create_main_window(app.handle())?;

            Ok(())
        })
        .invoke_handler(desktop_invoke_handler!())
        .run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("error while running tauri application: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        parse_oauth_deep_link, redeem_oauth_handoff_token_impl, RepositoryCommitFileDiff,
        RepositoryFileDiff,
    };
    use crate::oauth::{OAuthProvider, PendingOAuthCallbackManager, PendingOAuthHandoffManager};
    use serde_json::json;

    #[test]
    fn repository_file_diff_serializes_camel_case_fields() {
        let diff = RepositoryFileDiff {
            path: "src/lib.rs".to_string(),
            old_text: "old".to_string(),
            new_text: "new".to_string(),
            viewer_kind: "text".to_string(),
            old_image_data_url: None,
            new_image_data_url: None,
            unsupported_extension: Some("bin".to_string()),
        };

        let value = serde_json::to_value(&diff).expect("repository file diff should serialize");

        assert_eq!(
            value,
            json!({
                "path": "src/lib.rs",
                "oldText": "old",
                "newText": "new",
                "viewerKind": "text",
                "oldImageDataUrl": null,
                "newImageDataUrl": null,
                "unsupportedExtension": "bin",
            })
        );
    }

    #[test]
    fn repository_commit_file_diff_serializes_commit_hash_and_content_fields() {
        let diff = RepositoryCommitFileDiff {
            commit_hash: "abc123".to_string(),
            path: "src/lib.rs".to_string(),
            old_text: "before".to_string(),
            new_text: "after".to_string(),
            viewer_kind: "text".to_string(),
            old_image_data_url: None,
            new_image_data_url: None,
            unsupported_extension: None,
        };

        let value =
            serde_json::to_value(&diff).expect("repository commit file diff should serialize");

        assert_eq!(
            value,
            json!({
                "commitHash": "abc123",
                "path": "src/lib.rs",
                "oldText": "before",
                "newText": "after",
                "viewerKind": "text",
                "oldImageDataUrl": null,
                "newImageDataUrl": null,
                "unsupportedExtension": null,
            })
        );
    }

    #[test]
    fn parse_oauth_deep_link_returns_handoff_token() {
        let parsed = parse_oauth_deep_link("litgit://oauth/callback?token=opaque-token")
            .expect("deep link should parse");

        assert_eq!(parsed.token, "opaque-token");
    }

    #[test]
    fn parse_oauth_deep_link_rejects_non_oauth_urls() {
        assert!(parse_oauth_deep_link("litgit://settings").is_none());
    }

    #[test]
    fn oauth_deep_link_round_trip_confirms_only_matching_staged_callback() {
        let callbacks = PendingOAuthCallbackManager::default();
        let handoffs = PendingOAuthHandoffManager::default();

        // Stage a callback
        callbacks.stage_callback(
            OAuthProvider::GitHub,
            "expected-state".to_string(),
            "raw-code".to_string(),
            "http://127.0.0.1:43123/callback?code=raw-code&state=expected-state".to_string(),
        );

        // Issue a handoff token for the same state
        let token = handoffs
            .issue_token(OAuthProvider::GitHub, "expected-state".to_string())
            .expect("should issue token");

        // Parse the deep link with the token
        let parsed = parse_oauth_deep_link(&format!("litgit://oauth/callback?token={}", token))
            .expect("deep link should parse");

        // Redeem the token through the handoff manager
        let confirmed = redeem_oauth_handoff_token_impl(&parsed.token, &callbacks, &handoffs)
            .expect("matching deep link should redeem staged callback");

        assert_eq!(confirmed.code, "raw-code");
        assert_eq!(confirmed.state, "expected-state");
    }
}
