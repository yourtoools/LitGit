import { DiffEditor } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import {
  buildDiffModelPaths,
  resolveDiffSplitBehavior,
} from "@/components/views/repo-info/diff-workspace-monaco-model";

interface DiffPreviewMonacoSurfaceProps {
  fontFamily: string;
  fontSize: number;
  ignoreTrimWhitespace: boolean;
  language: string;
  lineNumbers: "off" | "on";
  modelPathBase: string;
  modified: string;
  onMount: (editor: MonacoEditor.IStandaloneDiffEditor) => void;
  original: string;
  renderSideBySide: boolean;
  syntaxHighlighting: boolean;
  theme: "vs" | "vs-dark";
  wordWrap: "off" | "on" | "wordWrapColumn" | "bounded";
}

export function DiffPreviewMonacoSurface({
  fontFamily,
  fontSize,
  ignoreTrimWhitespace,
  language,
  lineNumbers,
  modelPathBase,
  modified,
  onMount,
  original,
  renderSideBySide,
  syntaxHighlighting,
  theme,
  wordWrap,
}: DiffPreviewMonacoSurfaceProps) {
  const diffModelPaths = buildDiffModelPaths(modelPathBase);
  const splitBehavior = resolveDiffSplitBehavior(renderSideBySide);
  const diffEditorKey = `${modelPathBase}:${language}:${renderSideBySide ? "split" : "inline"}`;

  return (
    <DiffEditor
      height="100%"
      keepCurrentModifiedModel={false}
      keepCurrentOriginalModel={false}
      key={diffEditorKey}
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
        lineNumbers,
        minimap: { enabled: false },
        readOnly: true,
        scrollBeyondLastLine: false,
        ignoreTrimWhitespace,
        wordSeparators: syntaxHighlighting ? undefined : "",
        wordWrap,
      }}
      original={original}
      originalModelPath={diffModelPaths.originalModelPath}
      theme={theme}
    />
  );
}
