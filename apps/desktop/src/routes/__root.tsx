import { Toaster } from "@litgit/ui/components/sonner";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useReducer } from "react";
import { GlobalGitAuthDialog } from "@/components/auth/global-git-auth-dialog";
import { RootShell } from "@/components/layout/root-shell";
import { ThemeProvider } from "@/components/providers/theme-provider";
import {
  isEditableTarget,
  isRepositoryRoutePath,
  isToggleTerminalShortcut,
} from "@/lib/keyboard-shortcuts";
import { RUNTIME_PLATFORM_DATA_ATTRIBUTE } from "@/lib/runtime-platform";
import {
  getGitIdentityStatus,
  getSettingsBackendCapabilities,
  startAutoFetchScheduler,
  stopAutoFetchScheduler,
} from "@/lib/tauri-settings-client";
import {
  useRootAutoFetchIntervalMinutes,
  useRootOnboardingPreferences,
  useRootSchedulerPreferences,
  useRootThemePreference,
  useRootToasterPosition,
} from "@/stores/preferences/preferences-root-selectors";
import { useRootActiveRepoContext } from "@/stores/repo/repo-root-selectors";
import { useTerminalPanelStore } from "@/stores/ui/use-terminal-panel-store";

import "@/styles/index.css";

interface RouterAppContext extends Record<string, never> {}

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

const isTerminalPanelTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("[data-integrated-terminal-panel='true']"));
};

function RootComponent() {
  const toasterPosition = useRootToasterPosition();

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
        <GlobalGitAuthDialog />
      </ThemeProvider>
      {/* <TanStackRouterDevtools position="bottom-left" /> */}
    </>
  );
}

function RootPreferenceEffects() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const theme = useRootThemePreference();
  const autoFetchIntervalMinutes = useRootAutoFetchIntervalMinutes();
  const schedulerPreferences = useRootSchedulerPreferences();
  const {
    hasCompletedOnboarding,
    lastNonSettingsRoute,
    setLastNonSettingsRoute,
  } = useRootOnboardingPreferences();
  const { activeRepo, activeRepoId } = useRootActiveRepoContext();
  const { resolvedTheme, setTheme } = useTheme();
  const toggleTerminal = useTerminalPanelStore((state) => state.toggle);
  const [isGitIdentityReady, setIsGitIdentityReady] = useReducer(
    (_previous: boolean | null, next: boolean | null) => next,
    null
  );

  useEffect(() => {
    let cancelled = false;

    getGitIdentityStatus(null)
      .then((status) => {
        if (!cancelled) {
          setIsGitIdentityReady(status.effective.isComplete);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsGitIdentityReady(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isGitIdentityReady === null) {
      return;
    }

    if (pathname === "/onboarding" || pathname === "/settings") {
      return;
    }

    if (hasCompletedOnboarding && isGitIdentityReady) {
      return;
    }

    navigate({ to: "/onboarding", replace: true }).catch(() => undefined);
  }, [hasCompletedOnboarding, isGitIdentityReady, navigate, pathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleToggleTerminalShortcut = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        (isEditableTarget(event.target) && !isTerminalPanelTarget(event.target))
      ) {
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
    if (
      pathname !== "/settings" &&
      pathname !== "/onboarding" &&
      pathname !== lastNonSettingsRoute
    ) {
      setLastNonSettingsRoute(pathname);
    }
  }, [lastNonSettingsRoute, pathname, setLastNonSettingsRoute]);

  const applyThemePreference = useCallback(() => {
    if (theme) {
      setTheme(theme);
    }
  }, [setTheme, theme]);

  useEffect(applyThemePreference, [applyThemePreference]);

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

  useEffect(() => {
    let cancelled = false;

    getSettingsBackendCapabilities()
      .then((capabilities) => {
        if (cancelled || typeof document === "undefined") {
          return;
        }

        document.documentElement.dataset[RUNTIME_PLATFORM_DATA_ATTRIBUTE] =
          capabilities.runtimePlatform;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
