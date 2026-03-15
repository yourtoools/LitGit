import type {
  DiffWorkspaceMode,
  DiffWorkspacePresentationMode,
  DiffWorkspaceToolbarControlState,
  DiffWorkspaceViewerKind,
} from "@/components/views/repo-info/diff-workspace-types";

export function resolvePresentationForViewerKind(
  requestedPresentation: DiffWorkspacePresentationMode,
  viewerKind: DiffWorkspaceViewerKind
): DiffWorkspacePresentationMode {
  if (viewerKind !== "text" && requestedPresentation === "hunk") {
    return "inline";
  }

  return requestedPresentation;
}

export function resolveToolbarControlState(input: {
  hasDiffEditor: boolean;
  hasHunks: boolean;
  isWorkingTreeSource: boolean;
  mode: DiffWorkspaceMode;
  presentation: DiffWorkspacePresentationMode;
  viewerKind: DiffWorkspaceViewerKind;
}): DiffWorkspaceToolbarControlState {
  const isTextDiffMode =
    (input.mode === "diff" || input.mode === "history") &&
    input.viewerKind === "text";
  const canNavigateTextDiff =
    input.presentation === "hunk" ? input.hasHunks : input.hasDiffEditor;
  const canNavigateChanges =
    input.mode === "diff" && isTextDiffMode && canNavigateTextDiff;

  return {
    canNavigateChanges,
    canToggleWhitespace: isTextDiffMode,
    canUseHunkMode: input.mode === "diff" && isTextDiffMode,
    showStageAction: input.isWorkingTreeSource,
  };
}
