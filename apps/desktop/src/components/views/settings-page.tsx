import { Button } from "@litgit/ui/components/button";
import { Checkbox } from "@litgit/ui/components/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@litgit/ui/components/combobox";
import { Input } from "@litgit/ui/components/input";
import { Label } from "@litgit/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@litgit/ui/components/select";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@litgit/ui/components/sidebar";
import { Skeleton } from "@litgit/ui/components/skeleton";
import { Switch } from "@litgit/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { cn } from "@litgit/ui/lib/utils";
import {
  ArrowLeftIcon,
  CpuIcon,
  GitBranchIcon,
  GlobeIcon,
  MonitorIcon,
  PaletteIcon,
  ShieldCheckIcon,
  TerminalWindowIcon,
  UserCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  getLocaleOption,
  LOCALE_OPTIONS,
  type LocaleOption,
  SYSTEM_LOCALE_CODE,
} from "@/lib/settings/locale-options";
import {
  clearAiProviderSecret,
  clearProxyAuthSecret,
  clearStoredHttpCredentialEntry,
  generateSshKeypair,
  getAiProviderSecretStatus,
  getGitIdentityStatus,
  getProxyAuthSecretStatus,
  getSettingsBackendCapabilities,
  listSigningKeys,
  listStoredHttpCredentialEntries,
  listSystemFontFamilies,
  pickSettingsFile,
  runProxyConnectionTest,
  saveAiProviderSecret,
  saveGitIdentity,
  saveProxyAuthSecret,
} from "@/lib/tauri-settings-client";
import {
  AUTO_FETCH_INTERVAL_LIMITS,
  clampEditorFontSize,
  clampEditorTabSize,
  clampTerminalFontSize,
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_PREFERENCES,
  DEFAULT_TERMINAL_FONT_FAMILY,
  SETTINGS_SECTION_LABELS,
  type SettingsSectionId,
} from "@/stores/preferences/preferences-store-types";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import { countUniqueRemoteNames } from "@/stores/repo/repo-store.helpers";
import { useRepoStore } from "@/stores/repo/use-repo-store";

interface SettingsSectionDefinition {
  description: string;
  icon: typeof GitBranchIcon;
  id: SettingsSectionId;
  keywords: string[];
}

const SETTINGS_SECTIONS: SettingsSectionDefinition[] = [
  {
    id: "general",
    description: "Startup and repository defaults with live app effects.",
    icon: GitBranchIcon,
    keywords: ["tabs", "graph", "history", "startup", "pull"],
  },
  {
    id: "git",
    description:
      "Manage how you appear in commits. Your name and email are read from your Git config.",
    icon: UserCircleIcon,
    keywords: [
      "profile",
      "git",
      "identity",
      "author",
      "name",
      "email",
      "commit",
    ],
  },
  {
    id: "ssh",
    description: "SSH agent and key material used for authenticated remotes.",
    icon: ShieldCheckIcon,
    keywords: ["agent", "keys", "auth", "git", "remote"],
  },
  {
    id: "ui",
    description: "Theme, locale, date rendering, and toolbar labeling.",
    icon: PaletteIcon,
    keywords: ["theme", "locale", "date", "toolbar", "notifications"],
  },
  {
    id: "signing",
    description: "Commit-signing defaults for supported Git commit flows.",
    icon: ShieldCheckIcon,
    keywords: ["gpg", "ssh", "signing", "commits"],
  },
  {
    id: "editor",
    description: "Monaco diff-editor appearance and runtime preferences.",
    icon: MonitorIcon,
    keywords: ["editor", "monaco", "wrap", "line numbers", "font"],
  },
  {
    id: "terminal",
    description: "Font and cursor presentation for the integrated terminal.",
    icon: TerminalWindowIcon,
    keywords: ["font", "cursor", "terminal", "line height"],
  },
  {
    id: "network",
    description:
      "Proxy, SSL, and remote credential behavior for Git network flows.",
    icon: GlobeIcon,
    keywords: ["proxy", "ssl", "http", "credentials", "gcm"],
  },
  {
    id: "ai",
    description:
      "Provider endpoint and API-key storage status for future AI features.",
    icon: CpuIcon,
    keywords: ["provider", "api", "endpoint", "future"],
  },
];

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
          "group relative flex min-w-0 cursor-pointer flex-col gap-2 rounded-xl border p-3 text-left transition-all duration-150 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
          isSelected
            ? "border-primary/60 bg-primary/5 shadow-primary/10 shadow-sm"
            : "border-border/60 bg-background/70 hover:border-border hover:bg-muted/30"
        )}
      >
        <div className="relative overflow-hidden rounded-lg border border-border/50">
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
        <div className="size-1.5 rounded-sm bg-[oklch(0.556_0_0)]" />
        <div className="size-1.5 rounded-sm bg-[oklch(0.556_0_0)]" />
        <div className="size-1.5 rounded-sm bg-[oklch(0.556_0_0)]" />
        <div className="ml-auto size-1.5 rounded-full bg-[oklch(0.708_0_0)]" />
      </div>
      <div className="flex flex-1 gap-1 p-1">
        <div className="w-5 rounded-sm bg-[oklch(0.97_0_0)]" />
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="h-2 rounded-sm bg-[oklch(0.922_0_0)]" />
          <div className="h-1.5 w-3/4 rounded-sm bg-[oklch(0.922_0_0)]" />
          <div className="h-1.5 w-1/2 rounded-sm bg-[oklch(0.922_0_0)]" />
        </div>
      </div>
    </div>
  );
}

function DarkThemePreview() {
  return (
    <div className="flex h-16 flex-col bg-[oklch(0.145_0_0)]">
      <div className="flex items-center gap-1 border-[oklch(1_0_0/10%)] border-b px-1.5 py-1">
        <div className="size-1.5 rounded-sm bg-[oklch(0.708_0_0)]" />
        <div className="size-1.5 rounded-sm bg-[oklch(0.708_0_0)]" />
        <div className="size-1.5 rounded-sm bg-[oklch(0.708_0_0)]" />
        <div className="ml-auto size-1.5 rounded-full bg-[oklch(0.556_0_0)]" />
      </div>
      <div className="flex flex-1 gap-1 p-1">
        <div className="w-5 rounded-sm bg-[oklch(0.269_0_0)]" />
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="h-2 rounded-sm bg-[oklch(0.269_0_0)]" />
          <div className="h-1.5 w-3/4 rounded-sm bg-[oklch(0.269_0_0)]" />
          <div className="h-1.5 w-1/2 rounded-sm bg-[oklch(0.269_0_0)]" />
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
          <div className="size-1 rounded-sm bg-[oklch(0.556_0_0)]" />
          <div className="size-1 rounded-sm bg-[oklch(0.556_0_0)]" />
        </div>
        <div className="flex flex-1 flex-col gap-0.5 p-1">
          <div className="h-1.5 rounded-sm bg-[oklch(0.922_0_0)]" />
          <div className="h-1 w-3/4 rounded-sm bg-[oklch(0.922_0_0)]" />
        </div>
      </div>
      <div className="flex w-1/2 flex-col bg-[oklch(0.145_0_0)]">
        <div className="flex items-center gap-0.5 border-[oklch(1_0_0/10%)] border-b px-1 py-0.5">
          <div className="size-1 rounded-sm bg-[oklch(0.708_0_0)]" />
          <div className="size-1 rounded-sm bg-[oklch(0.708_0_0)]" />
        </div>
        <div className="flex flex-1 flex-col gap-0.5 p-1">
          <div className="h-1.5 rounded-sm bg-[oklch(0.269_0_0)]" />
          <div className="h-1 w-3/4 rounded-sm bg-[oklch(0.269_0_0)]" />
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

const TOASTER_OPTIONS = {
  "bottom-center": "Bottom center",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
  "top-center": "Top center",
  "top-left": "Top left",
  "top-right": "Top right",
} as const;

const DATE_FORMAT_OPTIONS = {
  compact: "Compact",
  verbose: "Verbose",
} as const;

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

const CURSOR_STYLE_OPTIONS = {
  bar: "Bar",
  block: "Block",
  underline: "Underline",
} as const;

const AI_PROVIDER_OPTIONS = {
  anthropic: "Anthropic",
  azure: "Azure",
  custom: "Custom",
  google: "Google",
  ollama: "Ollama",
  openai: "OpenAI",
} as const;

const AI_ENDPOINT_PLACEHOLDERS: Record<string, string> = {
  anthropic: "https://api.anthropic.com/v1",
  azure:
    "https://<resource-name>.openai.azure.com/openai/deployments/<deployment-name>",
  custom: "https://localhost:8000/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  ollama: "http://localhost:11434/v1",
  openai: "https://api.openai.com/v1",
};

const PROXY_TYPE_OPTIONS = {
  http: "HTTP",
  https: "HTTPS",
  socks5: "SOCKS5",
} as const;

const MONOSPACE_FONT_NAMES = new Set([
  "Cascadia Code, monospace",
  "Fira Code, monospace",
  "Geist Mono, monospace",
  "IBM Plex Mono, monospace",
  "JetBrains Mono Variable, JetBrains Mono, monospace",
]);

interface FontPickerOption {
  family: string;
  isMonospace: boolean;
  source: "curated" | "system";
}

interface SystemFontReadResult {
  options: FontPickerOption[];
  status: "available" | "unavailable";
}

interface SidebarResizeState {
  pointerId?: number;
  startWidth: number;
  startX: number;
}

const LEFT_SIDEBAR_MIN_WIDTH = 220;
const LEFT_SIDEBAR_MAX_WIDTH = 400;
const LEFT_SIDEBAR_DEFAULT_WIDTH = 280;
const MIN_CONTENT_WIDTH = 560;
const EDITOR_PREVIEW_SIDEBAR_MIN_WIDTH = 320;
const EDITOR_PREVIEW_SIDEBAR_MAX_WIDTH = 640;
const EDITOR_PREVIEW_SIDEBAR_DEFAULT_WIDTH = 420;
const EDITOR_CONTENT_MIN_WIDTH = 560;
const RESIZE_HANDLE_WIDTH = 6;
const SETTINGS_SIDEBAR_WIDTH_STORAGE_KEY = "litgit:settings-sidebar-width";
const SETTINGS_EDITOR_PREVIEW_WIDTH_STORAGE_KEY =
  "litgit:settings-editor-preview-width";
const SETTINGS_TERMINAL_PREVIEW_WIDTH_STORAGE_KEY =
  "litgit:settings-terminal-preview-width";

const LINE_NUMBER_OPTIONS = {
  off: "Hidden",
  on: "Visible",
} as const;

const SIGNING_FORMAT_OPTIONS = {
  gpg: "OPENPGP",
  ssh: "SSH",
} as const;

const NO_SIGNING_KEY_VALUE = "__none__";

const EOL_OPTIONS = {
  crlf: "CRLF",
  lf: "LF",
  system: "System default",
} as const;

const clampWidth = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const getSettingsLayoutWidth = () => {
  if (typeof window === "undefined") {
    return LEFT_SIDEBAR_DEFAULT_WIDTH + MIN_CONTENT_WIDTH + RESIZE_HANDLE_WIDTH;
  }

  return window.innerWidth;
};

const getSidebarResizeBounds = (availableWidth: number) => {
  const maxWidth = Math.max(
    0,
    Math.min(
      LEFT_SIDEBAR_MAX_WIDTH,
      availableWidth - MIN_CONTENT_WIDTH - RESIZE_HANDLE_WIDTH
    )
  );
  const minWidth = Math.min(LEFT_SIDEBAR_MIN_WIDTH, maxWidth);

  return {
    maxWidth,
    minWidth,
  };
};

const getInitialSidebarWidth = () => {
  if (typeof window === "undefined") {
    return LEFT_SIDEBAR_DEFAULT_WIDTH;
  }

  const storedWidth = window.localStorage.getItem(
    SETTINGS_SIDEBAR_WIDTH_STORAGE_KEY
  );
  const parsedStoredWidth = storedWidth
    ? Number.parseInt(storedWidth, 10)
    : Number.NaN;
  const preferredWidth = Number.isFinite(parsedStoredWidth)
    ? parsedStoredWidth
    : LEFT_SIDEBAR_DEFAULT_WIDTH;
  const { maxWidth, minWidth } = getSidebarResizeBounds(
    getSettingsLayoutWidth()
  );

  if (maxWidth <= 0) {
    return 0;
  }

  return clampWidth(preferredWidth, minWidth, maxWidth);
};

const getEditorPreviewResizeBounds = (availableWidth: number) => {
  const maxWidth = Math.max(
    0,
    Math.min(
      EDITOR_PREVIEW_SIDEBAR_MAX_WIDTH,
      availableWidth - EDITOR_CONTENT_MIN_WIDTH - RESIZE_HANDLE_WIDTH
    )
  );
  const minWidth = Math.min(EDITOR_PREVIEW_SIDEBAR_MIN_WIDTH, maxWidth);

  return {
    maxWidth,
    minWidth,
  };
};

const getInitialEditorPreviewSidebarWidth = () => {
  if (typeof window === "undefined") {
    return EDITOR_PREVIEW_SIDEBAR_DEFAULT_WIDTH;
  }

  const storedWidth = window.localStorage.getItem(
    SETTINGS_EDITOR_PREVIEW_WIDTH_STORAGE_KEY
  );
  const parsedStoredWidth = storedWidth
    ? Number.parseInt(storedWidth, 10)
    : Number.NaN;
  const preferredWidth = Number.isFinite(parsedStoredWidth)
    ? parsedStoredWidth
    : EDITOR_PREVIEW_SIDEBAR_DEFAULT_WIDTH;
  const { maxWidth, minWidth } = getEditorPreviewResizeBounds(
    getSettingsLayoutWidth()
  );

  if (maxWidth <= 0) {
    return 0;
  }

  return clampWidth(preferredWidth, minWidth, maxWidth);
};

const getInitialTerminalPreviewSidebarWidth = () => {
  if (typeof window === "undefined") {
    return EDITOR_PREVIEW_SIDEBAR_DEFAULT_WIDTH;
  }

  const storedWidth = window.localStorage.getItem(
    SETTINGS_TERMINAL_PREVIEW_WIDTH_STORAGE_KEY
  );
  const parsedStoredWidth = storedWidth
    ? Number.parseInt(storedWidth, 10)
    : Number.NaN;
  const preferredWidth = Number.isFinite(parsedStoredWidth)
    ? parsedStoredWidth
    : EDITOR_PREVIEW_SIDEBAR_DEFAULT_WIDTH;
  const { maxWidth, minWidth } = getEditorPreviewResizeBounds(
    getSettingsLayoutWidth()
  );

  if (maxWidth <= 0) {
    return 0;
  }

  return clampWidth(preferredWidth, minWidth, maxWidth);
};

const getVisibleFonts = (
  fonts: readonly FontPickerOption[],
  visibility: "all-fonts" | "monospace-only"
) => {
  if (visibility === "all-fonts") {
    return fonts;
  }

  return fonts.filter((font) => font.isMonospace);
};

const detectMonospaceFont = (fontName: string) => {
  const normalizedFontName = fontName.toLowerCase();

  return (
    normalizedFontName.includes("mono") ||
    normalizedFontName.includes("code") ||
    normalizedFontName.includes("console") ||
    normalizedFontName.includes("courier") ||
    MONOSPACE_FONT_NAMES.has(fontName)
  );
};

const BUNDLED_FONT_OPTIONS = [
  {
    family: "Geist Variable, Geist, sans-serif",
    isMonospace: false,
    source: "curated" as const,
  },
  {
    family: "JetBrains Mono Variable, JetBrains Mono, monospace",
    isMonospace: true,
    source: "curated" as const,
  },
] as const satisfies readonly FontPickerOption[];

let cachedSystemFontReadResult: SystemFontReadResult | null = null;
let systemFontReadInFlightPromise: Promise<SystemFontReadResult> | null = null;

const readSystemFontFamiliesUncached =
  async (): Promise<SystemFontReadResult> => {
    try {
      const tauriFontFamilies = await listSystemFontFamilies();

      if (tauriFontFamilies.length > 0) {
        return {
          options: tauriFontFamilies.map((family) => ({
            family,
            isMonospace: detectMonospaceFont(family),
            source: "system" as const,
          })),
          status: "available",
        };
      }
    } catch {
      // Fall back to browser APIs when native enumeration is unavailable.
    }

    if (!(typeof window !== "undefined" && "queryLocalFonts" in window)) {
      return {
        options: [],
        status: "unavailable",
      };
    }

    try {
      const queryLocalFonts = (
        window as Window & {
          queryLocalFonts?: () => Promise<Array<{ family: string }>>;
        }
      ).queryLocalFonts;

      if (!queryLocalFonts) {
        return {
          options: [],
          status: "unavailable",
        };
      }

      const fonts = await queryLocalFonts();

      return {
        options: Array.from(
          new Map(
            fonts
              .filter((font) => typeof font.family === "string")
              .map((font) => {
                const family = font.family.trim();

                return [
                  family,
                  {
                    family,
                    isMonospace: detectMonospaceFont(family),
                    source: "system" as const,
                  },
                ];
              })
          ).values()
        ).filter((font) => font.family.length > 0),
        status: "available",
      };
    } catch {
      return {
        options: [],
        status: "unavailable",
      };
    }
  };

const readSystemFontFamilies = async (): Promise<SystemFontReadResult> => {
  if (cachedSystemFontReadResult) {
    return cachedSystemFontReadResult;
  }

  if (systemFontReadInFlightPromise) {
    return systemFontReadInFlightPromise;
  }

  systemFontReadInFlightPromise = readSystemFontFamiliesUncached();

  try {
    const result = await systemFontReadInFlightPromise;
    cachedSystemFontReadResult = result;

    return result;
  } finally {
    systemFontReadInFlightPromise = null;
  }
};

const runWhenBrowserIsIdle = (callback: () => void): (() => void) => {
  if (typeof window === "undefined") {
    callback();

    return () => undefined;
  }

  const idleWindow = window as Window & {
    cancelIdleCallback?: (id: number) => void;
    requestIdleCallback?: (
      callback: (deadline: unknown) => void,
      options?: { timeout: number }
    ) => number;
  };

  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(
      () => {
        callback();
      },
      { timeout: 300 }
    );

    return () => {
      idleWindow.cancelIdleCallback?.(handle);
    };
  }

  const handle = window.setTimeout(() => {
    callback();
  }, 0);

  return () => {
    window.clearTimeout(handle);
  };
};

const describeFontSource = (option: FontPickerOption) => {
  if (option.source === "system") {
    return option.isMonospace
      ? "System font - detected monospace"
      : "System font";
  }

  return option.isMonospace
    ? "Bundled fallback - monospace"
    : "Bundled fallback";
};

const matchesQuery = (query: string, values: string[]) => {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return false;
  }

  return values.some((value) => value.toLowerCase().includes(normalizedQuery));
};

