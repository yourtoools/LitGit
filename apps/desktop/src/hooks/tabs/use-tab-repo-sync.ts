import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useRepoStore } from "@/stores/repo/use-repo-store";
import { useTabStore } from "@/stores/tabs/use-tab-store";

export function useTabRepoSync() {
  const clearActiveRepo = useRepoStore((state) => state.clearActiveRepo);
  const openedRepos = useRepoStore((state) => state.openedRepos);
  const refreshOpenedRepositories = useRepoStore(
    (state) => state.refreshOpenedRepositories
  );
  const setActiveRepo = useRepoStore((state) => state.setActiveRepo);
  const activeTabId = useTabStore((state) => state.activeTabId);
  const activeTabRepoId = useTabStore((state) => {
    const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
    return activeTab?.repoId ?? null;
  });
  const prevOpenedRepos = useRef(openedRepos);
  const prevActiveTabState = useRef<{
    repoId: string | null;
    tabId: string | null;
  } | null>(null);

  useEffect(() => {
    const previousState = prevActiveTabState.current;
    const didTabChange = previousState?.tabId !== activeTabId;
    const didRepoBindingChange = previousState?.repoId !== activeTabRepoId;

    prevActiveTabState.current = {
      repoId: activeTabRepoId,
      tabId: activeTabId,
    };

    if (!(didTabChange || didRepoBindingChange)) {
      return;
    }

    if (activeTabRepoId) {
      const activeRepoId = useRepoStore.getState().activeRepoId;

      if (didTabChange) {
        setActiveRepo(activeTabRepoId, { forceRefresh: true }).catch(
          (error: unknown) => {
            if (import.meta.env.DEV) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Failed to refresh active repository"
              );
            }
          }
        );
        return;
      }

      if (activeRepoId !== activeTabRepoId) {
        setActiveRepo(activeTabRepoId).catch((error: unknown) => {
          if (import.meta.env.DEV) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Failed to sync active repository"
            );
          }
        });
      }

      return;
    }

    if (useRepoStore.getState().activeRepoId !== null) {
      clearActiveRepo();
    }

    refreshOpenedRepositories().catch((error: unknown) => {
      if (import.meta.env.DEV) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to refresh recent repositories"
        );
      }
    });
  }, [
    activeTabId,
    activeTabRepoId,
    clearActiveRepo,
    refreshOpenedRepositories,
    setActiveRepo,
  ]);

  useEffect(() => {
    const previousRepoIds = new Set(
      prevOpenedRepos.current.map((repo) => repo.id)
    );
    const currentRepoIds = new Set(openedRepos.map((repo) => repo.id));
    const newRepos = openedRepos.filter(
      (repo) => !previousRepoIds.has(repo.id)
    );
    const removedRepoIds = prevOpenedRepos.current
      .filter((repo) => !currentRepoIds.has(repo.id))
      .map((repo) => repo.id);

    if (removedRepoIds.length > 0) {
      const removedRepoIdSet = new Set(removedRepoIds);
      const currentTabState = useTabStore.getState();
      const tabsToUnlink = currentTabState.tabs.filter(
        (tab) => tab.repoId && removedRepoIdSet.has(tab.repoId)
      );

      for (const tab of tabsToUnlink) {
        currentTabState.unlinkTabFromRepo(tab.id);
      }
    }

    for (const newRepo of newRepos) {
      const currentTabState = useTabStore.getState();
      const existingTabForRepo = currentTabState.tabs.find(
        (tab) => tab.repoId === newRepo.id
      );

      if (existingTabForRepo) {
        currentTabState.setActiveTab(existingTabForRepo.id);
        continue;
      }

      const activeTab = currentTabState.tabs.find(
        (tab) => tab.id === currentTabState.activeTabId
      );

      if (activeTab && activeTab.repoId === null) {
        currentTabState.linkTabToRepo(activeTab.id, newRepo.id, newRepo.name);
        continue;
      }

      const newTabId = currentTabState.addTab();

      if (newTabId) {
        currentTabState.linkTabToRepo(newTabId, newRepo.id, newRepo.name);
      }
    }

    prevOpenedRepos.current = openedRepos;
  }, [openedRepos]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    (globalThis as Record<string, unknown>).__tabStore = useTabStore;
    (globalThis as Record<string, unknown>).__repoStore = useRepoStore;
  }, []);
}
