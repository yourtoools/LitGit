import {
  closeHistoryWithLimit,
  getEmptyGroupPromptId,
  normalizeTabOrder,
} from "@/stores/tabs/tab-store.helpers";
import type { TabStoreSet } from "@/stores/tabs/tab-store.slice-types";
import type { Tab, TabStoreState } from "@/stores/tabs/tab-types";

type TabHistorySliceKeys =
  | "closeOtherTabs"
  | "closeTabsToRight"
  | "reopenClosedTab";

export const createTabHistorySlice = (
  set: TabStoreSet
): Pick<TabStoreState, TabHistorySliceKeys> => ({
  reopenClosedTab: () => {
    set((state) => {
      if (state.closedTabHistory.length === 0) {
        return state;
      }

      const [closedEntry, ...nextHistory] = state.closedTabHistory;

      if (!closedEntry) {
        return state;
      }

      // Check if a tab with the same repo already exists
      if (closedEntry.tab.repoId) {
        const existingTab = state.tabs.find(
          (tab) => tab.repoId === closedEntry.tab.repoId
        );

        if (existingTab) {
          return {
            activeTabId: existingTab.id,
            closedTabHistory: nextHistory,
          };
        }
      }

      const reopenedTab: Tab = {
        ...closedEntry.tab,
        id: crypto.randomUUID(),
        groupId: null,
        order: state.tabs.length,
      };

      return {
        tabs: [...state.tabs, reopenedTab],
        activeTabId: reopenedTab.id,
        closedTabHistory: nextHistory,
      };
    });
  },
  closeOtherTabs: (id) => {
    set((state) => {
      const sortedTabs = [...state.tabs].sort((a, b) => a.order - b.order);
      const keepTab = sortedTabs.find((tab) => tab.id === id);

      if (!keepTab) {
        return state;
      }

      const closedTabs = sortedTabs.filter((tab) => tab.id !== id);
      const nextClosedHistory = closeHistoryWithLimit(
        state.closedTabHistory,
        closedTabs
      );
      const nextTabs = normalizeTabOrder([keepTab]);

      return {
        tabs: nextTabs,
        groups: state.groups.map((group) => ({
          ...group,
          tabIds: group.tabIds.filter((tabId) => tabId === id),
        })),
        activeTabId: id,
        closedTabHistory: nextClosedHistory,
        emptyGroupPromptId: getEmptyGroupPromptId(
          state.groups.map((group) => ({
            ...group,
            tabIds: group.tabIds.filter((tabId) => tabId === id),
          })),
          state.emptyGroupPromptId
        ),
      };
    });
  },
  closeTabsToRight: (id) => {
    set((state) => {
      const sortedTabs = [...state.tabs].sort((a, b) => a.order - b.order);
      const pivotTab = sortedTabs.find((tab) => tab.id === id);

      if (!pivotTab) {
        return state;
      }

      const closedTabs = sortedTabs.filter((tab) => tab.order > pivotTab.order);

      if (closedTabs.length === 0) {
        return state;
      }

      const closedTabIds = new Set(closedTabs.map((tab) => tab.id));
      const remainingTabs = normalizeTabOrder(
        sortedTabs.filter((tab) => !closedTabIds.has(tab.id))
      );
      const nextActiveTabId =
        state.activeTabId && closedTabIds.has(state.activeTabId)
          ? (remainingTabs.at(-1)?.id ?? remainingTabs[0]?.id ?? null)
          : (state.activeTabId ?? remainingTabs[0]?.id ?? null);

      return {
        tabs: remainingTabs,
        groups: state.groups.map((group) => ({
          ...group,
          tabIds: group.tabIds.filter((tabId) => !closedTabIds.has(tabId)),
        })),
        activeTabId: nextActiveTabId,
        closedTabHistory: closeHistoryWithLimit(
          state.closedTabHistory,
          closedTabs
        ),
        emptyGroupPromptId: getEmptyGroupPromptId(
          state.groups.map((group) => ({
            ...group,
            tabIds: group.tabIds.filter((tabId) => !closedTabIds.has(tabId)),
          })),
          state.emptyGroupPromptId
        ),
      };
    });
  },
});
