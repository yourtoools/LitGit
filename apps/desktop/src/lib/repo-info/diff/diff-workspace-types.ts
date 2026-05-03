export type DiffWorkspaceMode = "blame" | "diff" | "edit" | "file" | "history";

export type DiffWorkspacePresentationMode = "hunk" | "inline" | "split";

export type DiffWorkspaceFilePresentationMode = "code" | "preview";

export type DiffWorkspaceViewerKind = "image" | "text" | "unsupported";

export interface DiffWorkspaceToolbarControlState {
  canNavigateChanges: boolean;
  canToggleWhitespace: boolean;
  canUseHunkMode: boolean;
  showStageAction: boolean;
}

export const DEFAULT_DIFF_WORKSPACE_MODE: DiffWorkspaceMode = "diff";
export const DEFAULT_DIFF_WORKSPACE_PRESENTATION: DiffWorkspacePresentationMode =
  "inline";
export const DEFAULT_DIFF_WORKSPACE_FILE_PRESENTATION: DiffWorkspaceFilePresentationMode =
  "preview";
