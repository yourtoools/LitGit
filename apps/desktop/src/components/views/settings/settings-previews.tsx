import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@litgit/ui/components/select";
import { cn } from "@litgit/ui/lib/utils";
import { useTheme } from "next-themes";
import {
  DefaultSelectValue,
  SectionActionRow,
} from "@/components/views/settings/settings-shared-ui";

type ThemePreference = "system" | "light" | "dark";

interface ThemeOption {
  description: string;
  label: string;
  value: ThemePreference;
}

const THEME_SELECT_OPTIONS: ThemeOption[] = [
  {
    value: "light",
    label: "Light",
    description: "Bright interface for daytime use",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Easy on the eyes in low light",
  },
  {
    value: "system",
    label: "System",
    description: "Follows your OS appearance",
  },
];

function ThemePreviewArt({ value }: { value: ThemePreference }) {
  if (value === "light") {
    return <LightThemePreview />;
  }

  if (value === "dark") {
    return <DarkThemePreview />;
  }

  return <SystemThemePreview />;
}

function ThemePreviewCard({
  option,
  isSelected,
  onSelect,
}: {
  option: ThemeOption;
  isSelected: boolean;
  onSelect: (value: ThemePreference) => void;
}) {
  const optionId = `theme-option-${option.value}`;

  return (
    <label className="block" htmlFor={optionId}>
      <input
        checked={isSelected}
        className="sr-only"
        id={optionId}
        name="theme-selection"
        onChange={() => onSelect(option.value)}
        type="radio"
        value={option.value}
      />
      <span
        aria-hidden="true"
        className={cn(
          "group focus-within:desktop-focus relative flex min-w-0 cursor-pointer flex-col gap-2 border p-3 text-left transition-all duration-150",
          isSelected
            ? "border-primary/60 bg-primary/5 shadow-primary/10 shadow-sm"
            : "border-border/60 bg-background/70 hover:border-border hover:bg-muted/30"
        )}
      >
        <div className="relative overflow-hidden border border-border/50">
          <ThemePreviewArt value={option.value} />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span
            className={cn(
              "flex size-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
              isSelected
                ? "border-primary bg-primary"
                : "border-muted-foreground/40"
            )}
          >
            {isSelected ? (
              <span className="size-1.5 rounded-full bg-primary-foreground" />
            ) : null}
          </span>
          <span className="min-w-0">
            <span className="block font-medium text-xs">{option.label}</span>
            <span className="block text-muted-foreground text-xs leading-tight">
              {option.description}
            </span>
          </span>
        </div>
      </span>
    </label>
  );
}

function LightThemePreview() {
  return (
    <div className="flex h-16 flex-col bg-[oklch(0.98_0_0)]">
      <div className="flex items-center gap-1 border-[oklch(0.922_0_0)] border-b px-1.5 py-1">
        <div className="size-1.5 bg-[oklch(0.556_0_0)]" />
        <div className="size-1.5 bg-[oklch(0.556_0_0)]" />
        <div className="size-1.5 bg-[oklch(0.556_0_0)]" />
        <div className="ml-auto size-1.5 rounded-full bg-[oklch(0.708_0_0)]" />
      </div>
      <div className="flex flex-1 gap-1 p-1">
        <div className="w-5 bg-[oklch(0.97_0_0)]" />
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="h-2 bg-[oklch(0.922_0_0)]" />
          <div className="h-1.5 w-3/4 bg-[oklch(0.922_0_0)]" />
          <div className="h-1.5 w-1/2 bg-[oklch(0.922_0_0)]" />
        </div>
      </div>
    </div>
  );
}

