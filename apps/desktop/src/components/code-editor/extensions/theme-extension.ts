import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

const lightHighlightStyle = HighlightStyle.define([
  // GitHub-inspired light theme colors
  { tag: [t.keyword, t.modifier], color: "#cf222e" }, // GitHub red
  { tag: [t.name, t.deleted, t.propertyName], color: "#0550ae" }, // GitHub blue
  { tag: [t.function(t.variableName), t.labelName], color: "#8250df" }, // GitHub purple
  { tag: [t.className, t.typeName], color: "#953800" }, // GitHub brown/orange
  { tag: [t.number, t.bool, t.atom], color: "#9a6700" }, // GitHub number
  { tag: [t.string, t.special(t.string), t.inserted], color: "#0a7f32" }, // GitHub green
  { tag: [t.comment, t.meta], color: "#6e7781" }, // GitHub muted gray
  { tag: [t.operator, t.operatorKeyword], color: "#cf222e" }, // GitHub red
  { tag: [t.link, t.url], color: "#0969da", textDecoration: "underline" }, // GitHub link blue
  { tag: t.heading, color: "#0550ae", fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
]);

const darkHighlightStyle = HighlightStyle.define([
  // Ayu-mirage inspired dark theme colors
  { tag: [t.keyword, t.modifier], color: "#ffad66" }, // Orange
  { tag: [t.name, t.deleted, t.propertyName], color: "#73d0ff" }, // Cyan
  { tag: [t.function(t.variableName), t.labelName], color: "#ffd173" }, // Yellow
  { tag: [t.className, t.typeName], color: "#bae67e" }, // Green
  { tag: [t.number, t.bool, t.atom], color: "#d4bfff" }, // Purple
  { tag: [t.string, t.special(t.string), t.inserted], color: "#aad94c" }, // Lime green
  { tag: [t.comment, t.meta], color: "#7f93ad" }, // Muted blue-gray
  { tag: [t.operator, t.operatorKeyword], color: "#f29e74" }, // Coral
  { tag: [t.link, t.url], color: "#5ccfe6", textDecoration: "underline" }, // Cyan link
  { tag: t.heading, color: "#73d0ff", fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
]);

function createEditorChromeTheme(
  fontFamily: string,
  fontSize: number,
  theme: "light" | "dark"
): Extension {
  const backgroundColor =
    theme === "dark" ? "var(--color-background)" : "var(--color-background)";
  const panelBackground =
    theme === "dark"
      ? "color-mix(in oklab, var(--color-background) 70%, #0d1117)"
      : "color-mix(in oklab, var(--color-background) 88%, white)";
  const gutterBackground =
    theme === "dark"
      ? "color-mix(in oklab, var(--color-background) 80%, #0d1117)"
      : "color-mix(in oklab, var(--color-muted) 92%, white)";
  const activeLineBackground =
    theme === "dark"
      ? "color-mix(in oklab, var(--color-background) 75%, var(--color-primary) 15%)"
      : "color-mix(in oklab, var(--color-background) 84%, var(--color-primary) 16%)";
  const selectionBackground =
    theme === "dark"
      ? "color-mix(in oklab, var(--color-primary) 28%, transparent)"
      : "color-mix(in oklab, var(--color-primary) 22%, transparent)";

  return EditorView.theme(
    {
      "&": {
        backgroundColor,
        color: "var(--color-foreground)",
        fontFamily: `${fontFamily}, monospace`,
        fontSize: `${fontSize}px`,
        height: "100%",
      },
      ".cm-content": {
        caretColor: "var(--color-primary)",
        fontFamily: `${fontFamily}, monospace`,
        fontSize: `${fontSize}px`,
      },
      ".cm-scroller": {
        overflow: "auto",
      },
      ".cm-line": {
        paddingInline: "0.25rem",
      },
      ".cm-gutters": {
        backgroundColor: gutterBackground,
        borderRight: "1px solid var(--color-border)",
        color: "var(--color-muted-foreground)",
        fontFamily: `${fontFamily}, monospace`,
        fontSize: `${fontSize}px`,
      },
      ".cm-gutterElement": {
        paddingInline: "0.5rem",
      },
      ".cm-activeLine": {
        backgroundColor: activeLineBackground,
      },
      ".cm-activeLineGutter": {
        backgroundColor: activeLineBackground,
        color: "var(--color-foreground)",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--color-primary)",
      },
      "&.cm-focused": {
        outline: "none",
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        {
          backgroundColor: selectionBackground,
        },
      ".cm-selectionMatch": {
        backgroundColor:
          "color-mix(in oklab, var(--color-primary) 18%, transparent)",
      },
      ".cm-foldPlaceholder": {
        backgroundColor: "transparent",
        border: "1px solid var(--color-border)",
        color: "var(--color-muted-foreground)",
      },
      ".cm-panels, .cm-tooltip": {
        backgroundColor: panelBackground,
        border: "1px solid var(--color-border)",
        color: "var(--color-foreground)",
      },
      ".cm-tooltip .cm-tooltip-arrow:before": {
        borderTopColor: "transparent",
        borderBottomColor: "transparent",
      },
      ".cm-tooltip .cm-tooltip-arrow:after": {
        borderTopColor: panelBackground,
        borderBottomColor: panelBackground,
      },
      ".cm-searchMatch": {
        backgroundColor:
          "color-mix(in oklab, var(--color-primary) 20%, transparent)",
        outline:
          "1px solid color-mix(in oklab, var(--color-primary) 60%, transparent)",
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor:
          "color-mix(in oklab, var(--color-primary) 30%, transparent)",
      },
      ".cm-matchingBracket, .cm-nonmatchingBracket": {
        backgroundColor:
          "color-mix(in oklab, var(--color-primary) 14%, transparent)",
        outline:
          "1px solid color-mix(in oklab, var(--color-primary) 45%, transparent)",
      },
    },
    { dark: theme === "dark" }
  );
}

export function createThemeExtension(
  theme: "light" | "dark",
  fontFamily: string,
  fontSize: number
): Extension[] {
  return [
    createEditorChromeTheme(fontFamily, fontSize, theme),
    syntaxHighlighting(
      theme === "dark" ? darkHighlightStyle : lightHighlightStyle
    ),
  ];
}
