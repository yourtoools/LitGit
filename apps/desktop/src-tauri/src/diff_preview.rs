use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use super::{
    decode_text_content_with_encoding, git_command, is_probably_text_content,
    resolve_file_extension, resolve_image_mime_type, validate_git_repo, RepositoryCommitFileDiff,
    RepositoryFileDiff,
};

const DIFF_CHANGED_LINE_LIMIT: usize = 500;
const FILE_LINE_LIMIT: usize = 20_000;
const NON_TEXT_SIZE_LIMIT_BYTES: usize = 10 * 1024 * 1024;
const IMAGE_CONTENT_MAX_BYTES: usize = 64 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PreviewMode {
    Diff,
    File,
}

impl PreviewMode {
    fn from_str(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "diff" => Ok(Self::Diff),
            "file" => Ok(Self::File),
            _ => Err("Invalid preview mode. Expected 'file' or 'diff'.".to_string()),
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

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreviewGateDetails {
    current: Option<usize>,
    limit: Option<usize>,
}

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

fn count_text_lines(content: &[u8]) -> usize {
    if content.is_empty() {
        return 0;
    }

    let line_break_count = content.iter().filter(|byte| **byte == b'\n').count();

    if content.last().copied() == Some(b'\n') {
        line_break_count
    } else {
        line_break_count + 1
    }
}

fn write_temp_bytes(prefix: &str, content: &[u8]) -> Option<std::path::PathBuf> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).ok()?;
    let path = std::env::temp_dir().join(format!(
        "litgit-preview-{prefix}-{}-{}.tmp",
        std::process::id(),
        now.as_nanos()
    ));
    fs::write(&path, content).ok()?;
    Some(path)
}

