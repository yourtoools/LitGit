import { Button } from "@litgit/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@litgit/ui/components/dropdown-menu";
import { Antigravity } from "@litgit/ui/components/ui/svgs/antigravity";
import { Bash } from "@litgit/ui/components/ui/svgs/bash";
import { Linux } from "@litgit/ui/components/ui/svgs/linux";
import { Powershell } from "@litgit/ui/components/ui/svgs/powershell";
import { VisualStudio } from "@litgit/ui/components/ui/svgs/visual-studio";
import { Vscode } from "@litgit/ui/components/ui/svgs/vscode";
import { cn } from "@litgit/ui/lib/utils";
import {
  CaretDownIcon,
  CopyIcon,
  MinusIcon,
  SquareIcon,
  XIcon,
} from "@phosphor-icons/react";
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { isWindowsPlatform } from "@/lib/runtime-platform";
import {
  type ExternalLauncherApp,
  type ExternalLauncherApplication,
  getLauncherApplications,
  openPathWithApplication,
} from "@/lib/tauri-settings-client";
import { useRootActiveRepoContext } from "@/stores/repo/repo-root-selectors";

const TITLEBAR_HEIGHT_CLASS = "h-7";
const CONTROL_BUTTON_BASE_CLASS =
  "tauri-no-drag inline-flex items-center justify-center border-0 bg-transparent text-muted-foreground transition-colors focus-visible:desktop-focus focus-visible:text-foreground";
const CONTROL_BUTTON_SIZE_CLASS = `${TITLEBAR_HEIGHT_CLASS} w-8`;
const CONTROL_BUTTON_HOVER_CLASS = "hover:bg-muted/70 hover:text-foreground";
const CONTROL_BUTTON_CLOSE_HOVER_CLASS =
  "hover:bg-destructive hover:text-destructive-foreground";
const OPEN_ACTION_BUTTON_CLASS =
  "h-6 gap-1 rounded-r-none border-border/60 bg-background/70 px-2 text-[11px] font-medium text-foreground shadow-none hover:bg-background";
const OPEN_MENU_BUTTON_CLASS =
  "h-6 min-w-0 rounded-l-none border-border/60 border-l-0 bg-background/70 px-1.5 text-foreground shadow-none hover:bg-background";
const SELECTED_LAUNCHER_STORAGE_KEY = "litgit:selected-launcher";
const LAUNCHER_ICON_CLASS = "size-[15px] shrink-0";

function ExplorerIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn(LAUNCHER_ICON_CLASS, className)}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M3 7.25h8.1l1.4 1.6H21v8.9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-10.5Z"
        fill="#FFD54F"
      />
      <path
        d="M3 8.25a2 2 0 0 1 2-2h5.55l1.4 1.6H19a2 2 0 0 1 2 2v.4H3v-2Z"
        fill="#64B5F6"
      />
      <path
        d="M3 10.25h18l-1.38 6.08a2 2 0 0 1-1.95 1.56H5.33a2 2 0 0 1-1.95-1.56L3 10.25Z"
        fill="#FFCA28"
      />
    </svg>
  );
}

function LauncherItemIcon({
  application,
  className,
}: {
  application: ExternalLauncherApplication;
  className?: string;
}) {
  switch (application) {
    case "file-manager":
      return <ExplorerIcon className={className} />;
    case "terminal":
      return <Powershell className={cn(LAUNCHER_ICON_CLASS, className)} />;
    case "vscode":
      return <Vscode className={cn(LAUNCHER_ICON_CLASS, className)} />;
    case "visual-studio":
      return <VisualStudio className={cn(LAUNCHER_ICON_CLASS, className)} />;
    case "antigravity":
      return <Antigravity className={cn(LAUNCHER_ICON_CLASS, className)} />;
    case "git-bash":
      return <Bash className={cn(LAUNCHER_ICON_CLASS, className)} />;
    case "wsl":
      return <Linux className={cn(LAUNCHER_ICON_CLASS, className)} />;
    default:
      return <ExplorerIcon className={className} />;
  }
}

