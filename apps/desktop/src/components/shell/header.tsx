import { Button } from "@litgit/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { cn } from "@litgit/ui/lib/utils";
import {
  GearIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
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

  const { activeRepo } = useRootActiveRepoContext();
  const repoPath = activeRepo?.path ?? null;

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
