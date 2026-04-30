import { env } from "@litgit/env/desktop";
import { Button } from "@litgit/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { useWindowEvent } from "@mantine/hooks";
import {
  ArrowDownIcon,
  ArrowsClockwiseIcon,
  ArrowsDownUpIcon,
  ArrowUpIcon,
  CloudArrowUpIcon,
  GitBranchIcon,
  PlayIcon,
  PlugsIcon,
} from "@phosphor-icons/react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { KeyboardShortcutsDialog } from "@/components/shell/footer/keyboard-shortcuts-dialog";
import {
  type ProviderStatusRefreshReason,
  shouldRefreshProviderStatuses,
} from "@/components/shell/footer/provider-status-refresh";
import { FooterZoomControl } from "@/components/shell/footer/zoom-control";
import { useReducerState } from "@/hooks/use-reducer-state";
import {
  isResetZoomShortcut,
  isZoomInShortcut,
  isZoomOutShortcut,
} from "@/lib/keyboard-shortcuts";
import {
  getProviderStatus,
  PROVIDER_STATUS_CHANGED_EVENT,
  type Provider,
  type ProviderStatus,
} from "@/lib/tauri-integrations-client";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import {
  useRepoActions,
  useRepoActiveContext,
  useRepoBranches,
} from "@/stores/repo/repo-selectors";
import { useBranchSearchStore } from "@/stores/ui/use-branch-search-store";

const ZOOM_OPTIONS = [130, 120, 110, 100, 90, 80];
const MIN_ZOOM = ZOOM_OPTIONS.at(-1) ?? 80;
const MAX_ZOOM = ZOOM_OPTIONS[0] ?? 130;
const ZOOM_STEP = 10;
const RELEASE_NOTES_URL = env.VITE_RELEASE_NOTES_URL;
const OAUTH_PROVIDERS: Provider[] = ["github", "gitlab", "bitbucket"];

