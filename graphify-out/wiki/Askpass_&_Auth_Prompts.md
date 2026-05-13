# Askpass & Auth Prompts

> 57 nodes · cohesion 0.06

## Key Concepts

- **askpass.rs** (29 connections) — `apps/desktop/src-tauri/src/askpass.rs`
- **askpass_ipc.rs** (24 connections) — `apps/desktop/src-tauri/src/askpass_ipc.rs`
- **resolve_prompt_response()** (8 connections) — `apps/desktop/src-tauri/src/askpass.rs`
- **resolve_oauth_prompt_response()** (7 connections) — `apps/desktop/src-tauri/src/askpass.rs`
- **run_with_temp_home()** (7 connections) — `apps/desktop/src-tauri/src/askpass.rs`
- **handle_queue_prompt()** (6 connections) — `apps/desktop/src-tauri/src/askpass_ipc.rs`
- **handle_unix_connection()** (5 connections) — `apps/desktop/src-tauri/src/askpass_ipc.rs`
- **handle_windows_connection()** (5 connections) — `apps/desktop/src-tauri/src/askpass_ipc.rs`
- **serialize_ipc_payload()** (5 connections) — `apps/desktop/src-tauri/src/askpass_ipc.rs`
- **save_provider_token()** (5 connections) — `apps/desktop/src-tauri/src/askpass.rs`
- **start_askpass_server()** (4 connections) — `apps/desktop/src-tauri/src/askpass_ipc.rs`
- **start_windows_server()** (4 connections) — `apps/desktop/src-tauri/src/askpass_ipc.rs`
- **resolve_prompt_response_autofills_github_credentials_when_oauth_connected()** (4 connections) — `apps/desktop/src-tauri/src/askpass.rs`
- **resolve_prompt_response_uses_documented_bitbucket_oauth_username()** (4 connections) — `apps/desktop/src-tauri/src/askpass.rs`
- **resolve_prompt_response_uses_documented_gitlab_oauth_username()** (4 connections) — `apps/desktop/src-tauri/src/askpass.rs`
- **classify_prompt_kind()** (3 connections) — `apps/desktop/src-tauri/src/askpass.rs`
- **emit_git_auth_prompt()** (3 connections) — `apps/desktop/src-tauri/src/askpass.rs`
- **handle_get_response()** (3 connections) — `apps/desktop/src-tauri/src/askpass_ipc.rs`
- **start_unix_server()** (3 connections) — `apps/desktop/src-tauri/src/askpass_ipc.rs`
- **resolve_prompt_response_rejects_empty_non_cancelled_response_without_credentials()** (3 connections) — `apps/desktop/src-tauri/src/askpass.rs`
- **allow_remember_for_kind()** (2 connections) — `apps/desktop/src-tauri/src/askpass.rs`
- **create_temp_home_dir()** (2 connections) — `apps/desktop/src-tauri/src/askpass.rs`
- **AskpassSocketPath** (2 connections) — `apps/desktop/src-tauri/src/askpass_ipc.rs`
- **create_windows_pipe()** (2 connections) — `apps/desktop/src-tauri/src/askpass_ipc.rs`
- **FailingPayload** (2 connections) — `apps/desktop/src-tauri/src/askpass_ipc.rs`
- *... and 32 more nodes in this community*

## Relationships

- [[Community 32]] (2 shared connections)
- [[Repository Core]] (1 shared connections)
- [[App Shell & Windowing]] (1 shared connections)
- [[Community 74]] (1 shared connections)

## Source Files

- `apps/desktop/src-tauri/src/askpass.rs`
- `apps/desktop/src-tauri/src/askpass_ipc.rs`

## Audit Trail

- EXTRACTED: 174 (94%)
- INFERRED: 11 (6%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*