function DarkThemePreview() {
  return (
    <div className="flex h-16 flex-col bg-[oklch(0.145_0_0)]">
      <div className="flex items-center gap-1 border-[oklch(1_0_0/10%)] border-b px-1.5 py-1">
        <div className="size-1.5 bg-[oklch(0.708_0_0)]" />
        <div className="size-1.5 bg-[oklch(0.708_0_0)]" />
        <div className="size-1.5 bg-[oklch(0.708_0_0)]" />
        <div className="ml-auto size-1.5 rounded-full bg-[oklch(0.556_0_0)]" />
      </div>
      <div className="flex flex-1 gap-1 p-1">
        <div className="w-5 bg-[oklch(0.269_0_0)]" />
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="h-2 bg-[oklch(0.269_0_0)]" />
          <div className="h-1.5 w-3/4 bg-[oklch(0.269_0_0)]" />
          <div className="h-1.5 w-1/2 bg-[oklch(0.269_0_0)]" />
        </div>
      </div>
    </div>
  );
}

function SystemThemePreview() {
  return (
    <div className="flex h-16">
      <div className="flex w-1/2 flex-col bg-[oklch(0.98_0_0)]">
        <div className="flex items-center gap-0.5 border-[oklch(0.922_0_0)] border-b px-1 py-0.5">
          <div className="size-1 bg-[oklch(0.556_0_0)]" />
          <div className="size-1 bg-[oklch(0.556_0_0)]" />
        </div>
        <div className="flex flex-1 flex-col gap-0.5 p-1">
          <div className="h-1.5 bg-[oklch(0.922_0_0)]" />
          <div className="h-1 w-3/4 bg-[oklch(0.922_0_0)]" />
        </div>
      </div>
      <div className="flex w-1/2 flex-col bg-[oklch(0.145_0_0)]">
        <div className="flex items-center gap-0.5 border-[oklch(1_0_0/10%)] border-b px-1 py-0.5">
          <div className="size-1 bg-[oklch(0.708_0_0)]" />
          <div className="size-1 bg-[oklch(0.708_0_0)]" />
        </div>
        <div className="flex flex-1 flex-col gap-0.5 p-1">
          <div className="h-1.5 bg-[oklch(0.269_0_0)]" />
          <div className="h-1 w-3/4 bg-[oklch(0.269_0_0)]" />
        </div>
      </div>
    </div>
  );
}

function ThemeSelector({
  value,
  onValueChange,
}: {
  value: ThemePreference;
  onValueChange: (value: ThemePreference) => void;
}) {
  return (
    <fieldset
      aria-label="Theme selection"
      className="grid grid-cols-1 gap-2 border-0 p-0 sm:grid-cols-3 sm:gap-3"
    >
      {THEME_SELECT_OPTIONS.map((option) => (
        <ThemePreviewCard
          isSelected={value === option.value}
          key={option.value}
          onSelect={onValueChange}
          option={option}
        />
      ))}
    </fieldset>
  );
}

const EDITOR_PREVIEW_MODE_OPTIONS = {
  diff: "Diff editor",
  regular: "Regular editor",
} as const;

const PREVIEW_SAMPLE_DATE = new Date("2026-03-10T17:42:00Z");
const NOTIFICATION_PREVIEW_TOAST_ID = "settings-notification-preview";
const EDITOR_PREVIEW_LINES = [
  "type Joke = {",
  "\tid: number;",
  "\tsetup: string;",
  "\tpunchline: string;",
  "\ttags: string[];",
  "};",
  "",
  "const jokes: Joke[] = [",
  "\t{",
  "\t\tid: 1,",
  '\t\tsetup: "Why do TypeScript developers never get lost?",',
  '\t\tpunchline: "Because they always follow strict directions.",',
  '\t\ttags: ["typescript", "strict", "dev"],',
  "\t},",
  "\t{",
  "\t\tid: 2,",
  '\t\tsetup: "Why did the JavaScript function break up with var?",',
  '\t\tpunchline: "It needed someone more committed, so it chose const.",',
  '\t\ttags: ["javascript", "const", "scope"],',
  "\t},",
  "\t{",
  "\t\tid: 3,",
  '\t\tsetup: "How many frontend engineers does it take to change a light bulb?",',
  '\t\tpunchline: "None. They just make it a dark mode toggle.",',
  '\t\ttags: ["frontend", "ui", "dark-mode"],',
  "\t},",
  "];",
  "",
  "const formatJoke = ({ setup, punchline }: Joke): string => {",
  '\treturn setup + " " + punchline;',
  "};",
  "",
  "export const getRandomJoke = (seed: number): string => {",
  "\tconst joke = jokes[Math.abs(seed) % jokes.length];",
  "\treturn formatJoke(joke);",
  "};",
  "",
  'const veryLongDebugLine = "preview.wrap.check = This intentionally long line ensures word-wrap settings are easy to evaluate while still keeping meaningful TypeScript content and readable code humor in one place for visual testing across multiple viewport widths.";',
  "",
  "console.info(getRandomJoke(Date.now()), veryLongDebugLine);",
  "",
  "// Toggle syntax highlighting, line numbers, and wrap to inspect readability.",
  "// This preview is intentionally read-only and optimized for settings feedback.",
  "",
  "export {};",
  "",
  "/*",
  "  Long sample paragraph for wrapping behavior:",
  "  The build passed, the tests passed, the deploy passed, and then someone changed one semicolon and now the app is haunted by a race condition that only appears at 4:59 PM on Fridays when the CI cache is warm and the coffee machine is empty.",
  "*/",
  "",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
  "// Keep scrolling to verify full-height preview behavior in the sidebar.",
] as const;