export default function Footer() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const setSection = usePreferencesStore((state) => state.setSection);
  const { activeRepoId } = useRepoActiveContext();
  const { pullBranch, pushBranch } = useRepoActions();
  const branches = useRepoBranches(activeRepoId);
  const currentBranch = branches.find((branch) => branch.isCurrent);
  const openBranchPalette = useBranchSearchStore((state) => state.open);

  const [zoom, updateZoom] = useReducerState(100);
  const [isFetching, updateIsFetching] = useReducerState(false);
  const [appVersion, updateAppVersion] = useReducerState("dev");
  const [providerStatuses, updateProviderStatuses] = useReducerState<Record<
    Provider,
    ProviderStatus
  > | null>(null);
  const [hasLoadedProviderStatuses, updateHasLoadedProviderStatuses] =
    useReducerState(false);
  const [providerStatusLoadFailed, updateProviderStatusLoadFailed] =
    useReducerState(false);
  const lastProviderStatusRefreshAtRef = useRef<number | null>(null);
  const previousPathnameRef = useRef<string | null>(pathname);
  const providerStatusRefreshInFlightRef = useRef(false);
  const queuedProviderStatusRefreshReasonRef =
    useRef<ProviderStatusRefreshReason | null>(null);
  const queuedProviderStatusRefreshPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let cancelled = false;

    const loadAppVersion = async () => {
      const { getVersion } = await import("@tauri-apps/api/app");
      const version = await getVersion();

      if (!cancelled) {
        updateAppVersion(version);
      }
    };

    loadAppVersion().catch((error: unknown) => {
      if (import.meta.env.DEV) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load app version"
        );
      }

      if (!cancelled) {
        updateAppVersion("dev");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [updateAppVersion]);

  const refreshProviderStatuses = useCallback(
    async (
      reason: ProviderStatusRefreshReason,
      previousPathname: string | null = previousPathnameRef.current
    ) => {
      if (!isTauri()) {
        return;
      }

      if (
        !shouldRefreshProviderStatuses({
          currentPathname: pathname,
          hasLoadedOnce: hasLoadedProviderStatuses,
          lastRefreshAt: lastProviderStatusRefreshAtRef.current,
          now: Date.now(),
          previousPathname,
          reason,
        })
      ) {
        return;
      }

      if (providerStatusRefreshInFlightRef.current) {
        queuedProviderStatusRefreshReasonRef.current = reason;
        queuedProviderStatusRefreshPathnameRef.current = previousPathname;
        return;
      }

      providerStatusRefreshInFlightRef.current = true;

      try {
        const statuses = await getProviderStatus();
        updateProviderStatuses(statuses);
        updateHasLoadedProviderStatuses(true);
        updateProviderStatusLoadFailed(false);
        lastProviderStatusRefreshAtRef.current = Date.now();
      } catch (error: unknown) {
        if (import.meta.env.DEV) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to load provider statuses"
          );
        }

        updateProviderStatuses(null);
        updateProviderStatusLoadFailed(true);
        updateHasLoadedProviderStatuses(true);
      } finally {
        providerStatusRefreshInFlightRef.current = false;

        const queuedReason = queuedProviderStatusRefreshReasonRef.current;
        const queuedPreviousPathname =
          queuedProviderStatusRefreshPathnameRef.current;

        queuedProviderStatusRefreshReasonRef.current = null;
        queuedProviderStatusRefreshPathnameRef.current = null;

        if (queuedReason) {
          await refreshProviderStatuses(queuedReason, queuedPreviousPathname);
        }
      }
    },
    [
      hasLoadedProviderStatuses,
      pathname,
      updateProviderStatuses,
      updateProviderStatusLoadFailed,
      updateHasLoadedProviderStatuses,
    ]
  );

  useEffect(() => {
    refreshProviderStatuses("mount").catch(() => undefined);
  }, [refreshProviderStatuses]);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;
    refreshProviderStatuses("pathname-change", previousPathname).catch(
      () => undefined
    );
  }, [pathname, refreshProviderStatuses]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let oauthCallbackTimeout: number | null = null;
    const unlistenPromise = listen("oauth-callback", () => {
      if (oauthCallbackTimeout !== null) {
        window.clearTimeout(oauthCallbackTimeout);
      }

      oauthCallbackTimeout = window.setTimeout(() => {
        oauthCallbackTimeout = null;
        refreshProviderStatuses("oauth-callback").catch(() => undefined);
      }, 500);
    });

    const handleProviderStatusChanged = () => {
      refreshProviderStatuses("provider-status-changed").catch(() => undefined);
    };

    window.addEventListener(
      PROVIDER_STATUS_CHANGED_EVENT,
      handleProviderStatusChanged
    );

    return () => {
      if (oauthCallbackTimeout !== null) {
        window.clearTimeout(oauthCallbackTimeout);
      }

      window.removeEventListener(
        PROVIDER_STATUS_CHANGED_EVENT,
        handleProviderStatusChanged
      );
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [refreshProviderStatuses]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const handleWindowFocus = () => {
      refreshProviderStatuses("window-focus").catch(() => undefined);
    };

    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [refreshProviderStatuses]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const applyWebviewZoom = async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      await getCurrentWebview().setZoom(zoom / 100);
    };

    applyWebviewZoom().catch((error: unknown) => {
      if (import.meta.env.DEV) {
        toast.error(
          error instanceof Error ? error.message : "Failed to apply zoom"
        );
      }
    });
  }, [zoom]);

  const handleConnectIntegration = useCallback(() => {
    setSection("integrations");

    if (pathname !== "/settings") {
      navigate({ to: "/settings", replace: true }).catch(() => undefined);
    }
  }, [navigate, pathname, setSection]);

  const hasConnectedProviders = OAUTH_PROVIDERS.some(
    (provider) => providerStatuses?.[provider]?.connected
  );
  const showConnectIntegration =
    hasLoadedProviderStatuses &&
    !providerStatusLoadFailed &&
    !hasConnectedProviders;

  useWindowEvent("keydown", (event) => {
    const shouldZoomIn = isZoomInShortcut(event);
    const shouldZoomOut = isZoomOutShortcut(event);
    const shouldResetZoom = isResetZoomShortcut(event);

    if (!(shouldZoomIn || shouldZoomOut || shouldResetZoom)) {
      return;
    }

    event.preventDefault();

    updateZoom((currentZoom) => {
      if (shouldResetZoom) {
        return 100;
      }

      const nextZoom = shouldZoomIn
        ? currentZoom + ZOOM_STEP
        : currentZoom - ZOOM_STEP;

      return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    });
  });

  const handleFetch = useCallback(async () => {
    if (!activeRepoId || isFetching) {
      return;
    }

    updateIsFetching(true);
    try {
      await pullBranch(activeRepoId, "fetch-all");
      toast.success("Fetch Successful", {
        description: "Updated all remotes",
      });
    } catch (error) {
      toast.error("Fetch Failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      updateIsFetching(false);
    }
  }, [activeRepoId, isFetching, pullBranch, updateIsFetching]);

  const handlePush = useCallback(async () => {
    if (!activeRepoId || isFetching) {
      return;
    }

    updateIsFetching(true);
    try {
      await pushBranch(activeRepoId);
      toast.success("Push Successful");
    } catch (error) {
      toast.error("Push Failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      updateIsFetching(false);
    }
  }, [activeRepoId, isFetching, pushBranch, updateIsFetching]);

  const openReleaseNotes = async () => {
    if (isTauri()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(RELEASE_NOTES_URL);
      return;
    }

    window.open(RELEASE_NOTES_URL, "_blank", "noopener,noreferrer");
  };

  const isBranchOnRemote = currentBranch
    ? currentBranch.isRemote || currentBranch.aheadCount !== undefined
    : false;

  const getSyncIcon = () => {
    if (!isBranchOnRemote) {
      return <CloudArrowUpIcon className="size-3" />;
    }

    if (isFetching) {
      return <ArrowsClockwiseIcon className="size-3 animate-spin" />;
    }

    const ahead = currentBranch?.aheadCount ?? 0;
    const behind = currentBranch?.behindCount ?? 0;

    if (ahead > 0 && behind > 0) {
      return <ArrowsDownUpIcon className="size-3" />;
    }

    if (ahead > 0) {
      return <ArrowUpIcon className="size-3" />;
    }

    if (behind > 0) {
      return <ArrowDownIcon className="size-3" />;
    }

    return <ArrowsClockwiseIcon className="size-3" />;
  };

  return (
    <PageShell
      as="footer"
      className="relative z-50 flex h-8 shrink-0 select-none items-center justify-between border-border/80 border-t bg-background/95 font-medium text-muted-foreground text-xs backdrop-blur supports-backdrop-filter:bg-background/80"
    >
      <TooltipProvider delay={1000} timeout={0}>
        <div className="flex items-center gap-0.5 px-0.5">
          {currentBranch ? (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      className="h-5 gap-1.5 rounded-none px-2 font-medium text-xs transition-none hover:bg-transparent hover:text-foreground focus-visible:ring-0! focus-visible:ring-offset-0! dark:hover:bg-transparent"
                      onClick={openBranchPalette}
                      size="xs"
                      variant="ghost"
                    >
                      <GitBranchIcon className="size-3" />
                      <span className="max-w-32 truncate tracking-[0.06em]">
                        {currentBranch.name}
                      </span>
                    </Button>
                  }
                />
                <TooltipContent side="top">
                  Checkout branch/tag...
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      className="h-5 gap-1.5 rounded-none px-2 font-medium text-xs transition-none hover:bg-transparent hover:text-foreground focus-visible:ring-0! focus-visible:ring-offset-0! dark:hover:bg-transparent"
                      onClick={isBranchOnRemote ? handleFetch : handlePush}
                      size="xs"
                      variant="ghost"
                    >
                      {getSyncIcon()}
                      {currentBranch.behindCount || currentBranch.aheadCount ? (
                        <span className="flex items-center gap-1 text-[10px] tracking-tighter">
                          {currentBranch.behindCount ? (
                            <span className="flex items-center">
                              {currentBranch.behindCount}↓
                            </span>
                          ) : null}
                          {currentBranch.aheadCount ? (
                            <span className="flex items-center">
                              {currentBranch.aheadCount}↑
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </Button>
                  }
                />
                <TooltipContent side="top">
                  {isBranchOnRemote ? "Fetch all remotes" : "Push branch"}
                </TooltipContent>
              </Tooltip>
            </>
          ) : null}

          {showConnectIntegration ? (
            <Tooltip>
              <TooltipTrigger>
                <Button
                  className="h-5 gap-1.5 px-2.5 font-semibold text-xs transition-none hover:bg-transparent hover:text-foreground focus-visible:ring-0! focus-visible:ring-offset-0! dark:hover:bg-transparent"
                  onClick={handleConnectIntegration}
                  size="xs"
                  variant="ghost"
                >
                  <PlugsIcon className="size-3" />
                  <span className="tracking-[0.06em]">
                    Connect an integration
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                Open Integrations settings
              </TooltipContent>
            </Tooltip>
          ) : null}

          {import.meta.env.DEV ? (
            <div className="ml-1 flex items-center">
              <Tooltip>
                <TooltipTrigger
                  aria-label="Preview onboarding page"
                  className="group inline-flex h-5 cursor-pointer items-center gap-1.5 border border-amber-500/35 bg-amber-500/15 px-2.5 font-semibold text-foreground/95 text-xs leading-none transition-all hover:border-amber-500/55 hover:bg-amber-500/25 hover:text-foreground"
                  onClick={() => {
                    navigate({ to: "/onboarding", replace: true }).catch(
                      () => undefined
                    );
                  }}
                >
                  <PlayIcon className="size-3 text-amber-600 dark:text-amber-400" />
                  <span className="text-muted-foreground/90 tracking-[0.06em]">
                    Onboarding
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Preview onboarding page
                </TooltipContent>
              </Tooltip>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-4">
          <KeyboardShortcutsDialog />
          <FooterZoomControl
            onSelectZoom={updateZoom}
            zoom={zoom}
            zoomOptions={ZOOM_OPTIONS}
          />

          <div className="flex items-center">
            <Tooltip>
              <TooltipTrigger
                aria-label="App version"
                className="group inline-flex h-5 cursor-pointer items-center gap-1.5 border border-primary/35 bg-primary/20 px-2.5 font-semibold text-foreground/95 text-xs leading-none transition-all hover:border-primary/55 hover:bg-primary/30 hover:text-foreground"
                onClick={() => {
                  openReleaseNotes().catch((error: unknown) => {
                    if (import.meta.env.DEV) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Failed to open release notes"
                      );
                    }
                  });
                }}
              >
                <span className="text-muted-foreground/90 tracking-[0.06em]">
                  Version
                </span>
                <span className="text-foreground">v{appVersion}</span>
              </TooltipTrigger>
              <TooltipContent side="top">View Release Notes</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>
    </PageShell>
  );
}
