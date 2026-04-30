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
  | "integrations"
  | "ssh"
  | "ui"
  | "signing"
  | "editor"
  | "terminal"
  | "network"
  | "ai";

interface GeneralPreferences {
  autoFetchIntervalMinutes: number;
  defaultBranchName: string;
  rememberTabs: boolean;
}

interface UiPreferences {
  dateFormat: DateFormatPreset;
  locale: string;
  repoFileBrowserByRepoId: Record<string, RepoFileBrowserState>;
  repoTimeline: RepoTimelinePreferences;
  theme: ThemePreference;
  toasterPosition: ToasterPosition;
  toolbarLabels: boolean;
}

export type RepoTimelineColumnId =
  | "branch"
  | "graph"
  | "commitMessage"
  | "author"
  | "dateTime"
  | "sha";

export interface RepoTimelinePreferences {
  compactGraph: boolean;
  smartBranchVisibility: boolean;
  visibleColumns: Record<RepoTimelineColumnId, boolean>;
}

export const DEFAULT_REPO_TIMELINE_PREFERENCES: RepoTimelinePreferences = {
  compactGraph: false,
  smartBranchVisibility: false,
  visibleColumns: {
    author: true,
    branch: true,
    commitMessage: true,
    dateTime: true,
    graph: true,
    sha: false,
  },
};

export type RepoFileBrowserSortOrder = "asc" | "desc";

export interface RepoFileBrowserState {
  collapsedBranchFolderKeys: Record<string, boolean>;
  collapsedSidebarGroupKeys: Record<string, boolean>;
  expandedCommitTreeNodePaths: Record<string, boolean>;
  expandedTreeNodePaths: Record<string, boolean>;
  filterInputValue: string;
  hiddenGraphEntryKeys: Record<string, boolean>;
  isRightSidebarOpen: boolean;
  isStagedSectionCollapsed: boolean;
  isUnstagedSectionCollapsed: boolean;
  leftSidebarWidth: number;
  rightSidebarWidth: number;
  selectedCommitId: string | null;
  selectedTimelineRowId: string | null;
  showAllFiles: boolean;
  sortOrder: RepoFileBrowserSortOrder;
  viewMode: "path" | "tree";
}

export const DEFAULT_REPO_FILE_BROWSER_STATE: RepoFileBrowserState = {
  collapsedBranchFolderKeys: {},
  collapsedSidebarGroupKeys: {
    local: true,
    remote: true,
    stashes: true,
    tags: true,
  },
  expandedCommitTreeNodePaths: {},
  expandedTreeNodePaths: {},
  filterInputValue: "",
  hiddenGraphEntryKeys: {},
  isRightSidebarOpen: true,
  isStagedSectionCollapsed: false,
  isUnstagedSectionCollapsed: false,
  leftSidebarWidth: 256,
  rightSidebarWidth: 320,
  selectedCommitId: null,
  selectedTimelineRowId: null,
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
  ignoreTrimWhitespace: boolean;
  lineNumbers: "on" | "off";
  renderSideBySide: boolean;
  showTrailingWhitespace: boolean;
  syntaxHighlighting: boolean;
  tabSize: number;
  theme: "light" | "dark";
  wordWrap: "off" | "on";
}

interface SshPreferences {
  privateKeyPath: string;
  publicKeyPath: string;
  useLocalAgent: boolean;
}

interface ProviderIntegration {
  avatarUrl: string | null;
  connected: boolean;
  displayName: string | null;
  sshKey: {
    keyPath: string;
    title: string;
    fingerprint: string;
    addedAt: string;
  } | null;
  username: string | null;
  useSystemAgent: boolean;
}

interface IntegrationsPreferences {
  bitbucket: ProviderIntegration;
  github: ProviderIntegration;
  gitlab: ProviderIntegration;
}

interface SigningPreferences {
  gpgProgramPath: string;
  signCommitsByDefault: boolean;
  signingFormat: "gpg" | "ssh";
  signingKey: string;
}

interface NetworkPreferences {
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

interface AiPreferences {
  availableModels: Array<{ id: string; label: string }>;
  commitInstruction: string;
  customEndpoint: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  model: string;
  provider: "openai" | "anthropic" | "azure" | "google" | "ollama" | "custom";
}

type AiProvider = AiPreferences["provider"];

const DEFAULT_PROVIDER_INTEGRATION: ProviderIntegration = {
  connected: false,
  username: null,
  displayName: null,
  avatarUrl: null,
  useSystemAgent: true,
  sshKey: null,
};

export const DEFAULT_AI_COMMIT_INSTRUCTION =
  "Generate a clear git commit title and optional body from staged changes only. If the repository has no commits yet, prefer git commit conventions such as Conventional Commits. If the repository already has commits, follow the existing commit style for consistency. Use imperative mood when appropriate, avoid speculation, and keep the body brief. When a commit description is needed, format it as bullet points listing the key changes.";

export interface AppPreferences {
  ai: AiPreferences;
  editor: EditorPreferences;
  general: GeneralPreferences;
  integrations: IntegrationsPreferences;
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

export const DEFAULT_EDITOR_FONT_FAMILY =
  "JetBrains Mono Variable, JetBrains Mono, monospace";

const DEFAULT_TERMINAL_FONT_FAMILY = DEFAULT_EDITOR_FONT_FAMILY;

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
    return 1200;
  }

  return Math.min(4096, Math.max(256, Math.round(value)));
};

export const clampAiMaxOutputTokens = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 96;
  }

  return Math.min(512, Math.max(32, Math.round(value)));
};

export const getDefaultAiMaxInputTokens = (provider: AiProvider): number => {
  switch (provider) {
    case "ollama": {
      return 1200;
    }
    default: {
      return 1200;
    }
  }
};

export const getDefaultAiMaxOutputTokens = (provider: AiProvider): number => {
  switch (provider) {
    case "ollama": {
      return 96;
    }
    case "google": {
      return 96;
    }
    case "anthropic": {
      return 96;
    }
    default: {
      return 96;
    }
  }
};

export const DEFAULT_PREFERENCES: AppPreferences = {
  ai: {
    availableModels: [],
    commitInstruction: DEFAULT_AI_COMMIT_INSTRUCTION,
    provider: "openai",
    customEndpoint: "",
    maxInputTokens: getDefaultAiMaxInputTokens("openai"),
    maxOutputTokens: getDefaultAiMaxOutputTokens("openai"),
    model: "",
  },
  editor: {
    eol: "system",
    fontFamily: DEFAULT_EDITOR_FONT_FAMILY,
    fontSize: 13,
    fontVisibility: "monospace-only",
    ignoreTrimWhitespace: true,
    lineNumbers: "on",
    renderSideBySide: true,
    showTrailingWhitespace: true,
    syntaxHighlighting: true,
    tabSize: 2,
    theme: "light",
    wordWrap: "off",
  },
  general: {
    autoFetchIntervalMinutes: 0,
    defaultBranchName: "main",
    rememberTabs: true,
  },
  integrations: {
    bitbucket: { ...DEFAULT_PROVIDER_INTEGRATION },
    github: { ...DEFAULT_PROVIDER_INTEGRATION },
    gitlab: { ...DEFAULT_PROVIDER_INTEGRATION },
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
    repoTimeline: DEFAULT_REPO_TIMELINE_PREFERENCES,
    theme: "system",
    toasterPosition: "bottom-center",
    toolbarLabels: false,
  },
};

export const SETTINGS_SECTION_LABELS: Record<SettingsSectionId, string> = {
  general: "General",
  git: "Profile",
  integrations: "Integrations",
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