export function WindowTitlebar() {
  const isWindows = isWindowsPlatform();
  const tauriRuntime = isTauri();
  const [isMaximized, setIsMaximized] = useState(false);
  const [launcherApplications, setLauncherApplications] = useState<
    ExternalLauncherApp[]
  >([]);
  const [selectedLauncherId, setSelectedLauncherId] =
    useState<ExternalLauncherApplication>("file-manager");
  const { activeRepo } = useRootActiveRepoContext();

  const repoPath = activeRepo?.path ?? null;
  const hasLauncherItems = launcherApplications.length > 0;
  const defaultFileManagerLauncher: ExternalLauncherApp = {
    id: "file-manager",
    label: isWindows ? "File Explorer" : "Files",
  };
  const selectedLauncher =
    launcherApplications.find(
      (launcher) => launcher.id === selectedLauncherId
    ) ??
    (selectedLauncherId === "file-manager" ? defaultFileManagerLauncher : null);

  const handleCopyRepoPath = useCallback(async () => {
    if (!repoPath) {
      return;
    }

    try {
      await navigator.clipboard.writeText(repoPath);
      toast.success("Repository path copied");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to copy repository path";
      toast.error(message);
    }
  }, [repoPath]);

  const handleOpenPath = useCallback(
    async (application: ExternalLauncherApplication) => {
      if (!repoPath) {
        return;
      }

      try {
        await openPathWithApplication({ application, path: repoPath });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to open repository path";
        toast.error(message);
      }
    },
    [repoPath]
  );

  const handleSelectLauncher = useCallback(
    async (application: ExternalLauncherApplication) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SELECTED_LAUNCHER_STORAGE_KEY, application);
      }

      setSelectedLauncherId(application);
      await handleOpenPath(application);
    },
    [handleOpenPath]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedLauncherId = window.localStorage.getItem(
      SELECTED_LAUNCHER_STORAGE_KEY
    );

    if (!storedLauncherId) {
      return;
    }

    setSelectedLauncherId(storedLauncherId as ExternalLauncherApplication);
  }, []);

  useEffect(() => {
    if (!tauriRuntime) {
      return;
    }

    let isDisposed = false;

    const loadLauncherApplications = async () => {
      try {
        const nextApplications = await getLauncherApplications();

        if (!isDisposed) {
          setLauncherApplications(nextApplications);
        }
      } catch {
        if (!isDisposed) {
          setLauncherApplications([]);
        }
      }
    };

    loadLauncherApplications().catch(() => undefined);

    return () => {
      isDisposed = true;
    };
  }, [tauriRuntime]);

  useEffect(() => {
    if (launcherApplications.length === 0) {
      return;
    }

    const hasSelectedLauncher = launcherApplications.some(
      (launcher) => launcher.id === selectedLauncherId
    );

    if (hasSelectedLauncher) {
      return;
    }

    const preferredLauncher =
      launcherApplications.find((launcher) => launcher.id === "vscode") ??
      launcherApplications.find((launcher) => launcher.id === "file-manager") ??
      launcherApplications[0];

    const nextLauncherId = preferredLauncher?.id ?? "file-manager";

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        SELECTED_LAUNCHER_STORAGE_KEY,
        nextLauncherId
      );
    }

    setSelectedLauncherId(nextLauncherId);
  }, [launcherApplications, selectedLauncherId]);

  const syncMaximizedState = useCallback(async () => {
    if (!tauriRuntime) {
      return;
    }

    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const maximized = await getCurrentWindow().isMaximized();
    setIsMaximized(maximized);
  }, [tauriRuntime]);

  useEffect(() => {
    if (!tauriRuntime) {
      return;
    }

    let isDisposed = false;
    let unlistenResize: (() => void) | null = null;

    const bindWindowResizeListener = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();

      const refreshMaximizedState = async () => {
        const maximized = await appWindow.isMaximized();

        if (!isDisposed) {
          setIsMaximized(maximized);
        }
      };

      await refreshMaximizedState();
      unlistenResize = await appWindow.onResized(() => {
        refreshMaximizedState().catch(() => undefined);
      });
    };

    bindWindowResizeListener().catch(() => undefined);

    return () => {
      isDisposed = true;

      if (unlistenResize) {
        unlistenResize();
      }
    };
  }, [tauriRuntime]);

  const handleMinimizeWindow = useCallback(() => {
    if (!tauriRuntime) {
      return;
    }

    const minimizeWindow = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    };

    minimizeWindow().catch(() => undefined);
  }, [tauriRuntime]);

  const handleToggleMaximizeWindow = useCallback(() => {
    if (!tauriRuntime) {
      return;
    }

    const toggleMaximizeWindow = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().toggleMaximize();
      await syncMaximizedState();
    };

    toggleMaximizeWindow().catch(() => undefined);
  }, [syncMaximizedState, tauriRuntime]);

  const handleCloseWindow = useCallback(() => {
    if (!tauriRuntime) {
      return;
    }

    const closeWindow = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    };

    closeWindow().catch(() => undefined);
  }, [tauriRuntime]);

  return (
    <div
      className="flex h-7 shrink-0 select-none items-center justify-between border-border/70 border-b bg-muted/25 pl-3"
      data-tauri-drag-region
    >
      <div
        className="pointer-events-none flex min-w-0 items-center text-[11px] text-muted-foreground uppercase tracking-[0.08em]"
        data-tauri-drag-region
      >
        <span className="truncate font-semibold" data-tauri-drag-region>
          LitGit Desktop
        </span>
      </div>

      {tauriRuntime ? (
        <div
          className="tauri-no-drag flex items-center gap-3"
          data-tauri-drag-region="false"
        >
          <div className="flex items-stretch">
            <Button
              aria-label={
                selectedLauncher
                  ? `Open active repository with ${selectedLauncher.label}`
                  : "Open active repository"
              }
              className={OPEN_ACTION_BUTTON_CLASS}
              disabled={!(repoPath && selectedLauncher)}
              onClick={() => {
                if (!selectedLauncher) {
                  return;
                }

                handleOpenPath(selectedLauncher.id).catch(() => undefined);
              }}
              size="xs"
              variant="outline"
            >
              {selectedLauncher ? (
                <>
                  <LauncherItemIcon application={selectedLauncher.id} />
                  <span>{selectedLauncher.label}</span>
                </>
              ) : (
                <span>Open</span>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label="Choose external tool"
                    className={OPEN_MENU_BUTTON_CLASS}
                    disabled={!repoPath}
                    size="xs"
                    variant="outline"
                  />
                }
              >
                <CaretDownIcon className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-44"
                sideOffset={6}
              >
                {launcherApplications.map((launcher) => (
                  <DropdownMenuItem
                    className="cursor-pointer"
                    key={launcher.id}
                    onClick={() => {
                      handleSelectLauncher(launcher.id).catch(() => undefined);
                    }}
                  >
                    <LauncherItemIcon application={launcher.id} />
                    <span>{launcher.label}</span>
                  </DropdownMenuItem>
                ))}
                {hasLauncherItems ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => {
                    handleCopyRepoPath().catch(() => undefined);
                  }}
                >
                  <CopyIcon className="size-3.5" />
                  <span>Copy path</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-stretch">
            <button
              aria-label="Minimize window"
              className={`${CONTROL_BUTTON_BASE_CLASS} ${CONTROL_BUTTON_SIZE_CLASS} ${CONTROL_BUTTON_HOVER_CLASS}`}
              onClick={handleMinimizeWindow}
              type="button"
            >
              <MinusIcon className="size-3" weight="bold" />
            </button>
            <button
              aria-label={isMaximized ? "Restore window" : "Maximize window"}
              className={`${CONTROL_BUTTON_BASE_CLASS} ${CONTROL_BUTTON_SIZE_CLASS} ${CONTROL_BUTTON_HOVER_CLASS}`}
              onClick={handleToggleMaximizeWindow}
              title={
                isWindows ? "Windows: use Win + Z for Snap Layouts." : undefined
              }
              type="button"
            >
              {isMaximized ? (
                <CopyIcon className="size-3" weight="bold" />
              ) : (
                <SquareIcon className="size-3" weight="bold" />
              )}
            </button>
            <button
              aria-label="Close window"
              className={`${CONTROL_BUTTON_BASE_CLASS} ${CONTROL_BUTTON_SIZE_CLASS} ${CONTROL_BUTTON_CLOSE_HOVER_CLASS}`}
              onClick={handleCloseWindow}
              type="button"
            >
              <XIcon className="size-3" weight="bold" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
