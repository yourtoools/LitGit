import { Button } from "@litgit/ui/components/button";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import type { RepositoryFileHunk } from "@/stores/repo/repo-store-types";

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

interface DiffWorkspaceHunkSurfaceProps {
  DiffEditorComponent: ComponentType<DiffEditorProps>;
  fontFamily: string;
  fontSize: number;
  hunks: RepositoryFileHunk[];
  ignoreTrimWhitespace: boolean;
  isLoading: boolean;
  language: string;
  lineNumbers: "off" | "on";
  modelPathBase: string;
  modified: string;
  onMount: (editor: unknown) => void;
  onRetry: () => void;
  original: string;
  renderError: string | null;
  syntaxHighlighting: boolean;
  tabSize: number;
  theme: "light" | "dark";
  wordWrap: "off" | "on";
}

export function DiffWorkspaceHunkSurface({
  DiffEditorComponent,
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
  tabSize,
  theme,
  wordWrap,
}: DiffWorkspaceHunkSurfaceProps) {
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
    <DiffEditorComponent
      collapseUnchanged={{
        margin: 3,
        minSize: 4,
      }}
      fontFamily={fontFamily}
      fontSize={fontSize}
      ignoreTrimWhitespace={ignoreTrimWhitespace}
      language={language}
      lineNumbers={lineNumbers}
      mode="diff"
      modelPath={modelPathBase}
      modified={modified}
      onMount={onMount}
      original={original}
      renderSideBySide={false}
      syntaxHighlighting={syntaxHighlighting}
      tabSize={tabSize}
      theme={theme}
      wordWrap={wordWrap}
    />
  );
}
