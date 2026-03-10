import { Toaster } from "@litgit/ui/components/sonner";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useTheme } from "next-themes";
import { useEffect, useMemo } from "react";
import { RootShell } from "@/components/layout/root-shell";
import { ThemeProvider } from "@/components/providers/theme-provider";
import {
  isEditableTarget,
  isRepositoryRoutePath,
  isToggleTerminalShortcut,
} from "@/lib/keyboard-shortcuts";
import {
  startAutoFetchScheduler,
  stopAutoFetchScheduler,
} from "@/lib/tauri-settings-client";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import type { RepoCommandPreferences } from "@/stores/repo/repo-store-types";
import { useRepoStore } from "@/stores/repo/use-repo-store";
import { useTerminalPanelStore } from "@/stores/ui/use-terminal-panel-store";

import "@/styles/index.css";

export interface RouterAppContext extends Record<string, never> {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "LitGit",
      },
      {
        name: "description",
        content: "Fast, fluent, and minimal Git client",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  const toasterPosition = usePreferencesStore(
    (state) => state.ui.toasterPosition
  );

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <RootPreferenceEffects />
        <RootShell>
          <Outlet />
        </RootShell>
        <Toaster position={toasterPosition} richColors />
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
    </>
  );
}

function RootPreferenceEffects() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const theme = usePreferencesStore((state) => state.ui.theme);
  const autoFetchIntervalMinutes = usePreferencesStore(
    (state) => state.general.autoFetchIntervalMinutes
  );
  const enableProxy = usePreferencesStore((state) => state.network.enableProxy);
  const gpgProgramPath = usePreferencesStore(
    (state) => state.signing.gpgProgramPath
  );
  const proxyAuthEnabled = usePreferencesStore(
    (state) => state.network.proxyAuthEnabled
  );
  const proxyHost = usePreferencesStore((state) => state.network.proxyHost);
  const proxyPort = usePreferencesStore((state) => state.network.proxyPort);
  const proxyType = usePreferencesStore((state) => state.network.proxyType);
  const proxyUsername = usePreferencesStore(
    (state) => state.network.proxyUsername
  );
  const signCommitsByDefault = usePreferencesStore(
    (state) => state.signing.signCommitsByDefault
  );
  const signingFormat = usePreferencesStore(
    (state) => state.signing.signingFormat
  );
  const signingKey = usePreferencesStore((state) => state.signing.signingKey);
  const sslVerification = usePreferencesStore(
    (state) => state.network.sslVerification
  );
  const useGitCredentialManager = usePreferencesStore(
    (state) => state.network.useGitCredentialManager
  );
  const useLocalSshAgent = usePreferencesStore(
    (state) => state.ssh.useLocalAgent
  );
  const lastNonSettingsRoute = usePreferencesStore(
    (state) => state.settings.lastNonSettingsRoute
  );
  const setLastNonSettingsRoute = usePreferencesStore(
    (state) => state.setLastNonSettingsRoute
  );
  const activeRepoId = useRepoStore((state) => state.activeRepoId);
  const activeRepo = useRepoStore(
    (state) =>
      state.openedRepos.find((repo) => repo.id === state.activeRepoId) ?? null
  );
  const { resolvedTheme, setTheme } = useTheme();
  const toggleTerminal = useTerminalPanelStore((state) => state.toggle);
  const schedulerPreferences = useMemo<RepoCommandPreferences>(() => {
    return {
      enableProxy,
      gpgProgramPath,
      proxyAuthEnabled,
      proxyHost,
      proxyPort,
      proxyType,
      proxyUsername,
      signCommitsByDefault,
      signingFormat,
      signingKey,
      sslVerification,
      useGitCredentialManager,
      useLocalSshAgent,
    };
  }, [
    enableProxy,
    gpgProgramPath,
    proxyAuthEnabled,
    proxyHost,
    proxyPort,
    proxyType,
    proxyUsername,
    signCommitsByDefault,
    signingFormat,
    signingKey,
    sslVerification,
    useGitCredentialManager,
    useLocalSshAgent,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleToggleTerminalShortcut = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) {
        return;
      }

      if (!isToggleTerminalShortcut(event)) {
        return;
      }

      if (!(isRepositoryRoutePath(pathname) && activeRepoId)) {
        return;
      }

      event.preventDefault();
      toggleTerminal();
    };

    window.addEventListener("keydown", handleToggleTerminalShortcut);

    return () => {
      window.removeEventListener("keydown", handleToggleTerminalShortcut);
    };
  }, [activeRepoId, pathname, toggleTerminal]);

  useEffect(() => {
    if (pathname !== "/settings" && pathname !== lastNonSettingsRoute) {
      setLastNonSettingsRoute(pathname);
    }
  }, [lastNonSettingsRoute, pathname, setLastNonSettingsRoute]);

  useEffect(() => {
    if (theme) {
      setTheme(theme);
    }
  }, [setTheme, theme]);

  useEffect(() => {
    if (
      !(
        activeRepoId &&
        activeRepo &&
        isRepositoryRoutePath(pathname) &&
        autoFetchIntervalMinutes > 0
      )
    ) {
      stopAutoFetchScheduler().catch(() => undefined);
      return;
    }

    startAutoFetchScheduler({
      intervalMinutes: autoFetchIntervalMinutes,
      preferences: schedulerPreferences as Record<string, unknown>,
      repoPath: activeRepo.path,
    }).catch(() => undefined);

    return () => {
      stopAutoFetchScheduler().catch(() => undefined);
    };
  }, [
    activeRepo,
    activeRepoId,
    autoFetchIntervalMinutes,
    pathname,
    schedulerPreferences,
  ]);

  useEffect(() => {
    if (!resolvedTheme) {
      return;
    }

    document.documentElement.dataset.resolvedTheme = resolvedTheme;
  }, [resolvedTheme]);

  return null;
}