function SettingsField({
  children,
  description,
  label,
  onJump,
  query,
}: {
  children: React.ReactNode;
  description: string;
  label: string;
  onJump?: () => void;
  query: string;
}) {
  const isHighlighted = matchesQuery(query, [label, description]);

  return (
    <div
      className={cn(
        "grid gap-2 rounded-xl border border-border/60 bg-background/70 p-4 transition-colors md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] md:gap-6",
        isHighlighted && "border-primary/40 bg-primary/5"
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium text-sm">{label}</div>
          {isHighlighted && onJump ? (
            <Button onClick={onJump} size="xs" type="button" variant="ghost">
              Open section
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {description}
        </p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function PlannedField({
  description,
  label,
  query,
}: {
  description: string;
  label: string;
  query: string;
}) {
  const isHighlighted = matchesQuery(query, [label, description, "planned"]);

  return (
    <div
      className={cn(
        "grid gap-1 rounded-xl border border-border/70 border-dashed bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] md:gap-6",
        isHighlighted && "border-primary/50 bg-primary/5"
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium text-sm">{label}</div>
          <span className="rounded-full border border-border/70 px-2 py-0.5 text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
            Planned
          </span>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {description}
        </p>
      </div>
      <div className="hidden md:block" />
    </div>
  );
}

function SettingsHelpText({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "danger" | "muted" | "warning";
}) {
  return (
    <p
      className={cn(
        "text-xs leading-relaxed",
        tone === "muted" && "text-muted-foreground",
        tone === "warning" && "text-amber-600 dark:text-amber-300",
        tone === "danger" && "text-destructive"
      )}
    >
      {children}
    </p>
  );
}

function SectionActionRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function DefaultSelectValue({
  placeholder = "Not selected",
}: {
  placeholder?: string;
}) {
  return <SelectValue placeholder={placeholder} />;
}

type EditorPreviewThemeMode = "dark" | "light";

const EDITOR_PREVIEW_THEME_CLASSES = {
  dark: {
    addedHighlight:
      "rounded-sm bg-emerald-500/12 pl-2 ring-1 ring-emerald-400/25",
    markerAdded: "text-emerald-300",
    markerRemoved: "text-rose-300",
    markerUnchanged: "text-muted-foreground/50",
    removedHighlight:
      "rounded-sm bg-rose-500/10 pl-2 opacity-90 ring-1 ring-rose-400/20",
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
    addedHighlight:
      "rounded-sm bg-emerald-100/80 pl-2 ring-1 ring-emerald-300/70",
    markerAdded: "text-emerald-700",
    markerRemoved: "text-rose-700",
    markerUnchanged: "text-muted-foreground/70",
    removedHighlight:
      "rounded-sm bg-rose-100/80 pl-2 opacity-95 ring-1 ring-rose-300/70",
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
  block: "h-4 w-2 rounded-[1px]",
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
        "h-full overflow-hidden rounded-md border border-border/60",
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
    <div className="flex h-full min-h-88 flex-col overflow-hidden rounded-lg border border-border/70 bg-card/60">
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
            <SelectTrigger className="h-7 w-36 bg-background text-xs">
              <DefaultSelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="regular">Regular editor</SelectItem>
              <SelectItem value="diff">Diff editor</SelectItem>
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
    <div className="flex h-full min-h-88 flex-col overflow-hidden rounded-lg border border-border/70 bg-card/60">
      <div className="flex items-center justify-between border-border/70 border-b bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
        <span>Terminal Preview</span>
        <span>Default shell directory</span>
      </div>
      <div className="min-h-0 flex-1 p-2">
        <div
          className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border/60 bg-background px-3 py-3 font-mono"
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

function FontPickerField({
  description,
  emptyMessage,
  helperText,
  isLoadingOptions,
  label,
  monospaceOnly,
  onMonospaceOnlyChange,
  onPickerInteract,
  onSearchChange,
  onValueChange,
  options,
  query,
  searchPlaceholder,
  selectedFont,
  showLoadingSkeleton,
}: {
  description: string;
  emptyMessage: string;
  helperText: string;
  isLoadingOptions?: boolean;
  label: string;
  monospaceOnly: boolean;
  onMonospaceOnlyChange: (checked: boolean) => void;
  onPickerInteract?: () => void;
  onSearchChange: (value: string) => void;
  onValueChange: (value: string) => void;
  options: readonly FontPickerOption[];
  query: string;
  searchPlaceholder: string;
  selectedFont: string;
  showLoadingSkeleton?: boolean;
}) {
  const selectedOption =
    options.find((option) => option.family === selectedFont) ?? null;

  return (
    <SettingsField description={description} label={label} query={query}>
      <div className="grid gap-3">
        {showLoadingSkeleton ? (
          <Skeleton className="h-8 w-full rounded-lg border border-input/60 bg-input/35" />
        ) : (
          <Combobox
            autoHighlight
            items={options}
            itemToStringLabel={(option: FontPickerOption) => option.family}
            onValueChange={(nextValue: FontPickerOption | null) => {
              if (nextValue) {
                onValueChange(nextValue.family);
              }
            }}
            value={selectedOption}
          >
            <ComboboxInput
              className="w-full"
              onChange={(event) => {
                onPickerInteract?.();
                onSearchChange(event.target.value);
              }}
              onFocus={() => {
                onPickerInteract?.();
              }}
              placeholder={searchPlaceholder}
              showClear
            />
            <ComboboxContent>
              <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
              <ComboboxList className="[scrollbar-color:color-mix(in_oklab,var(--color-muted-foreground)_55%,transparent)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/45 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2">
                {(option: FontPickerOption) => (
                  <ComboboxItem key={option.family} value={option}>
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-6">
                      <div className="min-w-0">
                        <div className="truncate text-sm">{option.family}</div>
                        <div className="truncate text-muted-foreground text-xs">
                          {describeFontSource(option)}
                        </div>
                      </div>
                    </div>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        )}
        <label className="inline-flex items-center gap-3">
          <Switch
            checked={monospaceOnly}
            onCheckedChange={(checked) =>
              onMonospaceOnlyChange(Boolean(checked))
            }
          />
          <span className="text-sm">Show monospace fonts only</span>
        </label>
        {isLoadingOptions ? (
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <span className="inline-flex size-2 animate-pulse rounded-full bg-primary/60" />
            <span>Loading installed fonts...</span>
          </div>
        ) : null}
        <SettingsHelpText>{helperText}</SettingsHelpText>
      </div>
    </SettingsField>
  );
}

const isMatchingSshKeyPair = (
  privateKeyPath: string | null | undefined,
  publicKeyPath: string | null | undefined
) => {
  const trimmedPrivateKeyPath = privateKeyPath?.trim() ?? "";
  const trimmedPublicKeyPath = publicKeyPath?.trim() ?? "";

  if (!(trimmedPrivateKeyPath && trimmedPublicKeyPath)) {
    return true;
  }

  return trimmedPublicKeyPath === `${trimmedPrivateKeyPath}.pub`;
};

function renderSection(
  sectionId: SettingsSectionId,
  query: string
): React.ReactNode {
  switch (sectionId) {
    case "general":
      return <GeneralSection query={query} />;
    case "git":
      return <GitSection query={query} />;
    case "ssh":
      return <SshSection query={query} />;
    case "ui":
      return <UiSection query={query} />;
    case "signing":
      return <SigningSection query={query} />;
    case "editor":
      return <EditorSection query={query} />;
    case "terminal":
      return <TerminalSection query={query} />;
    case "network":
      return <NetworkSection query={query} />;
    case "ai":
      return <AiSection query={query} />;
    default:
      return null;
  }
}

function GitSection({ query }: { query: string }) {
  const activeRepoId = useRepoStore((state) => state.activeRepoId);
  const activeRepo = useRepoStore((state) =>
    state.openedRepos.find((repo) => repo.id === activeRepoId)
  );
  const activeRepoIdentity = useRepoStore((state) =>
    activeRepoId ? (state.repoGitIdentities[activeRepoId] ?? null) : null
  );
  const setRepoGitIdentity = useRepoStore((state) => state.setRepoGitIdentity);
  const [identityStatus, setIdentityStatus] = useState<null | {
    effective: {
      email: string | null;
      isComplete: boolean;
      name: string | null;
    };
    effectiveScope: "global" | "local" | null;
    global: { email: string | null; isComplete: boolean; name: string | null };
    local: {
      email: string | null;
      isComplete: boolean;
      name: string | null;
    } | null;
    repoPath: string | null;
  }>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState<{
    email: string;
    name: string;
  } | null>(null);
  const [lastLoadedRepoPath, setLastLoadedRepoPath] = useState<string | null>(
    null
  );

  const areIdentityStatusesEqual = useCallback(
    (
      left: {
        effective: {
          email: string | null;
          isComplete: boolean;
          name: string | null;
        };
        effectiveScope: "global" | "local" | null;
        global: {
          email: string | null;
          isComplete: boolean;
          name: string | null;
        };
        local: {
          email: string | null;
          isComplete: boolean;
          name: string | null;
        } | null;
        repoPath: string | null;
      } | null,
      right: {
        effective: {
          email: string | null;
          isComplete: boolean;
          name: string | null;
        };
        effectiveScope: "global" | "local" | null;
        global: {
          email: string | null;
          isComplete: boolean;
          name: string | null;
        };
        local: {
          email: string | null;
          isComplete: boolean;
          name: string | null;
        } | null;
        repoPath: string | null;
      } | null
    ) => {
      return JSON.stringify(left) === JSON.stringify(right);
    },
    []
  );

  const formatIdentity = useCallback(
    (
      value: { email: string | null; name: string | null } | null | undefined
    ) => {
      if (!(value?.name || value?.email)) {
        return "Not configured";
      }

      if (value.name && value.email) {
        return `${value.name} <${value.email}>`;
      }

      return value.name ?? value.email ?? "Not configured";
    },
    []
  );

  const refreshIdentity = useCallback(async () => {
    setIsRefreshing(true);

    try {
      const nextStatus = await getGitIdentityStatus(activeRepo?.path ?? null);
      setIdentityStatus(nextStatus);
      setLastLoadedRepoPath(activeRepo?.path ?? null);

      if (activeRepoId) {
        setRepoGitIdentity(activeRepoId, nextStatus);
      }

      setStatusMessage(null);
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to read Git profile"
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [activeRepo?.path, activeRepoId, setRepoGitIdentity]);

  useEffect(() => {
    refreshIdentity().catch(() => undefined);
  }, [refreshIdentity]);

  useEffect(() => {
    if (!(activeRepo && activeRepoIdentity)) {
      return;
    }

    setIdentityStatus((currentStatus) => {
      if (areIdentityStatusesEqual(currentStatus, activeRepoIdentity)) {
        return currentStatus;
      }

      return activeRepoIdentity;
    });

    if (
      lastLoadedRepoPath === activeRepo.path &&
      identityStatus !== null &&
      !areIdentityStatusesEqual(identityStatus, activeRepoIdentity)
    ) {
      setStatusMessage("Profile changed outside LitGit; values refreshed.");
    }
  }, [
    activeRepo,
    activeRepoIdentity,
    areIdentityStatusesEqual,
    identityStatus,
    lastLoadedRepoPath,
  ]);

  useEffect(() => {
    const preferredIdentity =
      identityStatus?.global ?? identityStatus?.effective;

    setName(preferredIdentity?.name ?? "");
    setEmail(preferredIdentity?.email ?? "");
  }, [identityStatus]);

  let effectiveIdentityHelpText =
    "No global profile is configured. Click Change to set one.";

  if (identityStatus?.effectiveScope === "local") {
    effectiveIdentityHelpText =
      "A repository-specific profile is active. Changes made here apply to your global default.";
  } else if (identityStatus?.effectiveScope === "global") {
    effectiveIdentityHelpText =
      "Your global profile is active across all repositories.";
  }

  return (
    <div className="grid gap-4">
      <SettingsField
        description="This defines who you are when authoring commits. Your name and email are read directly from your global Git config."
        label="Commit profile"
        query={query}
      >
        <div className="grid gap-3">
          <div className="grid gap-2 rounded-xl border border-border/60 bg-muted/18 p-4">
            {isEditing ? (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="git-settings-name">Commit author name</Label>
                  <Input
                    id="git-settings-name"
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Jane Developer"
                    value={name}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="git-settings-email">
                    Commit author email
                  </Label>
                  <Input
                    id="git-settings-email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="jane@example.com"
                    type="email"
                    value={email}
                  />
                </div>
                <SectionActionRow>
                  <Button
                    disabled={isSaving}
                    onClick={() => {
                      setIsSaving(true);
                      saveGitIdentity({
                        gitIdentity: { email, name, scope: "global" },
                        repoPath: null,
                      })
                        .then((nextStatus) => {
                          setIdentityStatus(nextStatus);
                          setLastLoadedRepoPath(activeRepo?.path ?? null);

                          if (activeRepoId) {
                            setRepoGitIdentity(activeRepoId, nextStatus);
                          }

                          setStatusMessage("Saved global profile.");
                          setIsEditing(false);
                          setEditSnapshot(null);
                        })
                        .catch((error: unknown) => {
                          setStatusMessage(
                            error instanceof Error
                              ? error.message
                              : "Failed to save Git profile"
                          );
                        })
                        .finally(() => {
                          setIsSaving(false);
                        });
                    }}
                    type="button"
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    disabled={isSaving}
                    onClick={() => {
                      if (editSnapshot) {
                        setName(editSnapshot.name);
                        setEmail(editSnapshot.email);
                      }

                      setIsEditing(false);
                      setEditSnapshot(null);
                      setStatusMessage(null);
                    }}
                    type="button"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </SectionActionRow>
              </div>
            ) : (
              <div className="grid gap-4">
                <div>
                  <p className="font-medium text-sm">Identity in use</p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {formatIdentity(identityStatus?.effective)}
                  </p>
                  <SettingsHelpText>
                    {effectiveIdentityHelpText}
                  </SettingsHelpText>
                </div>
                {identityStatus?.effectiveScope === "local" ? (
                  <div className="grid gap-1 text-muted-foreground text-xs">
                    <span>
                      Global: {formatIdentity(identityStatus?.global)}
                    </span>
                    {activeRepo ? (
                      <span>
                        Repository override:{" "}
                        {formatIdentity(identityStatus?.local)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <SectionActionRow>
                  <Button
                    disabled={isRefreshing}
                    onClick={() => {
                      refreshIdentity().catch(() => undefined);
                    }}
                    type="button"
                    variant="outline"
                  >
                    {isRefreshing ? "Refreshing..." : "Refresh profile"}
                  </Button>
                  <Button
                    onClick={() => {
                      setEditSnapshot({ email, name });
                      setIsEditing(true);
                      setStatusMessage(null);
                    }}
                    type="button"
                    variant="outline"
                  >
                    Change
                  </Button>
                </SectionActionRow>
              </div>
            )}
          </div>
          <SettingsHelpText>
            Your email is attached to your commits and may be visible on public
            repositories. LitGit uses your underlying Git config to store this
            profile.
          </SettingsHelpText>
          {statusMessage ? (
            <SettingsHelpText>{statusMessage}</SettingsHelpText>
          ) : null}
        </div>
      </SettingsField>
    </div>
  );
}

function GeneralSection({ query }: { query: string }) {
  const rememberTabs = usePreferencesStore(
    (state) => state.general.rememberTabs
  );
  const autoFetchIntervalMinutes = usePreferencesStore(
    (state) => state.general.autoFetchIntervalMinutes
  );
  const defaultBranchName = usePreferencesStore(
    (state) => state.general.defaultBranchName
  );
  const setRememberTabs = usePreferencesStore((state) => state.setRememberTabs);
  const setAutoFetchIntervalMinutes = usePreferencesStore(
    (state) => state.setAutoFetchIntervalMinutes
  );
  const setDefaultBranchName = usePreferencesStore(
    (state) => state.setDefaultBranchName
  );
  const activeRepoId = useRepoStore((state) => state.activeRepoId);
  const repoRemoteNames = useRepoStore((state) => state.repoRemoteNames);
  const remoteNames = activeRepoId
    ? (repoRemoteNames[activeRepoId] ?? null)
    : null;
  const uniqueRemoteCount = remoteNames
    ? countUniqueRemoteNames(remoteNames)
    : null;
  const showAutoFetchWarning =
    uniqueRemoteCount !== null && uniqueRemoteCount > 5;

  return (
    <div className="grid gap-4">
      <SettingsField
        description="Keep open tabs between launches. Turning this off stops restoration and clears remembered tab layout."
        label="Remember tabs"
        query={query}
      >
        <label className="inline-flex items-center gap-3">
          <Switch
            checked={rememberTabs}
            onCheckedChange={(checked) => setRememberTabs(Boolean(checked))}
          />
          <span className="text-sm">
            {rememberTabs ? "Restore tabs on launch" : "Do not restore tabs"}
          </span>
        </label>
      </SettingsField>
      <SettingsField
        description="Prefills the branch name for newly created local repositories. Defaults to main."
        label="Default branch name"
        query={query}
      >
        <div className="grid gap-2">
          <Input
            onChange={(event) => setDefaultBranchName(event.target.value)}
            placeholder="main"
            value={defaultBranchName}
          />
          <SettingsHelpText>
            Used only when creating a new local repository from LitGit.
          </SettingsHelpText>
        </div>
      </SettingsField>
      <SettingsField
        description="Schedules background fetches for the active repository tab. Default is 1 minute, and 0 disables it."
        label="Auto fetch interval"
        query={query}
      >
        <div className="grid gap-2">
          <Input
            max={AUTO_FETCH_INTERVAL_LIMITS.max}
            min={AUTO_FETCH_INTERVAL_LIMITS.min}
            onChange={(event) => {
              setAutoFetchIntervalMinutes(Number(event.target.value) || 0);
            }}
            type="number"
            value={autoFetchIntervalMinutes}
          />
          <SettingsHelpText>
            LitGit defaults to 1 minute, similar to GitKraken. Use 0 to disable
            auto fetch. Allowed range: 0 to 60 minutes.
          </SettingsHelpText>
          {showAutoFetchWarning ? (
            <SettingsHelpText tone="warning">
              This repository has {uniqueRemoteCount} configured remotes.
              Frequent background fetches may be expensive.
            </SettingsHelpText>
          ) : null}
          <SettingsHelpText tone="warning">
            Each visible repository tab can schedule fetch work. Keeping many
            repo tabs open with short intervals may impact performance.
          </SettingsHelpText>
        </div>
      </SettingsField>
    </div>
  );
}

function UiSection({ query }: { query: string }) {
  const locale = usePreferencesStore((state) => state.ui.locale);
  const setLocale = usePreferencesStore((state) => state.setLocale);
  const theme = usePreferencesStore((state) => state.ui.theme);
  const setThemePreference = usePreferencesStore(
    (state) => state.setThemePreference
  );
  const toasterPosition = usePreferencesStore(
    (state) => state.ui.toasterPosition
  );
  const setToasterPosition = usePreferencesStore(
    (state) => state.setToasterPosition
  );
  const toolbarLabels = usePreferencesStore((state) => state.ui.toolbarLabels);
  const setToolbarLabels = usePreferencesStore(
    (state) => state.setToolbarLabels
  );
  const dateFormat = usePreferencesStore((state) => state.ui.dateFormat);
  const setDateFormat = usePreferencesStore((state) => state.setDateFormat);
  const selectedLocaleOption = getLocaleOption(locale) ?? LOCALE_OPTIONS[0];
  const effectiveLocale =
    selectedLocaleOption.code === SYSTEM_LOCALE_CODE ||
    selectedLocaleOption.code.trim().length === 0
      ? undefined
      : selectedLocaleOption.code;
  const formatDatePreview = (formatPreset: "compact" | "verbose"): string => {
    const formatOptions: Intl.DateTimeFormatOptions = {
      dateStyle: formatPreset === "verbose" ? "full" : "medium",
      timeStyle: formatPreset === "verbose" ? "medium" : "short",
    };

    return new Intl.DateTimeFormat(effectiveLocale, formatOptions).format(
      PREVIEW_SAMPLE_DATE
    );
  };
  const selectedDatePreview = formatDatePreview(dateFormat);

  return (
    <div className="grid gap-4">
      <SettingsField
        description="Switch between system, light, and dark appearance. Applied immediately."
        label="Theme"
        query={query}
      >
        <ThemeSelector
          onValueChange={setThemePreference}
          value={theme as ThemePreference}
        />
      </SettingsField>
      <SettingsField
        description="Change where toast notifications appear in the desktop shell."
        label="Notification location"
        query={query}
      >
        <SectionActionRow>
          <Select
            items={TOASTER_OPTIONS}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setToasterPosition(
                  value as
                    | "top-right"
                    | "top-center"
                    | "top-left"
                    | "bottom-right"
                    | "bottom-center"
                    | "bottom-left"
                );
              }
            }}
            value={toasterPosition}
          >
            <SelectTrigger className="w-fit">
              <DefaultSelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="top-right">Top right</SelectItem>
              <SelectItem value="top-center">Top center</SelectItem>
              <SelectItem value="top-left">Top left</SelectItem>
              <SelectItem value="bottom-right">Bottom right</SelectItem>
              <SelectItem value="bottom-center">Bottom center</SelectItem>
              <SelectItem value="bottom-left">Bottom left</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              toast("Notification position preview", {
                description:
                  "This toast appears at the currently selected location.",
                id: NOTIFICATION_PREVIEW_TOAST_ID,
              });
            }}
            type="button"
            variant="outline"
          >
            Test notification
          </Button>
        </SectionActionRow>
      </SettingsField>
      <SettingsField
        description="Choose the locale used for date rendering with a curated searchable list. System locale follows your OS settings."
        label="Date/time locale"
        query={query}
      >
        <div className="grid gap-2">
          <Combobox
            autoHighlight
            items={LOCALE_OPTIONS}
            itemToStringLabel={(option: LocaleOption) =>
              `${option.displayName} ${option.code}`
            }
            onValueChange={(nextValue: LocaleOption | null) => {
              setLocale(nextValue?.code ?? SYSTEM_LOCALE_CODE);
            }}
            value={selectedLocaleOption}
          >
            <ComboboxInput
              className="w-full"
              placeholder="Search locale"
              showClear
            />
            <ComboboxContent>
              <ComboboxEmpty>No matching locale found.</ComboboxEmpty>
              <ComboboxList className="[scrollbar-color:color-mix(in_oklab,var(--color-muted-foreground)_55%,transparent)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/45 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2">
                {(option: LocaleOption) => (
                  <ComboboxItem key={option.code} value={option}>
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-6">
                      <div className="min-w-0">
                        <div className="truncate text-sm">
                          {option.displayName}
                        </div>
                        <div className="truncate text-muted-foreground text-xs">
                          {option.code === SYSTEM_LOCALE_CODE
                            ? "Use your operating system locale"
                            : option.code}
                        </div>
                      </div>
                    </div>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <SettingsHelpText>
            {selectedLocaleOption.code === SYSTEM_LOCALE_CODE
              ? "Repository timestamps follow your system locale until you pick a specific locale."
              : `Repository timestamps now use ${selectedLocaleOption.displayName}.`}
          </SettingsHelpText>
          <SettingsHelpText>Preview: {selectedDatePreview}</SettingsHelpText>
        </div>
      </SettingsField>
      <SettingsField
        description="Controls whether repository dates use a compact or verbose format."
        label="Date format"
        query={query}
      >
        <div className="grid gap-2">
          <Select
            items={DATE_FORMAT_OPTIONS}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setDateFormat(value as "compact" | "verbose");
              }
            }}
            value={dateFormat}
          >
            <SelectTrigger>
              <DefaultSelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compact">Compact</SelectItem>
              <SelectItem value="verbose">Verbose</SelectItem>
            </SelectContent>
          </Select>
          <SettingsHelpText>Preview: {selectedDatePreview}</SettingsHelpText>
        </div>
      </SettingsField>
      <SettingsField
        description="Show or hide text labels alongside shell toolbar actions."
        label="Show toolbar labels"
        query={query}
      >
        <div className="grid gap-2">
          <label className="inline-flex items-center gap-3">
            <Checkbox
              checked={toolbarLabels}
              onCheckedChange={(checked) => setToolbarLabels(Boolean(checked))}
            />
            <span className="text-sm">Display action labels in the header</span>
          </label>
          <div className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-muted/20 p-2">
            <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border border-border/70 bg-background px-2 py-1 text-xs">
              <GitBranchIcon className="size-3.5" />
              {toolbarLabels ? <span>Branches</span> : null}
            </span>
            <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border border-border/70 bg-background px-2 py-1 text-xs">
              <TerminalWindowIcon className="size-3.5" />
              {toolbarLabels ? <span>Terminal</span> : null}
            </span>
            <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border border-border/70 bg-background px-2 py-1 text-xs">
              <ShieldCheckIcon className="size-3.5" />
              {toolbarLabels ? <span>Security</span> : null}
            </span>
          </div>
          <SettingsHelpText>
            Preview updates instantly based on your toolbar label preference.
          </SettingsHelpText>
        </div>
      </SettingsField>
    </div>
  );
}

function TerminalSection({ query }: { query: string }) {
  const cursorStyle = usePreferencesStore(
    (state) => state.terminal.cursorStyle
  );
  const fontFamily = usePreferencesStore((state) => state.terminal.fontFamily);
  const fontSize = usePreferencesStore((state) => state.terminal.fontSize);
  const fontVisibility = usePreferencesStore(
    (state) => state.terminal.fontVisibility
  );
  const lineHeight = usePreferencesStore((state) => state.terminal.lineHeight);
  const setCursorStyle = usePreferencesStore(
    (state) => state.setTerminalCursorStyle
  );
  const setFontFamily = usePreferencesStore(
    (state) => state.setTerminalFontFamily
  );
  const setFontSize = usePreferencesStore((state) => state.setTerminalFontSize);
  const setFontVisibility = usePreferencesStore(
    (state) => state.setTerminalFontVisibility
  );
  const setLineHeight = usePreferencesStore(
    (state) => state.setTerminalLineHeight
  );
  const [systemTerminalFonts, setSystemTerminalFonts] = useState<
    readonly FontPickerOption[]
  >([]);
  const [terminalFontStatus, setTerminalFontStatus] =
    useState<SystemFontReadResult["status"]>("available");
  const [isLoadingTerminalFonts, setIsLoadingTerminalFonts] = useState(false);
  const [hasLoadedTerminalFonts, setHasLoadedTerminalFonts] = useState(false);
  const [terminalFontQuery, setTerminalFontQuery] = useState("");
  const deferredTerminalFontQuery = useDeferredValue(terminalFontQuery);
  const [terminalFontSizeInput, setTerminalFontSizeInput] = useState(() =>
    String(fontSize)
  );
  const [previewSidebarWidth, setPreviewSidebarWidth] = useState(
    getInitialTerminalPreviewSidebarWidth
  );
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const previewResizeStateRef = useRef<SidebarResizeState | null>(null);
  const previewResizeAnimationFrameRef = useRef<number | null>(null);
  const pendingPreviewSidebarWidthRef = useRef<number | null>(null);
  const previewBodyStyleSnapshotRef = useRef<{
    cursor: string;
    userSelect: string;
  } | null>(null);
  const terminalFonts = useMemo(
    () =>
      Array.from(
        new Map(
          [...systemTerminalFonts, ...BUNDLED_FONT_OPTIONS].map((font) => [
            font.family,
            font,
          ])
        ).values()
      ),
    [systemTerminalFonts]
  );
  const visibleTerminalFonts = useMemo(() => {
    const filteredFonts = getVisibleFonts(terminalFonts, fontVisibility);
    const normalizedQuery = deferredTerminalFontQuery.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return filteredFonts;
    }

    return filteredFonts.filter((font) =>
      font.family.toLowerCase().includes(normalizedQuery)
    );
  }, [deferredTerminalFontQuery, fontVisibility, terminalFonts]);

  useEffect(() => {
    if (!terminalFonts.some((font) => font.family === fontFamily)) {
      setFontFamily(DEFAULT_TERMINAL_FONT_FAMILY);
    }
  }, [fontFamily, setFontFamily, terminalFonts]);

  useEffect(() => {
    setTerminalFontSizeInput(String(fontSize));
  }, [fontSize]);

  const loadTerminalFonts = useCallback(() => {
    if (hasLoadedTerminalFonts || isLoadingTerminalFonts) {
      return;
    }

    setIsLoadingTerminalFonts(true);
    readSystemFontFamilies()
      .then((result) => {
        setSystemTerminalFonts(result.options);
        setTerminalFontStatus(result.status);
        setHasLoadedTerminalFonts(true);
      })
      .catch(() => undefined)
      .finally(() => {
        setIsLoadingTerminalFonts(false);
      });
  }, [hasLoadedTerminalFonts, isLoadingTerminalFonts]);

  useEffect(() => {
    if (hasLoadedTerminalFonts || isLoadingTerminalFonts) {
      return;
    }

    return runWhenBrowserIsIdle(() => {
      loadTerminalFonts();
    });
  }, [hasLoadedTerminalFonts, isLoadingTerminalFonts, loadTerminalFonts]);

  const getAvailableTerminalWidth = useCallback(() => {
    return previewContainerRef.current?.clientWidth ?? getSettingsLayoutWidth();
  }, []);

  const schedulePreviewSidebarWidthUpdate = useCallback((nextWidth: number) => {
    pendingPreviewSidebarWidthRef.current = nextWidth;

    if (previewResizeAnimationFrameRef.current !== null) {
      return;
    }

    previewResizeAnimationFrameRef.current = window.requestAnimationFrame(
      () => {
        const width = pendingPreviewSidebarWidthRef.current;

        previewResizeAnimationFrameRef.current = null;
        pendingPreviewSidebarWidthRef.current = null;

        if (typeof width === "number") {
          setPreviewSidebarWidth(width);
        }
      }
    );
  }, []);

  const resetPreviewResizeState = useCallback(() => {
    previewResizeStateRef.current = null;

    if (previewResizeAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(previewResizeAnimationFrameRef.current);
      previewResizeAnimationFrameRef.current = null;
    }

    pendingPreviewSidebarWidthRef.current = null;

    if (previewBodyStyleSnapshotRef.current) {
      document.body.style.userSelect =
        previewBodyStyleSnapshotRef.current.userSelect;
      document.body.style.cursor = previewBodyStyleSnapshotRef.current.cursor;
      previewBodyStyleSnapshotRef.current = null;
    }
  }, []);

  const startPreviewResize = (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const { maxWidth, minWidth } = getEditorPreviewResizeBounds(
      getAvailableTerminalWidth()
    );

    if (maxWidth <= 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    previewBodyStyleSnapshotRef.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };

    previewResizeStateRef.current = {
      pointerId: event.pointerId,
      startWidth: previewSidebarWidth,
      startX: event.clientX,
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    schedulePreviewSidebarWidthUpdate(
      clampWidth(previewSidebarWidth, minWidth, maxWidth)
    );
  };

  const adjustPreviewSidebarWidth = (delta: number) => {
    const { maxWidth, minWidth } = getEditorPreviewResizeBounds(
      getAvailableTerminalWidth()
    );

    if (maxWidth <= 0) {
      setPreviewSidebarWidth(0);
      return;
    }

    setPreviewSidebarWidth((currentWidth) =>
      clampWidth(currentWidth + delta, minWidth, maxWidth)
    );
  };

  const handlePreviewResizeHandleKeyDown = (
    event: React.KeyboardEvent<HTMLElement>
  ) => {
    const resizeStep = event.shiftKey ? 40 : 16;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      adjustPreviewSidebarWidth(resizeStep);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      adjustPreviewSidebarWidth(-resizeStep);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      const { minWidth } = getEditorPreviewResizeBounds(
        getAvailableTerminalWidth()
      );
      setPreviewSidebarWidth(minWidth);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      const { maxWidth } = getEditorPreviewResizeBounds(
        getAvailableTerminalWidth()
      );
      setPreviewSidebarWidth(maxWidth);
    }
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = previewResizeStateRef.current;

      if (!resizeState || event.pointerId !== resizeState.pointerId) {
        return;
      }

      const delta = event.clientX - resizeState.startX;
      const { maxWidth, minWidth } = getEditorPreviewResizeBounds(
        getAvailableTerminalWidth()
      );

      if (maxWidth <= 0) {
        schedulePreviewSidebarWidthUpdate(0);
        return;
      }

      schedulePreviewSidebarWidthUpdate(
        clampWidth(resizeState.startWidth - delta, minWidth, maxWidth)
      );
    };

    const handlePointerUp = () => {
      if (!previewResizeStateRef.current) {
        return;
      }

      resetPreviewResizeState();
    };

    const handleWindowBlur = () => {
      if (!previewResizeStateRef.current) {
        return;
      }

      resetPreviewResizeState();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handleWindowBlur);
      resetPreviewResizeState();
    };
  }, [
    getAvailableTerminalWidth,
    resetPreviewResizeState,
    schedulePreviewSidebarWidthUpdate,
  ]);

  useEffect(() => {
    const clampPreviewWidthToViewport = () => {
      const { maxWidth, minWidth } = getEditorPreviewResizeBounds(
        getAvailableTerminalWidth()
      );

      setPreviewSidebarWidth((currentWidth) => {
        if (maxWidth <= 0) {
          return 0;
        }

        return clampWidth(currentWidth, minWidth, maxWidth);
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      clampPreviewWidthToViewport();
    });

    if (previewContainerRef.current) {
      resizeObserver.observe(previewContainerRef.current);
    }

    clampPreviewWidthToViewport();
    window.addEventListener("resize", clampPreviewWidthToViewport);

    return () => {
      window.removeEventListener("resize", clampPreviewWidthToViewport);
      resizeObserver.disconnect();
    };
  }, [getAvailableTerminalWidth]);

  useEffect(() => {
    window.localStorage.setItem(
      SETTINGS_TERMINAL_PREVIEW_WIDTH_STORAGE_KEY,
      String(Math.round(previewSidebarWidth))
    );
  }, [previewSidebarWidth]);

  let terminalFontHelperText =
    "Loading installed system fonts in the background. Bundled fallbacks are available immediately.";

  if (hasLoadedTerminalFonts && terminalFontStatus === "unavailable") {
    terminalFontHelperText =
      "System font enumeration is unavailable here, so the picker is showing bundled fallbacks only.";
  } else if (hasLoadedTerminalFonts) {
    terminalFontHelperText =
      "Installed system fonts are shown first, with bundled fallbacks available when needed.";
  }

  return (
    <div
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch"
      ref={previewContainerRef}
    >
      <div className="grid gap-4">
        <FontPickerField
          description="Search installed terminal fonts and bundled fallbacks, then optionally filter to monospace only."
          emptyMessage={
            terminalFontStatus === "unavailable"
              ? "No installed fonts could be read on this platform. Bundled fallbacks are still available."
              : "No matching terminal fonts found."
          }
          helperText={terminalFontHelperText}
          isLoadingOptions={isLoadingTerminalFonts}
          label="Terminal font"
          monospaceOnly={fontVisibility === "monospace-only"}
          onMonospaceOnlyChange={(checked) => {
            setFontVisibility(checked ? "monospace-only" : "all-fonts");
          }}
          onPickerInteract={loadTerminalFonts}
          onSearchChange={setTerminalFontQuery}
          onValueChange={setFontFamily}
          options={visibleTerminalFonts}
          query={query}
          searchPlaceholder="Search terminal fonts"
          selectedFont={fontFamily}
          showLoadingSkeleton={
            isLoadingTerminalFonts && !hasLoadedTerminalFonts
          }
        />
        <SettingsField
          description="Applied immediately to the mounted xterm instance."
          label="Font size"
          query={query}
        >
          <Input
            max={32}
            min={8}
            onBlur={() => {
              if (terminalFontSizeInput.trim().length === 0) {
                setTerminalFontSizeInput(String(fontSize));
                return;
              }

              const parsedValue = Number(terminalFontSizeInput);

              if (!Number.isFinite(parsedValue)) {
                setTerminalFontSizeInput(String(fontSize));
                return;
              }

              const clampedValue = clampTerminalFontSize(parsedValue);
              setFontSize(clampedValue);
              setTerminalFontSizeInput(String(clampedValue));
            }}
            onChange={(event) => {
              const nextValue = event.target.value;
              setTerminalFontSizeInput(nextValue);

              if (nextValue.trim().length === 0) {
                return;
              }

              const parsedValue = Number(nextValue);

              if (!Number.isFinite(parsedValue)) {
                return;
              }

              if (parsedValue < 8 || parsedValue > 32) {
                return;
              }

              setFontSize(parsedValue);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            step={1}
            type="number"
            value={terminalFontSizeInput}
          />
        </SettingsField>
        <SettingsField
          description="Tune line spacing for the integrated terminal."
          label="Line height"
          query={query}
        >
          <Input
            min={1}
            onChange={(event) =>
              setLineHeight(Math.max(1, Number(event.target.value) || 1))
            }
            step="0.1"
            type="number"
            value={lineHeight}
          />
        </SettingsField>
        <SettingsField
          description="Choose the cursor style used by xterm."
          label="Cursor style"
          query={query}
        >
          <Select
            items={CURSOR_STYLE_OPTIONS}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setCursorStyle(value as "block" | "underline" | "bar");
              }
            }}
            value={cursorStyle}
          >
            <SelectTrigger>
              <DefaultSelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="block">Block</SelectItem>
              <SelectItem value="underline">Underline</SelectItem>
              <SelectItem value="bar">Bar</SelectItem>
            </SelectContent>
          </Select>
        </SettingsField>
      </div>
      <div className="hidden xl:flex xl:items-stretch xl:self-stretch">
        <button
          aria-controls="terminal-preview-sidebar"
          aria-label="Resize terminal preview sidebar"
          className="h-full w-1.5 shrink-0 cursor-col-resize bg-transparent outline-none transition-colors hover:bg-accent/30 focus-visible:bg-accent/30 focus-visible:ring-2 focus-visible:ring-primary/50"
          onKeyDown={handlePreviewResizeHandleKeyDown}
          onPointerDown={startPreviewResize}
          type="button"
        />
        <div
          className="min-w-0 self-stretch"
          id="terminal-preview-sidebar"
          style={{
            width: previewSidebarWidth > 0 ? `${previewSidebarWidth}px` : "0px",
          }}
        >
          <div className="h-full">
            <div className="h-full min-h-88">
              <TerminalPreview
                cursorStyle={cursorStyle}
                fontFamily={fontFamily}
                fontSize={fontSize}
                lineHeight={lineHeight}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="xl:hidden">
        <SettingsField
          description="Live in-app terminal instance using your selected terminal typography settings."
          label="In-App Terminal preview"
          query={query}
        >
          <div className="h-88">
            <TerminalPreview
              cursorStyle={cursorStyle}
              fontFamily={fontFamily}
              fontSize={fontSize}
              lineHeight={lineHeight}
            />
          </div>
        </SettingsField>
      </div>
    </div>
  );
}

function NetworkSection({ query }: { query: string }) {
  const enableProxy = usePreferencesStore((state) => state.network.enableProxy);
  const proxyAuthEnabled = usePreferencesStore(
    (state) => state.network.proxyAuthEnabled
  );
  const proxyAuthSecretStored = usePreferencesStore(
    (state) => state.network.proxyAuthSecretStored
  );
  const proxyAuthSecretStorageMode = usePreferencesStore(
    (state) => state.network.proxyAuthSecretStorageMode
  );
  const proxyHost = usePreferencesStore((state) => state.network.proxyHost);
  const proxyPort = usePreferencesStore((state) => state.network.proxyPort);
  const proxyType = usePreferencesStore((state) => state.network.proxyType);
  const proxyUsername = usePreferencesStore(
    (state) => state.network.proxyUsername
  );
  const setNetworkProxy = usePreferencesStore((state) => state.setNetworkProxy);
  const setNetworkProxyAuthSecretStatus = usePreferencesStore(
    (state) => state.setNetworkProxyAuthSecretStatus
  );
  const sslVerification = usePreferencesStore(
    (state) => state.network.sslVerification
  );
  const useGitCredentialManager = usePreferencesStore(
    (state) => state.network.useGitCredentialManager
  );
  const [credentialEntries, setCredentialEntries] = useState<
    Array<{
      host: string;
      id: string;
      port: number | null;
      protocol: string;
      username: string;
    }>
  >([]);
  const [proxyTestMessage, setProxyTestMessage] = useState<string | null>(null);
  const [proxyPasswordInput, setProxyPasswordInput] = useState("");
  const [proxyAuthMessage, setProxyAuthMessage] = useState<string | null>(null);
  const [proxyTargetDraft, setProxyTargetDraft] = useState(() => ({
    host: proxyHost,
    port: String(proxyPort),
    type: proxyType,
  }));

  const normalizedProxyDraftHost = proxyTargetDraft.host.trim();
  const normalizedProxyDraftPort = proxyTargetDraft.port.trim();
  const parsedProxyDraftPort = Number(normalizedProxyDraftPort);
  const hasValidProxyDraftPort =
    normalizedProxyDraftPort.length > 0 &&
    Number.isInteger(parsedProxyDraftPort) &&
    parsedProxyDraftPort > 0;
  const canSaveProxyTarget =
    normalizedProxyDraftHost.length > 0 && hasValidProxyDraftPort;
  const canTestProxyTarget = canSaveProxyTarget;
  const hasSavedProxyTarget = proxyHost.trim().length > 0;
  const hasUnsavedProxyTargetChanges =
    proxyTargetDraft.host !== proxyHost ||
    proxyTargetDraft.port !== String(proxyPort) ||
    proxyTargetDraft.type !== proxyType;

  const handleSaveProxyTarget = () => {
    if (!canSaveProxyTarget) {
      setProxyTestMessage(
        "Enter a proxy host and a valid positive port before saving."
      );
      return;
    }

    setNetworkProxy({
      proxyHost: normalizedProxyDraftHost,
      proxyPort: parsedProxyDraftPort,
      proxyType: proxyTargetDraft.type,
    });
    setProxyTestMessage("Proxy target saved.");
  };

  const resetProxySettings = () => {
    const currentUsername = proxyUsername.trim();

    const finishReset = () => {
      setNetworkProxy({
        enableProxy: DEFAULT_PREFERENCES.network.enableProxy,
        proxyAuthEnabled: DEFAULT_PREFERENCES.network.proxyAuthEnabled,
        proxyHost: DEFAULT_PREFERENCES.network.proxyHost,
        proxyPort: DEFAULT_PREFERENCES.network.proxyPort,
        proxyType: DEFAULT_PREFERENCES.network.proxyType,
        proxyUsername: DEFAULT_PREFERENCES.network.proxyUsername,
        sslVerification: DEFAULT_PREFERENCES.network.sslVerification,
        useGitCredentialManager:
          DEFAULT_PREFERENCES.network.useGitCredentialManager,
      });
      setNetworkProxyAuthSecretStatus({
        hasStoredValue: false,
        storageMode: null,
      });
      setProxyTargetDraft({
        host: DEFAULT_PREFERENCES.network.proxyHost,
        port: String(DEFAULT_PREFERENCES.network.proxyPort),
        type: DEFAULT_PREFERENCES.network.proxyType,
      });
      setProxyAuthMessage("Proxy settings reset to defaults.");
      setProxyPasswordInput("");
      setProxyTestMessage(null);
    };

    if (currentUsername.length === 0) {
      finishReset();
      return;
    }

    clearProxyAuthSecret(currentUsername)
      .then(finishReset)
      .catch(() => {
        finishReset();
      });
  };

  useEffect(() => {
    listStoredHttpCredentialEntries()
      .then(setCredentialEntries)
      .catch(() => {
        setCredentialEntries([]);
      });
  }, []);

  useEffect(() => {
    if (!(proxyAuthEnabled && proxyUsername.trim().length > 0)) {
      setNetworkProxyAuthSecretStatus({
        hasStoredValue: false,
        storageMode: null,
      });
      return;
    }

    getProxyAuthSecretStatus(proxyUsername)
      .then((status) => {
        setNetworkProxyAuthSecretStatus({
          hasStoredValue: status.hasStoredValue,
          storageMode: status.storageMode,
        });
      })
      .catch(() => {
        setNetworkProxyAuthSecretStatus({
          hasStoredValue: false,
          storageMode: null,
        });
      });
  }, [proxyAuthEnabled, proxyUsername, setNetworkProxyAuthSecretStatus]);

  useEffect(() => {
    setProxyTargetDraft({
      host: proxyHost,
      port: String(proxyPort),
      type: proxyType,
    });
  }, [proxyHost, proxyPort, proxyType]);

  return (
    <div className="grid gap-4">
      <SettingsField
        description="Delegate HTTP credential storage to Git Credential Manager when available."
        label="Use Git Credential Manager"
        query={query}
      >
        <label className="inline-flex items-center gap-3">
          <Switch
            checked={useGitCredentialManager}
            onCheckedChange={(checked) => {
              setNetworkProxy({ useGitCredentialManager: Boolean(checked) });
            }}
          />
          <span className="text-sm">Use system credential helper</span>
        </label>
      </SettingsField>
      <SettingsField
        description="Enable proxy-aware Git network operations when backend support is available."
        label="Use proxy"
        query={query}
      >
        <label className="inline-flex items-center gap-3">
          <Switch
            checked={enableProxy}
            onCheckedChange={(checked) => {
              setNetworkProxy({ enableProxy: Boolean(checked) });
            }}
          />
          <span className="text-sm">
            {enableProxy ? "Proxy enabled" : "Proxy disabled"}
          </span>
        </label>
      </SettingsField>
      <SettingsField
        description="Reject invalid SSL certificates by default for supported remote operations."
        label="Verify SSL certificates"
        query={query}
      >
        <label className="inline-flex items-center gap-3">
          <Checkbox
            checked={sslVerification}
            onCheckedChange={(checked) => {
              setNetworkProxy({ sslVerification: Boolean(checked) });
            }}
          />
          <span className="text-sm">Keep SSL verification enabled</span>
        </label>
      </SettingsField>
      <SettingsField
        description="Host, port, and proxy type feed the backend proxy-test command for desktop validation."
        label="Proxy target"
        query={query}
      >
        <div className="grid gap-4 rounded-xl border border-border/60 bg-muted/18 p-4 md:gap-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(7rem,0.75fr)_minmax(8rem,0.8fr)]">
            <div className="grid gap-2">
              <Label htmlFor="proxy-target-host">Proxy host</Label>
              <Input
                id="proxy-target-host"
                onChange={(event) => {
                  setProxyTargetDraft((current) => ({
                    ...current,
                    host: event.target.value,
                  }));
                  setProxyTestMessage(null);
                }}
                placeholder="proxy.local"
                value={proxyTargetDraft.host}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-target-port">Port</Label>
              <Input
                id="proxy-target-port"
                min={1}
                onChange={(event) => {
                  setProxyTargetDraft((current) => ({
                    ...current,
                    port: event.target.value,
                  }));
                  setProxyTestMessage(null);
                }}
                placeholder="80"
                type="number"
                value={proxyTargetDraft.port}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proxy-target-type">Type</Label>
              <Select
                items={PROXY_TYPE_OPTIONS}
                onValueChange={(value) => {
                  if (typeof value === "string") {
                    setProxyTargetDraft((current) => ({
                      ...current,
                      type: value as "http" | "https" | "socks5",
                    }));
                    setProxyTestMessage(null);
                  }
                }}
                value={proxyTargetDraft.type}
              >
                <SelectTrigger id="proxy-target-type">
                  <DefaultSelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="https">HTTPS</SelectItem>
                  <SelectItem value="socks5">SOCKS5</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              disabled={!(canSaveProxyTarget && hasUnsavedProxyTargetChanges)}
              onClick={handleSaveProxyTarget}
              type="button"
            >
              Save proxy target
            </Button>
            <Button
              disabled={!canTestProxyTarget}
              onClick={() => {
                if (!canTestProxyTarget) {
                  setProxyTestMessage(
                    "Enter a proxy host and a valid positive port before testing."
                  );
                  return;
                }

                runProxyConnectionTest({
                  host: normalizedProxyDraftHost,
                  port: parsedProxyDraftPort,
                  proxyType: proxyTargetDraft.type,
                  username:
                    proxyAuthEnabled && proxyUsername.trim().length > 0
                      ? proxyUsername
                      : undefined,
                  password:
                    proxyAuthEnabled && proxyPasswordInput.trim().length > 0
                      ? proxyPasswordInput
                      : undefined,
                })
                  .then((result) => {
                    setProxyTestMessage(result.message);
                  })
                  .catch((error: unknown) => {
                    setProxyTestMessage(
                      error instanceof Error
                        ? error.message
                        : "Proxy test failed"
                    );
                  });
              }}
              type="button"
              variant="outline"
            >
              Test proxy connection
            </Button>
            {hasSavedProxyTarget ? (
              <Button
                onClick={resetProxySettings}
                type="button"
                variant="ghost"
              >
                Reset proxy settings
              </Button>
            ) : null}
          </div>
          {proxyTestMessage ? (
            <SettingsHelpText>{proxyTestMessage}</SettingsHelpText>
          ) : null}
          {!canSaveProxyTarget &&
          (normalizedProxyDraftHost.length > 0 ||
            normalizedProxyDraftPort.length > 0) ? (
            <SettingsHelpText tone="warning">
              Enter both a proxy host and a valid positive port before saving or
              testing.
            </SettingsHelpText>
          ) : null}
          <SettingsHelpText>
            Leave host empty to disable proxy routing even if the toggle stays
            on.
          </SettingsHelpText>
        </div>
      </SettingsField>
      <SettingsField
        description="Reveal proxy username and password only when your proxy requires authentication. Passwords stay in backend secure storage or session fallback."
        label="Proxy authentication"
        query={query}
      >
        <div className="grid gap-3">
          <label className="inline-flex items-center gap-3">
            <Checkbox
              checked={proxyAuthEnabled}
              onCheckedChange={(checked) => {
                const nextValue = Boolean(checked);
                setNetworkProxy({ proxyAuthEnabled: nextValue });
                setProxyAuthMessage(null);

                if (!nextValue && proxyUsername.trim().length > 0) {
                  clearProxyAuthSecret(proxyUsername)
                    .then(() => {
                      setNetworkProxyAuthSecretStatus({
                        hasStoredValue: false,
                        storageMode: null,
                      });
                      setProxyPasswordInput("");
                    })
                    .catch(() => undefined);
                }
              }}
            />
            <span className="text-sm">
              {proxyAuthEnabled
                ? "Proxy authentication enabled"
                : "Proxy authentication disabled"}
            </span>
          </label>
          {proxyAuthEnabled ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  onChange={(event) => {
                    setNetworkProxy({ proxyUsername: event.target.value });
                    setProxyAuthMessage(null);
                  }}
                  placeholder="proxy-user"
                  value={proxyUsername}
                />
                <Input
                  onChange={(event) => {
                    setProxyPasswordInput(event.target.value);
                    setProxyAuthMessage(null);
                  }}
                  placeholder="Enter proxy password"
                  type="password"
                  value={proxyPasswordInput}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  disabled={
                    proxyUsername.trim().length === 0 ||
                    proxyPasswordInput.trim().length === 0
                  }
                  onClick={() => {
                    saveProxyAuthSecret(proxyUsername, proxyPasswordInput)
                      .then((status) => {
                        setNetworkProxyAuthSecretStatus({
                          hasStoredValue: status.hasStoredValue,
                          storageMode: status.storageMode,
                        });
                        setProxyPasswordInput("");
                        setProxyAuthMessage(
                          `Proxy password saved (${status.storageMode}).`
                        );
                      })
                      .catch((error: unknown) => {
                        setProxyAuthMessage(
                          error instanceof Error
                            ? error.message
                            : "Failed to save proxy password"
                        );
                      });
                  }}
                  type="button"
                  variant="outline"
                >
                  Save password
                </Button>
                <Button
                  disabled={proxyUsername.trim().length === 0}
                  onClick={() => {
                    clearProxyAuthSecret(proxyUsername)
                      .then(() => {
                        setNetworkProxyAuthSecretStatus({
                          hasStoredValue: false,
                          storageMode: null,
                        });
                        setProxyPasswordInput("");
                        setProxyAuthMessage("Cleared stored proxy password.");
                      })
                      .catch((error: unknown) => {
                        setProxyAuthMessage(
                          error instanceof Error
                            ? error.message
                            : "Failed to clear proxy password"
                        );
                      });
                  }}
                  type="button"
                  variant="ghost"
                >
                  Clear password
                </Button>
                <span className="text-muted-foreground text-sm">
                  {proxyAuthSecretStored
                    ? `Stored (${proxyAuthSecretStorageMode ?? "session"})`
                    : "No proxy password saved"}
                </span>
              </div>
              {proxyAuthMessage ? (
                <SettingsHelpText>{proxyAuthMessage}</SettingsHelpText>
              ) : null}
            </>
          ) : null}
        </div>
      </SettingsField>
      <SettingsField
        description="Credential entries are listed through backend metadata only; secret values never return to the renderer."
        label="Stored HTTP credential entries"
        query={query}
      >
        <div className="grid gap-2">
          {credentialEntries.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              No stored HTTP credentials yet.
            </div>
          ) : (
            credentialEntries.map((entry) => (
              <div
                className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2"
                key={entry.id}
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm">
                    {entry.protocol}://{entry.host}
                    {entry.port ? `:${entry.port}` : ""}
                  </div>
                  <div className="truncate text-muted-foreground text-xs">
                    {entry.username}
                  </div>
                </div>
                <Button
                  onClick={() => {
                    clearStoredHttpCredentialEntry(entry.id)
                      .then(() =>
                        listStoredHttpCredentialEntries().then(
                          setCredentialEntries
                        )
                      )
                      .catch(() => undefined);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Clear
                </Button>
              </div>
            ))
          )}
        </div>
      </SettingsField>
    </div>
  );
}

function SshSection({ query }: { query: string }) {
  const privateKeyPath =
    usePreferencesStore((state) => state.ssh.privateKeyPath) ?? "";
  const publicKeyPath =
    usePreferencesStore((state) => state.ssh.publicKeyPath) ?? "";
  const setSshPaths = usePreferencesStore((state) => state.setSshPaths);
  const useLocalAgent = usePreferencesStore((state) => state.ssh.useLocalAgent);
  const setPreferencesState = usePreferencesStore.setState;
  const [sshStatusMessage, setSshStatusMessage] = useState<string | null>(null);
  const hasMismatchedSshPair = !isMatchingSshKeyPair(
    privateKeyPath,
    publicKeyPath
  );

  return (
    <div className="grid gap-4">
      <SettingsField
        description="Allow supported Git operations to consult the local SSH agent when authenticating remotes."
        label="Use local SSH agent"
        query={query}
      >
        <label className="inline-flex items-center gap-3">
          <Switch
            checked={useLocalAgent}
            onCheckedChange={(checked) => {
              setPreferencesState((state) => ({
                ssh: {
                  ...state.ssh,
                  useLocalAgent: Boolean(checked),
                },
              }));
            }}
          />
          <span className="text-sm">
            {useLocalAgent ? "Prefer local SSH agent" : "Do not use SSH agent"}
          </span>
        </label>
      </SettingsField>
      <SettingsField
        description="Store key paths as preferences while the actual private key contents remain outside the renderer."
        label="SSH key selection"
        query={query}
      >
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="ssh-private-key-path">Private key path</Label>
            <div className="flex gap-2">
              <Input
                id="ssh-private-key-path"
                placeholder="~/.ssh/id_ed25519"
                readOnly
                value={privateKeyPath}
              />
              <Button
                onClick={() => {
                  pickSettingsFile()
                    .then((path) => {
                      if (path) {
                        setSshPaths({ privateKeyPath: path });
                      }
                    })
                    .catch((error: unknown) => {
                      setSshStatusMessage(
                        error instanceof Error
                          ? error.message
                          : "Failed to pick file"
                      );
                    });
                }}
                type="button"
                variant="outline"
              >
                Browse
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ssh-public-key-path">Public key path</Label>
            <div className="flex gap-2">
              <Input
                id="ssh-public-key-path"
                placeholder="~/.ssh/id_ed25519.pub"
                readOnly
                value={publicKeyPath}
              />
              <Button
                onClick={() => {
                  pickSettingsFile()
                    .then((path) => {
                      if (path) {
                        setSshPaths({ publicKeyPath: path });
                      }
                    })
                    .catch((error: unknown) => {
                      setSshStatusMessage(
                        error instanceof Error
                          ? error.message
                          : "Failed to pick file"
                      );
                    });
                }}
                type="button"
                variant="outline"
              >
                Browse
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                generateSshKeypair("litgit_ed25519")
                  .then((result) => {
                    setSshPaths({
                      privateKeyPath: result.path,
                      publicKeyPath: `${result.path}.pub`,
                    });
                    setSshStatusMessage("Generated a new SSH keypair.");
                  })
                  .catch((error: unknown) => {
                    setSshStatusMessage(
                      error instanceof Error
                        ? error.message
                        : "Failed to generate SSH keypair"
                    );
                  });
              }}
              type="button"
              variant="outline"
            >
              Generate new keypair
            </Button>
            {sshStatusMessage ? (
              <span className="text-muted-foreground text-sm">
                {sshStatusMessage}
              </span>
            ) : null}
          </div>
          {hasMismatchedSshPair ? (
            <SettingsHelpText tone="warning">
              The public key must match the selected private key path and should
              normally be `{(privateKeyPath || "<private-key-path>").trim()}
              .pub`.
            </SettingsHelpText>
          ) : null}
        </div>
      </SettingsField>
    </div>
  );
}

function SigningSection({ query }: { query: string }) {
  const gpgProgramPath = usePreferencesStore(
    (state) => state.signing.gpgProgramPath
  );
  const signingFormat = usePreferencesStore(
    (state) => state.signing.signingFormat
  );
  const signingKey =
    usePreferencesStore((state) => state.signing.signingKey) ?? "";
  const signCommitsByDefault = usePreferencesStore(
    (state) => state.signing.signCommitsByDefault
  );
  const setSigningPreferences = usePreferencesStore(
    (state) => state.setSigningPreferences
  );
  const [availableSigningKeys, setAvailableSigningKeys] = useState<
    Array<{ id: string; label: string; type: "gpg" | "ssh" }>
  >([]);
  const [signingStatusMessage, setSigningStatusMessage] = useState<
    string | null
  >(null);

  const filteredSigningKeys = useMemo(
    () =>
      availableSigningKeys.filter((entry) =>
        signingFormat === "gpg" ? entry.type === "gpg" : entry.type === "ssh"
      ),
    [availableSigningKeys, signingFormat]
  );

  useEffect(() => {
    listSigningKeys()
      .then((keys) => {
        setAvailableSigningKeys(keys);
      })
      .catch((error: unknown) => {
        setSigningStatusMessage(
          error instanceof Error ? error.message : "Failed to load signing keys"
        );
      });
  }, []);

  useEffect(() => {
    if (
      signingKey.length > 0 &&
      !filteredSigningKeys.some((entry) => entry.id === signingKey)
    ) {
      setSigningPreferences({ signingKey: "" });
    }
  }, [filteredSigningKeys, setSigningPreferences, signingKey]);

  return (
    <div className="grid gap-4">
      <SettingsField
        description="Apply Git commit signing automatically on supported commit flows."
        label="Sign commits by default"
        query={query}
      >
        <label className="inline-flex items-center gap-3">
          <Checkbox
            checked={signCommitsByDefault}
            onCheckedChange={(checked) => {
              setSigningPreferences({
                signCommitsByDefault: Boolean(checked),
              });
            }}
          />
          <span className="text-sm">Use signing defaults for new commits</span>
        </label>
      </SettingsField>
      <SettingsField
        description="Choose whether commit signing should use OPENPGP or SSH-backed keys. Incompatible selected keys are cleared automatically."
        label="Signing format"
        query={query}
      >
        <Select
          items={SIGNING_FORMAT_OPTIONS}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setSigningPreferences({ signingFormat: value as "gpg" | "ssh" });
            }
          }}
          value={signingFormat}
        >
          <SelectTrigger>
            <DefaultSelectValue placeholder="OPENPGP" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gpg">OPENPGP</SelectItem>
            <SelectItem value="ssh">SSH</SelectItem>
          </SelectContent>
        </Select>
      </SettingsField>
      <SettingsField
        description="Optional explicit path to the GPG executable used when GPG signing is selected."
        label="GPG program path"
        query={query}
      >
        <div className="flex gap-2">
          <Input placeholder="/usr/bin/gpg" readOnly value={gpgProgramPath} />
          <Button
            onClick={() => {
              pickSettingsFile()
                .then((path) => {
                  if (path) {
                    setSigningPreferences({ gpgProgramPath: path });
                  }
                })
                .catch((error: unknown) => {
                  setSigningStatusMessage(
                    error instanceof Error
                      ? error.message
                      : "Failed to pick GPG program"
                  );
                });
            }}
            type="button"
            variant="outline"
          >
            Browse
          </Button>
        </div>
      </SettingsField>
      <SettingsField
        description="Available signing keys discovered from local GPG secret keys and SSH public keys."
        label="Signing key"
        query={query}
      >
        <div className="grid gap-3">
          <Select
            items={{
              [NO_SIGNING_KEY_VALUE]: "<None>",
              ...(Object.fromEntries(
                filteredSigningKeys.map((entry) => [
                  entry.id,
                  `${entry.label} (${entry.type.toUpperCase()})`,
                ])
              ) as Record<string, string>),
            }}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setSigningPreferences({
                  signingKey: value === NO_SIGNING_KEY_VALUE ? "" : value,
                });
              }
            }}
            value={signingKey.length > 0 ? signingKey : NO_SIGNING_KEY_VALUE}
          >
            <SelectTrigger>
              <SelectValue className="min-w-24" placeholder="<None>" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SIGNING_KEY_VALUE}>&lt;None&gt;</SelectItem>
              {filteredSigningKeys.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.label} ({entry.type.toUpperCase()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filteredSigningKeys.length === 0 ? (
            <SettingsHelpText>
              No compatible signing keys were discovered for the selected format
              yet.
            </SettingsHelpText>
          ) : null}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                listSigningKeys()
                  .then((keys) => {
                    setAvailableSigningKeys(keys);
                    setSigningStatusMessage("Signing keys refreshed.");
                  })
                  .catch((error: unknown) => {
                    setSigningStatusMessage(
                      error instanceof Error
                        ? error.message
                        : "Failed to refresh signing keys"
                    );
                  });
              }}
              type="button"
              variant="outline"
            >
              Refresh keys
            </Button>
            {signingStatusMessage ? (
              <span className="text-muted-foreground text-sm">
                {signingStatusMessage}
              </span>
            ) : null}
          </div>
        </div>
      </SettingsField>
    </div>
  );
}

