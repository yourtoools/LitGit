import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  type AppPreferences,
  clampAiMaxInputTokens,
  clampAutoFetchInterval,
  clampEditorFontSize,
  clampEditorTabSize,
  clampProxyPort,
  clampTerminalFontSize,
  clampTerminalLineHeight,
  type DateFormatPreset,
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  type SettingsSectionId,
  type TerminalCursorStyle,
  type ThemePreference,
  type ToasterPosition,
} from "@/stores/preferences/preferences-store-types";
import { TAB_STORE_KEY } from "@/stores/tabs/tab-store.helpers";

interface PreferencesStoreState extends AppPreferences {
  resetSettingsSearch: () => void;
  setAiCustomEndpoint: (customEndpoint: string) => void;
  setAiMaxInputTokens: (maxInputTokens: number) => void;
  setAiProvider: (provider: AppPreferences["ai"]["provider"]) => void;
  setAutoFetchIntervalMinutes: (minutes: number) => void;
  setDateFormat: (dateFormat: DateFormatPreset) => void;
  setDefaultBranchName: (defaultBranchName: string) => void;
  setEditorPreferences: (input: {
    eol?: AppPreferences["editor"]["eol"];
    fontFamily?: string;
    fontSize?: number;
    fontVisibility?: AppPreferences["editor"]["fontVisibility"];
    lineNumbers?: AppPreferences["editor"]["lineNumbers"];
    syntaxHighlighting?: boolean;
    tabSize?: number;
    wordWrap?: AppPreferences["editor"]["wordWrap"];
  }) => void;
  setHasCompletedOnboarding: (completed: boolean) => void;
  setLastNonSettingsRoute: (route: string | null) => void;
  setLocale: (locale: string) => void;
  setNetworkProxy: (input: {
    enableProxy?: boolean;
    proxyAuthEnabled?: boolean;
    proxyHost?: string;
    proxyPort?: number;
    proxyUsername?: string;
    proxyType?: AppPreferences["network"]["proxyType"];
    sslVerification?: boolean;
    useGitCredentialManager?: boolean;
  }) => void;
  setNetworkProxyAuthSecretStatus: (status: {
    hasStoredValue: boolean;
    storageMode: "secure" | "session" | null;
  }) => void;
  setRememberTabs: (rememberTabs: boolean) => void;
  setSearchQuery: (searchQuery: string) => void;
  setSection: (section: SettingsSectionId) => void;
  setSigningPreferences: (input: {
    gpgProgramPath?: string;
    signingFormat?: AppPreferences["signing"]["signingFormat"];
    signingKey?: string;
    signCommitsByDefault?: boolean;
  }) => void;
  setSshPaths: (input: {
    privateKeyPath?: string;
    publicKeyPath?: string;
  }) => void;
  setTerminalCursorStyle: (cursorStyle: TerminalCursorStyle) => void;
  setTerminalFontFamily: (fontFamily: string) => void;
  setTerminalFontSize: (fontSize: number) => void;
  setTerminalFontVisibility: (
    fontVisibility: AppPreferences["terminal"]["fontVisibility"]
  ) => void;
  setTerminalLineHeight: (lineHeight: number) => void;
  setThemePreference: (theme: ThemePreference) => void;
  setToasterPosition: (position: ToasterPosition) => void;
  setToolbarLabels: (toolbarLabels: boolean) => void;
}

const clearPersistedTabs = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(TAB_STORE_KEY);
};