const EDITOR_PREVIEW_DIFF_LINES = [
  'type Delivery = "deadpan" | "dramatic";',
  "",
  "type Joke = {",
  "\tid: number;",
  "\tsetup: string;",
  "\tpunchline: string;",
  "\ttags: readonly string[];",
  "\tdelivery?: Delivery;",
  "};",
  "",
  "const jokes: Joke[] = [",
  "\t{",
  "\t\tid: 1,",
  '\t\tsetup: "Why do TypeScript developers never get lost?",',
  '\t\tpunchline: "Because they always follow strict directions.",',
  '\t\ttags: ["typescript", "strict", "dev"],',
  '\t\tdelivery: "deadpan",',
  "\t},",
  "\t{",
  "\t\tid: 2,",
  '\t\tsetup: "Why did the JavaScript function break up with var?",',
  '\t\tpunchline: "It wanted less drama and more block scope.",',
  '\t\ttags: ["javascript", "const", "scope"],',
  "\t},",
  "\t{",
  "\t\tid: 3,",
  '\t\tsetup: "How many frontend engineers does it take to change a light bulb?",',
  '\t\tpunchline: "None. They just make it a dark mode toggle.",',
  '\t\ttags: ["frontend", "ui", "dark-mode"],',
  "\t},",
  "\t{",
  "\t\tid: 4,",
  '\t\tsetup: "Why did the linter apply for management?",',
  '\t\tpunchline: "It loved enforcing standards across teams.",',
  '\t\ttags: ["tooling", "lint", "quality"],',
  '\t\tdelivery: "dramatic",',
  "\t},",
  "];",
  "",
  "const formatJoke = ({ delivery, setup, punchline }: Joke): string => {",
  '\tconst prefix = delivery === "dramatic" ? "[drama] " : "";',
  '\treturn prefix + setup + " " + punchline;',
  "};",
  "",
  "export const getRandomJoke = (seed: number): string => {",
  "\tconst randomOffset = Math.abs(seed * 13) % jokes.length;",
  "\tconst joke = jokes[randomOffset];",
  '\treturn "[" + joke.tags.join(",") + "] " + formatJoke(joke);',
  "};",
  "",
  'const releaseNote = "Updated top/middle/bottom sections to make diff preview richer.";',
  'const veryLongDebugLine = "preview.wrap.check = This intentionally long line ensures word-wrap settings are easy to evaluate while still keeping meaningful TypeScript content and readable code humor in one place for visual testing across multiple viewport widths.";',
  "",
  "console.info(getRandomJoke(Date.now()), releaseNote, veryLongDebugLine);",
  "",
  "// Diff mode sample now includes changes from top, middle, and bottom.",
] as const;

type EditorPreviewThemeMode = "dark" | "light";

