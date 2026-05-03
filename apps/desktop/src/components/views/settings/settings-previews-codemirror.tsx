import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@litgit/ui/components/select";
import { cn } from "@litgit/ui/lib/utils";
import { useTheme } from "next-themes";
import { useCallback } from "react";
import { CodeEditor } from "@/components/code-editor/code-editor";
import {
  DefaultSelectValue,
  SectionActionRow,
} from "@/components/views/settings/settings-section-ui";
import type {
  EditorPreferences,
  TerminalPreferences,
  ThemePreference,
} from "@/stores/preferences/preferences-store-types";

export type { ThemePreference } from "@/stores/preferences/preferences-store-types";

// Constants
export const NOTIFICATION_PREVIEW_TOAST_ID = "settings-notification-preview";
export const PREVIEW_SAMPLE_DATE = new Date("2024-01-15T10:30:00Z");

// Theme option types
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

// Theme Preview Art Components
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

function ThemePreviewArt({ value }: { value: ThemePreference }) {
  if (value === "light") {
    return <LightThemePreview />;
  }

  if (value === "dark") {
    return <DarkThemePreview />;
  }

  return <SystemThemePreview />;
}

interface ThemePreviewCardProps {
  isSelected: boolean;
  onSelect: (value: ThemePreference) => void;
  option: ThemeOption;
}

function ThemePreviewCard({
  option,
  isSelected,
  onSelect,
}: ThemePreviewCardProps) {
  const optionId = `theme-option-${option.value}`;

  return (
    <label aria-label={option.label} className="block" htmlFor={optionId}>
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

// Editor Preview Component
interface EditorPreviewProps {
  eol: EditorPreferences["eol"];
  fontFamily: string;
  fontSize: number;
  lineNumbers: EditorPreferences["lineNumbers"];
  mode: "diff" | "regular";
  onModeChange: (mode: "diff" | "regular") => void;
  syntaxHighlighting: boolean;
  tabSize: number;
  wordWrap: EditorPreferences["wordWrap"];
}

const SAMPLE_CODE = `function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export const message = greet("World");
`;

const SAMPLE_DIFF_ORIGINAL = `function greet(name: string): string {
  return "Hello, " + name + "!";
}`;

const SAMPLE_DIFF_MODIFIED = `function greet(name: string): string {
  return \`Hello, \${name}!\`;
}`;

const EDITOR_PREVIEW_MODE_OPTIONS = {
  diff: "Diff editor",
  regular: "Regular editor",
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

  return `"${trimmedFontFamily}", ui-monospace, SFMono-Regular, monospace`;
};

export function EditorPreview({
  fontFamily,
  fontSize,
  lineNumbers,
  mode,
  onModeChange,
  syntaxHighlighting,
  tabSize,
  wordWrap,
}: EditorPreviewProps) {
  const { resolvedTheme } = useTheme();
  const editorTheme = resolvedTheme === "light" ? "light" : "dark";
  const previewFontFamily = getPreviewFontFamily(fontFamily);

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
        {mode === "diff" ? (
          <CodeEditor
            fontFamily={fontFamily}
            fontSize={fontSize}
            language="typescript"
            lineNumbers={lineNumbers}
            mode="diff"
            modelPath="inmemory://settings/preview/diff"
            modified={SAMPLE_DIFF_MODIFIED}
            original={SAMPLE_DIFF_ORIGINAL}
            renderSideBySide
            syntaxHighlighting={syntaxHighlighting}
            tabSize={tabSize}
            theme={editorTheme}
            wordWrap={wordWrap}
          />
        ) : (
          <CodeEditor
            fontFamily={fontFamily}
            fontSize={fontSize}
            language="typescript"
            lineNumbers={lineNumbers}
            mode="view"
            modelPath="inmemory://settings/preview/regular"
            syntaxHighlighting={syntaxHighlighting}
            tabSize={tabSize}
            theme={editorTheme}
            value={SAMPLE_CODE}
            wordWrap={wordWrap}
          />
        )}
      </div>
    </div>
  );
}

// Theme Selector Component
interface ThemeSelectorProps {
  onValueChange: (theme: ThemePreference) => void;
  query?: string;
  value: ThemePreference;
}

export function ThemeSelector({ value, onValueChange }: ThemeSelectorProps) {
  const { setTheme } = useTheme();

  const handleChange = useCallback(
    (newTheme: ThemePreference) => {
      onValueChange(newTheme);
      setTheme(newTheme === "system" ? "system" : newTheme);
    },
    [onValueChange, setTheme]
  );

  return (
    <fieldset
      aria-label="Theme selection"
      className="grid grid-cols-1 gap-2 border-0 p-0 sm:grid-cols-3 sm:gap-3"
    >
      {THEME_SELECT_OPTIONS.map((option) => (
        <ThemePreviewCard
          isSelected={value === option.value}
          key={option.value}
          onSelect={handleChange}
          option={option}
        />
      ))}
    </fieldset>
  );
}

// Terminal Preview Component
interface TerminalPreviewProps {
  cursorStyle: TerminalPreferences["cursorStyle"];
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
}

export function TerminalPreview({
  cursorStyle,
  fontFamily,
  fontSize,
  lineHeight,
}: TerminalPreviewProps) {
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
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:color-mix(in_oklab,var(--color-muted-foreground)_55%,transparent)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/45 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2">
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
