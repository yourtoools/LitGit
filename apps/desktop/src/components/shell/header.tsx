import { Button } from "@litgit/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@litgit/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { Antigravity } from "@litgit/ui/components/ui/svgs/antigravity";
import { Bash } from "@litgit/ui/components/ui/svgs/bash";
import { Linux } from "@litgit/ui/components/ui/svgs/linux";
import { Powershell } from "@litgit/ui/components/ui/svgs/powershell";
import { VisualStudio } from "@litgit/ui/components/ui/svgs/visual-studio";
import { Vscode } from "@litgit/ui/components/ui/svgs/vscode";
import { Cursor } from "@litgit/ui/components/ui/svgs/cursor";
import { CursorDark } from "@litgit/ui/components/ui/svgs/cursor-dark";
import { cn } from "@litgit/ui/lib/utils";
import {
  CaretDownIcon,
  CopyIcon,
  DesktopIcon,
  GearIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { isTauri } from "@tauri-apps/api/core";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { WindowTitlebar } from "@/components/shell/window-titlebar";
import { TabBar } from "@/components/tabs/tab-bar";
import { GitIdentityDialog } from "@/components/views/git-identity-dialog";
import { RepositoryInitializeDialog } from "@/components/views/repository-initialize-dialog";
import { useOpenRepositoryTabRouting } from "@/hooks/tabs/use-open-repository-tab-routing";
import { useTabRepoSync } from "@/hooks/tabs/use-tab-repo-sync";
import { useTabUrlState } from "@/hooks/tabs/use-tab-url-state";
import {
  isEditableTarget,
  isOpenRepositoryChordEndShortcut,
  isOpenRepositoryChordStartShortcut,
  isPrimaryShortcut,
} from "@/lib/keyboard-shortcuts";
import { getRepoGitIdentity } from "@/lib/tauri-repo-client";
import {
  type ExternalLauncherApp,
  type ExternalLauncherApplication,
  getLauncherApplications,
  openPathWithApplication,
} from "@/lib/tauri-settings-client";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import { useRootActiveRepoContext } from "@/stores/repo/repo-root-selectors";
import type {
  GitIdentityStatus,
  GitIdentityWriteInput,
  OpenedRepository,
  PickedRepositorySelection,
} from "@/stores/repo/repo-store-types";
import { useRepoStore } from "@/stores/repo/use-repo-store";
import { useTabStore } from "@/stores/tabs/use-tab-store";
import { useTerminalPanelStore } from "@/stores/ui/use-terminal-panel-store";

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
  const { resolvedTheme } = useTheme();

  switch (application) {
    case "file-manager":
      return <ExplorerIcon className={className} />;
    case "terminal":
      return <Powershell className={cn(LAUNCHER_ICON_CLASS, className)} />;
    case "vscode":
      return <Vscode className={cn(LAUNCHER_ICON_CLASS, className)} />;
    case "cursor":
      if (resolvedTheme === "dark") {
        return <CursorDark className={cn(LAUNCHER_ICON_CLASS, className)} />;
      }
      return <Cursor className={cn(LAUNCHER_ICON_CLASS, className)} />;
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

export default function Header() {
  useTabRepoSync();
  const navigate = useNavigate();

  const openRepository = useRepoStore((state) => state.openRepository);
  const initializeRepository = useRepoStore(
    (state) => state.initializeRepository
  );
  const isPickingRepo = useRepoStore((state) => state.isPickingRepo);
  const { routeRepository } = useOpenRepositoryTabRouting();
  const { activeTabId, setActiveTabFromUrl } = useTabUrlState();
  const resetSettingsSearch = usePreferencesStore(
    (state) => state.resetSettingsSearch
  );
  const setSection = usePreferencesStore((state) => state.setSection);
  const toolbarLabels = usePreferencesStore((state) => state.ui.toolbarLabels);
  const tabs = useTabStore((state) => state.tabs);
  const linkTabToRepo = useTabStore((state) => state.linkTabToRepo);

  const [isInitializingRepository, setIsInitializingRepository] =
    useState(false);
  const [isGitIdentityDialogOpen, setIsGitIdentityDialogOpen] = useState(false);
  const [gitIdentityStatus, setGitIdentityStatus] =
    useState<GitIdentityStatus | null>(null);
  const [pendingRepoInitialization, setPendingRepoInitialization] =
    useState<PickedRepositorySelection | null>(null);
  const openRepositoryChordTimeoutRef = useRef<number | null>(null);

  // Launcher state for "Open With" feature
  const tauriRuntime = isTauri();
  const { activeRepo } = useRootActiveRepoContext();
  const [launcherApplications, setLauncherApplications] = useState<
    ExternalLauncherApp[]
  >([]);
  const [selectedLauncherId, setSelectedLauncherId] =
    useState<ExternalLauncherApplication>("file-manager");
  const repoPath = activeRepo?.path ?? null;
  const hasLauncherItems = launcherApplications.length > 0;

  const selectedLauncher = launcherApplications.find(
    (launcher) => launcher.id === selectedLauncherId
  );

  // Terminal state
  const isTerminalPanelOpen = useTerminalPanelStore((state) => state.isOpen);
  const toggleTerminalPanel = useTerminalPanelStore((state) => state.toggle);

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

  const clearOpenRepositoryChord = useCallback(() => {
    if (openRepositoryChordTimeoutRef.current !== null) {
      window.clearTimeout(openRepositoryChordTimeoutRef.current);
      openRepositoryChordTimeoutRef.current = null;
    }
  }, []);

  const queueOpenRepositoryChord = useCallback(() => {
    clearOpenRepositoryChord();
    openRepositoryChordTimeoutRef.current = window.setTimeout(() => {
      openRepositoryChordTimeoutRef.current = null;
    }, 1500);
  }, [clearOpenRepositoryChord]);

  const routePickedRepository = useCallback(
    async (repositoryToRoute: OpenedRepository) => {
      const existingTabForRepo = tabs.find(
        (tab) => tab.repoId === repositoryToRoute.id
      );

      if (existingTabForRepo) {
        setActiveTabFromUrl(existingTabForRepo.id);
        return;
      }

      if (activeTabId) {
        linkTabToRepo(
          activeTabId,
          repositoryToRoute.id,
          repositoryToRoute.name
        );
        setActiveTabFromUrl(activeTabId);
        return;
      }

      await routeRepository(repositoryToRoute.id, repositoryToRoute.name);
    },
    [activeTabId, linkTabToRepo, routeRepository, setActiveTabFromUrl, tabs]
  );

  const handleOpenRepoPicker = useCallback(async () => {
    if (isPickingRepo || isInitializingRepository) {
      return;
    }

    const result = await openRepository();

    if (!result) {
      return;
    }

    if (result.status === "requires-initial-commit") {
      setPendingRepoInitialization(result.repository);
      return;
    }

    await routePickedRepository(result.repository);
  }, [
    isPickingRepo,
    isInitializingRepository,
    openRepository,
    routePickedRepository,
  ]);

  const triggerOpenRepositoryPicker = useCallback(() => {
    handleOpenRepoPicker().catch(() => {
      return;
    });
  }, [handleOpenRepoPicker]);

  const completeRepositoryInitialization = useCallback(
    async (gitIdentity?: GitIdentityWriteInput | null) => {
      if (!(pendingRepoInitialization && !isInitializingRepository)) {
        return;
      }

      setIsInitializingRepository(true);

      try {
        const openedRepository = await initializeRepository(
          pendingRepoInitialization,
          gitIdentity
        );

        if (!openedRepository) {
          return;
        }

        setPendingRepoInitialization(null);
        setIsGitIdentityDialogOpen(false);
        await routePickedRepository(openedRepository);
      } finally {
        setIsInitializingRepository(false);
      }
    },
    [
      initializeRepository,
      isInitializingRepository,
      pendingRepoInitialization,
      routePickedRepository,
    ]
  );

  const handleInitializeRepository = useCallback(async () => {
    if (!(pendingRepoInitialization && !isInitializingRepository)) {
      return;
    }

    const identityStatus = await getRepoGitIdentity(
      pendingRepoInitialization.path
    );

    if (identityStatus.effective.isComplete) {
      await completeRepositoryInitialization();
      return;
    }

    setGitIdentityStatus(identityStatus);
    setIsGitIdentityDialogOpen(true);
  }, [
    completeRepositoryInitialization,
    isInitializingRepository,
    pendingRepoInitialization,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hasOpenRepositoryChord = () => {
      return openRepositoryChordTimeoutRef.current !== null;
    };

    const shouldIgnoreShortcut = (event: KeyboardEvent) => {
      return event.repeat || isEditableTarget(event.target);
    };

    const handleOpenRepositoryChord = (event: KeyboardEvent) => {
      if (!hasOpenRepositoryChord()) {
        return false;
      }

      if (isOpenRepositoryChordEndShortcut(event)) {
        event.preventDefault();
        clearOpenRepositoryChord();
        triggerOpenRepositoryPicker();
        return true;
      }

      if (event.key !== "Meta" && event.key !== "Control") {
        clearOpenRepositoryChord();
      }

      return true;
    };

    const handleGlobalOpenShortcut = (event: KeyboardEvent) => {
      if (shouldIgnoreShortcut(event)) {
        return;
      }

      if (isOpenRepositoryChordStartShortcut(event)) {
        queueOpenRepositoryChord();
        return;
      }

      if (handleOpenRepositoryChord(event)) {
        return;
      }

      if (!isPrimaryShortcut(event, "o")) {
        return;
      }

      event.preventDefault();
      triggerOpenRepositoryPicker();
    };

    window.addEventListener("keydown", handleGlobalOpenShortcut);

    return () => {
      clearOpenRepositoryChord();
      window.removeEventListener("keydown", handleGlobalOpenShortcut);
    };
  }, [
    clearOpenRepositoryChord,
    queueOpenRepositoryChord,
    triggerOpenRepositoryPicker,
  ]);

  return (
    <header className="bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <WindowTitlebar />
      <PageShell className="flex h-10 w-full min-w-0 items-center gap-2 border-border/80 border-b">
        <div className="hidden min-w-0 flex-1 items-center gap-1 overflow-hidden md:flex">
          <TabBar />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/* Open With Dropdown */}
          {tauriRuntime ? (
            <div className="flex items-stretch">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label={
                        selectedLauncher
                          ? `Open active repository with ${selectedLauncher.label}`
                          : "Open active repository in external application"
                      }
                      className="focus-visible:desktop-focus h-7 gap-1 rounded-r-none border-border/60 px-2 text-[0.7rem] focus-visible:ring-0! focus-visible:ring-offset-0!"
                      disabled={!repoPath}
                      onClick={() => {
                        if (selectedLauncher) {
                          handleOpenPath(selectedLauncher.id).catch(
                            () => undefined
                          );
                        } else if (launcherApplications[0]) {
                          handleOpenPath(launcherApplications[0].id).catch(
                            () => undefined
                          );
                        }
                      }}
                      size="sm"
                      variant="outline"
                    >
                      {selectedLauncher ? (
                        <LauncherItemIcon application={selectedLauncher.id} />
                      ) : (
                        <DesktopIcon className="size-3.5" />
                      )}
                      <span
                        className={cn("text-xs", !toolbarLabels && "hidden")}
                      >
                        {selectedLauncher?.label ?? "Open"}
                      </span>
                    </Button>
                  }
                />
                <TooltipContent
                  className={cn(toolbarLabels && "hidden")}
                  side="bottom"
                >
                  {selectedLauncher
                    ? `Open with ${selectedLauncher.label}`
                    : "Open with external app"}
                </TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label="Choose external application"
                      className="focus-visible:desktop-focus-strong h-7 min-w-0 rounded-l-none border-border/60 border-l-0 px-1.5 focus-visible:ring-0! focus-visible:ring-offset-0!"
                      disabled={!repoPath}
                      size="sm"
                      variant="outline"
                    >
                      <CaretDownIcon className="size-3" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="min-w-44">
                  {launcherApplications.map((launcher) => (
                    <DropdownMenuItem
                      className="cursor-pointer gap-2"
                      key={launcher.id}
                      onClick={() => {
                        setSelectedLauncherId(launcher.id);
                        handleOpenPath(launcher.id).catch(() => undefined);
                      }}
                    >
                      <LauncherItemIcon application={launcher.id} />
                      <span>{launcher.label}</span>
                    </DropdownMenuItem>
                  ))}
                  {hasLauncherItems ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    className="cursor-pointer gap-2"
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
          ) : null}

          {/* Terminal Toggle */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Toggle terminal panel"
                  className="focus-visible:desktop-focus shrink-0 focus-visible:ring-0! focus-visible:ring-offset-0!"
                  disabled={!repoPath}
                  onClick={toggleTerminalPanel}
                  size={toolbarLabels ? "default" : "icon"}
                  variant="ghost"
                >
                  <TerminalWindowIcon
                    className={cn(
                      "size-4",
                      isTerminalPanelOpen && "text-primary"
                    )}
                  />
                  <span className={cn("text-xs", !toolbarLabels && "hidden")}>
                    Terminal
                  </span>
                </Button>
              }
            />
            <TooltipContent
              className={cn(toolbarLabels && "hidden")}
              side="bottom"
            >
              {isTerminalPanelOpen ? "Hide terminal" : "Show terminal"}
            </TooltipContent>
          </Tooltip>

          {/* Settings */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Workspace settings"
                  className="focus-visible:desktop-focus shrink-0 focus-visible:ring-0! focus-visible:ring-offset-0!"
                  onClick={() => {
                    resetSettingsSearch();
                    setSection("general");
                    navigate({ to: "/settings" }).catch(() => undefined);
                  }}
                  size={toolbarLabels ? "default" : "icon"}
                  variant="ghost"
                >
                  <GearIcon className="size-4" />
                  <span className={cn("text-xs", !toolbarLabels && "hidden")}>
                    Settings
                  </span>
                </Button>
              }
            />
            <TooltipContent
              className={cn(toolbarLabels && "hidden")}
              side="bottom"
            >
              Settings
            </TooltipContent>
          </Tooltip>
        </div>
      </PageShell>
      <RepositoryInitializeDialog
        isInitializing={isInitializingRepository}
        isRepositoryInitialized={
          pendingRepoInitialization?.isGitRepository ?? false
        }
        onConfirm={() => {
          handleInitializeRepository().catch(() => {
            return;
          });
        }}
        onOpenChange={(open) => {
          if (!(open || isInitializingRepository)) {
            setPendingRepoInitialization(null);
            setIsGitIdentityDialogOpen(false);
          }
        }}
        open={Boolean(pendingRepoInitialization)}
        repositoryName={pendingRepoInitialization?.name ?? "repository"}
      />
      <GitIdentityDialog
        description="LitGit needs your Git author name and email before it can create the first commit. This will be saved to your global Git config."
        identityStatus={gitIdentityStatus}
        onConfirm={async (gitIdentity) => {
          await completeRepositoryInitialization(gitIdentity);
        }}
        onOpenChange={setIsGitIdentityDialogOpen}
        open={isGitIdentityDialogOpen}
        submitLabel="Save and create first commit"
        title="Set your global Git identity"
      />
    </header>
  );
}
