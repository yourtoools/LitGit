use serde::Serialize;
use std::fs;
use std::path::Path;

use super::{RepositoryCommitFileDiff, RepositoryFileDiff};
use crate::git_support::{
    decode_text_content_with_encoding, encode_image_data_url, is_probably_text_content,
    load_commit_contents, load_working_tree_contents, resolve_file_extension,
    resolve_image_mime_type, validate_git_repo, write_temp_bytes, GitSupportError,
};

const DIFF_CHANGED_LINE_LIMIT: usize = 500;
const FILE_LINE_LIMIT: usize = 20_000;
const NON_TEXT_SIZE_LIMIT_BYTES: usize = 10 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PreviewMode {
    Diff,
    File,
}

impl PreviewMode {
    fn from_str(value: &str) -> Result<Self, GitSupportError> {
        match value.trim().to_ascii_lowercase().as_str() {
            "diff" => Ok(Self::Diff),
            "file" => Ok(Self::File),
            _ => Err(GitSupportError::Message(
                "Invalid preview mode. Expected 'file' or 'diff'.".to_string(),
            )),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Diff => "diff",
            Self::File => "file",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PreviewGate {
    None,
    FileLineLimit { current: usize, limit: usize },
    DiffChangedLineLimit { current: usize, limit: usize },
    NonTextSizeLimit { current: usize, limit: usize },
    BinaryUnsupported,
    DiffLineCountUnavailable,
}

impl PreviewGate {
    fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::FileLineLimit { .. } => "file_line_limit",
            Self::DiffChangedLineLimit { .. } => "diff_changed_line_limit",
            Self::NonTextSizeLimit { .. } => "non_text_size_limit",
            Self::BinaryUnsupported => "binary_unsupported",
            Self::DiffLineCountUnavailable => "diff_line_count_unavailable",
        }
    }

    fn details(self) -> Option<PreviewGateDetails> {
        match self {
            Self::FileLineLimit { current, limit }
            | Self::DiffChangedLineLimit { current, limit }
            | Self::NonTextSizeLimit { current, limit } => Some(PreviewGateDetails {
                current: Some(current),
                limit: Some(limit),
            }),
            Self::BinaryUnsupported | Self::DiffLineCountUnavailable | Self::None => None,
        }
    }
}

/// Additional information describing why a preview gate was triggered.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreviewGateDetails {
    current: Option<usize>,
    limit: Option<usize>,
}

/// Preflight metadata for a working-tree file preview.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryFilePreflight {
    file_size_bytes: Option<usize>,
    gate: String,
    gate_details: Option<PreviewGateDetails>,
    is_binary: bool,
    line_count_changed: Option<usize>,
    line_count_file: Option<usize>,
    mode: String,
    new_side_bytes: Option<usize>,
    old_side_bytes: Option<usize>,
    path: String,
    unsupported_extension: Option<String>,
    viewer_kind: String,
}

/// Preflight metadata for a historical commit file preview.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryCommitFilePreflight {
    commit_hash: String,
    file_size_bytes: Option<usize>,
    gate: String,
    gate_details: Option<PreviewGateDetails>,
    is_binary: bool,
    line_count_changed: Option<usize>,
    line_count_file: Option<usize>,
    mode: String,
    new_side_bytes: Option<usize>,
    old_side_bytes: Option<usize>,
    path: String,
    unsupported_extension: Option<String>,
    viewer_kind: String,
}

struct PreflightMetadata {
    file_size_bytes: Option<usize>,
    gate: PreviewGate,
    is_binary: bool,
    line_count_changed: Option<usize>,
    line_count_file: Option<usize>,
    new_side_bytes: Option<usize>,
    old_side_bytes: Option<usize>,
    unsupported_extension: Option<String>,
    viewer_kind: &'static str,
}

struct PreviewContentPayload {
    new_image_data_url: Option<String>,
    new_text: String,
    old_image_data_url: Option<String>,
    old_text: String,
    unsupported_extension: Option<String>,
    viewer_kind: String,
}

