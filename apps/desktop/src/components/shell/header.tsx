import { Button } from "@litgit/ui/components/button";
import { BellIcon, GearIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { TabBar } from "@/components/tabs/tab-bar";
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
import type {
  OpenedRepository,
  PickedRepositorySelection,
} from "@/stores/repo/repo-store-types";
import { useRepoStore } from "@/stores/repo/use-repo-store";
import { useTabStore } from "@/stores/tabs/use-tab-store";

export default function Header() {
  useTabRepoSync();

  const openRepository = useRepoStore((state) => state.openRepository);
  const initializeRepository = useRepoStore(
    (state) => state.initializeRepository
  );
  const isPickingRepo = useRepoStore((state) => state.isPickingRepo);
  const { routeRepository } = useOpenRepositoryTabRouting();
  const { activeTabId, setActiveTabFromUrl } = useTabUrlState();
  const tabs = useTabStore((state) => state.tabs);
  const linkTabToRepo = useTabStore((state) => state.linkTabToRepo);

  const [isInitializingRepository, setIsInitializingRepository] =
    useState(false);
  const [pendingRepoInitialization, setPendingRepoInitialization] =
    useState<PickedRepositorySelection | null>(null);
  const openRepositoryChordTimeoutRef = useRef<number | null>(null);

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

  const handleInitializeRepository = useCallback(async () => {
    if (!(pendingRepoInitialization && !isInitializingRepository)) {
      return;
    }

    setIsInitializingRepository(true);

    try {
      const openedRepository = await initializeRepository(
        pendingRepoInitialization
      );

      if (!openedRepository) {
        return;
      }

      setPendingRepoInitialization(null);
      await routePickedRepository(openedRepository);
    } finally {
      setIsInitializingRepository(false);
    }
  }, [
    initializeRepository,
    isInitializingRepository,
    pendingRepoInitialization,
    routePickedRepository,
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
    <header className="border-border/80 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <PageShell className="flex h-14 w-full min-w-0 items-center gap-2">
        <div className="hidden min-w-0 flex-1 items-center gap-1 overflow-hidden md:flex">
          <TabBar />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 border-border border-l pl-2 sm:pl-3">
          <Button
            aria-label="Notifications"
            disabled
            size="icon"
            variant="outline"
          >
            <BellIcon />
          </Button>
          <Button
            aria-label="Workspace settings"
            className="hidden sm:inline-flex"
            disabled
            size="icon"
            variant="outline"
          >
            <GearIcon />
          </Button>
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
          }
        }}
        open={Boolean(pendingRepoInitialization)}
        repositoryName={pendingRepoInitialization?.name ?? "repository"}
      />
    </header>
  );
}
