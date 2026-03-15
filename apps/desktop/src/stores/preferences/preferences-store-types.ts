export const PREFERENCES_STORAGE_KEY = "litgit-preferences-store";

export type ThemePreference = "light" | "dark" | "system";

export type ToasterPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";
export type TerminalCursorStyle = "block" | "underline" | "bar";
export type DateFormatPreset = "compact" | "verbose";
export type SettingsSectionId =
  | "general"
  | "git"
  | "ssh"
  | "ui"
  | "signing"
  | "editor"
  | "terminal"
  | "network"
  | "ai";

export interface GeneralPreferences {
  autoFetchIntervalMinutes: number;
  defaultBranchName: string;
  rememberTabs: boolean;
}

export interface UiPreferences {
  dateFormat: DateFormatPreset;
  locale: string;
  repoFileBrowserByRepoId: Record<string, RepoFileBrowserState>;
  theme: ThemePreference;
  toasterPosition: ToasterPosition;
  toolbarLabels: boolean;
}

export type RepoFileBrowserSortOrder = "asc" | "desc";

export interface RepoFileBrowserState {
  expandedTreeNodePaths: Record<string, boolean>;
  filterInputValue: string;
  isStagedSectionCollapsed: boolean;
  isUnstagedSectionCollapsed: boolean;
  showAllFiles: boolean;
  sortOrder: RepoFileBrowserSortOrder;
  viewMode: "path" | "tree";
}

export const DEFAULT_REPO_FILE_BROWSER_STATE: RepoFileBrowserState = {
  expandedTreeNodePaths: {},
  filterInputValue: "",
  isStagedSectionCollapsed: false,
  isUnstagedSectionCollapsed: false,
  showAllFiles: false,
  sortOrder: "asc",
  viewMode: "tree",
};

export interface TerminalPreferences {
  cursorStyle: TerminalCursorStyle;
  fontFamily: string;
  fontSize: number;
  fontVisibility: "monospace-only" | "all-fonts";
  lineHeight: number;
}

export interface EditorPreferences {
  eol: "system" | "lf" | "crlf";
  fontFamily: string;
  fontSize: number;
  fontVisibility: "monospace-only" | "all-fonts";
  lineNumbers: "on" | "off";
  syntaxHighlighting: boolean;
  tabSize: number;
  wordWrap: "off" | "on";
}

export interface SshPreferences {
  privateKeyPath: string;
  publicKeyPath: string;
  useLocalAgent: boolean;
}

export interface SigningPreferences {
  gpgProgramPath: string;
  signCommitsByDefault: boolean;
  signingFormat: "gpg" | "ssh";
  signingKey: string;
}

export interface NetworkPreferences {
  enableProxy: boolean;
  proxyAuthEnabled: boolean;
  proxyAuthSecretStorageMode: "secure" | "session" | null;
  proxyAuthSecretStored: boolean;
  proxyHost: string;
  proxyPort: number;
  proxyType: "http" | "https" | "socks5";
  proxyUsername: string;
  sslVerification: boolean;
  useGitCredentialManager: boolean;
}

export interface AiPreferences {
  commitInstruction: string;
  customEndpoint: string;
  maxInputTokens: number;
  model: string;
  provider: "openai" | "anthropic" | "azure" | "google" | "ollama" | "custom";
}

export const DEFAULT_AI_COMMIT_INSTRUCTION =
  "Generate a clear git commit title and optional body from staged changes only. If the repository has no commits yet, prefer git commit conventions such as Conventional Commits. If the repository already has commits, follow the existing commit style for consistency. Use imperative mood when appropriate, avoid speculation, and keep the body brief. When a commit description is needed, format it as bullet points listing the key changes.";

export interface AppPreferences {
  ai: AiPreferences;
  editor: EditorPreferences;
  general: GeneralPreferences;
  network: NetworkPreferences;
  settings: {
    activeSection: SettingsSectionId;
    hasCompletedOnboarding: boolean;
    lastNonSettingsRoute: string | null;
    searchQuery: string;
  };
  signing: SigningPreferences;
  ssh: SshPreferences;
  terminal: TerminalPreferences;
  ui: UiPreferences;
}

