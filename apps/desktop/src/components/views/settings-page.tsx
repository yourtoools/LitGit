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
import { Switch } from "@litgit/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { cn } from "@litgit/ui/lib/utils";
import {
  CaretLeftIcon,
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
import { useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const THEME_OPTIONS = {
  dark: "Dark",
  light: "Light",
  system: "System",
} as const;

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
  pointerId: number;
  startWidth: number;
  startX: number;
}

const LEFT_SIDEBAR_MIN_WIDTH = 220;
const LEFT_SIDEBAR_MAX_WIDTH = 400;
const LEFT_SIDEBAR_DEFAULT_WIDTH = 280;
const MIN_CONTENT_WIDTH = 560;
const RESIZE_HANDLE_WIDTH = 6;
const SETTINGS_SIDEBAR_WIDTH_STORAGE_KEY = "litgit:settings-sidebar-width";

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

const readSystemFontFamilies = async (): Promise<SystemFontReadResult> => {
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
        "grid gap-2 rounded-xl border border-border/60 bg-background/70 p-4 transition-colors",
        isHighlighted && "border-primary/40 bg-primary/5"
      )}
    >
      <div className="space-y-1">
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
      {children}
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
        "grid gap-1 rounded-xl border border-border/70 border-dashed bg-muted/20 p-4",
        isHighlighted && "border-primary/50 bg-primary/5"
      )}
    >
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