fn compute_changed_line_count_with_git(old: &[u8], new: &[u8]) -> Option<usize> {
    let old_path = write_temp_bytes("old", old)?;
    let new_path = write_temp_bytes("new", new)?;

    let output = git_command()
        .args([
            "diff",
            "--no-index",
            "--numstat",
            "--",
            old_path.to_string_lossy().as_ref(),
            new_path.to_string_lossy().as_ref(),
        ])
        .output()
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

fn encode_image_data_url(content: &[u8], mime_type: &str) -> Option<String> {
    if content.is_empty() || content.len() > IMAGE_CONTENT_MAX_BYTES {
        return None;
    }

    let encoded = BASE64_STANDARD.encode(content);
    Some(format!("data:{mime_type};base64,{encoded}"))
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
    let old_side_bytes = old_content.map(|content| content.len());
    let new_side_bytes = new_content.map(|content| content.len());
    let file_size_bytes = match mode {
        PreviewMode::File => {
            resolve_file_target_bytes(old_content, new_content).map(|content| content.len())
        }
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

fn load_working_tree_contents(
    repo_path: &str,
    file_path: &str,
) -> Result<(Option<Vec<u8>>, Option<Vec<u8>>), String> {
    let old_output = git_command()
        .args(["-C", repo_path, "show", &format!("HEAD:{file_path}")])
        .output()
        .map_err(|error| format!("Failed to run git show: {error}"))?;
    let old_content = old_output.status.success().then_some(old_output.stdout);

    let new_content = fs::read(Path::new(repo_path).join(file_path)).ok();
    Ok((old_content, new_content))
}

fn load_commit_contents(
    repo_path: &str,
    commit_hash: &str,
    file_path: &str,
) -> Result<(Option<Vec<u8>>, Option<Vec<u8>>), String> {
    let old_output = git_command()
        .args([
            "-C",
            repo_path,
            "show",
            &format!("{commit_hash}^:{file_path}"),
        ])
        .output()
        .map_err(|error| format!("Failed to run git show for previous commit file: {error}"))?;
    let old_content = old_output.status.success().then_some(old_output.stdout);

    let new_output = git_command()
        .args([
            "-C",
            repo_path,
            "show",
            &format!("{commit_hash}:{file_path}"),
        ])
        .output()
        .map_err(|error| format!("Failed to run git show for commit file: {error}"))?;
    let new_content = new_output.status.success().then_some(new_output.stdout);

    Ok((old_content, new_content))
}

fn build_content_payload(
    file_path: &str,
    mode: PreviewMode,
    old_content: Option<&[u8]>,
    new_content: Option<&[u8]>,
    encoding: Option<&str>,
) -> Result<
    (
        String,
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
    ),
    String,
> {
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
            return Err("Failed to render image preview".to_string());
        }

        return Ok((
            String::new(),
            String::new(),
            "image".to_string(),
            old_side,
            new_side,
            None,
        ));
    }

    if is_probably_text_content(old_content) && is_probably_text_content(new_content) {
        return match mode {
            PreviewMode::Diff => Ok((
                decode_text_content_with_encoding(old_content, encoding)?,
                decode_text_content_with_encoding(new_content, encoding)?,
                "text".to_string(),
                None,
                None,
                None,
            )),
            PreviewMode::File => {
                let target_text = decode_text_content_with_encoding(
                    resolve_file_target_bytes(old_content, new_content),
                    encoding,
                )?;
                Ok((
                    String::new(),
                    target_text,
                    "text".to_string(),
                    None,
                    None,
                    None,
                ))
            }
        };
    }

    Err("Binary file not supported".to_string())
}

#[tauri::command]
pub(crate) fn get_repository_file_preflight(
    repo_path: String,
    file_path: String,
    mode: String,
) -> Result<RepositoryFilePreflight, String> {
    validate_git_repo(Path::new(&repo_path))?;
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

#[tauri::command]
pub(crate) fn get_repository_commit_file_preflight(
    repo_path: String,
    commit_hash: String,
    file_path: String,
    mode: String,
) -> Result<RepositoryCommitFilePreflight, String> {
    validate_git_repo(Path::new(&repo_path))?;
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

#[tauri::command]
pub(crate) fn get_repository_file_content(
    repo_path: String,
    file_path: String,
    mode: String,
    force_render: bool,
    encoding: Option<String>,
) -> Result<RepositoryFileDiff, String> {
    validate_git_repo(Path::new(&repo_path))?;
    let preview_mode = PreviewMode::from_str(&mode)?;
    let (old_content, new_content) = load_working_tree_contents(&repo_path, &file_path)?;
    let metadata = build_preflight_metadata(
        &file_path,
        preview_mode,
        old_content.as_deref(),
        new_content.as_deref(),
    );

    if metadata.gate == PreviewGate::BinaryUnsupported {
        return Err("Binary file not supported".to_string());
    }

    if metadata.gate == PreviewGate::DiffLineCountUnavailable {
        return Err("Unable to compute changed line count".to_string());
    }

    if !force_render {
        match metadata.gate {
            PreviewGate::FileLineLimit { .. }
            | PreviewGate::DiffChangedLineLimit { .. }
            | PreviewGate::NonTextSizeLimit { .. } => {
                return Err("Render blocked by preview safety limits".to_string());
            }
            PreviewGate::BinaryUnsupported
            | PreviewGate::DiffLineCountUnavailable
            | PreviewGate::None => {}
        }
    }

    let (
        old_text,
        new_text,
        viewer_kind,
        old_image_data_url,
        new_image_data_url,
        unsupported_extension,
    ) = build_content_payload(
        &file_path,
        preview_mode,
        old_content.as_deref(),
        new_content.as_deref(),
        encoding.as_deref(),
    )?;

    Ok(RepositoryFileDiff {
        path: file_path,
        old_text,
        new_text,
        viewer_kind,
        old_image_data_url,
        new_image_data_url,
        unsupported_extension,
    })
}

#[tauri::command]
pub(crate) fn get_repository_commit_file_content(
    repo_path: String,
    commit_hash: String,
    file_path: String,
    mode: String,
    force_render: bool,
    encoding: Option<String>,
) -> Result<RepositoryCommitFileDiff, String> {
    validate_git_repo(Path::new(&repo_path))?;
    let preview_mode = PreviewMode::from_str(&mode)?;
    let (old_content, new_content) = load_commit_contents(&repo_path, &commit_hash, &file_path)?;
    let metadata = build_preflight_metadata(
        &file_path,
        preview_mode,
        old_content.as_deref(),
        new_content.as_deref(),
    );

    if metadata.gate == PreviewGate::BinaryUnsupported {
        return Err("Binary file not supported".to_string());
    }

    if metadata.gate == PreviewGate::DiffLineCountUnavailable {
        return Err("Unable to compute changed line count".to_string());
    }

    if !force_render {
        match metadata.gate {
            PreviewGate::FileLineLimit { .. }
            | PreviewGate::DiffChangedLineLimit { .. }
            | PreviewGate::NonTextSizeLimit { .. } => {
                return Err("Render blocked by preview safety limits".to_string());
            }
            PreviewGate::BinaryUnsupported
            | PreviewGate::DiffLineCountUnavailable
            | PreviewGate::None => {}
        }
    }

    let (
        old_text,
        new_text,
        viewer_kind,
        old_image_data_url,
        new_image_data_url,
        unsupported_extension,
    ) = build_content_payload(
        &file_path,
        preview_mode,
        old_content.as_deref(),
        new_content.as_deref(),
        encoding.as_deref(),
    )?;

    Ok(RepositoryCommitFileDiff {
        commit_hash,
        path: file_path,
        old_text,
        new_text,
        viewer_kind,
        old_image_data_url,
        new_image_data_url,
        unsupported_extension,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        compute_changed_line_count, resolve_preflight_gate, PreviewGate, PreviewMode,
        NON_TEXT_SIZE_LIMIT_BYTES,
    };

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
        let changed = compute_changed_line_count(Some(content.as_slice()), Some(content.as_slice()));

        assert_eq!(changed, Some(0));
    }
}
