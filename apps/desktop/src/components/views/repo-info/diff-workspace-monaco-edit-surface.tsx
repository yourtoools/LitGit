import { Editor } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";

interface DiffWorkspaceMonacoEditSurfaceProps {
  fontFamily: string;
  fontSize: number;
  language: string;
  lineNumbers: "off" | "on";
  modelPath: string;
  onChange: (nextValue: string) => void;
  onMount: (editor: MonacoEditor.IStandaloneCodeEditor) => void;
  onSave: () => void;
  syntaxHighlighting: boolean;
  theme: "vs" | "vs-dark";
  value: string;
  wordWrap: "off" | "on" | "wordWrapColumn" | "bounded";
}

export function DiffWorkspaceMonacoEditSurface({
  fontFamily,
  fontSize,
  language,
  lineNumbers,
  modelPath,
  onChange,
  onMount,
  onSave,
  syntaxHighlighting,
  theme,
  value,
  wordWrap,
}: DiffWorkspaceMonacoEditSurfaceProps) {
  return (
    <Editor
      height="100%"
      language={language}
      onChange={(nextValue) => {
        onChange(nextValue ?? "");
      }}
      onMount={(editor, monaco) => {
        // biome-ignore lint/suspicious/noBitwiseOperators: Monaco keybinding masks require bitwise composition.
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          onSave();
        });
        editor.onKeyDown((event) => {
          event.stopPropagation();
        });
        onMount(editor);
        editor.focus();
      }}
      options={{
        automaticLayout: true,
        experimentalWhitespaceRendering: "svg",
        fontFamily,
        fontSize,
        lineNumbers,
        minimap: { enabled: false },
        readOnly: false,
        scrollBeyondLastLine: false,
        trimAutoWhitespace: false,
        wordSeparators: syntaxHighlighting ? undefined : "",
        wordWrap,
      }}
      path={modelPath}
      theme={theme}
      value={value}
    />
  );
}
