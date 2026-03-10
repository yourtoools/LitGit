import { env } from "@litgit/env/desktop";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { KeyboardShortcutsDialog } from "@/components/shell/footer/keyboard-shortcuts-dialog";
import { FooterZoomControl } from "@/components/shell/footer/zoom-control";
import {
  isResetZoomShortcut,
  isZoomInShortcut,
  isZoomOutShortcut,
} from "@/lib/keyboard-shortcuts";

const ZOOM_OPTIONS = [130, 120, 110, 100, 90, 80];
const MIN_ZOOM = ZOOM_OPTIONS.at(-1) ?? 80;
const MAX_ZOOM = ZOOM_OPTIONS[0] ?? 130;
const ZOOM_STEP = 10;
const RELEASE_NOTES_URL = env.VITE_RELEASE_NOTES_URL;

export default function Footer() {
  const [zoom, setZoom] = useState(100);
  const [appVersion, setAppVersion] = useState("dev");

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleZoomShortcut = (event: KeyboardEvent) => {
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
    };

    window.addEventListener("keydown", handleZoomShortcut);

    return () => {
      window.removeEventListener("keydown", handleZoomShortcut);
    };
  }, []);

  const openReleaseNotes = async () => {
    if (isTauri()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(RELEASE_NOTES_URL);
      return;
    }

    window.open(RELEASE_NOTES_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <PageShell
      as="footer"
      className="relative z-50 flex shrink-0 select-none items-center justify-between border-border/50 border-t bg-background py-1.5 font-medium text-muted-foreground text-xs"
    >
      <div className="flex items-center gap-3" />

      <TooltipProvider delay={1000} timeout={0}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <KeyboardShortcutsDialog />
            <FooterZoomControl
              onSelectZoom={setZoom}
              zoom={zoom}
              zoomOptions={ZOOM_OPTIONS}
            />
          </div>

          <div className="flex items-center">
            <Tooltip>
              <TooltipTrigger
                aria-label="App version"
                className="flex h-4.5 cursor-pointer items-center border border-border/50 bg-muted/50 px-1.5 py-0.5 text-foreground text-xs leading-none transition-colors hover:text-foreground/80"
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
                Version {appVersion}
              </TooltipTrigger>
              <TooltipContent side="top">View Release Note</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>
    </PageShell>
  );
}
