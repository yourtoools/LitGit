import { type Extension, StateEffect, StateField } from "@codemirror/state";
import { GutterMarker, gutter } from "@codemirror/view";
import type { BlameDecoration } from "@/components/code-editor/code-editor-types";

class BlameMarker extends GutterMarker {
  private readonly author: string;
  private readonly avatarLabel: string;
  private readonly color: string;

  constructor(author: string, avatarLabel: string, color: string) {
    super();
    this.author = author;
    this.avatarLabel = avatarLabel;
    this.color = color;
  }

  toDOM(): HTMLElement {
    const el = document.createElement("div");
    el.className = "blame-avatar flex items-center justify-center";
    el.style.cssText = `
      width: 16px;
      height: 16px;
      border-radius: 999px;
      background: ${this.color};
      color: #05070a;
      font-size: 9px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    el.textContent = this.avatarLabel;
    el.title = this.author;
    return el;
  }
}

const setBlameDecorations = StateEffect.define<BlameDecoration[]>();

const blameField = StateField.define<Map<number, GutterMarker>>({
  create() {
    return new Map();
  },
  update(map, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setBlameDecorations)) {
        const newMap = new Map<number, GutterMarker>();
        for (const deco of effect.value) {
          if (Number.isFinite(deco.lineNumber) && deco.lineNumber > 0) {
            newMap.set(
              deco.lineNumber,
              new BlameMarker(deco.author, deco.avatarLabel, deco.color)
            );
          }
        }
        return newMap;
      }
    }
    return map;
  },
});

const blameGutter = gutter({
  lineMarker(view, line) {
    const lineNum = view.state.doc.lineAt(line.from).number;
    const map = view.state.field(blameField);
    return map.get(lineNum) ?? null;
  },
  initialSpacer() {
    return new BlameMarker("", "", "transparent");
  },
});

export function blameGutterExtension(
  decorations: BlameDecoration[]
): Extension {
  return [
    blameField.init(() => {
      const map = new Map<number, GutterMarker>();
      for (const deco of decorations) {
        if (Number.isFinite(deco.lineNumber) && deco.lineNumber > 0) {
          map.set(
            deco.lineNumber,
            new BlameMarker(deco.author, deco.avatarLabel, deco.color)
          );
        }
      }
      return map;
    }),
    blameGutter,
  ];
}
