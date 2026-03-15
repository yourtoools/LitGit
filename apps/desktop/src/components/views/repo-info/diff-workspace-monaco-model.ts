export interface MonacoModelPathInput {
  commitHash?: string | null;
  filePath: string;
  source: "commit" | "working";
}
const LEADING_SLASHES_PATTERN = /^\/+/;

function normalizeModelFilePath(filePath: string): string {
  const normalized = filePath
    .replaceAll("\\", "/")
    .replace(LEADING_SLASHES_PATTERN, "");
  const encoded = encodeURIComponent(normalized).replaceAll("%2F", "/");

  return encoded.length > 0 ? encoded : "untitled";
}

export function buildMonacoModelBasePath(input: MonacoModelPathInput): string {
  const normalizedFilePath = normalizeModelFilePath(input.filePath);

  if (input.source === "commit") {
    const normalizedCommitHash = input.commitHash?.trim().length
      ? input.commitHash.trim()
      : "unknown";
    const encodedCommitHash = encodeURIComponent(normalizedCommitHash);

    return `inmemory://litgit/commit/${encodedCommitHash}/${normalizedFilePath}`;
  }

  return `inmemory://litgit/working/${normalizedFilePath}`;
}

export function buildDiffModelPaths(modelBasePath: string): {
  modifiedModelPath: string;
  originalModelPath: string;
} {
  const separator = modelBasePath.includes("?") ? "&" : "?";

  return {
    modifiedModelPath: `${modelBasePath}${separator}side=modified`,
    originalModelPath: `${modelBasePath}${separator}side=original`,
  };
}

export function resolveDiffSplitBehavior(renderSideBySide: boolean): {
  renderSideBySide: boolean;
  renderSideBySideInlineBreakpoint: number;
  useInlineViewWhenSpaceIsLimited: boolean;
} {
  return {
    renderSideBySide,
    renderSideBySideInlineBreakpoint: 0,
    useInlineViewWhenSpaceIsLimited: false,
  };
}