function EditorSection({ query }: { query: string }) {
  const editor = usePreferencesStore((state) => state.editor);
  const setEditorPreferences = usePreferencesStore(
    (state) => state.setEditorPreferences
  );
  const [previewSidebarWidth, setPreviewSidebarWidth] = useState(
    getInitialEditorPreviewSidebarWidth
  );
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const previewResizeStateRef = useRef<SidebarResizeState | null>(null);
  const previewResizeAnimationFrameRef = useRef<number | null>(null);
  const pendingPreviewSidebarWidthRef = useRef<number | null>(null);
  const previewBodyStyleSnapshotRef = useRef<{
    cursor: string;
    userSelect: string;
  } | null>(null);
  const [systemEditorFonts, setSystemEditorFonts] = useState<
    readonly FontPickerOption[]
  >([]);
  const [editorFontStatus, setEditorFontStatus] =
    useState<SystemFontReadResult["status"]>("available");
  const [isLoadingEditorFonts, setIsLoadingEditorFonts] = useState(false);
  const [hasLoadedEditorFonts, setHasLoadedEditorFonts] = useState(false);
  const [editorFontQuery, setEditorFontQuery] = useState("");
  const deferredEditorFontQuery = useDeferredValue(editorFontQuery);
  const [editorFontSizeInput, setEditorFontSizeInput] = useState(() =>
    String(editor.fontSize)
  );
  const [editorTabSizeInput, setEditorTabSizeInput] = useState(() =>
    String(editor.tabSize)
  );
  const [editorPreviewMode, setEditorPreviewMode] = useState<
    "diff" | "regular"
  >("regular");
  const editorFonts = useMemo(
    () =>
      Array.from(
        new Map(
          [...systemEditorFonts, ...BUNDLED_FONT_OPTIONS].map((font) => [
            font.family,
            font,
          ])
        ).values()
      ),
    [systemEditorFonts]
  );
  const visibleEditorFonts = useMemo(() => {
    const filteredFonts = getVisibleFonts(editorFonts, editor.fontVisibility);
    const normalizedQuery = deferredEditorFontQuery.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return filteredFonts;
    }

    return filteredFonts.filter((font) =>
      font.family.toLowerCase().includes(normalizedQuery)
    );
  }, [deferredEditorFontQuery, editor.fontVisibility, editorFonts]);

  useEffect(() => {
    if (!editorFonts.some((font) => font.family === editor.fontFamily)) {
      setEditorPreferences({ fontFamily: DEFAULT_EDITOR_FONT_FAMILY });
    }
  }, [editor.fontFamily, editorFonts, setEditorPreferences]);

  useEffect(() => {
    setEditorFontSizeInput(String(editor.fontSize));
  }, [editor.fontSize]);

  useEffect(() => {
    setEditorTabSizeInput(String(editor.tabSize));
  }, [editor.tabSize]);

  const loadEditorFonts = useCallback(() => {
    if (hasLoadedEditorFonts || isLoadingEditorFonts) {
      return;
    }

    setIsLoadingEditorFonts(true);
    readSystemFontFamilies()
      .then((result) => {
        setSystemEditorFonts(result.options);
        setEditorFontStatus(result.status);
        setHasLoadedEditorFonts(true);
      })
      .catch(() => undefined)
      .finally(() => {
        setIsLoadingEditorFonts(false);
      });
  }, [hasLoadedEditorFonts, isLoadingEditorFonts]);

  useEffect(() => {
    if (hasLoadedEditorFonts || isLoadingEditorFonts) {
      return;
    }

    return runWhenBrowserIsIdle(() => {
      loadEditorFonts();
    });
  }, [hasLoadedEditorFonts, isLoadingEditorFonts, loadEditorFonts]);

  const getAvailableEditorWidth = useCallback(() => {
    return previewContainerRef.current?.clientWidth ?? getSettingsLayoutWidth();
  }, []);

  const schedulePreviewSidebarWidthUpdate = useCallback((nextWidth: number) => {
    pendingPreviewSidebarWidthRef.current = nextWidth;

    if (previewResizeAnimationFrameRef.current !== null) {
      return;
    }

    previewResizeAnimationFrameRef.current = window.requestAnimationFrame(
      () => {
        const width = pendingPreviewSidebarWidthRef.current;

        previewResizeAnimationFrameRef.current = null;
        pendingPreviewSidebarWidthRef.current = null;

        if (typeof width === "number") {
          setPreviewSidebarWidth(width);
        }
      }
    );
  }, []);

  const resetPreviewResizeState = useCallback(() => {
    previewResizeStateRef.current = null;

    if (previewResizeAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(previewResizeAnimationFrameRef.current);
      previewResizeAnimationFrameRef.current = null;
    }

    pendingPreviewSidebarWidthRef.current = null;

    if (previewBodyStyleSnapshotRef.current) {
      document.body.style.userSelect =
        previewBodyStyleSnapshotRef.current.userSelect;
      document.body.style.cursor = previewBodyStyleSnapshotRef.current.cursor;
      previewBodyStyleSnapshotRef.current = null;
    }
  }, []);

  const _startPreviewResize = (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const { maxWidth, minWidth } = getEditorPreviewResizeBounds(
      getAvailableEditorWidth()
    );

    if (maxWidth <= 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    previewBodyStyleSnapshotRef.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };

    previewResizeStateRef.current = {
      pointerId: event.pointerId,
      startWidth: previewSidebarWidth,
      startX: event.clientX,
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    schedulePreviewSidebarWidthUpdate(
      clampWidth(previewSidebarWidth, minWidth, maxWidth)
    );
  };

  const adjustPreviewSidebarWidth = (delta: number) => {
    const { maxWidth, minWidth } = getEditorPreviewResizeBounds(
      getAvailableEditorWidth()
    );

    if (maxWidth <= 0) {
      setPreviewSidebarWidth(0);
      return;
    }

    setPreviewSidebarWidth((currentWidth) =>
      clampWidth(currentWidth + delta, minWidth, maxWidth)
    );
  };

  const _handlePreviewResizeHandleKeyDown = (
    event: React.KeyboardEvent<HTMLElement>
  ) => {
    const resizeStep = event.shiftKey ? 40 : 16;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      adjustPreviewSidebarWidth(resizeStep);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      adjustPreviewSidebarWidth(-resizeStep);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      const { minWidth } = getEditorPreviewResizeBounds(
        getAvailableEditorWidth()
      );
      setPreviewSidebarWidth(minWidth);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      const { maxWidth } = getEditorPreviewResizeBounds(
        getAvailableEditorWidth()
      );
      setPreviewSidebarWidth(maxWidth);
    }
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = previewResizeStateRef.current;

      if (!resizeState || event.pointerId !== resizeState.pointerId) {
        return;
      }

      const delta = event.clientX - resizeState.startX;
      const { maxWidth, minWidth } = getEditorPreviewResizeBounds(
        getAvailableEditorWidth()
      );

      if (maxWidth <= 0) {
        schedulePreviewSidebarWidthUpdate(0);
        return;
      }

      schedulePreviewSidebarWidthUpdate(
        clampWidth(resizeState.startWidth - delta, minWidth, maxWidth)
      );
    };

    const handlePointerUp = () => {
      if (!previewResizeStateRef.current) {
        return;
      }

      resetPreviewResizeState();
    };

    const handleWindowBlur = () => {
      if (!previewResizeStateRef.current) {
        return;
      }

      resetPreviewResizeState();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handleWindowBlur);
      resetPreviewResizeState();
    };
  }, [
    getAvailableEditorWidth,
    resetPreviewResizeState,
    schedulePreviewSidebarWidthUpdate,
  ]);

  useEffect(() => {
    const clampPreviewWidthToViewport = () => {
      const { maxWidth, minWidth } = getEditorPreviewResizeBounds(
        getAvailableEditorWidth()
      );

      setPreviewSidebarWidth((currentWidth) => {
        if (maxWidth <= 0) {
          return 0;
        }

        return clampWidth(currentWidth, minWidth, maxWidth);
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      clampPreviewWidthToViewport();
    });

    if (previewContainerRef.current) {
      resizeObserver.observe(previewContainerRef.current);
    }

    clampPreviewWidthToViewport();
    window.addEventListener("resize", clampPreviewWidthToViewport);

    return () => {
      window.removeEventListener("resize", clampPreviewWidthToViewport);
      resizeObserver.disconnect();
    };
  }, [getAvailableEditorWidth]);

  let editorFontHelperText =
    "Loading installed system fonts in the background. Bundled fallbacks are available immediately.";

  if (hasLoadedEditorFonts && editorFontStatus === "unavailable") {
    editorFontHelperText =
      "System font enumeration is unavailable here, so the picker is showing bundled fallbacks only.";
  } else if (hasLoadedEditorFonts) {
    editorFontHelperText =
      "Installed system fonts are shown first, with bundled fallbacks available when needed.";
  }

  return (
    <div
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch"
      ref={previewContainerRef}
    >
      <div className="grid gap-4">
        <FontPickerField
          description="Search installed editor fonts and bundled fallbacks, then optionally filter to monospace only."
          emptyMessage={
            editorFontStatus === "unavailable"
              ? "No installed fonts could be read on this platform. Bundled fallbacks are still available."
              : "No matching editor fonts found."
          }
          helperText={editorFontHelperText}
          isLoadingOptions={isLoadingEditorFonts}
          label="Editor font"
          monospaceOnly={editor.fontVisibility === "monospace-only"}
          onMonospaceOnlyChange={(checked) => {
            setEditorPreferences({
              fontVisibility: checked ? "monospace-only" : "all-fonts",
            });
          }}
          onPickerInteract={loadEditorFonts}
          onSearchChange={setEditorFontQuery}
          onValueChange={(value) => setEditorPreferences({ fontFamily: value })}
          options={visibleEditorFonts}
          query={query}
          searchPlaceholder="Search editor fonts"
          selectedFont={editor.fontFamily}
          showLoadingSkeleton={isLoadingEditorFonts && !hasLoadedEditorFonts}
        />
        <SettingsField
          description="Changes Monaco font size immediately for open diff views."
          label="Font size"
          query={query}
        >
          <Input
            max={32}
            min={10}
            onBlur={() => {
              if (editorFontSizeInput.trim().length === 0) {
                setEditorFontSizeInput(String(editor.fontSize));
                return;
              }

              const parsedValue = Number(editorFontSizeInput);

              if (!Number.isFinite(parsedValue)) {
                setEditorFontSizeInput(String(editor.fontSize));
                return;
              }

              const clampedValue = clampEditorFontSize(parsedValue);
              setEditorPreferences({ fontSize: clampedValue });
              setEditorFontSizeInput(String(clampedValue));
            }}
            onChange={(event) => {
              const nextValue = event.target.value;
              setEditorFontSizeInput(nextValue);

              if (nextValue.trim().length === 0) {
                return;
              }

              const parsedValue = Number(nextValue);

              if (!Number.isFinite(parsedValue)) {
                return;
              }

              if (parsedValue < 10 || parsedValue > 32) {
                return;
              }

              setEditorPreferences({ fontSize: parsedValue });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            step={1}
            type="number"
            value={editorFontSizeInput}
          />
        </SettingsField>
        <SettingsField
          description="Controls the visible indentation width in the Monaco diff editor."
          label="Tab size"
          query={query}
        >
          <Input
            max={8}
            min={1}
            onBlur={() => {
              if (editorTabSizeInput.trim().length === 0) {
                setEditorTabSizeInput(String(editor.tabSize));
                return;
              }

              const parsedValue = Number(editorTabSizeInput);

              if (!Number.isFinite(parsedValue)) {
                setEditorTabSizeInput(String(editor.tabSize));
                return;
              }

              const clampedValue = clampEditorTabSize(parsedValue);
              setEditorPreferences({ tabSize: clampedValue });
              setEditorTabSizeInput(String(clampedValue));
            }}
            onChange={(event) => {
              const nextValue = event.target.value;
              setEditorTabSizeInput(nextValue);

              if (nextValue.trim().length === 0) {
                return;
              }

              const parsedValue = Number(nextValue);

              if (!Number.isFinite(parsedValue)) {
                return;
              }

              if (parsedValue < 1 || parsedValue > 8) {
                return;
              }

              setEditorPreferences({ tabSize: parsedValue });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            step={1}
            type="number"
            value={editorTabSizeInput}
          />
        </SettingsField>
        <SettingsField
          description="Show or hide Monaco line numbers in diff views."
          label="Line numbers"
          query={query}
        >
          <Select
            items={LINE_NUMBER_OPTIONS}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setEditorPreferences({ lineNumbers: value as "on" | "off" });
              }
            }}
            value={editor.lineNumbers}
          >
            <SelectTrigger>
              <DefaultSelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on">Visible</SelectItem>
              <SelectItem value="off">Hidden</SelectItem>
            </SelectContent>
          </Select>
        </SettingsField>
        <SettingsField
          description="Wrap long lines in the existing read-only diff editor."
          label="Word wrap"
          query={query}
        >
          <label className="inline-flex items-center gap-3">
            <Switch
              checked={editor.wordWrap === "on"}
              onCheckedChange={(checked) => {
                setEditorPreferences({ wordWrap: checked ? "on" : "off" });
              }}
            />
            <span className="text-sm">
              {editor.wordWrap === "on"
                ? "Word wrap enabled"
                : "Word wrap disabled"}
            </span>
          </label>
        </SettingsField>
        <SettingsField
          description="Disable language detection and syntax coloring when you want a plain-text diff view."
          label="Syntax highlighting"
          query={query}
        >
          <label className="inline-flex items-center gap-3">
            <Switch
              checked={editor.syntaxHighlighting}
              onCheckedChange={(checked) => {
                setEditorPreferences({ syntaxHighlighting: Boolean(checked) });
              }}
            />
            <span className="text-sm">
              {editor.syntaxHighlighting
                ? "Use syntax-aware language colors"
                : "Always render diffs as plain text"}
            </span>
          </label>
        </SettingsField>
        <SettingsField
          description="Choose which line-ending mode Monaco should use when rendering diffs."
          label="Line ending mode"
          query={query}
        >
          <Select
            items={EOL_OPTIONS}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setEditorPreferences({
                  eol: value as "system" | "lf" | "crlf",
                });
              }
            }}
            value={editor.eol}
          >
            <SelectTrigger>
              <DefaultSelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System default</SelectItem>
              <SelectItem value="lf">LF</SelectItem>
              <SelectItem value="crlf">CRLF</SelectItem>
            </SelectContent>
          </Select>
        </SettingsField>
      </div>
      <div className="hidden xl:flex xl:items-stretch xl:self-stretch">
        <button
          aria-controls="editor-preview-sidebar"
          aria-label="Resize editor preview sidebar"
          className="h-full w-1.5 shrink-0 cursor-col-resize bg-transparent outline-none transition-colors hover:bg-accent/30 focus-visible:bg-accent/30 focus-visible:ring-2 focus-visible:ring-primary/50"
          onKeyDown={_handlePreviewResizeHandleKeyDown}
          onPointerDown={_startPreviewResize}
          type="button"
        />
        <div
          className="min-w-0 self-stretch"
          id="editor-preview-sidebar"
          style={{
            width: previewSidebarWidth > 0 ? `${previewSidebarWidth}px` : "0px",
          }}
        >
          <div className="h-full">
            <div className="h-full min-h-88">
              <EditorPreview
                eol={editor.eol}
                fontFamily={editor.fontFamily}
                fontSize={editor.fontSize}
                lineNumbers={editor.lineNumbers}
                mode={editorPreviewMode}
                onModeChange={setEditorPreviewMode}
                syntaxHighlighting={editor.syntaxHighlighting}
                tabSize={editor.tabSize}
                wordWrap={editor.wordWrap}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="xl:hidden">
        <div className="h-88">
          <EditorPreview
            eol={editor.eol}
            fontFamily={editor.fontFamily}
            fontSize={editor.fontSize}
            lineNumbers={editor.lineNumbers}
            mode={editorPreviewMode}
            onModeChange={setEditorPreviewMode}
            syntaxHighlighting={editor.syntaxHighlighting}
            tabSize={editor.tabSize}
            wordWrap={editor.wordWrap}
          />
        </div>
      </div>
    </div>
  );
}

