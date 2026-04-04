import { useTheme } from "next-themes";
import { useCallback } from "react";
import { CodeEditor } from "@/components/code-editor/code-editor";
import type {
  EditorPreferences,
  TerminalPreferences,
  ThemePreference,
} from "@/stores/preferences/preferences-store-types";

export type { ThemePreference } from "@/stores/preferences/preferences-store-types";

// Constants
export const NOTIFICATION_PREVIEW_TOAST_ID = "settings-notification-preview";
export const PREVIEW_SAMPLE_DATE = new Date("2024-01-15T10:30:00Z");

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

const message = greet("World");
console.log(message);
`;

const SAMPLE_DIFF_ORIGINAL = `function greet(name: string): string {
  return "Hello, " + name + "!";
}`;

const SAMPLE_DIFF_MODIFIED = `function greet(name: string): string {
  return \`Hello, \${name}!\`;
}`;

export function EditorPreview({
  fontFamily,
  fontSize,
  lineNumbers,
  mode,
  onModeChange: _onModeChange, // Intentionally unused - parent handles mode switching
  syntaxHighlighting,
  tabSize,
  wordWrap,
}: EditorPreviewProps) {
  const { resolvedTheme } = useTheme();
  const editorTheme = resolvedTheme === "light" ? "light" : "dark";

  if (mode === "diff") {
    return (
      <div className="h-full w-full">
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
      </div>
    );
  }

  return (
    <div className="h-full w-full">
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
    <div className="flex gap-2">
      <button
        className={`rounded border px-3 py-2 text-sm ${
          value === "light" ? "border-primary bg-primary/10" : "border-border"
        }`}
        onClick={() => handleChange("light")}
        type="button"
      >
        Light
      </button>
      <button
        className={`rounded border px-3 py-2 text-sm ${
          value === "dark" ? "border-primary bg-primary/10" : "border-border"
        }`}
        onClick={() => handleChange("dark")}
        type="button"
      >
        Dark
      </button>
      <button
        className={`rounded border px-3 py-2 text-sm ${
          value === "system" ? "border-primary bg-primary/10" : "border-border"
        }`}
        onClick={() => handleChange("system")}
        type="button"
      >
        System
      </button>
    </div>
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
  let cursorClass = "border-b-2 border-foreground";

  if (cursorStyle === "block") {
    cursorClass = "bg-foreground";
  } else if (cursorStyle === "bar") {
    cursorClass = "border-l-2 border-foreground";
  }

  return (
    <div
      className="h-full w-full overflow-hidden rounded border bg-background p-2 font-mono text-sm"
      style={{
        fontFamily,
        fontSize: `${fontSize}px`,
        lineHeight,
      }}
    >
      <div className="text-muted-foreground">
        <span className="text-green-500">$</span> git status
      </div>
      <div className="mt-1 text-muted-foreground">
        On branch <span className="text-blue-500">main</span>
      </div>
      <div className="mt-1 text-muted-foreground">
        Your branch is up to date with &apos;origin/main&apos;.
      </div>
      <div className="mt-2" />
      <div className="text-muted-foreground">
        nothing to commit, working tree clean
      </div>
      <div className="mt-2 flex items-center text-muted-foreground">
        <span className="text-green-500">$</span>
        <span className={`ml-1 h-4 w-2 animate-pulse ${cursorClass}`} />
      </div>
    </div>
  );
}