export const usePreferencesStore = create<PreferencesStoreState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      resetSettingsSearch: () => {
        set((state) => ({
          settings: {
            ...state.settings,
            searchQuery: "",
          },
        }));
      },
      setAiCustomEndpoint: (customEndpoint) => {
        set((state) => ({
          ai: {
            ...state.ai,
            customEndpoint,
          },
        }));
      },
      setAiMaxInputTokens: (maxInputTokens) => {
        set((state) => ({
          ai: {
            ...state.ai,
            maxInputTokens: clampAiMaxInputTokens(maxInputTokens),
          },
        }));
      },
      setAiProvider: (provider) => {
        set((state) => ({
          ai: {
            ...state.ai,
            provider,
          },
        }));
      },
      setAutoFetchIntervalMinutes: (minutes) => {
        set((state) => ({
          general: {
            ...state.general,
            autoFetchIntervalMinutes: clampAutoFetchInterval(minutes),
          },
        }));
      },
      setDateFormat: (dateFormat) => {
        set((state) => ({
          ui: {
            ...state.ui,
            dateFormat,
          },
        }));
      },
      setDefaultBranchName: (defaultBranchName) => {
        set((state) => ({
          general: {
            ...state.general,
            defaultBranchName: defaultBranchName.trim() || "main",
          },
        }));
      },
      setEditorPreferences: (input) => {
        set((state) => ({
          editor: {
            ...state.editor,
            ...input,
            ...(input.fontSize === undefined
              ? {}
              : { fontSize: clampEditorFontSize(input.fontSize) }),
            ...(input.tabSize === undefined
              ? {}
              : { tabSize: clampEditorTabSize(input.tabSize) }),
          },
        }));
      },
      setHasCompletedOnboarding: (completed) => {
        set((state) => ({
          settings: {
            ...state.settings,
            hasCompletedOnboarding: completed,
          },
        }));
      },
      setLastNonSettingsRoute: (route) => {
        set((state) => ({
          settings: {
            ...state.settings,
            lastNonSettingsRoute: route,
          },
        }));
      },
      setLocale: (locale) => {
        set((state) => ({
          ui: {
            ...state.ui,
            locale,
          },
        }));
      },
      setNetworkProxy: (input) => {
        set((state) => ({
          network: {
            ...state.network,
            ...input,
            ...(input.proxyPort === undefined
              ? {}
              : { proxyPort: clampProxyPort(input.proxyPort) }),
          },
        }));
      },
      setNetworkProxyAuthSecretStatus: (status) => {
        set((state) => ({
          network: {
            ...state.network,
            proxyAuthSecretStorageMode: status.storageMode,
            proxyAuthSecretStored: status.hasStoredValue,
          },
        }));
      },
      setRememberTabs: (rememberTabs) => {
        if (!rememberTabs) {
          clearPersistedTabs();
        }

        set((state) => ({
          general: {
            ...state.general,
            rememberTabs,
          },
        }));
      },
      setSearchQuery: (searchQuery) => {
        set((state) => ({
          settings: {
            ...state.settings,
            searchQuery,
          },
        }));
      },
      setSection: (activeSection) => {
        set((state) => ({
          settings: {
            ...state.settings,
            activeSection,
          },
        }));
      },
      setSigningPreferences: (input) => {
        set((state) => {
          const nextSigning = {
            ...state.signing,
            ...input,
          };

          if (
            input.signingFormat &&
            input.signingFormat !== state.signing.signingFormat &&
            (state.signing.signingKey?.length ?? 0) > 0
          ) {
            nextSigning.signingKey = "";
          }

          return {
            signing: nextSigning,
          };
        });
      },
      setSshPaths: (input) => {
        set((state) => ({
          ssh: {
            ...state.ssh,
            ...input,
          },
        }));
      },
      setTerminalCursorStyle: (cursorStyle) => {
        set((state) => ({
          terminal: {
            ...state.terminal,
            cursorStyle,
          },
        }));
      },
      setTerminalFontFamily: (fontFamily) => {
        set((state) => ({
          terminal: {
            ...state.terminal,
            fontFamily,
          },
        }));
      },
      setTerminalFontSize: (fontSize) => {
        set((state) => ({
          terminal: {
            ...state.terminal,
            fontSize: clampTerminalFontSize(fontSize),
          },
        }));
      },
      setTerminalFontVisibility: (fontVisibility) => {
        set((state) => ({
          terminal: {
            ...state.terminal,
            fontVisibility,
          },
        }));
      },
      setTerminalLineHeight: (lineHeight) => {
        set((state) => ({
          terminal: {
            ...state.terminal,
            lineHeight: clampTerminalLineHeight(lineHeight),
          },
        }));
      },
      setThemePreference: (theme) => {
        set((state) => ({
          ui: {
            ...state.ui,
            theme,
          },
        }));
      },
      setToasterPosition: (toasterPosition) => {
        set((state) => ({
          ui: {
            ...state.ui,
            toasterPosition,
          },
        }));
      },
      setToolbarLabels: (toolbarLabels) => {
        set((state) => ({
          ui: {
            ...state.ui,
            toolbarLabels,
          },
        }));
      },
    }),
    {
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<AppPreferences>;

        return {
          ...currentState,
          ...persisted,
          ai: {
            ...currentState.ai,
            ...persisted.ai,
          },
          editor: {
            ...currentState.editor,
            ...persisted.editor,
          },
          general: {
            ...currentState.general,
            ...persisted.general,
          },
          network: {
            ...currentState.network,
            ...persisted.network,
          },
          settings: {
            ...currentState.settings,
            ...persisted.settings,
          },
          signing: {
            ...currentState.signing,
            ...persisted.signing,
          },
          ssh: {
            ...currentState.ssh,
            ...persisted.ssh,
          },
          terminal: {
            ...currentState.terminal,
            ...persisted.terminal,
          },
          ui: {
            ...currentState.ui,
            ...persisted.ui,
          },
        };
      },
      name: PREFERENCES_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        ai: state.ai,
        editor: state.editor,
        general: state.general,
        network: state.network,
        settings: {
          activeSection: state.settings.activeSection,
          hasCompletedOnboarding: state.settings.hasCompletedOnboarding,
          lastNonSettingsRoute: state.settings.lastNonSettingsRoute,
          searchQuery: state.settings.searchQuery,
        },
        signing: state.signing,
        ssh: state.ssh,
        terminal: state.terminal,
        ui: state.ui,
      }),
    }
  )
);
