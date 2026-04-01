import { useMemo } from "react";
import { useRepoStore } from "@/stores/repo/use-repo-store";
import { useTabStore } from "@/stores/tabs/use-tab-store";

type TabStoreState = ReturnType<typeof useTabStore.getState>;

export interface TabBarStoreState {
  actions: {
    addTab: TabStoreState["addTab"];
    addTabToGroup: TabStoreState["addTabToGroup"];
    closeTab: TabStoreState["closeTab"];
    dismissEmptyGroupPrompt: TabStoreState["dismissEmptyGroupPrompt"];
    moveGroup: TabStoreState["moveGroup"];
    moveTab: TabStoreState["moveTab"];
    moveTabOutOfGroup: TabStoreState["moveTabOutOfGroup"];
    moveTabWithinGroup: TabStoreState["moveTabWithinGroup"];
    removeGroup: TabStoreState["removeGroup"];
    removeTabFromGroup: TabStoreState["removeTabFromGroup"];
    reopenClosedTab: TabStoreState["reopenClosedTab"];
    ungroup: TabStoreState["ungroup"];
  };
  activeLoadingTabSignals: {
    isLoadingBranches: boolean;
    isLoadingHistory: boolean;
    isLoadingStatus: boolean;
    isLoadingWip: boolean;
    isRefreshingOpenedRepos: boolean;
  };
  emptyGroupPromptId: string | null;
  groups: TabStoreState["groups"];
  tabs: TabStoreState["tabs"];
}

export const useTabBarStoreState = (): TabBarStoreState => {
  const tabs = useTabStore((state) => state.tabs);
  const groups = useTabStore((state) => state.groups);
  const emptyGroupPromptId = useTabStore((state) => state.emptyGroupPromptId);

  const addTab = useTabStore((state) => state.addTab);
  const addTabToGroup = useTabStore((state) => state.addTabToGroup);
  const closeTab = useTabStore((state) => state.closeTab);
  const dismissEmptyGroupPrompt = useTabStore(
    (state) => state.dismissEmptyGroupPrompt
  );
  const moveGroup = useTabStore((state) => state.moveGroup);
  const moveTab = useTabStore((state) => state.moveTab);
  const moveTabOutOfGroup = useTabStore((state) => state.moveTabOutOfGroup);
  const moveTabWithinGroup = useTabStore((state) => state.moveTabWithinGroup);
  const removeGroup = useTabStore((state) => state.removeGroup);
  const removeTabFromGroup = useTabStore((state) => state.removeTabFromGroup);
  const reopenClosedTab = useTabStore((state) => state.reopenClosedTab);
  const ungroup = useTabStore((state) => state.ungroup);

  const isLoadingBranches = useRepoStore((state) => state.isLoadingBranches);
  const isLoadingHistory = useRepoStore((state) => state.isLoadingHistory);
  const isLoadingStatus = useRepoStore((state) => state.isLoadingStatus);
  const isLoadingWip = useRepoStore((state) => state.isLoadingWip);
  const isRefreshingOpenedRepos = useRepoStore(
    (state) => state.isRefreshingOpenedRepos
  );

  const actions = useMemo(
    () => ({
      addTab,
      addTabToGroup,
      closeTab,
      dismissEmptyGroupPrompt,
      moveGroup,
      moveTab,
      moveTabOutOfGroup,
      moveTabWithinGroup,
      removeGroup,
      removeTabFromGroup,
      reopenClosedTab,
      ungroup,
    }),
    [
      addTab,
      addTabToGroup,
      closeTab,
      dismissEmptyGroupPrompt,
      moveGroup,
      moveTab,
      moveTabOutOfGroup,
      moveTabWithinGroup,
      removeGroup,
      removeTabFromGroup,
      reopenClosedTab,
      ungroup,
    ]
  );

  const activeLoadingTabSignals = useMemo(
    () => ({
      isLoadingBranches,
      isLoadingHistory,
      isLoadingStatus,
      isLoadingWip,
      isRefreshingOpenedRepos,
    }),
    [
      isLoadingBranches,
      isLoadingHistory,
      isLoadingStatus,
      isLoadingWip,
      isRefreshingOpenedRepos,
    ]
  );

  return {
    tabs,
    groups,
    emptyGroupPromptId,
    actions,
    activeLoadingTabSignals,
  };
};