function FontPickerField({
  description,
  emptyMessage,
  helperText,
  label,
  onMonospaceOnlyChange,
  onSearchChange,
  onValueChange,
  options,
  query,
  searchPlaceholder,
  selectedFont,
  monospaceOnly,
}: {
  description: string;
  emptyMessage: string;
  helperText: string;
  label: string;
  monospaceOnly: boolean;
  onMonospaceOnlyChange: (checked: boolean) => void;
  onSearchChange: (value: string) => void;
  onValueChange: (value: string) => void;
  options: readonly FontPickerOption[];
  query: string;
  searchPlaceholder: string;
  selectedFont: string;
}) {
  const selectedOption =
    options.find((option) => option.family === selectedFont) ?? null;

  return (
    <SettingsField description={description} label={label} query={query}>
      <div className="grid gap-3">
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
            onChange={(event) => onSearchChange(event.target.value)}
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
        <label className="inline-flex items-center gap-3">
          <Switch
            checked={monospaceOnly}
            onCheckedChange={(checked) =>
              onMonospaceOnlyChange(Boolean(checked))
            }
          />
          <span className="text-sm">Show monospace fonts only</span>
        </label>
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

  return (
    <div className="grid gap-4">
      <SettingsField
        description="Switch between system, light, and dark appearance. Applied immediately."
        label="Theme"
        query={query}
      >
        <Select
          items={THEME_OPTIONS}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setThemePreference(value as "system" | "light" | "dark");
            }
          }}
          value={theme}
        >
          <SelectTrigger>
            <DefaultSelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">System</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
          </SelectContent>
        </Select>
      </SettingsField>
      <SettingsField
        description="Change where toast notifications appear in the desktop shell."
        label="Notification location"
        query={query}
      >
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
          <SelectTrigger>
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
        </div>
      </SettingsField>
      <SettingsField
        description="Controls whether repository dates use a compact or verbose format."
        label="Date format"
        query={query}
      >
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
      </SettingsField>
      <SettingsField
        description="Show or hide text labels alongside shell toolbar actions."
        label="Show toolbar labels"
        query={query}
      >
        <label className="inline-flex items-center gap-3">
          <Checkbox
            checked={toolbarLabels}
            onCheckedChange={(checked) => setToolbarLabels(Boolean(checked))}
          />
          <span className="text-sm">Display action labels in the header</span>
        </label>
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
  const [terminalFontQuery, setTerminalFontQuery] = useState("");
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
    const normalizedQuery = terminalFontQuery.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return filteredFonts;
    }

    return filteredFonts.filter((font) =>
      font.family.toLowerCase().includes(normalizedQuery)
    );
  }, [fontVisibility, terminalFontQuery, terminalFonts]);

  useEffect(() => {
    if (!terminalFonts.some((font) => font.family === fontFamily)) {
      setFontFamily(DEFAULT_TERMINAL_FONT_FAMILY);
    }
  }, [fontFamily, setFontFamily, terminalFonts]);

  useEffect(() => {
    readSystemFontFamilies()
      .then((result) => {
        setSystemTerminalFonts(result.options);
        setTerminalFontStatus(result.status);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="grid gap-4">
      <FontPickerField
        description="Search installed terminal fonts and bundled fallbacks, then optionally filter to monospace only."
        emptyMessage={
          terminalFontStatus === "unavailable"
            ? "No installed fonts could be read on this platform. Bundled fallbacks are still available."
            : "No matching terminal fonts found."
        }
        helperText={
          terminalFontStatus === "unavailable"
            ? "System font enumeration is unavailable here, so the picker is showing bundled fallbacks only."
            : "Installed system fonts are shown first, with bundled fallbacks available when needed."
        }
        label="Terminal font"
        monospaceOnly={fontVisibility === "monospace-only"}
        onMonospaceOnlyChange={(checked) => {
          setFontVisibility(checked ? "monospace-only" : "all-fonts");
        }}
        onSearchChange={setTerminalFontQuery}
        onValueChange={setFontFamily}
        options={visibleTerminalFonts}
        query={query}
        searchPlaceholder="Search terminal fonts"
        selectedFont={fontFamily}
      />
      <SettingsField
        description="Applied immediately to the mounted xterm instance."
        label="Font size"
        query={query}
      >
        <Input
          min={8}
          onChange={(event) => setFontSize(Number(event.target.value) || 12)}
          type="number"
          value={fontSize}
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
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            onChange={(event) => {
              setNetworkProxy({ proxyHost: event.target.value });
            }}
            placeholder="proxy.local"
            value={proxyHost}
          />
          <Input
            min={1}
            onChange={(event) => {
              setNetworkProxy({
                proxyPort: Number(event.target.value) || 80,
              });
            }}
            placeholder="80"
            type="number"
            value={proxyPort}
          />
          <Select
            items={PROXY_TYPE_OPTIONS}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setNetworkProxy({
                  proxyType: value as "http" | "https" | "socks5",
                });
              }
            }}
            value={proxyType}
          >
            <SelectTrigger>
              <DefaultSelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="http">HTTP</SelectItem>
              <SelectItem value="https">HTTPS</SelectItem>
              <SelectItem value="socks5">SOCKS5</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              if (!proxyHost.trim()) {
                setProxyTestMessage("Proxy host is required before testing.");
                return;
              }

              runProxyConnectionTest({
                host: proxyHost,
                port: proxyPort,
                proxyType,
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
                    error instanceof Error ? error.message : "Proxy test failed"
                  );
                });
            }}
            type="button"
            variant="outline"
          >
            Test proxy connection
          </Button>
          {proxyTestMessage ? (
            <span className="text-muted-foreground text-sm">
              {proxyTestMessage}
            </span>
          ) : null}
        </div>
        <SettingsHelpText>
          Leave host empty to disable proxy routing even if the toggle stays on.
        </SettingsHelpText>
        <SectionActionRow>
          <Button onClick={resetProxySettings} type="button" variant="ghost">
            Reset proxy settings
          </Button>
        </SectionActionRow>
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
  const [systemEditorFonts, setSystemEditorFonts] = useState<
    readonly FontPickerOption[]
  >([]);
  const [editorFontStatus, setEditorFontStatus] =
    useState<SystemFontReadResult["status"]>("available");
  const [editorFontQuery, setEditorFontQuery] = useState("");
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
    const normalizedQuery = editorFontQuery.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return filteredFonts;
    }

    return filteredFonts.filter((font) =>
      font.family.toLowerCase().includes(normalizedQuery)
    );
  }, [editor.fontVisibility, editorFontQuery, editorFonts]);

  useEffect(() => {
    if (!editorFonts.some((font) => font.family === editor.fontFamily)) {
      setEditorPreferences({ fontFamily: DEFAULT_EDITOR_FONT_FAMILY });
    }
  }, [editor.fontFamily, editorFonts, setEditorPreferences]);

  useEffect(() => {
    readSystemFontFamilies()
      .then((result) => {
        setSystemEditorFonts(result.options);
        setEditorFontStatus(result.status);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="grid gap-4">
      <FontPickerField
        description="Search installed editor fonts and bundled fallbacks, then optionally filter to monospace only."
        emptyMessage={
          editorFontStatus === "unavailable"
            ? "No installed fonts could be read on this platform. Bundled fallbacks are still available."
            : "No matching editor fonts found."
        }
        helperText={
          editorFontStatus === "unavailable"
            ? "System font enumeration is unavailable here, so the picker is showing bundled fallbacks only."
            : "Installed system fonts are shown first, with bundled fallbacks available when needed."
        }
        label="Editor font"
        monospaceOnly={editor.fontVisibility === "monospace-only"}
        onMonospaceOnlyChange={(checked) => {
          setEditorPreferences({
            fontVisibility: checked ? "monospace-only" : "all-fonts",
          });
        }}
        onSearchChange={setEditorFontQuery}
        onValueChange={(value) => setEditorPreferences({ fontFamily: value })}
        options={visibleEditorFonts}
        query={query}
        searchPlaceholder="Search editor fonts"
        selectedFont={editor.fontFamily}
      />
      <SettingsField
        description="Changes Monaco font size immediately for open diff views."
        label="Font size"
        query={query}
      >
        <Input
          min={10}
          onChange={(event) => {
            setEditorPreferences({
              fontSize: Number(event.target.value) || 13,
            });
          }}
          type="number"
          value={editor.fontSize}
        />
      </SettingsField>
      <SettingsField
        description="Controls the visible indentation width in the Monaco diff editor."
        label="Tab size"
        query={query}
      >
        <Input
          min={1}
          onChange={(event) => {
            setEditorPreferences({ tabSize: Number(event.target.value) || 2 });
          }}
          type="number"
          value={editor.tabSize}
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
  const [capabilitiesMessage, setCapabilitiesMessage] = useState<string | null>(
    null
  );

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
      });
  };

  useEffect(() => {
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
            onChange={(event) => setAiSecretInput(event.target.value)}
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
                  })
                  .catch(() => undefined);
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
          <SectionActionRow>
            <Button onClick={resetAiSettings} type="button" variant="ghost">
              Reset AI settings
            </Button>
          </SectionActionRow>
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
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(
    getInitialSidebarWidth
  );
  const sidebarResizeStateRef = useRef<SidebarResizeState | null>(null);
  const sidebarContainerRef = useRef<HTMLDivElement | null>(null);
  const contentPanelRef = useRef<HTMLDivElement | null>(null);
  const previousActiveSectionRef = useRef<SettingsSectionId | null>(null);
  const resizeAnimationFrameRef = useRef<number | null>(null);
  const pendingSidebarWidthRef = useRef<number | null>(null);
  const bodyStyleSnapshotRef = useRef<{
    cursor: string;
    userSelect: string;
  } | null>(null);
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

  const handleExitPreferences = useCallback(() => {
    const nextPath =
      lastNonSettingsRoute &&
      lastNonSettingsRoute !== "/settings" &&
      lastNonSettingsRoute !== currentPathname
        ? lastNonSettingsRoute
        : "/";

    window.location.assign(nextPath);
  }, [currentPathname, lastNonSettingsRoute]);

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

    if (bodyStyleSnapshotRef.current) {
      document.body.style.userSelect = bodyStyleSnapshotRef.current.userSelect;
      document.body.style.cursor = bodyStyleSnapshotRef.current.cursor;
      bodyStyleSnapshotRef.current = null;
    }
  }, []);

  const startSidebarResize = (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const { maxWidth, minWidth } = getSidebarResizeBounds(
      getAvailableSettingsWidth()
    );

    if (maxWidth <= 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    bodyStyleSnapshotRef.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };

    sidebarResizeStateRef.current = {
      pointerId: event.pointerId,
      startWidth: leftSidebarWidth,
      startX: event.clientX,
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    scheduleSidebarWidthUpdate(
      clampWidth(leftSidebarWidth, minWidth, maxWidth)
    );
  };

  const adjustSidebarWidth = (delta: number) => {
    const { maxWidth, minWidth } = getSidebarResizeBounds(
      getAvailableSettingsWidth()
    );

    if (maxWidth <= 0) {
      setLeftSidebarWidth(0);
      return;
    }

    setLeftSidebarWidth((currentWidth) =>
      clampWidth(currentWidth + delta, minWidth, maxWidth)
    );
  };

  const handleResizeHandleKeyDown = (
    event: React.KeyboardEvent<HTMLElement>
  ) => {
    const resizeStep = event.shiftKey ? 40 : 16;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      adjustSidebarWidth(-resizeStep);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      adjustSidebarWidth(resizeStep);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      const { minWidth } = getSidebarResizeBounds(getAvailableSettingsWidth());
      setLeftSidebarWidth(minWidth);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      const { maxWidth } = getSidebarResizeBounds(getAvailableSettingsWidth());
      setLeftSidebarWidth(maxWidth);
    }
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = sidebarResizeStateRef.current;

      if (!resizeState || event.pointerId !== resizeState.pointerId) {
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

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
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
                    className="shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
                    onClick={handleExitPreferences}
                    size={toolbarLabels ? "sm" : "icon-sm"}
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <CaretLeftIcon className="size-4 shrink-0" />
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
        aria-controls="settings-content-panel"
        aria-label="Resize left sidebar"
        className="h-full w-1.5 shrink-0 cursor-col-resize bg-transparent outline-none transition-colors hover:bg-accent/30 focus-visible:bg-accent/30 focus-visible:ring-2 focus-visible:ring-primary/50"
        onKeyDown={handleResizeHandleKeyDown}
        onPointerDown={startSidebarResize}
        type="button"
      />
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        id="settings-content-panel"
        ref={contentPanelRef}
      >
        <div className="px-8 py-8">
          <h2 className="font-semibold text-xl">
            {SETTINGS_SECTION_LABELS[activeDefinition.id]}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {activeDefinition.description}
          </p>
          <div className="mt-6 grid gap-4">
            {renderSection(activeDefinition.id, query)}
          </div>
        </div>
      </div>
    </div>
  );
}