const EDITOR_PREVIEW_THEME_CLASSES = {
  dark: {
    addedHighlight: " bg-emerald-500/12 pl-2 ring-1 ring-emerald-400/25",
    markerAdded: "text-emerald-300",
    markerRemoved: "text-rose-300",
    markerUnchanged: "text-muted-foreground/50",
    removedHighlight: " bg-rose-500/10 pl-2 opacity-90 ring-1 ring-rose-400/20",
    surface: "bg-[#171717]",
    tone: {
      added: "text-emerald-300",
      keyword: "text-sky-300",
      muted: "text-muted-foreground/70",
      plain: "text-foreground/90",
      string: "text-amber-200",
      type: "text-cyan-300",
    },
  },
  light: {
    addedHighlight: " bg-emerald-100/80 pl-2 ring-1 ring-emerald-300/70",
    markerAdded: "text-emerald-700",
    markerRemoved: "text-rose-700",
    markerUnchanged: "text-muted-foreground/70",
    removedHighlight: " bg-rose-100/80 pl-2 opacity-95 ring-1 ring-rose-300/70",
    surface: "bg-background",
    tone: {
      added: "text-emerald-700",
      keyword: "text-sky-700",
      muted: "text-muted-foreground/80",
      plain: "text-foreground",
      string: "text-amber-700",
      type: "text-cyan-700",
    },
  },
} as const;

const TERMINAL_PREVIEW_LINES = [
  { prefix: "~", text: "git status", tone: "prompt" },
  { prefix: "", text: "On branch main", tone: "muted" },
  { prefix: "", text: "Changes ready to commit: 2 files", tone: "muted" },
  { prefix: "~", text: 'git commit -m "Hello world"', tone: "prompt" },
  { prefix: "", text: "[main 8f3d1b2] Hello world", tone: "success" },
  { prefix: "", text: " 2 files changed, 18 insertions(+)", tone: "muted" },
] as const;

const TERMINAL_CURSOR_STYLE_CLASS_NAMES = {
  bar: "h-4 w-0.5 rounded-full",
  block: "h-4 w-2 ",
  underline: "h-0.5 w-3 rounded-full",
} as const;

const getPreviewFontFamily = (fontFamily: string) => {
  const trimmedFontFamily = fontFamily.trim();

  if (trimmedFontFamily.length === 0) {
    return "ui-monospace, SFMono-Regular, monospace";
  }

  if (trimmedFontFamily.includes(",")) {
    return `${trimmedFontFamily}, ui-monospace, SFMono-Regular, monospace`;
  }

  return trimmedFontFamily.includes(" ")
    ? `"${trimmedFontFamily}", ui-monospace, SFMono-Regular, monospace`
    : `${trimmedFontFamily}, ui-monospace, SFMono-Regular, monospace`;
};

const getEditorPreviewEolLabel = (eol: "system" | "lf" | "crlf") => {
  if (eol === "lf") {
    return "LF";
  }

  if (eol === "crlf") {
    return "CRLF";
  }

  return "System";
};

const renderEditorPreviewText = (content: string, tabSize: number) => {
  return content.replaceAll("\t", " ".repeat(tabSize));
};

const getEditorPreviewTone = ({
  content,
  mode,
  syntaxHighlighting,
  themeMode,
}: {
  content: string;
  mode: "diff" | "regular";
  syntaxHighlighting: boolean;
  themeMode: EditorPreviewThemeMode;
}) => {
  const toneClasses = EDITOR_PREVIEW_THEME_CLASSES[themeMode].tone;

  if (!syntaxHighlighting) {
    return toneClasses.plain;
  }

  if (mode === "diff" && content.includes("delivery")) {
    return toneClasses.added;
  }

  if (content.includes("type")) {
    return toneClasses.type;
  }

  if (
    content.includes("const") ||
    content.includes("export") ||
    content.startsWith("//")
  ) {
    return toneClasses.keyword;
  }

  if (content.includes('"')) {
    return toneClasses.string;
  }

  return toneClasses.plain;
};

const getEditorPreviewDiffState = (content: string) => {
  if (content.includes("delivery") || content.includes("New line added")) {
    return "added";
  }

  if (
    content.includes(
      'punchline: "Because they always follow strict directions."'
    ) ||
    content.includes('tags: ["typescript", "strict", "dev"]')
  ) {
    return "removed";
  }

  return "unchanged";
};

