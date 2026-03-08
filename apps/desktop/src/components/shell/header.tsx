import { Button } from "@litgit/ui/components/button";
import { BellIcon, GearIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { TabBar } from "@/components/tabs/tab-bar";
import { useOpenRepositoryTabRouting } from "@/hooks/tabs/use-open-repository-tab-routing";
import { useTabRepoSync } from "@/hooks/tabs/use-tab-repo-sync";
import { useTabUrlState } from "@/hooks/tabs/use-tab-url-state";
import { isEditableTarget, isPrimaryShortcut } from "@/lib/keyboard-shortcuts";
import type { OpenedRepository } from "@/stores/repo/repo-store-types";
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

  const handleOpenRepoPicker = useCallback(async () => {
    if (isPickingRepo || isInitializingRepository) {
      return;
    }

    const result = await openRepository();

    if (!result) {
      return;
    }

    let repositoryToRoute: OpenedRepository;

    if (result.status === "requires-initial-commit") {
      setIsInitializingRepository(true);
      try {
        const openedRepository = await initializeRepository(result.repository);
        if (!openedRepository) {
          return;
        }
        repositoryToRoute = openedRepository;
      } finally {
        setIsInitializingRepository(false);
      }
    } else {
      repositoryToRoute = result.repository;
    }

    // Smart navigation: check if repo is already open in another tab
    const existingTabForRepo = tabs.find(
      (tab) => tab.repoId === repositoryToRoute.id
    );

    if (existingTabForRepo) {
      // Navigate to existing tab instead of creating a duplicate
      setActiveTabFromUrl(existingTabForRepo.id);
      return;
    }

    // Replace current tab's repo with the newly picked one
    if (activeTabId) {
      linkTabToRepo(activeTabId, repositoryToRoute.id, repositoryToRoute.name);
      setActiveTabFromUrl(activeTabId);
    } else {
      // Fallback to normal routing if no active tab
      await routeRepository(repositoryToRoute.id, repositoryToRoute.name);
    }
  }, [
    isPickingRepo,
    isInitializingRepository,
    openRepository,
    initializeRepository,
    tabs,
    activeTabId,
    linkTabToRepo,
    setActiveTabFromUrl,
    routeRepository,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleGlobalOpenShortcut = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      if (!isPrimaryShortcut(event, "o")) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      if (isPickingRepo || isInitializingRepository) {
        return;
      }

      event.preventDefault();

      handleOpenRepoPicker().catch(() => {
        return;
      });
    };

    window.addEventListener("keydown", handleGlobalOpenShortcut);

    return () => {
      window.removeEventListener("keydown", handleGlobalOpenShortcut);
    };
  }, [handleOpenRepoPicker, isInitializingRepository, isPickingRepo]);

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
    </header>
  );
}