fn count_text_lines(content: &[u8]) -> usize {
    if content.is_empty() {
        return 0;
    }

    let mut line_break_count = 0;

    for &byte in content {
        if byte == b'\n' {
            line_break_count += 1;
        }
    }

    if content.last().copied() == Some(b'\n') {
        line_break_count
    } else {
        line_break_count + 1
    }
}

fn compute_changed_line_count_with_git(old: &[u8], new: &[u8]) -> Option<usize> {
    let old_path = write_temp_bytes("old", old)?;
    let new_path = write_temp_bytes("new", new)?;

    let output = crate::git_support::run_git_tool_output(
        &[
            "diff",
            "--no-index",
            "--numstat",
            "--",
            old_path.to_string_lossy().as_ref(),
            new_path.to_string_lossy().as_ref(),
        ],
        "compute changed line count",
    )
    .ok()?;

    let _ = fs::remove_file(&old_path);
    let _ = fs::remove_file(&new_path);

    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim().is_empty() {
        return output.status.success().then_some(0);
    }

    let first_line = stdout.lines().find(|line| !line.trim().is_empty())?;
    let mut fields = first_line.split('\t');
    let additions = fields.next()?.trim();
    let deletions = fields.next()?.trim();

    if additions == "-" || deletions == "-" {
        return None;
    }

    let additions_value = additions.parse::<usize>().ok()?;
    let deletions_value = deletions.parse::<usize>().ok()?;
    Some(additions_value.saturating_add(deletions_value))
}

fn compute_changed_line_count(old: Option<&[u8]>, new: Option<&[u8]>) -> Option<usize> {
    match (old, new) {
        (None, None) => Some(0),
        (None, Some(new_content)) => Some(count_text_lines(new_content)),
        (Some(old_content), None) => Some(count_text_lines(old_content)),
        (Some(old_content), Some(new_content)) => {
            if old_content == new_content {
                return Some(0);
            }

            compute_changed_line_count_with_git(old_content, new_content)
        }
    }
}

fn resolve_file_target_bytes<'a>(
    old_content: Option<&'a [u8]>,
    new_content: Option<&'a [u8]>,
) -> Option<&'a [u8]> {
    new_content.or(old_content)
}

fn resolve_preflight_gate(
    mode: PreviewMode,
    viewer_kind: &str,
    is_binary: bool,
    file_size_bytes: Option<usize>,
    line_count_file: Option<usize>,
    line_count_changed: Option<usize>,
) -> PreviewGate {
    if is_binary {
        return PreviewGate::BinaryUnsupported;
    }

    if mode == PreviewMode::Diff && viewer_kind == "text" && line_count_changed.is_none() {
        return PreviewGate::DiffLineCountUnavailable;
    }

    if viewer_kind != "text" {
        if let Some(current_bytes) = file_size_bytes {
            if current_bytes > NON_TEXT_SIZE_LIMIT_BYTES {
                return PreviewGate::NonTextSizeLimit {
                    current: current_bytes,
                    limit: NON_TEXT_SIZE_LIMIT_BYTES,
                };
            }
        }
    }

    if mode == PreviewMode::Diff && viewer_kind == "text" {
        if let Some(changed_count) = line_count_changed {
            if changed_count > DIFF_CHANGED_LINE_LIMIT {
                return PreviewGate::DiffChangedLineLimit {
                    current: changed_count,
                    limit: DIFF_CHANGED_LINE_LIMIT,
                };
            }
        }
    }

    if mode == PreviewMode::File && viewer_kind == "text" {
        if let Some(file_line_count) = line_count_file {
            if file_line_count > FILE_LINE_LIMIT {
                return PreviewGate::FileLineLimit {
                    current: file_line_count,
                    limit: FILE_LINE_LIMIT,
                };
            }
        }
    }

    PreviewGate::None
}