const getEditorPreviewDiffMarker = (content: string) => {
  const diffState = getEditorPreviewDiffState(content);

  if (diffState === "added") {
    return "+";
  }

  if (diffState === "removed") {
    return "-";
  }

  return "·";
};

function EditorStaticPreview({
  eol,
  fontSize,
  mode,
  lineNumbers,
  syntaxHighlighting,
  tabSize,
  themeMode,
  wordWrap,
}: {
  eol: "system" | "lf" | "crlf";
  fontSize: number;
  lineNumbers: "on" | "off";
  mode: "diff" | "regular";
  syntaxHighlighting: boolean;
  tabSize: number;
  themeMode: EditorPreviewThemeMode;
  wordWrap: "on" | "off";
}) {
  const lines = (
    mode === "diff" ? EDITOR_PREVIEW_DIFF_LINES : EDITOR_PREVIEW_LINES
  ).map((content, index) => ({
    content,
    id: `${mode}-${index + 1}-${content}`,
    lineNumber: index + 1,
  }));

  const lineClassName = cn(
    "max-w-full",
    wordWrap === "on"
      ? "whitespace-pre-wrap break-words"
      : "truncate whitespace-pre"
  );
  const previewThemeClasses = EDITOR_PREVIEW_THEME_CLASSES[themeMode];

  return (
    <div
      className={cn(
        "h-full overflow-hidden border border-border/60",
        previewThemeClasses.surface
      )}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden p-3">
        <div className="flex items-center justify-between gap-3 border-border/60 border-b pb-2 text-[11px] text-muted-foreground/80 uppercase tracking-[0.12em]">
          <span>{mode === "diff" ? "Diff preview" : "Regular preview"}</span>
          <div className="flex items-center gap-3">
            <span>EOL {getEditorPreviewEolLabel(eol)}</span>
            <span>Tab {tabSize}</span>
            <span>{syntaxHighlighting ? "Syntax on" : "Syntax off"}</span>
          </div>
        </div>
        <div
          className="grid h-full min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-4 overflow-hidden pt-3"
          style={{ lineHeight: `${Math.max(fontSize * 1.6, 22)}px` }}
        >
          {lineNumbers === "on" ? (
            <div className="select-none pt-0.5 text-muted-foreground/55">
              {lines.map((line) => (
                <div className="text-right" key={`line-number-${line.id}`}>
                  {line.lineNumber}
                </div>
              ))}
            </div>
          ) : null}
          <div className="min-w-0 overflow-hidden">
            {lines.map((line) => (
              <div
                className={cn(
                  lineClassName,
                  mode === "diff" &&
                    getEditorPreviewDiffState(line.content) === "added" &&
                    previewThemeClasses.addedHighlight,
                  mode === "diff" &&
                    getEditorPreviewDiffState(line.content) === "removed" &&
                    previewThemeClasses.removedHighlight
                )}
                key={line.id}
              >
                {mode === "diff" ? (
                  <span
                    className={cn(
                      "mr-2 inline-block w-3 text-center",
                      getEditorPreviewDiffState(line.content) === "added" &&
                        previewThemeClasses.markerAdded,
                      getEditorPreviewDiffState(line.content) === "removed" &&
                        previewThemeClasses.markerRemoved,
                      getEditorPreviewDiffState(line.content) === "unchanged" &&
                        previewThemeClasses.markerUnchanged
                    )}
                  >
                    {getEditorPreviewDiffMarker(line.content)}
                  </span>
                ) : null}
                <span
                  className={cn(
                    getEditorPreviewTone({
                      content: line.content,
                      mode,
                      syntaxHighlighting,
                      themeMode,
                    })
                  )}
                >
                  {renderEditorPreviewText(line.content, tabSize)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EditorPreview({
  eol,
  fontFamily,
  fontSize,
  lineNumbers,
  mode,
  onModeChange,
  syntaxHighlighting,
  tabSize,
  wordWrap,
}: {
  eol: "system" | "lf" | "crlf";
  fontFamily: string;
  fontSize: number;
  lineNumbers: "on" | "off";
  mode: "diff" | "regular";
  onModeChange: (value: "diff" | "regular") => void;
  syntaxHighlighting: boolean;
  tabSize: number;
  wordWrap: "on" | "off";
}) {
  const previewFontFamily = getPreviewFontFamily(fontFamily);
  const { resolvedTheme } = useTheme();
  const previewThemeMode: EditorPreviewThemeMode =
    resolvedTheme === "light" ? "light" : "dark";

  return (
    <div className="flex h-full min-h-88 flex-col overflow-hidden border border-border/70 bg-card/60">
      <div className="flex items-center justify-between border-border/70 border-b bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
        <span>Editor Preview</span>
        <SectionActionRow>
          <Select
            items={EDITOR_PREVIEW_MODE_OPTIONS}
            onValueChange={(value) => {
              if (value === "diff" || value === "regular") {
                onModeChange(value);
              }
            }}
            value={mode}
          >
            <SelectTrigger className="focus-visible:desktop-focus h-7 w-36 bg-background text-xs focus-visible:ring-0! focus-visible:ring-offset-0!">
              <DefaultSelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="regular">Regular editor</SelectItem>
                <SelectItem value="diff">Diff editor</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SectionActionRow>
      </div>
      <div
        className="min-h-0 flex-1 p-2"
        style={{
          fontFamily: previewFontFamily,
          fontSize: `${fontSize}px`,
        }}
      >
        <EditorStaticPreview
          eol={eol}
          fontSize={fontSize}
          lineNumbers={lineNumbers}
          mode={mode}
          syntaxHighlighting={syntaxHighlighting}
          tabSize={tabSize}
          themeMode={previewThemeMode}
          wordWrap={wordWrap}
        />
      </div>
    </div>
  );
}

function TerminalPreview({
  cursorStyle,
  fontFamily,
  fontSize,
  lineHeight,
}: {
  cursorStyle: "bar" | "block" | "underline";
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
}) {
  const previewFontFamily = getPreviewFontFamily(fontFamily);

  return (
    <div className="flex h-full min-h-88 flex-col overflow-hidden border border-border/70 bg-card/60">
      <div className="flex items-center justify-between border-border/70 border-b bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
        <span>Terminal Preview</span>
        <span>Default shell directory</span>
      </div>
      <div className="min-h-0 flex-1 p-2">
        <div
          className="flex h-full min-h-0 flex-col overflow-hidden border border-border/60 bg-background px-3 py-3 font-mono"
          style={{
            fontFamily: previewFontFamily,
            fontSize: `${fontSize}px`,
            lineHeight: String(Math.max(1.25, lineHeight + 0.15)),
          }}
        >
          <div className="min-h-0 flex-1">
            {TERMINAL_PREVIEW_LINES.map((line) => (
              <div
                className="truncate"
                key={`terminal-preview-${line.prefix}-${line.text}`}
              >
                <span
                  className={cn(
                    "mr-2",
                    line.tone === "prompt" && "text-emerald-300",
                    line.tone === "success" && "text-sky-300",
                    line.tone === "muted" && "text-muted-foreground/75"
                  )}
                >
                  {line.prefix}
                </span>
                <span
                  className={cn(
                    line.tone === "prompt" && "text-foreground",
                    line.tone === "success" && "text-foreground",
                    line.tone === "muted" && "text-muted-foreground/90"
                  )}
                >
                  {line.text}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2 text-muted-foreground/80 text-xs">
            <span className="text-emerald-300">~</span>
            <span
              className={cn(
                "inline-block bg-foreground/80",
                TERMINAL_CURSOR_STYLE_CLASS_NAMES[cursorStyle]
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export type { ThemePreference };
export {
  EditorPreview,
  EditorStaticPreview,
  NOTIFICATION_PREVIEW_TOAST_ID,
  PREVIEW_SAMPLE_DATE,
  TerminalPreview,
  ThemeSelector,
};
