import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@litgit/ui/components/avatar";
import { Button } from "@litgit/ui/components/button";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { useMemo } from "react";
import type { DiffPreviewPanelState } from "@/components/views/repo-info/diff-preview-state";
import { DiffPreviewSurface } from "@/components/views/repo-info/diff-preview-surface";
import { ImageDiffViewer } from "@/components/views/repo-info/image-diff-viewer";
import type {
  RepositoryCommitFileDiff,
  RepositoryFileHistoryEntry,
} from "@/stores/repo/repo-store-types";

interface DiffEditorProps {
  collapseUnchanged?: {
    margin: number;
    minSize: number;
  } | null;
  fontFamily: string;
  fontSize: number;
  ignoreTrimWhitespace: boolean;
  language: string;
  lineNumbers: "off" | "on";
  mode: "diff";
  modelPath: string;
  modified: string;
  onMount: (editor: unknown) => void;
  original: string;
  renderSideBySide: boolean;
  syntaxHighlighting: boolean;
  tabSize: number;
  theme: "light" | "dark";
  wordWrap: "off" | "on";
}

interface DiffWorkspaceHistorySurfaceProps {
  avatarUrlByCommitHash: Record<string, string | null>;
  DiffEditorComponent: ComponentType<DiffEditorProps>;
  diff: RepositoryCommitFileDiff | null;
  diffModelPathBase: string;
  diffState: DiffPreviewPanelState;
  entries: RepositoryFileHistoryEntry[];
  fontFamily: string;
  fontSize: number;
  ignoreTrimWhitespace: boolean;
  isLoading: boolean;
  language: string;
  lineNumbers: "off" | "on";
  onCancelDiff: () => void;
  onDiffEditorMount: (editor: unknown) => void;
  onRenderDiffAnyway: () => void;
  onRetry: () => void;
  onRetryDiff: () => void;
  onSelectEntry: (entry: RepositoryFileHistoryEntry) => void;
  renderError: string | null;
  renderSideBySide: boolean;
  selectedCommitHash: string | null;
  syntaxHighlighting: boolean;
  tabSize: number;
  theme: "light" | "dark";
  wordWrap: "off" | "on";
}

const AUTHOR_SPLIT_PATTERN = /\s+/;

function toDateLabel(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function toRelativeDateLabel(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const now = Date.now();
  const diffInMinutes = Math.round((parsed.getTime() - now) / 60_000);
  const formatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
  });
  const absMinutes = Math.abs(diffInMinutes);

  if (absMinutes < 60) {
    return formatter.format(diffInMinutes, "minute");
  }

  const diffInHours = Math.round(diffInMinutes / 60);
  const absHours = Math.abs(diffInHours);

  if (absHours < 24) {
    return formatter.format(diffInHours, "hour");
  }

  const diffInDays = Math.round(diffInHours / 24);
  const absDays = Math.abs(diffInDays);

  if (absDays < 30) {
    return formatter.format(diffInDays, "day");
  }

  return toDateLabel(value);
}