fn build_preflight_metadata(
    file_path: &str,
    mode: PreviewMode,
    old_content: Option<&[u8]>,
    new_content: Option<&[u8]>,
) -> PreflightMetadata {
    let unsupported_extension = resolve_file_extension(file_path);
    let image_mime_type = unsupported_extension
        .as_deref()
        .and_then(resolve_image_mime_type);
    let is_text_content = image_mime_type.is_none()
        && is_probably_text_content(old_content)
        && is_probably_text_content(new_content);
    let viewer_kind = if image_mime_type.is_some() {
        "image"
    } else if is_text_content {
        "text"
    } else {
        "unsupported"
    };
    let is_binary = viewer_kind == "unsupported";
    let old_side_bytes = old_content.map(<[u8]>::len);
    let new_side_bytes = new_content.map(<[u8]>::len);
    let file_size_bytes = match mode {
        PreviewMode::File => resolve_file_target_bytes(old_content, new_content).map(<[u8]>::len),
        PreviewMode::Diff => match (old_side_bytes, new_side_bytes) {
            (Some(old_bytes), Some(new_bytes)) => Some(old_bytes.max(new_bytes)),
            (Some(old_bytes), None) => Some(old_bytes),
            (None, Some(new_bytes)) => Some(new_bytes),
            (None, None) => None,
        },
    };
    let line_count_file = if mode == PreviewMode::File && viewer_kind == "text" {
        resolve_file_target_bytes(old_content, new_content).map(count_text_lines)
    } else {
        None
    };
    let line_count_changed = if mode == PreviewMode::Diff && viewer_kind == "text" {
        compute_changed_line_count(old_content, new_content)
    } else {
        None
    };
    let gate = resolve_preflight_gate(
        mode,
        viewer_kind,
        is_binary,
        file_size_bytes,
        line_count_file,
        line_count_changed,
    );

    PreflightMetadata {
        file_size_bytes,
        gate,
        is_binary,
        line_count_changed,
        line_count_file,
        new_side_bytes,
        old_side_bytes,
        unsupported_extension,
        viewer_kind,
    }
}

fn build_content_payload(
    file_path: &str,
    mode: PreviewMode,
    old_content: Option<&[u8]>,
    new_content: Option<&[u8]>,
    encoding: Option<&str>,
) -> Result<PreviewContentPayload, GitSupportError> {
    let extension = resolve_file_extension(file_path);
    let image_mime_type = extension.as_deref().and_then(resolve_image_mime_type);

    if let Some(mime_type) = image_mime_type {
        let (old_side, new_side) = match mode {
            PreviewMode::Diff => (
                old_content.and_then(|content| encode_image_data_url(content, mime_type)),
                new_content.and_then(|content| encode_image_data_url(content, mime_type)),
            ),
            PreviewMode::File => {
                let target_data_url = resolve_file_target_bytes(old_content, new_content)
                    .and_then(|content| encode_image_data_url(content, mime_type));
                (None, target_data_url)
            }
        };

        if old_side.is_none() && new_side.is_none() {
            return Err(GitSupportError::Message(
                "Failed to render image preview".to_string(),
            ));
        }

        return Ok(PreviewContentPayload {
            old_text: String::new(),
            new_text: String::new(),
            viewer_kind: "image".to_string(),
            old_image_data_url: old_side,
            new_image_data_url: new_side,
            unsupported_extension: None,
        });
    }

    if is_probably_text_content(old_content) && is_probably_text_content(new_content) {
        return match mode {
            PreviewMode::Diff => Ok(PreviewContentPayload {
                old_text: decode_text_content_with_encoding(old_content, encoding)?,
                new_text: decode_text_content_with_encoding(new_content, encoding)?,
                viewer_kind: "text".to_string(),
                old_image_data_url: None,
                new_image_data_url: None,
                unsupported_extension: None,
            }),
            PreviewMode::File => {
                let target_text = decode_text_content_with_encoding(
                    resolve_file_target_bytes(old_content, new_content),
                    encoding,
                )?;
                Ok(PreviewContentPayload {
                    old_text: String::new(),
                    new_text: target_text,
                    viewer_kind: "text".to_string(),
                    old_image_data_url: None,
                    new_image_data_url: None,
                    unsupported_extension: None,
                })
            }
        };
    }

    Err(GitSupportError::Message(
        "Binary file not supported".to_string(),
    ))
}

