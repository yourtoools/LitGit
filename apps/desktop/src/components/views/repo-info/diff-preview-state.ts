import type {
  RepositoryCommitFilePreflight,
  RepositoryDiffPreviewGate,
  RepositoryFilePreflight,
} from "@/stores/repo/repo-store-types";

export type DiffPreviewPanelState =
  | { kind: "contentLoading"; forceRender: boolean; path: string }
  | { description: string; kind: "guarded"; path: string; title: string }
  | { kind: "idle" }
  | { kind: "preflightLoading"; path: string }
  | { kind: "ready"; path: string }
  | { kind: "errorLoadingFile"; message?: string; path: string }
  | { kind: "errorRenderingDiff"; message?: string; path: string }
  | { kind: "unsupportedBinary"; path: string };

type PreflightLike = RepositoryCommitFilePreflight | RepositoryFilePreflight;

function formatMegabytes(value: number): string {
  const mb = value / (1024 * 1024);
  return mb.toFixed(1);
}

function resolveGuardCopy(
  gate: RepositoryDiffPreviewGate,
  preflight: PreflightLike
): { description: string; title: string } | null {
  const currentValue = preflight.gateDetails?.current ?? 0;
  const limitValue = preflight.gateDetails?.limit ?? 0;

  if (gate === "diff_changed_line_limit") {
    return {
      title: "Diff too large to render",
      description: `Limit: ${limitValue} changed lines, current: ${currentValue} changed lines`,
    };
  }

  if (gate === "file_line_limit") {
    return {
      title: "File too large to render",
      description: `Limit: ${limitValue} file lines, current: ${currentValue} file lines`,
    };
  }

  if (gate === "non_text_size_limit") {
    return {
      title: "File too large to render",
      description: `Limit: 10 MB for non-text preview, current: ${formatMegabytes(currentValue)} MB`,
    };
  }

  return null;
}

export function resolveDiffPreviewUiState(
  preflight: PreflightLike | null,
  fallbackPath: string,
  mode: "file" | "diff"
): DiffPreviewPanelState {
  const resolvedPath = preflight?.path ?? fallbackPath;

  if (!preflight) {
    return mode === "file"
      ? { kind: "errorLoadingFile", path: resolvedPath }
      : { kind: "errorRenderingDiff", path: resolvedPath };
  }

  if (preflight.gate === "binary_unsupported") {
    return { kind: "unsupportedBinary", path: resolvedPath };
  }

  if (preflight.gate === "diff_line_count_unavailable") {
    return { kind: "errorRenderingDiff", path: resolvedPath };
  }

  const guardCopy = resolveGuardCopy(preflight.gate, preflight);

  if (guardCopy) {
    return {
      kind: "guarded",
      path: resolvedPath,
      title: guardCopy.title,
      description: guardCopy.description,
    };
  }

  return { kind: "ready", path: resolvedPath };
}

export function shouldMountMonaco(
  state: DiffPreviewPanelState,
  viewerKind: "image" | "text" | "unsupported"
): boolean {
  return state.kind === "ready" && viewerKind === "text";
}