function resolveAvatarLabel(author: string): string {
  const parts = author
    .split(AUTHOR_SPLIT_PATTERN)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return "?";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function DiffWorkspaceHistorySurface({
  avatarUrlByCommitHash,
  diff,
  DiffEditorComponent,
  diffModelPathBase,
  diffState,
  entries,
  fontFamily,
  fontSize,
  ignoreTrimWhitespace,
  isLoading,
  language,
  lineNumbers,
  onCancelDiff,
  onDiffEditorMount,
  onRenderDiffAnyway,
  onRetry,
  onRetryDiff,
  onSelectEntry,
  renderError,
  renderSideBySide,
  selectedCommitHash,
  syntaxHighlighting,
  tabSize,
  theme,
  wordWrap,
}: DiffWorkspaceHistorySurfaceProps) {
  const normalizedEntries = useMemo(
    () =>
      entries.map((entry) => ({
        ...entry,
        relativeDateLabel: toRelativeDateLabel(entry.date),
      })),
    [entries]
  );
  const isDiffReady = diffState.kind === "ready";
  const shouldRenderDiffGate = !isDiffReady;
  const shouldRenderTextDiff =
    isDiffReady && diff !== null && diff.viewerKind === "text";
  const shouldRenderImageDiff =
    isDiffReady && diff !== null && diff.viewerKind === "image";
  const hasBothImageSides =
    (diff?.oldImageDataUrl ?? null) !== null &&
    (diff?.newImageDataUrl ?? null) !== null &&
    diff?.oldImageDataUrl !== diff?.newImageDataUrl;
  const useImageSplitView = renderSideBySide && hasBothImageSides;

  if (isLoading && entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        <SpinnerGapIcon className="mr-2 size-4 animate-spin" />
        Loading file history...
      </div>
    );
  }

  if (renderError && entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="space-y-3 border border-border/70 bg-background px-4 py-4 text-center">
          <p className="font-medium text-sm">Error loading file history</p>
          <Button
            className="h-7 px-3 text-xs"
            onClick={onRetry}
            size="sm"
            type="button"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        No history entries found for this file.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="h-full w-[27rem] shrink-0 border-border/70 border-r bg-background/95">
        <div className="h-full overflow-y-auto">
          {normalizedEntries.map((entry) => {
            const isSelected = entry.commitHash === selectedCommitHash;
            const avatarSrc =
              entry.authorAvatarUrl ??
              avatarUrlByCommitHash[entry.commitHash] ??
              null;

            return (
              <button
                className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-border/50 border-b px-2 py-2 text-left transition-colors ${
                  isSelected
                    ? "bg-sky-500/15"
                    : "bg-transparent hover:bg-accent/30"
                }`}
                key={entry.commitHash}
                onClick={() => {
                  onSelectEntry(entry);
                }}
                type="button"
              >
                <Avatar className="size-8 border border-border/60">
                  <AvatarImage
                    alt={entry.author}
                    src={avatarSrc ?? undefined}
                  />
                  <AvatarFallback className="text-[0.62rem]">
                    {resolveAvatarLabel(entry.author)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm leading-5">
                    {entry.messageSummary}
                  </p>
                  <p className="truncate text-[0.72rem] text-muted-foreground">
                    {entry.relativeDateLabel} by {entry.author}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-mono text-[0.68rem] text-muted-foreground">
                    {entry.shortHash}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          {shouldRenderDiffGate ? (
            <DiffPreviewSurface
              onCancel={onCancelDiff}
              onRenderAnyway={onRenderDiffAnyway}
              onRetry={onRetryDiff}
              state={diffState}
            />
          ) : null}

          {shouldRenderTextDiff ? (
            <DiffEditorComponent
              collapseUnchanged={null}
              fontFamily={fontFamily}
              fontSize={fontSize}
              ignoreTrimWhitespace={ignoreTrimWhitespace}
              language={language}
              lineNumbers={lineNumbers}
              mode="diff"
              modelPath={diffModelPathBase}
              modified={diff.newText}
              onMount={onDiffEditorMount}
              original={diff.oldText}
              renderSideBySide={renderSideBySide}
              syntaxHighlighting={syntaxHighlighting}
              tabSize={tabSize}
              theme={theme}
              wordWrap={wordWrap}
            />
          ) : null}

          {shouldRenderImageDiff ? (
            <ImageDiffViewer
              filePath={diff.path}
              newImageSrc={diff.newImageDataUrl}
              oldImageSrc={diff.oldImageDataUrl}
              splitView={useImageSplitView}
            />
          ) : null}

          {isDiffReady && diff === null ? (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              No diff available for this history entry.
            </div>
          ) : null}

          {isDiffReady &&
          diff !== null &&
          diff.viewerKind !== "text" &&
          diff.viewerKind !== "image" ? (
            <div className="flex h-full items-center justify-center px-6">
              <div className="space-y-3 border border-border/70 bg-background px-4 py-4 text-center">
                <p className="font-medium text-sm">
                  Unsupported file extension
                </p>
                <p className="text-muted-foreground text-xs">
                  This file type is not previewable in Diff View.
                </p>
                {diff.unsupportedExtension ? (
                  <p className="text-muted-foreground/80 text-xs">
                    Detected extension: .{diff.unsupportedExtension}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
