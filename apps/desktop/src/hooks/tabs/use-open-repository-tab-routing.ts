import { useCallback } from "react";
import { useTabUrlState } from "@/hooks/tabs/use-tab-url-state";
import { useRepoStore } from "@/stores/repo/use-repo-store";
import { useTabStore } from "@/stores/tabs/use-tab-store";

interface RouteRepositoryOptions {
  preferredTabId?: string;
}

export function useOpenRepositoryTabRouting() {
  const setActiveRepo = useRepoStore((state) => state.setActiveRepo);
  const { setActiveTabFromUrl } = useTabUrlState();

  const routeRepository = useCallback(
    async (
      repoId: string,
      repoName: string,
      options?: RouteRepositoryOptions
    ) => {
      const tabState = useTabStore.getState();
      const existingTabForRepo = tabState.tabs.find(
        (tab) => tab.repoId === repoId
      );

      if (existingTabForRepo) {
        setActiveTabFromUrl(existingTabForRepo.id);
        await setActiveRepo(repoId);
        return;
      }

      const preferredTabId =
        options?.preferredTabId && options.preferredTabId.length > 0
          ? options.preferredTabId
          : tabState.activeTabId;

      const preferredTab = preferredTabId
        ? tabState.tabs.find((tab) => tab.id === preferredTabId)
        : null;

      const reusableTab =
        preferredTab && preferredTab.repoId === null ? preferredTab : null;

      const targetTabId = reusableTab?.id ?? tabState.addTab();

      if (!targetTabId) {
        return;
      }

      tabState.linkTabToRepo(targetTabId, repoId, repoName);
      setActiveTabFromUrl(targetTabId);
      await setActiveRepo(repoId);
    },
    [setActiveRepo, setActiveTabFromUrl]
  );

  return {
    routeRepository,
  };
}
