import { env } from "@litgit/env/desktop";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { cn } from "@litgit/ui/lib/utils";
import { useWindowEvent } from "@mantine/hooks";
import {
  ArrowClockwiseIcon,
  PlayIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { isTauri } from "@tauri-apps/api/core";
import { intlFormat } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { KeyboardShortcutsDialog } from "@/components/shell/footer/keyboard-shortcuts-dialog";
import { FooterZoomControl } from "@/components/shell/footer/zoom-control";
import {
  isResetZoomShortcut,
  isZoomInShortcut,
  isZoomOutShortcut,
} from "@/lib/keyboard-shortcuts";
import { useRepoStore } from "@/stores/repo/use-repo-store";

const ZOOM_OPTIONS = [130, 120, 110, 100, 90, 80];
const MIN_ZOOM = ZOOM_OPTIONS.at(-1) ?? 80;
const MAX_ZOOM = ZOOM_OPTIONS[0] ?? 130;
const ZOOM_STEP = 10;
const RELEASE_NOTES_URL = env.VITE_RELEASE_NOTES_URL;

export default function Footer() {
  const navigate = useNavigate();
  const [zoom, setZoom] = useState(100);
  const [appVersion, setAppVersion] = useState("dev");
  const activeRepoId = useRepoStore((state) => state.activeRepoId);
  const repoBackgroundRefreshById = useRepoStore(
    (state) => state.repoBackgroundRefreshById
  );
  const repoLastLoadedAtById = useRepoStore(
    (state) => state.repoLastLoadedAtById
  );
  const setActiveRepo = useRepoStore((state) => state.setActiveRepo);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let cancelled = false;

    const loadAppVersion = async () => {
      const { getVersion } = await import("@tauri-apps/api/app");
      const version = await getVersion();

      if (!cancelled) {
        setAppVersion(version);
      }
    };

    loadAppVersion().catch((error: unknown) => {
      if (import.meta.env.DEV) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load app version"
        );
      }

      if (!cancelled) {
        setAppVersion("dev");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

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

  useWindowEvent("keydown", (event) => {
    const shouldZoomIn = isZoomInShortcut(event);
    const shouldZoomOut = isZoomOutShortcut(event);
    const shouldResetZoom = isResetZoomShortcut(event);

    if (!(shouldZoomIn || shouldZoomOut || shouldResetZoom)) {
      return;
    }

    event.preventDefault();

    setZoom((currentZoom) => {
      if (shouldResetZoom) {
        return 100;
      }

      const nextZoom = shouldZoomIn
        ? currentZoom + ZOOM_STEP
        : currentZoom - ZOOM_STEP;

      return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    });
  });

  const openReleaseNotes = async () => {
    if (isTauri()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(RELEASE_NOTES_URL);
      return;
    }

    window.open(RELEASE_NOTES_URL, "_blank", "noopener,noreferrer");
  };

  const isBackgroundRefreshingRepo = activeRepoId
    ? (repoBackgroundRefreshById[activeRepoId] ?? false)
    : false;
  const lastLoadedAt = activeRepoId
    ? (repoLastLoadedAtById[activeRepoId] ?? null)
    : null;
  let syncStatusLabel = "Ready";

  if (isBackgroundRefreshingRepo) {
    syncStatusLabel = "Checking for updates...";
  } else if (lastLoadedAt) {
    syncStatusLabel = `Updated ${intlFormat(lastLoadedAt, {
      hour: "numeric",
      minute: "numeric",
    })}`;
  }

  const handleManualRepoRefresh = useCallback(() => {
    if (!activeRepoId || isBackgroundRefreshingRepo) {
      return;
    }

    setActiveRepo(activeRepoId, {
      background: true,
      forceRefresh: true,
      refreshMode: "full",
    }).catch((error: unknown) => {
      if (import.meta.env.DEV) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to refresh repository"
        );
      }
    });
  }, [activeRepoId, isBackgroundRefreshingRepo, setActiveRepo]);

  return (
    <PageShell
      as="footer"
      className="relative z-50 flex h-8 shrink-0 select-none items-center justify-between border-border/80 border-t bg-background/95 font-medium text-muted-foreground text-xs backdrop-blur supports-backdrop-filter:bg-background/80"
    >
      <div className="flex items-center gap-3">
        {activeRepoId ? (
          <TooltipProvider delay={1000} timeout={0}>
            <Tooltip>
              <TooltipTrigger
                aria-label="Refresh repository"
                className={cn(
                  "relative flex items-center gap-1 py-1 outline-none transition-colors hover:text-foreground focus-visible:text-foreground",
                  isBackgroundRefreshingRepo
                    ? "cursor-default text-muted-foreground"
                    : "cursor-pointer text-muted-foreground"
                )}
                disabled={isBackgroundRefreshingRepo}
                onClick={handleManualRepoRefresh}
              >
                {isBackgroundRefreshingRepo ? (
                  <SpinnerGapIcon className="size-3 animate-spin text-primary" />
                ) : (
                  <ArrowClockwiseIcon className="size-3" />
                )}
                <span className="leading-none">{syncStatusLabel}</span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {isBackgroundRefreshingRepo
                  ? "Refreshing repository"
                  : "Refresh repository"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>

      <TooltipProvider delay={1000} timeout={0}>
        <div className="flex items-center gap-4">
          <KeyboardShortcutsDialog />
          <FooterZoomControl
            onSelectZoom={setZoom}
            zoom={zoom}
            zoomOptions={ZOOM_OPTIONS}
          />

          {import.meta.env.DEV ? (
            <div className="flex items-center">
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
                  <span className="text-muted-foreground/90 uppercase tracking-[0.06em]">
                    Onboarding
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Preview onboarding page
                </TooltipContent>
              </Tooltip>
            </div>
          ) : null}

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
                <span className="text-muted-foreground/90 uppercase tracking-[0.06em]">
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
