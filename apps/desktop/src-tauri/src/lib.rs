use serde::Serialize;
use tauri::Manager;

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
mod history;
mod repository;
use repository::{
    clone_git_repository, create_local_repository, create_repository_initial_commit,
    pick_clone_destination_folder, pick_git_repository, pick_settings_file,
    validate_opened_repositories,
};
mod repository_actions;
use repository_actions::{
    checkout_repository_commit, cherry_pick_repository_commit, create_repository_tag,
    drop_repository_commit, pull_repository_action, push_repository_branch,
    revert_repository_commit, reword_repository_commit, run_repository_merge_action,
};
mod settings;
use settings::{
    clear_ai_provider_secret, clear_github_token, clear_http_credential_entry,
    clear_proxy_auth_secret, generate_ssh_keypair, get_ai_provider_secret_status, get_git_identity,
    get_github_token_status, get_proxy_auth_secret_status, get_settings_backend_capabilities,
    list_http_credential_entries, list_signing_keys, list_system_font_families,
    save_ai_provider_secret, save_github_token, save_proxy_auth_secret, set_git_identity,
    start_auto_fetch_scheduler, stop_auto_fetch_scheduler, test_proxy_connection, SettingsState,
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
mod working_tree;
use working_tree::{
    add_repository_ignore_rule, discard_all_repository_changes, discard_repository_path_changes,
    get_repository_files, get_repository_working_tree_items, get_repository_working_tree_status,
    reset_repository_to_reference, stage_all_repository_changes, stage_repository_file,
    unstage_all_repository_changes, unstage_repository_file,
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
            save_github_token,
            get_github_token_status,
            clear_github_token,
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
            open_path_with_application
        ]
    };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Starts the Tauri desktop application and registers its commands and shared state.
///
/// If the Tauri runtime fails to initialize or run, the process exits with status code `1`.
// Tauri command registration stays centralized here so the desktop entrypoint is easy to audit.
pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(TerminalState::default())
        .manage(SettingsState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let settings_state = app.state::<SettingsState>();
            initialize_github_identity_cache(app.handle(), settings_state.inner());

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
    use super::{RepositoryCommitFileDiff, RepositoryFileDiff};
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
}
