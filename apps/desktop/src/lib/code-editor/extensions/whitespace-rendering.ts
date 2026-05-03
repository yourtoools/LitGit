import type { Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

// Pre-defined regex for performance
const TRAILING_WHITESPACE_REGEX = /[ \t]+$/;

// Widget for rendering trailing space as middle dot
class TrailingSpaceWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-trailing-whitespace-marker";
    span.textContent = "\u00B7"; // Middle dot character
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// Widget for rendering trailing tab as right arrow
class TrailingTabWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-trailing-whitespace-marker cm-whitespace-marker-tab";
    span.textContent = "\u2192"; // Right arrow character
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

// Create decorations for trailing whitespace in visible ranges
function createTrailingWhitespaceDecorations(view: EditorView): DecorationSet {
  type DecoRange = ReturnType<ReturnType<typeof Decoration.replace>["range"]>;
  const decorations: DecoRange[] = [];

  for (const { from, to } of view.visibleRanges) {
    let pos = from;

    while (pos < to) {
      const line = view.state.doc.lineAt(pos);
      const lineText = line.text;

      // Find trailing whitespace at end of line
      const trailingMatch = TRAILING_WHITESPACE_REGEX.exec(lineText);

      if (trailingMatch) {
        const trailingStart = line.to - trailingMatch[0].length;
        const trailingText = view.state.doc.sliceString(trailingStart, line.to);

        for (let i = 0; i < trailingText.length; i++) {
          const char = trailingText[i];
          const charPos = trailingStart + i;

          if (char === " ") {
            decorations.push(
              Decoration.replace({
                widget: new TrailingSpaceWidget(),
              }).range(charPos, charPos + 1)
            );
          } else if (char === "\t") {
            decorations.push(
              Decoration.replace({
                widget: new TrailingTabWidget(),
              }).range(charPos, charPos + 1)
            );
          }
        }
      }

      pos = line.to + 1;
    }
  }

  return Decoration.set(decorations);
}

// Plugin to maintain trailing whitespace decorations
function createTrailingWhitespacePlugin(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;

      constructor(view: EditorView) {
        this.decorations = createTrailingWhitespaceDecorations(view);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = createTrailingWhitespaceDecorations(update.view);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}

// Base theme for trailing whitespace markers
const trailingWhitespaceBaseTheme = EditorView.baseTheme({
  ".cm-trailing-whitespace-marker": {
    backgroundColor:
      "color-mix(in oklab, var(--color-destructive) 25%, transparent)",
    color: "var(--color-destructive)",
    fontSize: "0.85em",
    borderRadius: "2px",
    pointerEvents: "none",
    userSelect: "none",
  },
  ".cm-trailing-whitespace-marker.cm-whitespace-marker-tab": {
    display: "inline-block",
    width: "2ch",
    textAlign: "center",
  },
});

// Main factory function - enabled=true shows trailing whitespace
export function createTrailingWhitespaceExtension(enabled: boolean): Extension {
  if (!enabled) {
    return [];
  }

  return [trailingWhitespaceBaseTheme, createTrailingWhitespacePlugin()];
}
