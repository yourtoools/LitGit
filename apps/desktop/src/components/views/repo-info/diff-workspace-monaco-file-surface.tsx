import { Editor } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { useEffect, useMemo, useRef } from "react";
import type { DiffWorkspaceMonacoBlameDecoration } from "@/components/views/repo-info/diff-workspace-monaco-types";

export type { DiffWorkspaceMonacoBlameDecoration } from "@/components/views/repo-info/diff-workspace-monaco-types";

interface DiffWorkspaceMonacoFileSurfaceProps {
  blameDecorations?: DiffWorkspaceMonacoBlameDecoration[];
  fontFamily: string;
  fontSize: number;
  language: string;
  lineNumbers: "off" | "on";
  minimapEnabled?: boolean;
  modelPath: string;
  onMount: (editor: MonacoEditor.IStandaloneCodeEditor) => void;
  syntaxHighlighting: boolean;
  theme: "vs" | "vs-dark";
  value: string;
  wordWrap: "off" | "on" | "wordWrapColumn" | "bounded";
}

export function DiffWorkspaceMonacoFileSurface({
  blameDecorations,
  fontFamily,
  fontSize,
  language,
  lineNumbers,
  minimapEnabled = false,
  modelPath,
  onMount,
  syntaxHighlighting,
  theme,
  value,
  wordWrap,
}: DiffWorkspaceMonacoFileSurfaceProps) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const decorationCollectionRef =
    useRef<MonacoEditor.IEditorDecorationsCollection | null>(null);
  const styleElementRef = useRef<HTMLStyleElement | null>(null);
  const normalizedBlameDecorations = useMemo(
    () =>
      (blameDecorations ?? []).filter(
        (entry) => Number.isFinite(entry.lineNumber) && entry.lineNumber > 0
      ),
    [blameDecorations]
  );
  const hasBlameDecorations = normalizedBlameDecorations.length > 0;
  const editorKey = `${modelPath}:${language}:${syntaxHighlighting ? "syntax" : "plain"}:${hasBlameDecorations ? "blame" : "plain"}`;

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    editor.updateOptions({
      glyphMargin: hasBlameDecorations,
      lineDecorationsWidth: hasBlameDecorations ? 12 : 0,
      lineNumbersMinChars: hasBlameDecorations ? 4 : 3,
    });
  }, [hasBlameDecorations]);

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    if (styleElementRef.current) {
      styleElementRef.current.remove();
      styleElementRef.current = null;
    }

    if (normalizedBlameDecorations.length === 0) {
      decorationCollectionRef.current?.clear();
      return;
    }

    const authorClasses = new Map<
      string,
      { avatarClass: string; laneClass: string; label: string }
    >();
    const cssRules: string[] = [];
    let classIndex = 0;

    for (const decoration of normalizedBlameDecorations) {
      const authorKey = `${decoration.author}:${decoration.avatarLabel}:${decoration.color}`;

      if (authorClasses.has(authorKey)) {
        continue;
      }

      const avatarClass = `litgit-blame-avatar-${classIndex}`;
      const laneClass = `litgit-blame-lane-${classIndex}`;
      classIndex += 1;
      authorClasses.set(authorKey, {
        avatarClass,
        laneClass,
        label: decoration.avatarLabel,
      });

      const escapedLabel = decoration.avatarLabel
        .replaceAll("\\", "\\\\")
        .replaceAll("'", "\\'");
      const color = decoration.color;
      cssRules.push(
        `.monaco-editor .${laneClass}{border-right:3px solid ${color};}`,
        `.monaco-editor .${avatarClass}{display:flex!important;align-items:center;justify-content:center;}`,
        `.monaco-editor .${avatarClass}::before{content:'${escapedLabel}';display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:999px;background:${color};color:#05070a;font-size:9px;font-weight:700;line-height:1;}`
      );
    }

    const styleElement = document.createElement("style");
    styleElement.textContent = cssRules.join("");
    document.head.append(styleElement);
    styleElementRef.current = styleElement;

    const decorations = normalizedBlameDecorations
      .map((decoration) => {
        const authorKey = `${decoration.author}:${decoration.avatarLabel}:${decoration.color}`;
        const classes = authorClasses.get(authorKey);

        if (!classes) {
          return null;
        }

        return {
          range: {
            endColumn: 1,
            endLineNumber: decoration.lineNumber,
            startColumn: 1,
            startLineNumber: decoration.lineNumber,
          },
          options: {
            glyphMarginClassName: `litgit-blame-glyph ${classes.avatarClass}`,
            glyphMarginHoverMessage: {
              value: decoration.author,
            },
            isWholeLine: true,
            linesDecorationsClassName: `litgit-blame-lane ${classes.laneClass}`,
          },
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    if (decorationCollectionRef.current === null) {
      decorationCollectionRef.current =
        editor.createDecorationsCollection(decorations);
      return;
    }

    decorationCollectionRef.current.set(decorations);
  }, [normalizedBlameDecorations]);

  useEffect(
    () => () => {
      decorationCollectionRef.current?.clear();
      decorationCollectionRef.current = null;
      if (styleElementRef.current) {
        styleElementRef.current.remove();
        styleElementRef.current = null;
      }
    },
    []
  );

  return (
    <Editor
      height="100%"
      key={editorKey}
      language={language}
      onMount={(editor) => {
        editorRef.current = editor;
        onMount(editor);
      }}
      options={{
        automaticLayout: true,
        experimentalWhitespaceRendering: "svg",
        fontFamily,
        fontSize,
        glyphMargin: hasBlameDecorations,
        lineNumbers,
        lineNumbersMinChars: hasBlameDecorations ? 4 : 3,
        lineDecorationsWidth: hasBlameDecorations ? 12 : 0,
        minimap: { enabled: minimapEnabled },
        readOnly: true,
        scrollBeyondLastLine: false,
        wordSeparators: syntaxHighlighting ? undefined : "",
        wordWrap,
      }}
      path={modelPath}
      theme={theme}
      value={value}
    />
  );
}
