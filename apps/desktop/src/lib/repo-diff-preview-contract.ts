import type {
  RepositoryCommitFileDiff,
  RepositoryCommitFilePreflight,
  RepositoryDiffPreviewGate,
  RepositoryDiffPreviewGateDetails,
  RepositoryDiffPreviewMode,
  RepositoryFileDiff,
  RepositoryFilePreflight,
} from "@/stores/repo/repo-store-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableNumber(value: unknown): value is number | null {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isViewerKind(
  value: unknown
): value is "image" | "text" | "unsupported" {
  return value === "image" || value === "text" || value === "unsupported";
}

function isPreviewMode(value: unknown): value is RepositoryDiffPreviewMode {
  return value === "diff" || value === "file";
}

function isPreviewGate(value: unknown): value is RepositoryDiffPreviewGate {
  return (
    value === "none" ||
    value === "file_line_limit" ||
    value === "diff_changed_line_limit" ||
    value === "non_text_size_limit" ||
    value === "binary_unsupported" ||
    value === "diff_line_count_unavailable"
  );
}

function parseGateDetails(
  value: unknown
): RepositoryDiffPreviewGateDetails | null {
  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new Error("Invalid preview gate details payload");
  }

  const { current, limit } = value;

  if (!(isNullableNumber(current) && isNullableNumber(limit))) {
    throw new Error("Invalid preview gate details payload");
  }

  return { current, limit };
}

function parseFilePreflightBase(
  value: unknown,
  errorMessage: string
): Omit<RepositoryFilePreflight, "path"> & { path: string } {
  if (!isRecord(value)) {
    throw new Error(errorMessage);
  }

  const {
    fileSizeBytes,
    gate,
    gateDetails,
    isBinary,
    lineCountChanged,
    lineCountFile,
    mode,
    newSideBytes,
    oldSideBytes,
    path,
    unsupportedExtension,
    viewerKind,
  } = value;

  if (
    typeof path !== "string" ||
    !isPreviewMode(mode) ||
    !isPreviewGate(gate) ||
    typeof isBinary !== "boolean" ||
    !isViewerKind(viewerKind) ||
    !isNullableNumber(fileSizeBytes) ||
    !isNullableNumber(lineCountChanged) ||
    !isNullableNumber(lineCountFile) ||
    !isNullableNumber(oldSideBytes) ||
    !isNullableNumber(newSideBytes) ||
    !isNullableString(unsupportedExtension)
  ) {
    throw new Error(errorMessage);
  }

  return {
    fileSizeBytes,
    gate,
    gateDetails: parseGateDetails(gateDetails),
    isBinary,
    lineCountChanged,
    lineCountFile,
    mode,
    newSideBytes,
    oldSideBytes,
    path,
    unsupportedExtension,
    viewerKind,
  };
}

export function parseRepositoryFilePreflight(
  value: unknown
): RepositoryFilePreflight {
  return parseFilePreflightBase(
    value,
    "Invalid repository file preflight payload"
  );
}

export function parseRepositoryCommitFilePreflight(
  value: unknown
): RepositoryCommitFilePreflight {
  if (!isRecord(value)) {
    throw new Error("Invalid repository commit file preflight payload");
  }

  const { commitHash } = value;

  if (typeof commitHash !== "string") {
    throw new Error("Invalid repository commit file preflight payload");
  }

  return {
    commitHash,
    ...parseFilePreflightBase(
      value,
      "Invalid repository commit file preflight payload"
    ),
  };
}

function parseDiffContentBase(
  value: unknown,
  errorMessage: string
): Omit<RepositoryFileDiff, "path"> & { path: string } {
  if (!isRecord(value)) {
    throw new Error(errorMessage);
  }

  const {
    path,
    oldText,
    newText,
    viewerKind,
    oldImageDataUrl,
    newImageDataUrl,
    unsupportedExtension,
  } = value;

  if (
    typeof path !== "string" ||
    typeof oldText !== "string" ||
    typeof newText !== "string" ||
    !isViewerKind(viewerKind) ||
    !isNullableString(oldImageDataUrl) ||
    !isNullableString(newImageDataUrl) ||
    !isNullableString(unsupportedExtension)
  ) {
    throw new Error(errorMessage);
  }

  return {
    newImageDataUrl,
    newText,
    oldImageDataUrl,
    oldText,
    path,
    unsupportedExtension,
    viewerKind,
  };
}

export function parseRepositoryFileContent(value: unknown): RepositoryFileDiff {
  return parseDiffContentBase(value, "Invalid repository file content payload");
}

export function parseRepositoryCommitFileContent(
  value: unknown
): RepositoryCommitFileDiff {
  if (!isRecord(value)) {
    throw new Error("Invalid repository commit file content payload");
  }

  const { commitHash } = value;

  if (typeof commitHash !== "string") {
    throw new Error("Invalid repository commit file content payload");
  }

  return {
    commitHash,
    ...parseDiffContentBase(
      value,
      "Invalid repository commit file content payload"
    ),
  };
}
