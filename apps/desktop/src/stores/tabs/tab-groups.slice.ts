import type { Tab, TabStoreState } from "@/components/tabs/types/tab-types";
import {
  closeHistoryWithLimit,
  createDefaultState,
  getDefaultGroupName,
  getEmptyGroupPromptId,
  normalizeTabOrder,
  pickNextGroupColor,
} from "@/stores/tabs/tab-store.helpers";
import type { TabStoreSet } from "@/stores/tabs/tab-store.slice-types";

type TabGroupsSliceKeys =
  | "addTabToGroup"
  | "closeGroup"
  | "createGroup"
  | "dismissEmptyGroupPrompt"
  | "moveGroup"
  | "removeGroup"
  | "removeTabFromGroup"
  | "renameGroup"
  | "setEditingGroupId"
  | "toggleGroupCollapse"
  | "ungroup"
  | "updateGroupColor";

const DEFAULT_GROUP_NAME = getDefaultGroupName();

export const createTabGroupsSlice = (
  set: TabStoreSet
): Pick<TabStoreState, TabGroupsSliceKeys> => ({
  moveGroup: (id, newOrder) => {
    set((state) => {
      const sortedTabs = [...state.tabs].sort((a, b) => a.order - b.order);
      const group = state.groups.find((g) => g.id === id);
      if (!group) {
        return state;
      }

      const groupTabs = sortedTabs.filter((t) => t.groupId === id);
      if (groupTabs.length === 0) {
        return state;
      }

      const tabsWithoutGroup = sortedTabs.filter((t) => t.groupId !== id);

      const boundedOrder = Math.max(
        0,
        Math.min(newOrder, tabsWithoutGroup.length)
      );

      tabsWithoutGroup.splice(boundedOrder, 0, ...groupTabs);

      return {
        tabs: normalizeTabOrder(tabsWithoutGroup),
      };
    });
  },
  createGroup: (tabIds, name) => {
    set((state) => {
      const uniqueTabIds = Array.from(
        new Set(
          tabIds.filter((tabId) => state.tabs.some((tab) => tab.id === tabId))
        )
      );

      if (uniqueTabIds.length === 0) {
        return state;
      }

      const movedTabIds = new Set(uniqueTabIds);
      const nextGroupId = crypto.randomUUID();
      const nextGroups = state.groups.map((group) => ({
        ...group,
        tabIds: group.tabIds.filter((tabId) => !movedTabIds.has(tabId)),
      }));

      nextGroups.push({
        id: nextGroupId,
        name:
          name ||
          (() => {
            const existingGroupNames = new Set(state.groups.map((g) => g.name));

            if (!existingGroupNames.has(DEFAULT_GROUP_NAME)) {
              return DEFAULT_GROUP_NAME;
            }

            let counter = 2;
            let candidateName = `${DEFAULT_GROUP_NAME} ${counter}`;
            while (existingGroupNames.has(candidateName)) {
              counter++;
              candidateName = `${DEFAULT_GROUP_NAME} ${counter}`;
            }
            return candidateName;
          })(),
        color: pickNextGroupColor(state.groups),
        tabIds: uniqueTabIds,
        collapsed: false,
      });

      return {
        tabs: state.tabs.map((tab) =>
          movedTabIds.has(tab.id)
            ? {
                ...tab,
                groupId: nextGroupId,
              }
            : tab
        ),
        groups: nextGroups,
        editingGroupId: nextGroupId,
        emptyGroupPromptId: getEmptyGroupPromptId(
          nextGroups,
          state.emptyGroupPromptId
        ),
      };
    });
  },
  removeGroup: (groupId) => {
    set((state) => {
      if (!state.groups.some((group) => group.id === groupId)) {
        return state;
      }

      return {
        tabs: state.tabs.map((tab) =>
          tab.groupId === groupId
            ? {
                ...tab,
                groupId: null,
              }
            : tab
        ),
        groups: state.groups.filter((group) => group.id !== groupId),
        emptyGroupPromptId:
          state.emptyGroupPromptId === groupId
            ? null
            : state.emptyGroupPromptId,
      };
    });
  },
  addTabToGroup: (tabId, groupId) => {
    set((state) => {
      const targetTab = state.tabs.find((tab) => tab.id === tabId);
      const targetGroup = state.groups.find((group) => group.id === groupId);

      if (!(targetTab && targetGroup)) {
        return state;
      }

      const sortedTabs = [...state.tabs].sort((a, b) => a.order - b.order);
      const tabsWithoutTarget = sortedTabs.filter((tab) => tab.id !== tabId);
      const lastIndexInTargetGroup = tabsWithoutTarget
        .map((tab, index) => ({ tab, index }))
        .filter((entry) => entry.tab.groupId === groupId)
        .at(-1)?.index;
      const targetInsertIndex =
        lastIndexInTargetGroup !== undefined
          ? lastIndexInTargetGroup + 1
          : tabsWithoutTarget.length;
      const movedTab: Tab = {
        ...targetTab,
        groupId,
      };
      const reorderedTabs = [...tabsWithoutTarget];

      reorderedTabs.splice(targetInsertIndex, 0, movedTab);

      const firstGroupOccurrenceIndex = reorderedTabs.findIndex(
        (tab) => tab.groupId === groupId
      );
      const compactedTabs =
        firstGroupOccurrenceIndex < 0
          ? reorderedTabs
          : (() => {
              const groupedTabs = reorderedTabs.filter(
                (tab) => tab.groupId === groupId
              );
              const nonGroupedTabs = reorderedTabs.filter(
                (tab) => tab.groupId !== groupId
              );
              const merged = [...nonGroupedTabs];

              merged.splice(firstGroupOccurrenceIndex, 0, ...groupedTabs);
              return merged;
            })();

      const normalizedTabs = normalizeTabOrder(compactedTabs);
      const nextGroups = state.groups.map((group) => ({
        ...group,
        tabIds: normalizedTabs
          .filter((tab) => tab.groupId === group.id)
          .map((tab) => tab.id),
      }));

      return {
        tabs: normalizedTabs,
        groups: nextGroups,
        emptyGroupPromptId: getEmptyGroupPromptId(
          nextGroups,
          state.emptyGroupPromptId
        ),
      };
    });
  },
  removeTabFromGroup: (tabId) => {
    set((state) => {
      const targetTab = state.tabs.find((tab) => tab.id === tabId);

      if (!targetTab?.groupId) {
        return state;
      }

      return {
        tabs: state.tabs.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                groupId: null,
              }
            : tab
        ),
        groups: state.groups.map((group) =>
          group.id === targetTab.groupId
            ? {
                ...group,
                tabIds: group.tabIds.filter((id) => id !== tabId),
              }
            : group
        ),
        emptyGroupPromptId: getEmptyGroupPromptId(
          state.groups.map((group) =>
            group.id === targetTab.groupId
              ? {
                  ...group,
                  tabIds: group.tabIds.filter((id) => id !== tabId),
                }
              : group
          ),
          state.emptyGroupPromptId
        ),
      };
    });
  },
  renameGroup: (groupId, name) => {
    set((state) => ({
      groups: state.groups.map((group) =>
        group.id === groupId ? { ...group, name } : group
      ),
    }));
  },
  updateGroupColor: (groupId, color) => {
    set((state) => ({
      groups: state.groups.map((group) =>
        group.id === groupId ? { ...group, color } : group
      ),
    }));
  },
  closeGroup: (groupId) => {
    set((state) => {
      const group = state.groups.find((g) => g.id === groupId);
      if (!group) {
        return state;
      }

      const tabIdsToClose = new Set(group.tabIds);
      const closedTabs = state.tabs.filter((tab) => tabIdsToClose.has(tab.id));
      const remainingTabs = normalizeTabOrder(
        state.tabs.filter((tab) => !tabIdsToClose.has(tab.id))
      );

      if (remainingTabs.length === 0) {
        const defaultState = createDefaultState();
        return {
          tabs: defaultState.tabs,
          groups: [],
          activeTabId: defaultState.activeTabId,
          closedTabHistory: closeHistoryWithLimit(
            state.closedTabHistory,
            closedTabs
          ),
          emptyGroupPromptId: null,
        };
      }

      return {
        tabs: remainingTabs,
        groups: state.groups.filter((g) => g.id !== groupId),
        activeTabId:
          state.activeTabId && tabIdsToClose.has(state.activeTabId)
            ? (remainingTabs[0]?.id ?? null)
            : state.activeTabId,
        closedTabHistory: closeHistoryWithLimit(
          state.closedTabHistory,
          closedTabs
        ),
        emptyGroupPromptId:
          state.emptyGroupPromptId === groupId
            ? null
            : state.emptyGroupPromptId,
      };
    });
  },
  ungroup: (groupId) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.groupId === groupId ? { ...tab, groupId: null } : tab
      ),
      groups: state.groups.filter((group) => group.id !== groupId),
      emptyGroupPromptId:
        state.emptyGroupPromptId === groupId ? null : state.emptyGroupPromptId,
    }));
  },
  toggleGroupCollapse: (groupId) => {
    set((state) => ({
      groups: state.groups.map((group) =>
        group.id === groupId ? { ...group, collapsed: !group.collapsed } : group
      ),
    }));
  },
  setEditingGroupId: (id) => {
    set({ editingGroupId: id });
  },
  dismissEmptyGroupPrompt: () => {
    set({ emptyGroupPromptId: null });
  },
});
