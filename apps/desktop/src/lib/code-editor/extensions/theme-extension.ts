import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

const lightHighlightStyle = HighlightStyle.define([
  // Keywords and modifiers - primary-adjacent red
  { tag: [t.keyword, t.modifier], color: "oklch(0.55 0.18 25)" },
  // Names and properties - primary blue
  { tag: [t.name, t.deleted, t.propertyName], color: "oklch(0.55 0.145 250)" },
  // Functions and labels - purple accent
  {
    tag: [t.function(t.variableName), t.labelName],
    color: "oklch(0.55 0.16 310)",
  },
  // Class and type names - warm accent
  { tag: [t.className, t.typeName], color: "oklch(0.55 0.14 50)" },
  // Numbers and atoms - yellow/gold
  { tag: [t.number, t.bool, t.atom], color: "oklch(0.65 0.13 85)" },
  // Strings and inserted text - green
  {
    tag: [t.string, t.special(t.string), t.inserted],
    color: "oklch(0.55 0.14 145)",
  },
  // Comments and metadata - muted
  { tag: [t.comment, t.meta], color: "oklch(0.55 0.015 95)" },
  // Operators - same as keywords
  { tag: [t.operator, t.operatorKeyword], color: "oklch(0.55 0.18 25)" },
  // Links and URLs - primary blue with underline
  {
    tag: [t.link, t.url],
    color: "oklch(0.55 0.145 250)",
    textDecoration: "underline",
  },
  // Headings
  { tag: t.heading, color: "oklch(0.55 0.145 250)", fontWeight: "bold" },
  // Emphasis
  { tag: t.emphasis, fontStyle: "italic" },
  // Strong
  { tag: t.strong, fontWeight: "bold" },
]);

const darkHighlightStyle = HighlightStyle.define([
  // Keywords and modifiers - warm orange
  { tag: [t.keyword, t.modifier], color: "oklch(0.75 0.15 55)" },
  // Names and properties - lighter primary blue
  { tag: [t.name, t.deleted, t.propertyName], color: "oklch(0.75 0.13 250)" },
  // Functions and labels - soft yellow
  {
    tag: [t.function(t.variableName), t.labelName],
    color: "oklch(0.8 0.12 85)",
  },
  // Class and type names - lime green
  { tag: [t.className, t.typeName], color: "oklch(0.75 0.16 145)" },
  // Numbers and atoms - soft purple
  { tag: [t.number, t.bool, t.atom], color: "oklch(0.75 0.14 310)" },
  // Strings and inserted text - bright green
  {
    tag: [t.string, t.special(t.string), t.inserted],
    color: "oklch(0.75 0.16 145)",
  },
  // Comments and metadata - muted blue-gray
  { tag: [t.comment, t.meta], color: "oklch(0.65 0.02 250)" },
  // Operators - coral/orange
  { tag: [t.operator, t.operatorKeyword], color: "oklch(0.75 0.14 45)" },
  // Links and URLs - cyan
  {
    tag: [t.link, t.url],
    color: "oklch(0.8 0.12 195)",
    textDecoration: "underline",
  },
  // Headings
  { tag: t.heading, color: "oklch(0.75 0.13 250)", fontWeight: "bold" },
  // Emphasis
  { tag: t.emphasis, fontStyle: "italic" },
  // Strong
  { tag: t.strong, fontWeight: "bold" },
]);

function createEditorChromeTheme(
  fontFamily: string,
  fontSize: number,
  theme: "light" | "dark"
): Extension {
  const backgroundColor = "var(--color-background)";
  const panelBackground =
    theme === "dark"
      ? "color-mix(in oklab, var(--color-background) 90%, var(--color-foreground))"
      : "color-mix(in oklab, var(--color-background) 96%, var(--color-foreground))";
  const gutterBackground =
    theme === "dark"
      ? "color-mix(in oklab, var(--color-background) 95%, var(--color-muted))"
      : "color-mix(in oklab, var(--color-muted) 70%, var(--color-background))";
  const activeLineBackground =
    theme === "dark"
      ? "color-mix(in oklab, var(--color-background) 92%, var(--color-primary))"
      : "color-mix(in oklab, var(--color-background) 96%, var(--color-primary))";
  const selectionBackground =
    theme === "dark"
      ? "color-mix(in oklab, var(--color-primary) 25%, transparent)"
      : "color-mix(in oklab, var(--color-primary) 20%, transparent)";

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
          "color-mix(in oklab, var(--color-primary) 15%, transparent)",
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
          "color-mix(in oklab, var(--color-primary) 18%, transparent)",
        outline:
          "1px solid color-mix(in oklab, var(--color-primary) 55%, transparent)",
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor:
          "color-mix(in oklab, var(--color-primary) 28%, transparent)",
      },
      ".cm-matchingBracket, .cm-nonmatchingBracket": {
        backgroundColor:
          "color-mix(in oklab, var(--color-primary) 12%, transparent)",
        outline:
          "1px solid color-mix(in oklab, var(--color-primary) 40%, transparent)",
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
