use serde::Serialize;
use std::path::Path;
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
use crate::git_support::{
    encode_image_data_url, git_command, is_probably_text_content, resolve_file_extension,
    resolve_image_mime_type, validate_git_repo,
};
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

struct DiffPreviewPayload {
    viewer_kind: String,
    old_text: String,
    new_text: String,
    old_image_data_url: Option<String>,
    new_image_data_url: Option<String>,
    unsupported_extension: Option<String>,
}

fn text_content_to_string(content: Option<&[u8]>) -> String {
    content
        .map(|bytes| String::from_utf8_lossy(bytes).to_string())
        .unwrap_or_default()
}

fn build_diff_preview_payload(
    file_path: &str,
    old_content: Option<&[u8]>,
    new_content: Option<&[u8]>,
) -> DiffPreviewPayload {
    let extension = resolve_file_extension(file_path);

    if let Some(extension) = extension.clone() {
        if let Some(mime_type) = resolve_image_mime_type(&extension) {
            let old_image_data_url =
                old_content.and_then(|content| encode_image_data_url(content, mime_type));
            let new_image_data_url =
                new_content.and_then(|content| encode_image_data_url(content, mime_type));

            if old_image_data_url.is_some() || new_image_data_url.is_some() {
                return DiffPreviewPayload {
                    viewer_kind: "image".to_string(),
                    old_text: String::new(),
                    new_text: String::new(),
                    old_image_data_url,
                    new_image_data_url,
                    unsupported_extension: None,
                };
            }

            return DiffPreviewPayload {
                viewer_kind: "unsupported".to_string(),
                old_text: String::new(),
                new_text: String::new(),
                old_image_data_url: None,
                new_image_data_url: None,
                unsupported_extension: Some(extension),
            };
        }
    }

    if is_probably_text_content(old_content) && is_probably_text_content(new_content) {
        return DiffPreviewPayload {
            viewer_kind: "text".to_string(),
            old_text: text_content_to_string(old_content),
            new_text: text_content_to_string(new_content),
            old_image_data_url: None,
            new_image_data_url: None,
            unsupported_extension: None,
        };
    }

    DiffPreviewPayload {
        viewer_kind: "unsupported".to_string(),
        old_text: String::new(),
        new_text: String::new(),
        old_image_data_url: None,
        new_image_data_url: None,
        unsupported_extension: extension,
    }
}

#[tauri::command]
fn get_repository_commit_file_diff(
    repo_path: String,
    commit_hash: String,
    file_path: String,
) -> Result<RepositoryCommitFileDiff, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let old_output = git_command()
        .args([
            "-C",
            &repo_path,
            "show",
            &format!("{commit_hash}^:{file_path}"),
        ])
        .output()
        .map_err(|error| format!("Failed to run git show for previous commit file: {error}"))?;

    let old_content = old_output.status.success().then_some(old_output.stdout);

    let new_output = git_command()
        .args([
            "-C",
            &repo_path,
            "show",
            &format!("{commit_hash}:{file_path}"),
        ])
        .output()
        .map_err(|error| format!("Failed to run git show for commit file: {error}"))?;

    let new_content = new_output.status.success().then_some(new_output.stdout);
    let preview_payload =
        build_diff_preview_payload(&file_path, old_content.as_deref(), new_content.as_deref());

    Ok(RepositoryCommitFileDiff {
        commit_hash,
        path: file_path,
        old_text: preview_payload.old_text,
        new_text: preview_payload.new_text,
        viewer_kind: preview_payload.viewer_kind,
        old_image_data_url: preview_payload.old_image_data_url,
        new_image_data_url: preview_payload.new_image_data_url,
        unsupported_extension: preview_payload.unsupported_extension,
    })
}

#[tauri::command]
fn get_repository_file_diff(
    repo_path: String,
    file_path: String,
) -> Result<RepositoryFileDiff, String> {
    validate_git_repo(Path::new(&repo_path))?;

    let old_output = git_command()
        .args(["-C", &repo_path, "show", &format!("HEAD:{file_path}")])
        .output()
        .map_err(|error| format!("Failed to run git show: {error}"))?;

    let old_content = old_output.status.success().then_some(old_output.stdout);

    let full_path = Path::new(&repo_path).join(&file_path);
    let new_content = std::fs::read(&full_path).ok();
    let preview_payload =
        build_diff_preview_payload(&file_path, old_content.as_deref(), new_content.as_deref());

    Ok(RepositoryFileDiff {
        path: file_path,
        old_text: preview_payload.old_text,
        new_text: preview_payload.new_text,
        viewer_kind: preview_payload.viewer_kind,
        old_image_data_url: preview_payload.old_image_data_url,
        new_image_data_url: preview_payload.new_image_data_url,
        unsupported_extension: preview_payload.unsupported_extension,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        .invoke_handler(tauri::generate_handler![
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
            get_repository_file_diff,
            get_repository_file_preflight,
            get_repository_file_content,
            get_repository_file_hunks,
            get_repository_file_history,
            get_repository_file_blame,
            get_repository_file_text,
            detect_repository_file_encoding,
            save_repository_file_text,
            get_repository_commit_files,
            get_repository_commit_file_diff,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
