import {
  closeHistoryWithLimit,
  createDefaultState,
  getDefaultTabTitle,
  getEmptyGroupPromptId,
  normalizeTabOrder,
  reorderTabsWithinGroup,
} from "@/stores/tabs/tab-store.helpers";
import type {
  TabStoreGet,
  TabStoreSet,
} from "@/stores/tabs/tab-store.slice-types";
import type { Tab, TabStoreState } from "@/stores/tabs/tab-types";

const DEFAULT_TAB_TITLE = getDefaultTabTitle();

type TabsCoreSliceKeys =
  | "addTab"
  | "closeTab"
  | "closeTabsForDeletedRepos"
  | "linkTabToRepo"
  | "moveTab"
  | "moveTabOutOfGroup"
  | "moveTabWithinGroup"
  | "setActiveTab"
  | "unlinkTabFromRepo";

export const createTabsCoreSlice = (
  set: TabStoreSet,
  get: TabStoreGet
): Pick<TabStoreState, TabsCoreSliceKeys> => ({
  addTab: () => {
    const newTabId = crypto.randomUUID();
    set((state) => {
      const nextTabs = [
        ...state.tabs,
        {
          id: newTabId,
          title: DEFAULT_TAB_TITLE,
          repoId: null,
          groupId: null,
          order: state.tabs.length,
        },
      ];

      return {
        tabs: nextTabs,
        activeTabId: newTabId,
      };
    });

    return newTabId;
  },
  closeTab: (id) => {
    set((state) => {
      const sortedTabs = [...state.tabs].sort((a, b) => a.order - b.order);
      const closingIndex = sortedTabs.findIndex((tab) => tab.id === id);

      if (closingIndex < 0) {
        return state;
      }

      const closingTab = sortedTabs[closingIndex];

      if (!closingTab) {
        return state;
      }

      const remainingTabs = normalizeTabOrder(
        sortedTabs.filter((tab) => tab.id !== id)
      );
      const nextGroups = state.groups.map((group) => ({
        ...group,
        tabIds: group.tabIds.filter((tabId) => tabId !== id),
      }));
      const nextClosedHistory = closeHistoryWithLimit(state.closedTabHistory, [
        closingTab,
      ]);

      if (remainingTabs.length === 0) {
        const defaultState = createDefaultState();

        return {
          tabs: defaultState.tabs,
          groups: [],
          activeTabId: defaultState.activeTabId,
          closedTabHistory: nextClosedHistory,
          emptyGroupPromptId: null,
        };
      }

      const nextActiveTabId =
        state.activeTabId === id
          ? (remainingTabs[closingIndex]?.id ??
            remainingTabs[closingIndex - 1]?.id ??
            remainingTabs[0]?.id ??
            null)
          : (state.activeTabId ?? remainingTabs[0]?.id ?? null);

      return {
        tabs: remainingTabs,
        groups: nextGroups,
        activeTabId: nextActiveTabId,
        closedTabHistory: nextClosedHistory,
        emptyGroupPromptId: getEmptyGroupPromptId(
          nextGroups,
          state.emptyGroupPromptId
        ),
      };
    });
  },
  closeTabsForDeletedRepos: (tabIds) => {
    let closedCount = 0;

    set((state) => {
      if (tabIds.length === 0) {
        return state;
      }

      const tabIdSet = new Set(tabIds);
      const sortedTabs = [...state.tabs].sort((a, b) => a.order - b.order);
      const tabsToClose = sortedTabs.filter((tab) => tabIdSet.has(tab.id));

      if (tabsToClose.length === 0) {
        return state;
      }

      const closingTabIdSet = new Set(tabsToClose.map((tab) => tab.id));
      const remainingTabs = normalizeTabOrder(
        sortedTabs.filter((tab) => !closingTabIdSet.has(tab.id))
      );
      const activeTabIndex = sortedTabs.findIndex(
        (tab) => tab.id === state.activeTabId
      );

      closedCount = tabsToClose.length;

      if (remainingTabs.length === 0) {
        const defaultState = createDefaultState();

        return {
          tabs: defaultState.tabs,
          groups: [],
          activeTabId: defaultState.activeTabId,
          emptyGroupPromptId: null,
        };
      }

      const activeTabWasClosed =
        state.activeTabId !== null && closingTabIdSet.has(state.activeTabId);
      const nextActiveTabId = activeTabWasClosed
        ? (sortedTabs
            .slice(activeTabIndex + 1)
            .find((tab) => !closingTabIdSet.has(tab.id))?.id ??
          sortedTabs
            .slice(0, activeTabIndex)
            .reverse()
            .find((tab) => !closingTabIdSet.has(tab.id))?.id ??
          remainingTabs[0]?.id ??
          null)
        : (state.activeTabId ?? remainingTabs[0]?.id ?? null);
      const nextGroups = state.groups.map((group) => ({
        ...group,
        tabIds: group.tabIds.filter((tabId) => !closingTabIdSet.has(tabId)),
      }));

      return {
        tabs: remainingTabs,
        groups: nextGroups,
        activeTabId: nextActiveTabId,
        emptyGroupPromptId: getEmptyGroupPromptId(
          nextGroups,
          state.emptyGroupPromptId
        ),
      };
    });

    return closedCount;
  },
  setActiveTab: (id) => {
    if (!get().tabs.some((tab) => tab.id === id)) {
      return;
    }

    set({ activeTabId: id });
  },
  moveTab: (id, newOrder) => {
    set((state) => {
      const sortedTabs = [...state.tabs].sort((a, b) => a.order - b.order);
      const fromIndex = sortedTabs.findIndex((tab) => tab.id === id);

      if (fromIndex < 0) {
        return state;
      }

      const boundedOrder = Math.max(
        0,
        Math.min(newOrder, sortedTabs.length - 1)
      );

      if (fromIndex === boundedOrder) {
        return state;
      }

      const movingTab = sortedTabs[fromIndex];

      if (!movingTab) {
        return state;
      }

      sortedTabs.splice(fromIndex, 1);
      sortedTabs.splice(boundedOrder, 0, movingTab);

      return {
        tabs: normalizeTabOrder(sortedTabs),
      };
    });
  },
  moveTabWithinGroup: (tabId, overTabId) => {
    set((state) => {
      const activeTab = state.tabs.find((tab) => tab.id === tabId);
      const overTab = state.tabs.find((tab) => tab.id === overTabId);

      if (!(activeTab?.groupId && overTab?.groupId)) {
        return state;
      }

      if (activeTab.groupId !== overTab.groupId) {
        return state;
      }

      const reorderedTabs = reorderTabsWithinGroup(
        state.tabs,
        activeTab.groupId,
        tabId,
        overTabId
      );

      return {
        tabs: normalizeTabOrder(reorderedTabs),
      };
    });
  },
  moveTabOutOfGroup: (tabId, newOrder) => {
    set((state) => {
      const sortedTabs = [...state.tabs].sort((a, b) => a.order - b.order);
      const fromIndex = sortedTabs.findIndex((tab) => tab.id === tabId);
      const movingTab = sortedTabs[fromIndex];

      if (!movingTab?.groupId) {
        return state;
      }

      const boundedOrder = Math.max(
        0,
        Math.min(newOrder, sortedTabs.length - 1)
      );

      const tabWithoutGroup: Tab = {
        ...movingTab,
        groupId: null,
      };

      sortedTabs.splice(fromIndex, 1);
      sortedTabs.splice(boundedOrder, 0, tabWithoutGroup);

      const nextGroups = state.groups.map((group) =>
        group.id === movingTab.groupId
          ? {
              ...group,
              tabIds: group.tabIds.filter((groupTabId) => groupTabId !== tabId),
            }
          : group
      );

      return {
        tabs: normalizeTabOrder(sortedTabs),
        groups: nextGroups,
        emptyGroupPromptId: getEmptyGroupPromptId(
          nextGroups,
          state.emptyGroupPromptId
        ),
      };
    });
  },
  linkTabToRepo: (tabId, repoId, repoName) => {
    set((state) => {
      const existingTab = state.tabs.find(
        (tab) => tab.repoId === repoId && tab.id !== tabId
      );

      if (existingTab) {
        return {
          activeTabId: existingTab.id,
        };
      }

      return {
        tabs: state.tabs.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                repoId,
                title: repoName,
              }
            : tab
        ),
      };
    });
  },
  unlinkTabFromRepo: (tabId) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              repoId: null,
              title: DEFAULT_TAB_TITLE,
            }
          : tab
      ),
    }));
  },
});
