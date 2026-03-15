import { Button } from "@litgit/ui/components/button";
import { DiffEditor } from "@monaco-editor/react";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import type { editor as MonacoEditor } from "monaco-editor";
import {
  buildDiffModelPaths,
  resolveDiffSplitBehavior,
} from "@/components/views/repo-info/diff-workspace-monaco-model";
import type { RepositoryFileHunk } from "@/stores/repo/repo-store-types";

interface DiffWorkspaceHunkSurfaceProps {
  fontFamily: string;
  fontSize: number;
  hunks: RepositoryFileHunk[];
  ignoreTrimWhitespace: boolean;
  isLoading: boolean;
  language: string;
  lineNumbers: "off" | "on";
  modelPathBase: string;
  modified: string;
  onMount: (editor: MonacoEditor.IStandaloneDiffEditor) => void;
  onRetry: () => void;
  original: string;
  renderError: string | null;
  syntaxHighlighting: boolean;
  theme: "vs" | "vs-dark";
  wordWrap: "off" | "on" | "wordWrapColumn" | "bounded";
}

export function DiffWorkspaceHunkSurface({
  fontFamily,
  fontSize,
  hunks,
  ignoreTrimWhitespace,
  isLoading,
  language,
  lineNumbers,
  modelPathBase,
  modified,
  onMount,
  onRetry,
  original,
  renderError,
  syntaxHighlighting,
  theme,
  wordWrap,
}: DiffWorkspaceHunkSurfaceProps) {
  const diffModelPaths = buildDiffModelPaths(modelPathBase);
  const splitBehavior = resolveDiffSplitBehavior(false);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        <SpinnerGapIcon className="mr-2 size-4 animate-spin" />
        Loading hunks...
      </div>
    );
  }

  if (renderError) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="space-y-3 border border-border/70 bg-background px-4 py-4 text-center">
          <p className="font-medium text-sm">Error rendering diff</p>
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

  if (hunks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        No changed hunks found.
      </div>
    );
  }

  return (
    <DiffEditor
      height="100%"
      keepCurrentModifiedModel={false}
      keepCurrentOriginalModel={false}
      language={language}
      modified={modified}
      modifiedModelPath={diffModelPaths.modifiedModelPath}
      onMount={onMount}
      options={{
        automaticLayout: true,
        experimentalWhitespaceRendering: "svg",
        fontFamily,
        fontSize,
        ...splitBehavior,
        hideUnchangedRegions: {
          enabled: true,
        },
        ignoreTrimWhitespace,
        lineNumbers,
        minimap: { enabled: false },
        readOnly: true,
        scrollBeyondLastLine: false,
        wordSeparators: syntaxHighlighting ? undefined : "",
        wordWrap,
      }}
      original={original}
      originalModelPath={diffModelPaths.originalModelPath}
      theme={theme}
    />
  );
}
