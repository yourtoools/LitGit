interface EditorBehaviorInput {
  lineNumbers: "off" | "on";
  syntaxHighlighting: boolean;
  tabSize: number;
  wordWrap: "off" | "on";
}

interface EditorBehavior {
  lineNumbers: boolean;
  syntaxHighlighting: boolean;
  tabSize: number;
  wordWrap: boolean;
}

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
