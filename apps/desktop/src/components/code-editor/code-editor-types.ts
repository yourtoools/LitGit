import type { MergeView } from "@codemirror/merge";
import type { EditorView } from "@codemirror/view";

export interface BlameDecoration {
  author: string;
  avatarLabel: string;
  color: string;
  lineNumber: number;
}

interface CodeEditorBaseProps {
  fontFamily: string;
  fontSize: number;
  language: string;
  lineNumbers: "off" | "on";
  minimap?: boolean;
  modelPath: string;
  syntaxHighlighting: boolean;
  tabSize: number;
  theme: "light" | "dark";
  wordWrap: "off" | "on";
}

export interface ViewModeProps extends CodeEditorBaseProps {
  blameDecorations?: BlameDecoration[];
  mode: "view";
  onMount?: (view: EditorView) => void;
  value: string;
}

export interface DiffModeProps extends CodeEditorBaseProps {
  collapseUnchanged?: {
    margin: number;
    minSize: number;
  } | null;
  ignoreTrimWhitespace?: boolean;
  mode: "diff";
  modified: string;
  onMount?: (view: EditorView | MergeView) => void;
  original: string;
  renderSideBySide: boolean;
  showTrailingWhitespace?: boolean;
}

export interface EditModeProps extends CodeEditorBaseProps {
  mode: "edit";
  onChange: (value: string) => void;
  onMount?: (view: EditorView) => void;
  onSave: () => void;
  value: string;
}

export type CodeEditorProps = ViewModeProps | DiffModeProps | EditModeProps;

export function isViewMode(props: CodeEditorProps): props is ViewModeProps {
  return props.mode === "view";
}

export function isDiffMode(props: CodeEditorProps): props is DiffModeProps {
  return props.mode === "diff";
}

export function isEditMode(props: CodeEditorProps): props is EditModeProps {
  return props.mode === "edit";
}