function AiSection({ query }: { query: string }) {
  const customEndpoint = usePreferencesStore(
    (state) => state.ai.customEndpoint
  );
  const maxInputTokens = usePreferencesStore(
    (state) => state.ai.maxInputTokens
  );
  const provider = usePreferencesStore((state) => state.ai.provider);
  const setAiCustomEndpoint = usePreferencesStore(
    (state) => state.setAiCustomEndpoint
  );
  const setAiMaxInputTokens = usePreferencesStore(
    (state) => state.setAiMaxInputTokens
  );
  const setAiProvider = usePreferencesStore((state) => state.setAiProvider);
  const [aiSecretInput, setAiSecretInput] = useState("");
  const [aiSecretStatus, setAiSecretStatus] = useState<null | {
    hasStoredValue: boolean;
    storageMode: "secure" | "session";
  }>(null);
  const [aiSecretMessage, setAiSecretMessage] = useState<string | null>(null);
  const [capabilitiesMessage, setCapabilitiesMessage] = useState<string | null>(
    null
  );
  const hasStoredAiSecret = aiSecretStatus?.hasStoredValue ?? false;

  const resetAiSettings = () => {
    clearAiProviderSecret(provider)
      .catch(() => undefined)
      .finally(() => {
        setAiProvider(DEFAULT_PREFERENCES.ai.provider);
        setAiCustomEndpoint(DEFAULT_PREFERENCES.ai.customEndpoint);
        setAiMaxInputTokens(DEFAULT_PREFERENCES.ai.maxInputTokens);
        setAiSecretInput("");
        setAiSecretStatus({
          hasStoredValue: false,
          storageMode: "session",
        });
        setAiSecretMessage("AI settings reset to defaults.");
      });
  };

  useEffect(() => {
    setAiSecretMessage(null);

    getAiProviderSecretStatus(provider)
      .then(setAiSecretStatus)
      .catch(() => {
        setAiSecretStatus(null);
      });

    getSettingsBackendCapabilities()
      .then((capabilities) => {
        if (capabilities.secureStorageAvailable) {
          setCapabilitiesMessage(null);
        } else {
          setCapabilitiesMessage(
            "Secure storage unavailable; using session mode."
          );
        }
      })
      .catch(() => {
        setCapabilitiesMessage("Desktop backend capabilities unavailable.");
      });
  }, [provider]);

  return (
    <div className="grid gap-4">
      <SettingsField
        description="Choose which provider future AI-assisted features should target."
        label="AI provider"
        query={query}
      >
        <Select
          items={AI_PROVIDER_OPTIONS}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setAiProvider(
                value as
                  | "openai"
                  | "anthropic"
                  | "azure"
                  | "google"
                  | "ollama"
                  | "custom"
              );
            }
          }}
          value={provider}
        >
          <SelectTrigger>
            <DefaultSelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">OpenAI</SelectItem>
            <SelectItem value="anthropic">Anthropic</SelectItem>
            <SelectItem value="azure">Azure</SelectItem>
            <SelectItem value="google">Google</SelectItem>
            <SelectItem value="ollama">Ollama</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </SettingsField>
      <SettingsField
        description="Store a custom endpoint for future AI provider requests."
        label="Custom API endpoint"
        query={query}
      >
        <Input
          onChange={(event) => setAiCustomEndpoint(event.target.value)}
          placeholder={AI_ENDPOINT_PLACEHOLDERS[provider]}
          value={customEndpoint}
        />
      </SettingsField>
      {provider === "custom" ? (
        <SettingsField
          description="Set the maximum input tokens for requests sent to your custom AI provider."
          label="Max input tokens"
          query={query}
        >
          <Input
            min={1}
            onChange={(event) => {
              setAiMaxInputTokens(Number(event.target.value) || 1);
            }}
            type="number"
            value={maxInputTokens}
          />
        </SettingsField>
      ) : null}
      <SettingsField
        description="Secrets are saved in the desktop backend and only metadata comes back to the renderer."
        label="API key storage"
        query={query}
      >
        <div className="grid gap-3">
          <Input
            onChange={(event) => {
              setAiSecretInput(event.target.value);
              setAiSecretMessage(null);
            }}
            placeholder="sk-..."
            type="password"
            value={aiSecretInput}
          />
          <div className="flex items-center gap-3">
            <Button
              disabled={aiSecretInput.trim().length === 0}
              onClick={() => {
                saveAiProviderSecret(provider, aiSecretInput)
                  .then((status) => {
                    setAiSecretStatus(status);
                    setAiSecretInput("");
                    setAiSecretMessage(
                      `API key saved (${status.storageMode}).`
                    );
                  })
                  .catch((error: unknown) => {
                    setAiSecretMessage(
                      error instanceof Error
                        ? error.message
                        : "Failed to save API key"
                    );
                  });
              }}
              type="button"
              variant="outline"
            >
              Save API key
            </Button>
            <span className="text-muted-foreground text-sm">
              {aiSecretStatus?.hasStoredValue
                ? `Stored (${aiSecretStatus.storageMode})`
                : "No API key saved"}
            </span>
          </div>
          {hasStoredAiSecret ? (
            <SectionActionRow>
              <Button onClick={resetAiSettings} type="button" variant="ghost">
                Reset AI settings
              </Button>
            </SectionActionRow>
          ) : null}
          {aiSecretMessage ? (
            <SettingsHelpText>{aiSecretMessage}</SettingsHelpText>
          ) : null}
          {capabilitiesMessage ? (
            <div className="text-muted-foreground text-xs">
              {capabilitiesMessage}
            </div>
          ) : null}
        </div>
      </SettingsField>
      <PlannedField
        description="Prompt templates stay non-interactive in v1 to avoid shipping dead controls."
        label="AI instruction templates"
        query={query}
      />
    </div>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(
    getInitialSidebarWidth
  );
  const sidebarResizeStateRef = useRef<SidebarResizeState | null>(null);
  const sidebarContainerRef = useRef<HTMLDivElement | null>(null);
  const contentPanelRef = useRef<HTMLDivElement | null>(null);
  const previousActiveSectionRef = useRef<SettingsSectionId | null>(null);
  const resizeAnimationFrameRef = useRef<number | null>(null);
  const pendingSidebarWidthRef = useRef<number | null>(null);
  const activeSection = usePreferencesStore(
    (state) => state.settings.activeSection
  );

  const lastNonSettingsRoute = usePreferencesStore(
    (state) => state.settings.lastNonSettingsRoute
  );
  const query = usePreferencesStore((state) => state.settings.searchQuery);
  const resetSettingsSearch = usePreferencesStore(
    (state) => state.resetSettingsSearch
  );
  const setSearchQuery = usePreferencesStore((state) => state.setSearchQuery);
  const setSection = usePreferencesStore((state) => state.setSection);
  const toolbarLabels = usePreferencesStore((state) => state.ui.toolbarLabels);
  const currentPathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const filteredSections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return SETTINGS_SECTIONS;
    }

    return SETTINGS_SECTIONS.filter((section) =>
      matchesQuery(normalizedQuery, [
        SETTINGS_SECTION_LABELS[section.id],
        section.description,
        ...section.keywords,
      ])
    );
  }, [query]);

  const activeDefinition =
    SETTINGS_SECTIONS.find((section) => section.id === activeSection) ??
    SETTINGS_SECTIONS[0];

  useEffect(() => {
    const previousActiveSection = previousActiveSectionRef.current;

    if (
      contentPanelRef.current &&
      (previousActiveSection === null ||
        previousActiveSection !== activeSection)
    ) {
      contentPanelRef.current.scrollTop = 0;
    }

    previousActiveSectionRef.current = activeSection;
  }, [activeSection]);

  useEffect(() => {
    return runWhenBrowserIsIdle(() => {
      readSystemFontFamilies().catch(() => undefined);
    });
  }, []);

  const handleExitPreferences = useCallback(() => {
    const nextPath =
      lastNonSettingsRoute &&
      lastNonSettingsRoute !== "/settings" &&
      lastNonSettingsRoute !== currentPathname
        ? lastNonSettingsRoute
        : "/";

    navigate({ to: nextPath as never }).catch(() => undefined);
  }, [currentPathname, lastNonSettingsRoute, navigate]);

  const getAvailableSettingsWidth = useCallback(() => {
    return sidebarContainerRef.current?.clientWidth ?? getSettingsLayoutWidth();
  }, []);

  const scheduleSidebarWidthUpdate = useCallback((nextWidth: number) => {
    pendingSidebarWidthRef.current = nextWidth;

    if (resizeAnimationFrameRef.current !== null) {
      return;
    }

    resizeAnimationFrameRef.current = window.requestAnimationFrame(() => {
      const width = pendingSidebarWidthRef.current;

      resizeAnimationFrameRef.current = null;
      pendingSidebarWidthRef.current = null;

      if (typeof width === "number") {
        setLeftSidebarWidth(width);
      }
    });
  }, []);

  const resetResizeState = useCallback(() => {
    sidebarResizeStateRef.current = null;

    if (resizeAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeAnimationFrameRef.current);
      resizeAnimationFrameRef.current = null;
    }

    pendingSidebarWidthRef.current = null;

    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  const startSidebarResize =
    (_target: "left") => (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const { maxWidth, minWidth } = getSidebarResizeBounds(
        getAvailableSettingsWidth()
      );

      if (maxWidth <= 0) {
        return;
      }

      sidebarResizeStateRef.current = {
        startWidth: clampWidth(leftSidebarWidth, minWidth, maxWidth),
        startX: event.clientX,
      };

      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      scheduleSidebarWidthUpdate(
        clampWidth(leftSidebarWidth, minWidth, maxWidth)
      );
    };

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      const resizeState = sidebarResizeStateRef.current;

      if (!resizeState) {
        return;
      }

      const delta = event.clientX - resizeState.startX;
      const { maxWidth, minWidth } = getSidebarResizeBounds(
        getAvailableSettingsWidth()
      );

      if (maxWidth <= 0) {
        scheduleSidebarWidthUpdate(0);
        return;
      }

      scheduleSidebarWidthUpdate(
        clampWidth(resizeState.startWidth + delta, minWidth, maxWidth)
      );
    };

    const handlePointerUp = () => {
      if (!sidebarResizeStateRef.current) {
        return;
      }

      resetResizeState();
    };

    const handleWindowBlur = () => {
      if (!sidebarResizeStateRef.current) {
        return;
      }

      resetResizeState();
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("blur", handleWindowBlur);
      resetResizeState();
    };
  }, [getAvailableSettingsWidth, resetResizeState, scheduleSidebarWidthUpdate]);

  useEffect(() => {
    const clampSidebarWidthToViewport = () => {
      const { maxWidth, minWidth } = getSidebarResizeBounds(
        getAvailableSettingsWidth()
      );

      setLeftSidebarWidth((currentWidth) => {
        if (maxWidth <= 0) {
          return 0;
        }

        return clampWidth(currentWidth, minWidth, maxWidth);
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      clampSidebarWidthToViewport();
    });

    if (sidebarContainerRef.current) {
      resizeObserver.observe(sidebarContainerRef.current);
    }

    clampSidebarWidthToViewport();
    window.addEventListener("resize", clampSidebarWidthToViewport);

    return () => {
      window.removeEventListener("resize", clampSidebarWidthToViewport);
      resizeObserver.disconnect();
    };
  }, [getAvailableSettingsWidth]);

  useEffect(() => {
    window.localStorage.setItem(
      SETTINGS_SIDEBAR_WIDTH_STORAGE_KEY,
      String(Math.round(leftSidebarWidth))
    );
  }, [leftSidebarWidth]);

  return (
    <div
      className="flex h-full min-h-0 overflow-hidden bg-background text-foreground"
      ref={sidebarContainerRef}
    >
      <Sidebar
        className="shrink-0 border-border/70 border-r"
        style={{
          width: leftSidebarWidth > 0 ? `${leftSidebarWidth}px` : "0px",
        }}
      >
        <SidebarHeader className="flex flex-col gap-1 border-border/70 border-b px-2 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs uppercase tracking-[0.12em]">
              Settings
            </span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Exit preferences"
                    className="shrink-0 whitespace-nowrap pr-0 text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
                    onClick={handleExitPreferences}
                    size={toolbarLabels ? "sm" : "icon"}
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <ArrowLeftIcon className="size-4 shrink-0" />
                <span className={cn(!toolbarLabels && "hidden")}>Exit</span>
              </TooltipTrigger>
              <TooltipContent
                className={cn(toolbarLabels && "hidden")}
                side="right"
              >
                Exit preferences
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="relative">
            <Input
              id="settings-search"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search categories"
              value={query}
            />
            {query.length > 0 ? (
              <Button
                aria-label="Clear search"
                className="absolute top-1 right-1"
                onClick={resetSettingsSearch}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <XIcon className="size-3.5" />
              </Button>
            ) : null}
          </div>
        </SidebarHeader>
        <SidebarContent className="overflow-y-auto px-2 py-2">
          {filteredSections.length === 0 ? (
            <p className="px-3 py-6 text-center text-muted-foreground text-sm">
              No categories match this search.
            </p>
          ) : (
            <div className="grid gap-1">
              {filteredSections.map((section) => {
                const Icon = section.icon;
                const isActive = section.id === activeDefinition?.id;

                return (
                  <button
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                      isActive
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                    key={section.id}
                    onClick={() => setSection(section.id)}
                    type="button"
                  >
                    <Icon className="size-4 shrink-0" />
                    {SETTINGS_SECTION_LABELS[section.id]}
                  </button>
                );
              })}
            </div>
          )}
        </SidebarContent>
      </Sidebar>
      <button
        aria-label="Resize left sidebar"
        className="h-full w-1.5 shrink-0 cursor-col-resize border-border/70 border-r bg-transparent hover:bg-accent/30"
        onMouseDown={startSidebarResize("left")}
        type="button"
      />
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-color:color-mix(in_oklab,var(--color-muted-foreground)_55%,transparent)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/45 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2"
        id="settings-content-panel"
        ref={contentPanelRef}
      >
        <div className="px-6 py-6 sm:px-8 sm:py-8">
          <header className="mb-6">
            <div className="border-primary border-l-4 pl-3">
              <h2 className="font-mono font-semibold text-foreground text-xl tracking-tight transition-colors sm:text-2xl">
                {SETTINGS_SECTION_LABELS[activeDefinition.id]}
              </h2>
            </div>
            <p className="mt-3 max-w-3xl text-muted-foreground text-sm leading-relaxed">
              {activeDefinition.description}
            </p>
          </header>
          <div className="rounded-xl border border-primary/15 bg-primary/2.5 p-4 sm:p-6">
            <div className="grid gap-4">
              {renderSection(activeDefinition.id, query)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
