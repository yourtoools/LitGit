import {
  CpuIcon,
  GitBranchIcon,
  GlobeIcon,
  MonitorIcon,
  PaletteIcon,
  PlugsIcon,
  ShieldCheckIcon,
  TerminalWindowIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import type { SettingsSectionId } from "@/stores/preferences/preferences-store-types";

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
    id: "integrations",
    description:
      "Connect GitHub, GitLab, or Bitbucket accounts and manage provider-specific SSH keys.",
    icon: PlugsIcon,
    keywords: [
      "oauth",
      "github",
      "gitlab",
      "bitbucket",
      "account",
      "connect",
      "ssh",
      "token",
    ],
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
    description: "Code editor appearance and runtime preferences.",
    icon: MonitorIcon,
    keywords: ["editor", "codemirror", "wrap", "line numbers", "font"],
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

export type { SettingsSectionDefinition, SidebarResizeState };
export {
  AI_ENDPOINT_PLACEHOLDERS,
  AI_PROVIDER_OPTIONS,
  CURSOR_STYLE_OPTIONS,
  clampWidth,
  DATE_FORMAT_OPTIONS,
  EDITOR_CONTENT_MIN_WIDTH,
  EDITOR_PREVIEW_SIDEBAR_DEFAULT_WIDTH,
  EDITOR_PREVIEW_SIDEBAR_MAX_WIDTH,
  EDITOR_PREVIEW_SIDEBAR_MIN_WIDTH,
  EOL_OPTIONS,
  getEditorPreviewResizeBounds,
  getInitialEditorPreviewSidebarWidth,
  getInitialSidebarWidth,
  getInitialTerminalPreviewSidebarWidth,
  getSettingsLayoutWidth,
  getSidebarResizeBounds,
  LEFT_SIDEBAR_DEFAULT_WIDTH,
  LEFT_SIDEBAR_MAX_WIDTH,
  LEFT_SIDEBAR_MIN_WIDTH,
  LINE_NUMBER_OPTIONS,
  MIN_CONTENT_WIDTH,
  NO_SIGNING_KEY_VALUE,
  PROXY_TYPE_OPTIONS,
  RESIZE_HANDLE_WIDTH,
  SETTINGS_EDITOR_PREVIEW_WIDTH_STORAGE_KEY,
  SETTINGS_SECTIONS,
  SETTINGS_SIDEBAR_WIDTH_STORAGE_KEY,
  SETTINGS_TERMINAL_PREVIEW_WIDTH_STORAGE_KEY,
  SIGNING_FORMAT_OPTIONS,
  TOASTER_OPTIONS,
};
