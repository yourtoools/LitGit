import { Button } from "@litgit/ui/components/button";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import type { DiffPreviewPanelState } from "@/lib/repo-info/diff/diff-preview-state";

interface DiffPreviewSurfaceProps {
  onCancel: () => void;
  onRenderAnyway: () => void;
  onRetry: () => void;
  state: DiffPreviewPanelState;
}

export function DiffPreviewSurface({
  onCancel,
  onRenderAnyway,
  onRetry,
  state,
}: DiffPreviewSurfaceProps) {
  if (state.kind === "ready" || state.kind === "idle") {
    return null;
  }

  if (state.kind === "preflightLoading" || state.kind === "contentLoading") {
    const label =
      state.kind === "preflightLoading"
        ? "Checking file preview limits..."
        : "Rendering preview...";

    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <SpinnerGapIcon className="size-4 animate-spin" />
          <span>{label}</span>
        </div>
      </div>
    );
  }

  if (state.kind === "guarded") {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="w-full max-w-md space-y-3 border border-border/70 bg-background px-4 py-4 text-center">
          <p className="font-medium text-sm">{state.title}</p>
          <p className="text-muted-foreground text-xs">{state.description}</p>
          <div className="flex items-center justify-center gap-2">
            <Button
              className="h-7 px-3 text-xs"
              onClick={onRenderAnyway}
              size="sm"
              type="button"
            >
              Render anyway
            </Button>
            <Button
              className="h-7 px-3 text-xs"
              onClick={onCancel}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === "unsupportedBinary") {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="space-y-2 border border-border/70 bg-background px-4 py-4 text-center">
          <p className="font-medium text-sm">Binary file not supported</p>
          <p className="text-muted-foreground text-xs">
            This file cannot be rendered in the current preview.
          </p>
        </div>
      </div>
    );
  }

  const title =
    state.kind === "errorLoadingFile"
      ? "Error loading file"
      : "Error rendering diff";
  const description =
    state.message ??
    "Try reopening the file with another encoding, then retry.";

  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="space-y-3 border border-border/70 bg-background px-4 py-4 text-center">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
        <div className="flex items-center justify-center gap-2">
          <Button
            className="h-7 px-3 text-xs"
            onClick={onRetry}
            size="sm"
            type="button"
          >
            Retry
          </Button>
          <Button
            className="h-7 px-3 text-xs"
            onClick={onCancel}
            size="sm"
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
