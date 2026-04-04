export interface EditorBehaviorInput {
  lineNumbers: "off" | "on";
  syntaxHighlighting: boolean;
  tabSize: number;
  wordWrap: "off" | "on";
}

export interface EditorBehavior {
  lineNumbers: boolean;
  syntaxHighlighting: boolean;
  tabSize: number;
  wordWrap: boolean;
}

export type DiffPresentationMode = "hunk" | "inline" | "split";

export interface DiffPresentationConfig {
  collapseUnchanged: { margin: number; minSize: number } | null;
  kind: "split" | "unified";
}

const HUNK_COLLAPSE_CONFIG = {
  margin: 3,
  minSize: 4,
} as const;

export function resolveEditorBehavior(
  input: EditorBehaviorInput
): EditorBehavior {
  return {
    lineNumbers: input.lineNumbers === "on",
    syntaxHighlighting: input.syntaxHighlighting,
    tabSize: input.tabSize,
    wordWrap: input.wordWrap === "on",
  };
}

export function resolveDiffPresentationConfig(
  presentation: DiffPresentationMode
): DiffPresentationConfig {
  if (presentation === "split") {
    return {
      collapseUnchanged: null,
      kind: "split",
    };
  }

  if (presentation === "hunk") {
    return {
      collapseUnchanged: HUNK_COLLAPSE_CONFIG,
      kind: "unified",
    };
  }

  return {
    collapseUnchanged: null,
    kind: "unified",
  };
}