export const DEFAULT_TERMINAL_FONT_FAMILY =
  "JetBrains Mono Variable, JetBrains Mono, monospace";

export const DEFAULT_EDITOR_FONT_FAMILY = DEFAULT_TERMINAL_FONT_FAMILY;

export const AUTO_FETCH_INTERVAL_LIMITS = {
  max: 60,
  min: 0,
} as const;

export const clampAutoFetchInterval = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(
    AUTO_FETCH_INTERVAL_LIMITS.max,
    Math.max(AUTO_FETCH_INTERVAL_LIMITS.min, Math.round(value))
  );
};

export const clampProxyPort = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 80;
  }

  return Math.min(65_535, Math.max(1, Math.round(value)));
};

export const clampEditorFontSize = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 13;
  }

  return Math.min(32, Math.max(10, Math.round(value)));
};

export const clampEditorTabSize = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 2;
  }

  return Math.min(8, Math.max(1, Math.round(value)));
};

export const clampTerminalFontSize = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 12;
  }

  return Math.min(32, Math.max(8, Math.round(value)));
};

export const clampTerminalLineHeight = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(2, Math.max(1, value));
};

export const clampAiMaxInputTokens = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 4096;
  }

  return Math.min(1_000_000, Math.max(1, Math.round(value)));
};

export const DEFAULT_PREFERENCES: AppPreferences = {
  ai: {
    commitInstruction: DEFAULT_AI_COMMIT_INSTRUCTION,
    provider: "openai",
    customEndpoint: "",
    maxInputTokens: 4096,
    model: "",
  },
  editor: {
    eol: "system",
    fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
    fontSize: 13,
    fontVisibility: "monospace-only",
    lineNumbers: "on",
    tabSize: 2,
    syntaxHighlighting: true,
    wordWrap: "off",
  },
  general: {
    autoFetchIntervalMinutes: 0,
    defaultBranchName: "main",
    rememberTabs: true,
  },
  network: {
    enableProxy: false,
    proxyAuthEnabled: false,
    proxyAuthSecretStorageMode: null,
    proxyAuthSecretStored: false,
    proxyHost: "",
    proxyPort: 80,
    proxyUsername: "",
    proxyType: "http",
    sslVerification: true,
    useGitCredentialManager: true,
  },
  settings: {
    activeSection: "general",
    hasCompletedOnboarding: false,
    lastNonSettingsRoute: null,
    searchQuery: "",
  },
  signing: {
    gpgProgramPath: "",
    signingFormat: "gpg",
    signingKey: "",
    signCommitsByDefault: false,
  },
  ssh: {
    privateKeyPath: "",
    publicKeyPath: "",
    useLocalAgent: true,
  },
  terminal: {
    cursorStyle: "block",
    fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
    fontVisibility: "monospace-only",
    fontSize: 12,
    lineHeight: 1,
  },
  ui: {
    dateFormat: "compact",
    locale: "system",
    repoFileBrowserByRepoId: {},
    theme: "system",
    toasterPosition: "top-right",
    toolbarLabels: false,
  },
};

export const SETTINGS_SECTION_LABELS: Record<SettingsSectionId, string> = {
  general: "General",
  git: "Profile",
  ssh: "SSH",
  ui: "UI Customization",
  signing: "Commit Signing",
  editor: "Editor",
  terminal: "In-App Terminal",
  network: "Network",
  ai: "AI Integration",
};

export const readRememberTabsPreference = (): boolean => {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES.general.rememberTabs;
  }

  const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);

  if (!raw) {
    return DEFAULT_PREFERENCES.general.rememberTabs;
  }

  try {
    const parsed = JSON.parse(raw) as {
      state?: { general?: { rememberTabs?: boolean } };
    };

    return (
      parsed.state?.general?.rememberTabs ??
      DEFAULT_PREFERENCES.general.rememberTabs
    );
  } catch {
    return DEFAULT_PREFERENCES.general.rememberTabs;
  }
};