/// Evaluates whether a working-tree file can be safely rendered in the selected preview mode.
#[tauri::command]
pub(crate) async fn get_repository_file_preflight(
    repo_path: String,
    file_path: String,
    mode: String,
) -> Result<RepositoryFilePreflight, String> {
    tauri::async_runtime::spawn_blocking(move || {
        get_repository_file_preflight_inner(repo_path, file_path, mode)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to load file preflight: {error}"))?
}

fn get_repository_file_preflight_inner(
    repo_path: String,
    file_path: String,
    mode: String,
) -> Result<RepositoryFilePreflight, GitSupportError> {
    validate_git_repo(Path::new(&repo_path))
        .map_err(|e| GitSupportError::Message(e.to_string()))?;
    let preview_mode = PreviewMode::from_str(&mode)?;
    let (old_content, new_content) = load_working_tree_contents(&repo_path, &file_path)?;
    let metadata = build_preflight_metadata(
        &file_path,
        preview_mode,
        old_content.as_deref(),
        new_content.as_deref(),
    );

    Ok(RepositoryFilePreflight {
        file_size_bytes: metadata.file_size_bytes,
        gate: metadata.gate.as_str().to_string(),
        gate_details: metadata.gate.details(),
        is_binary: metadata.is_binary,
        line_count_changed: metadata.line_count_changed,
        line_count_file: metadata.line_count_file,
        mode: preview_mode.as_str().to_string(),
        new_side_bytes: metadata.new_side_bytes,
        old_side_bytes: metadata.old_side_bytes,
        path: file_path,
        unsupported_extension: metadata.unsupported_extension,
        viewer_kind: metadata.viewer_kind.to_string(),
    })
}

/// Evaluates whether a commit file can be safely rendered in the selected preview mode.
#[tauri::command]
pub(crate) async fn get_repository_commit_file_preflight(
    repo_path: String,
    commit_hash: String,
    file_path: String,
    mode: String,
) -> Result<RepositoryCommitFilePreflight, String> {
    tauri::async_runtime::spawn_blocking(move || {
        get_repository_commit_file_preflight_inner(repo_path, commit_hash, file_path, mode)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to load commit file preflight: {error}"))?
}

fn get_repository_commit_file_preflight_inner(
    repo_path: String,
    commit_hash: String,
    file_path: String,
    mode: String,
) -> Result<RepositoryCommitFilePreflight, GitSupportError> {
    validate_git_repo(Path::new(&repo_path))
        .map_err(|e| GitSupportError::Message(e.to_string()))?;
    let preview_mode = PreviewMode::from_str(&mode)?;
    let (old_content, new_content) = load_commit_contents(&repo_path, &commit_hash, &file_path)?;
    let metadata = build_preflight_metadata(
        &file_path,
        preview_mode,
        old_content.as_deref(),
        new_content.as_deref(),
    );

    Ok(RepositoryCommitFilePreflight {
        commit_hash,
        file_size_bytes: metadata.file_size_bytes,
        gate: metadata.gate.as_str().to_string(),
        gate_details: metadata.gate.details(),
        is_binary: metadata.is_binary,
        line_count_changed: metadata.line_count_changed,
        line_count_file: metadata.line_count_file,
        mode: preview_mode.as_str().to_string(),
        new_side_bytes: metadata.new_side_bytes,
        old_side_bytes: metadata.old_side_bytes,
        path: file_path,
        unsupported_extension: metadata.unsupported_extension,
        viewer_kind: metadata.viewer_kind.to_string(),
    })
}

/// Returns working-tree file content for diff/file preview modes.
#[tauri::command]
pub(crate) async fn get_repository_file_content(
    repo_path: String,
    file_path: String,
    mode: String,
    force_render: bool,
    encoding: Option<String>,
) -> Result<RepositoryFileDiff, String> {
    tauri::async_runtime::spawn_blocking(move || {
        get_repository_file_content_inner(repo_path, file_path, mode, force_render, encoding)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to load file content: {error}"))?
}

fn get_repository_file_content_inner(
    repo_path: String,
    file_path: String,
    mode: String,
    force_render: bool,
    encoding: Option<String>,
) -> Result<RepositoryFileDiff, GitSupportError> {
    validate_git_repo(Path::new(&repo_path))
        .map_err(|e| GitSupportError::Message(e.to_string()))?;
    let preview_mode = PreviewMode::from_str(&mode)?;
    let (old_content, new_content) = load_working_tree_contents(&repo_path, &file_path)?;
    let metadata = build_preflight_metadata(
        &file_path,
        preview_mode,
        old_content.as_deref(),
        new_content.as_deref(),
    );

    if metadata.gate == PreviewGate::BinaryUnsupported {
        return Err(GitSupportError::Message(
            "Binary file not supported".to_string(),
        ));
    }

    if metadata.gate == PreviewGate::DiffLineCountUnavailable {
        return Err(GitSupportError::Message(
            "Unable to compute changed line count".to_string(),
        ));
    }

    if !force_render {
        match metadata.gate {
            PreviewGate::FileLineLimit { .. }
            | PreviewGate::DiffChangedLineLimit { .. }
            | PreviewGate::NonTextSizeLimit { .. } => {
                return Err(GitSupportError::Message(
                    "Render blocked by preview safety limits".to_string(),
                ));
            }
            PreviewGate::BinaryUnsupported
            | PreviewGate::DiffLineCountUnavailable
            | PreviewGate::None => {}
        }
    }

    let content_payload = build_content_payload(
        &file_path,
        preview_mode,
        old_content.as_deref(),
        new_content.as_deref(),
        encoding.as_deref(),
    )?;

    Ok(RepositoryFileDiff {
        path: file_path,
        old_text: content_payload.old_text,
        new_text: content_payload.new_text,
        viewer_kind: content_payload.viewer_kind,
        old_image_data_url: content_payload.old_image_data_url,
        new_image_data_url: content_payload.new_image_data_url,
        unsupported_extension: content_payload.unsupported_extension,
    })
}

/// Returns commit file content for diff/file preview modes.
#[tauri::command]
pub(crate) async fn get_repository_commit_file_content(
    repo_path: String,
    commit_hash: String,
    file_path: String,
    mode: String,
    force_render: bool,
    encoding: Option<String>,
) -> Result<RepositoryCommitFileDiff, String> {
    tauri::async_runtime::spawn_blocking(move || {
        get_repository_commit_file_content_inner(
            repo_path,
            commit_hash,
            file_path,
            mode,
            force_render,
            encoding,
        )
        .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Failed to load commit file content: {error}"))?
}

fn get_repository_commit_file_content_inner(
    repo_path: String,
    commit_hash: String,
    file_path: String,
    mode: String,
    force_render: bool,
    encoding: Option<String>,
) -> Result<RepositoryCommitFileDiff, GitSupportError> {
    validate_git_repo(Path::new(&repo_path))
        .map_err(|e| GitSupportError::Message(e.to_string()))?;
    let preview_mode = PreviewMode::from_str(&mode)?;
    let (old_content, new_content) = load_commit_contents(&repo_path, &commit_hash, &file_path)?;
    let metadata = build_preflight_metadata(
        &file_path,
        preview_mode,
        old_content.as_deref(),
        new_content.as_deref(),
    );

    if metadata.gate == PreviewGate::BinaryUnsupported {
        return Err(GitSupportError::Message(
            "Binary file not supported".to_string(),
        ));
    }

    if metadata.gate == PreviewGate::DiffLineCountUnavailable {
        return Err(GitSupportError::Message(
            "Unable to compute changed line count".to_string(),
        ));
    }

    if !force_render {
        match metadata.gate {
            PreviewGate::FileLineLimit { .. }
            | PreviewGate::DiffChangedLineLimit { .. }
            | PreviewGate::NonTextSizeLimit { .. } => {
                return Err(GitSupportError::Message(
                    "Render blocked by preview safety limits".to_string(),
                ));
            }
            PreviewGate::BinaryUnsupported
            | PreviewGate::DiffLineCountUnavailable
            | PreviewGate::None => {}
        }
    }

    let content_payload = build_content_payload(
        &file_path,
        preview_mode,
        old_content.as_deref(),
        new_content.as_deref(),
        encoding.as_deref(),
    )?;

    Ok(RepositoryCommitFileDiff {
        commit_hash,
        path: file_path,
        old_text: content_payload.old_text,
        new_text: content_payload.new_text,
        viewer_kind: content_payload.viewer_kind,
        old_image_data_url: content_payload.old_image_data_url,
        new_image_data_url: content_payload.new_image_data_url,
        unsupported_extension: content_payload.unsupported_extension,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        compute_changed_line_count, get_repository_commit_file_content,
        get_repository_commit_file_preflight, get_repository_file_content,
        get_repository_file_preflight, resolve_preflight_gate, PreviewGate, PreviewMode,
        NON_TEXT_SIZE_LIMIT_BYTES,
    };
    use crate::git_support::git_command;
    use std::env;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn binary_gate_wins_over_size_gate() {
        let gate = resolve_preflight_gate(
            PreviewMode::Diff,
            "unsupported",
            true,
            Some(NON_TEXT_SIZE_LIMIT_BYTES + 42),
            None,
            None,
        );

        assert_eq!(gate, PreviewGate::BinaryUnsupported);
    }

    #[test]
    fn text_diff_over_500_lines_gates_diff_render() {
        let gate = resolve_preflight_gate(
            PreviewMode::Diff,
            "text",
            false,
            Some(2_048),
            None,
            Some(501),
        );

        assert!(matches!(gate, PreviewGate::DiffChangedLineLimit { .. }));
    }

    #[test]
    fn non_text_over_10mb_gates_for_file_and_diff_modes() {
        let file_gate = resolve_preflight_gate(
            PreviewMode::File,
            "image",
            false,
            Some(NON_TEXT_SIZE_LIMIT_BYTES + 1),
            None,
            None,
        );
        let diff_gate = resolve_preflight_gate(
            PreviewMode::Diff,
            "image",
            false,
            Some(NON_TEXT_SIZE_LIMIT_BYTES + 1),
            None,
            None,
        );

        assert!(matches!(file_gate, PreviewGate::NonTextSizeLimit { .. }));
        assert!(matches!(diff_gate, PreviewGate::NonTextSizeLimit { .. }));
    }

    #[test]
    fn unknown_text_diff_line_count_returns_diff_line_count_unavailable() {
        let gate =
            resolve_preflight_gate(PreviewMode::Diff, "text", false, Some(1_024), None, None);
        assert_eq!(gate, PreviewGate::DiffLineCountUnavailable);
    }

    #[test]
    fn unchanged_text_diff_reports_zero_changed_lines() {
        let content = b"# markdown\nsame\n";
        let changed =
            compute_changed_line_count(Some(content.as_slice()), Some(content.as_slice()));

        assert_eq!(changed, Some(0));
    }

    #[tokio::test]
    async fn get_repository_file_preflight_reports_text_diff_metadata_for_working_tree_changes() {
        let repo = TempRepository::create();
        repo.write_file("notes.txt", "first line\nsecond line\n");
        repo.git(&["add", "notes.txt"]);
        repo.git(&["commit", "-m", "Add notes"]);
        repo.write_file("notes.txt", "first line\nchanged line\nthird line\n");

        let preflight = get_repository_file_preflight(
            repo.path.to_string_lossy().to_string(),
            "notes.txt".to_string(),
            "diff".to_string(),
        )
        .await
        .expect("working tree preflight");

        assert_eq!(preflight.path, "notes.txt");
        assert_eq!(preflight.mode, "diff");
        assert_eq!(preflight.viewer_kind, "text");
        assert_eq!(preflight.gate, "none");
        assert_eq!(preflight.line_count_changed, Some(3));
        assert!(!preflight.is_binary);
    }

    #[tokio::test]
    async fn get_repository_commit_file_preflight_reports_text_file_metadata_for_commit() {
        let repo = TempRepository::create();
        repo.write_file("notes.txt", "first line\nsecond line\n");
        repo.git(&["add", "notes.txt"]);
        repo.git(&["commit", "-m", "Add notes"]);
        repo.write_file("notes.txt", "first line\nchanged line\nthird line\n");
        repo.git(&["commit", "-am", "Update notes"]);
        let commit_hash = repo.git_output(&["rev-parse", "HEAD"]);

        let preflight = get_repository_commit_file_preflight(
            repo.path.to_string_lossy().to_string(),
            commit_hash.trim().to_string(),
            "notes.txt".to_string(),
            "file".to_string(),
        )
        .await
        .expect("commit preflight");

        assert_eq!(preflight.commit_hash, commit_hash.trim());
        assert_eq!(preflight.path, "notes.txt");
        assert_eq!(preflight.mode, "file");
        assert_eq!(preflight.viewer_kind, "text");
        assert_eq!(preflight.gate, "none");
        assert_eq!(preflight.line_count_file, Some(3));
        assert!(!preflight.is_binary);
    }

    #[tokio::test]
    async fn get_repository_file_content_returns_old_and_new_text_for_working_tree_diff() {
        let repo = TempRepository::create();
        repo.write_file("notes.txt", "first line\nsecond line\n");
        repo.git(&["add", "notes.txt"]);
        repo.git(&["commit", "-m", "Add notes"]);
        repo.write_file("notes.txt", "first line\nchanged line\nthird line\n");

        let diff = get_repository_file_content(
            repo.path.to_string_lossy().to_string(),
            "notes.txt".to_string(),
            "diff".to_string(),
            false,
            None,
        )
        .await
        .expect("working tree diff content");

        assert_eq!(diff.path, "notes.txt");
        assert_eq!(diff.viewer_kind, "text");
        assert_eq!(diff.old_text, "first line\nsecond line\n");
        assert_eq!(diff.new_text, "first line\nchanged line\nthird line\n");
    }

    #[tokio::test]
    async fn get_repository_commit_file_content_returns_old_and_new_text_for_commit_diff() {
        let repo = TempRepository::create();
        repo.write_file("notes.txt", "first line\nsecond line\n");
        repo.git(&["add", "notes.txt"]);
        repo.git(&["commit", "-m", "Add notes"]);
        repo.write_file("notes.txt", "first line\nchanged line\nthird line\n");
        repo.git(&["commit", "-am", "Update notes"]);
        let commit_hash = repo.git_output(&["rev-parse", "HEAD"]);

        let diff = get_repository_commit_file_content(
            repo.path.to_string_lossy().to_string(),
            commit_hash.trim().to_string(),
            "notes.txt".to_string(),
            "diff".to_string(),
            false,
            None,
        )
        .await
        .expect("commit diff content");

        assert_eq!(diff.commit_hash, commit_hash.trim());
        assert_eq!(diff.path, "notes.txt");
        assert_eq!(diff.viewer_kind, "text");
        assert_eq!(diff.old_text, "first line\nsecond line\n");
        assert_eq!(diff.new_text, "first line\nchanged line\nthird line\n");
    }

    struct TempRepository {
        path: PathBuf,
    }

    impl TempRepository {
        fn create() -> Self {
            let unique_suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock should be after unix epoch")
                .as_nanos();
            let path = env::temp_dir().join(format!("litgit-diff-preview-test-{unique_suffix}"));

            fs::create_dir_all(&path).expect("temp repo directory should be created");
            Self::git_in(&path, &["init", "-b", "main"]);
            Self::git_in(&path, &["config", "user.name", "LitGit Tests"]);
            Self::git_in(&path, &["config", "user.email", "tests@example.com"]);

            Self { path }
        }

        fn write_file(&self, relative_path: &str, contents: &str) {
            let file_path = self.path.join(relative_path);
            fs::write(file_path, contents).expect("repo file should be written");
        }

        fn git(&self, args: &[&str]) {
            Self::git_in(&self.path, args);
        }

        fn git_output(&self, args: &[&str]) -> String {
            let output = git_command()
                .args(["-C", self.path.to_string_lossy().as_ref()])
                .args(args)
                .output()
                .expect("git command should run");

            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );

            String::from_utf8_lossy(&output.stdout).to_string()
        }

        fn git_in(path: &Path, args: &[&str]) {
            let output = git_command()
                .args(["-C", path.to_string_lossy().as_ref()])
                .args(args)
                .output()
                .expect("git command should run");

            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }

    impl Drop for TempRepository {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}
