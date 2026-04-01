import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@litgit/ui/components/avatar";
import { Button } from "@litgit/ui/components/button";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DiffWorkspaceMonacoBlameDecoration } from "@/components/views/repo-info/diff-workspace-monaco-types";
import type { RepositoryFileBlameLine } from "@/stores/repo/repo-store-types";

interface EditorProps {
  blameDecorations?: DiffWorkspaceMonacoBlameDecoration[];
  fontFamily: string;
  fontSize: number;
  language: string;
  lineNumbers: "off" | "on";
  minimapEnabled?: boolean;
  modelPath: string;
  onMount: (editor: unknown) => void;
  syntaxHighlighting: boolean;
  theme: "vs" | "vs-dark";
  value: string;
  wordWrap: "off" | "on" | "wordWrapColumn" | "bounded";
}

interface DiffWorkspaceBlameSurfaceProps {
  avatarUrlByCommitHash: Record<string, string | null>;
  EditorComponent: ComponentType<EditorProps>;
  fontFamily: string;
  fontSize: number;
  isLoading: boolean;
  language: string;
  lineNumbers: "off" | "on";
  lines: RepositoryFileBlameLine[];
  modelPath: string;
  onPreviewEditorMount: (editor: unknown) => void;
  onRetry: () => void;
  renderError: string | null;
  syntaxHighlighting: boolean;
  theme: "vs" | "vs-dark";
  wordWrap: "off" | "on" | "wordWrapColumn" | "bounded";
}

interface BlameCommitSummary {
  author: string;
  authorTime: number | null;
  commitHash: string;
  firstLineNumber: number;
  lineCount: number;
  summary: string;
}
const AUTHOR_SPLIT_PATTERN = /\s+/;

function resolveAvatarLabel(author: string): string {
  const parts = author
    .split(AUTHOR_SPLIT_PATTERN)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return "?";
  }

  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");
  return initials.join("");
}

function resolveAuthorColor(author: string): string {
  let hash = 0;

  for (const character of author) {
    hash = (hash * 31 + character.charCodeAt(0)) % 2_147_483_647;
  }

  const hue = hash % 360;
  return `hsl(${hue} 72% 58%)`;
}

function toDateLabel(authorTime: number | null): string {
  if (authorTime === null || !Number.isFinite(authorTime)) {
    return "Unknown date";
  }

  const parsed = new Date(authorTime * 1000);

  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function toRelativeDateLabel(authorTime: number | null): string {
  if (authorTime === null || !Number.isFinite(authorTime)) {
    return "Unknown date";
  }

  const now = Date.now();
  const sourceTime = authorTime * 1000;
  const diffInMinutes = Math.round((sourceTime - now) / 60_000);
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

  return toDateLabel(authorTime);
}

export function DiffWorkspaceBlameSurface({
  avatarUrlByCommitHash,
  EditorComponent,
  fontFamily,
  fontSize,
  isLoading,
  language,
  lineNumbers,
  lines,
  modelPath,
  onPreviewEditorMount,
  onRetry,
  renderError,
  syntaxHighlighting,
  theme,
  wordWrap,
}: DiffWorkspaceBlameSurfaceProps) {
  const previewEditorRef = useRef<{
    revealLineInCenter?: (line: number) => void;
  } | null>(null);
  const normalizedLines = useMemo(
    () => [...lines].sort((left, right) => left.lineNumber - right.lineNumber),
    [lines]
  );
  const previewText = useMemo(
    () => normalizedLines.map((line) => line.text).join("\n"),
    [normalizedLines]
  );
  const blameDecorations = useMemo<DiffWorkspaceMonacoBlameDecoration[]>(
    () =>
      normalizedLines.map((line) => ({
        author: line.author,
        avatarLabel: resolveAvatarLabel(line.author),
        color: resolveAuthorColor(`${line.author}:${line.authorEmail}`),
        lineNumber: line.lineNumber,
      })),
    [normalizedLines]
  );
  const commitSummaries = useMemo<BlameCommitSummary[]>(() => {
    const summariesByHash = new Map<string, BlameCommitSummary>();

    for (const line of normalizedLines) {
      const existing = summariesByHash.get(line.commitHash);

      if (existing) {
        existing.lineCount += 1;
        continue;
      }

      summariesByHash.set(line.commitHash, {
        author: line.author,
        authorTime: line.authorTime ?? null,
        commitHash: line.commitHash,
        firstLineNumber: line.lineNumber,
        lineCount: 1,
        summary: line.summary,
      });
    }

    return Array.from(summariesByHash.values()).sort(
      (left, right) => left.firstLineNumber - right.firstLineNumber
    );
  }, [normalizedLines]);
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(
    null
  );
  const selectedSummary = useMemo(
    () =>
      commitSummaries.find(
        (entry) => entry.commitHash === selectedCommitHash
      ) ??
      commitSummaries.at(0) ??
      null,
    [commitSummaries, selectedCommitHash]
  );

  useEffect(() => {
    if (commitSummaries.length === 0) {
      setSelectedCommitHash(null);
      return;
    }

    if (
      selectedCommitHash &&
      commitSummaries.some((entry) => entry.commitHash === selectedCommitHash)
    ) {
      return;
    }

    setSelectedCommitHash(commitSummaries[0].commitHash);
  }, [commitSummaries, selectedCommitHash]);

  useEffect(() => {
    if (!selectedSummary) {
      return;
    }

    previewEditorRef.current?.revealLineInCenter?.(
      selectedSummary.firstLineNumber
    );
  }, [selectedSummary]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        <SpinnerGapIcon className="mr-2 size-4 animate-spin" />
        Loading blame...
      </div>
    );
  }

  if (renderError) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="space-y-3 border border-border/70 bg-background px-4 py-4 text-center">
          <p className="font-medium text-sm">Error loading blame</p>
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

  if (normalizedLines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        No blame lines found.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="h-full w-[27rem] shrink-0 border-border/70 border-r bg-background/95">
        <div className="h-full overflow-y-auto">
          {commitSummaries.map((entry) => {
            const isSelected = entry.commitHash === selectedCommitHash;
            const avatarSrc = avatarUrlByCommitHash[entry.commitHash] ?? null;

            return (
              <button
                className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-border/50 border-b px-2 py-2 text-left transition-colors ${
                  isSelected
                    ? "bg-sky-500/15"
                    : "bg-transparent hover:bg-accent/30"
                }`}
                key={entry.commitHash}
                onClick={() => {
                  setSelectedCommitHash(entry.commitHash);
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
                  <p className="line-clamp-1 font-medium text-sm leading-5">
                    {entry.summary}
                  </p>
                  <p className="truncate text-[0.72rem] text-muted-foreground">
                    {toRelativeDateLabel(entry.authorTime)} by {entry.author}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-mono text-[0.68rem] text-muted-foreground">
                    {entry.commitHash.slice(0, 7)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <EditorComponent
            blameDecorations={blameDecorations}
            fontFamily={fontFamily}
            fontSize={fontSize}
            language={language}
            lineNumbers={lineNumbers}
            minimapEnabled
            modelPath={modelPath}
            onMount={(editor) => {
              previewEditorRef.current = editor as {
                revealLineInCenter?: (line: number) => void;
              } | null;
              onPreviewEditorMount(editor);
            }}
            syntaxHighlighting={syntaxHighlighting}
            theme={theme}
            value={previewText}
            wordWrap={wordWrap}
          />
        </div>
      </section>
    </div>
  );
}
