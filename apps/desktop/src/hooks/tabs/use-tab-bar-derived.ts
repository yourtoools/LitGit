import { useCallback, useMemo } from "react";
import type { GroupTabStats, RenderItem } from "@/lib/tabs/tab-bar-types";
import {
  getRenderItems,
  toGroupDropId,
  toGroupSortableId,
} from "@/lib/tabs/tab-bar-utils";
import type { Tab, TabGroup } from "@/stores/tabs/tab-types";

interface UseTabBarDerivedParams {
  groups: TabGroup[];
  tabs: Tab[];
}

interface TabBarDerivedState {
  getGroupById: (groupId: string) => TabGroup | undefined;
  getGroupEndIndex: (groupId: string) => number;
  getGroupStartIndex: (groupId: string) => number;
  getGroupTabCount: (groupId: string) => number;
  getTabById: (tabId: string) => Tab | undefined;
  groupByIdMap: Map<string, TabGroup>;
  groupDropItems: string[];
  groupStatsById: Map<string, GroupTabStats>;
  renderItems: RenderItem[];
  sortedTabs: Tab[];
  tabByIdMap: Map<string, Tab>;
  tabsByGroupId: Map<string, Tab[]>;
  topLevelSortableItems: string[];
}

export const useTabBarDerived = ({
  tabs,
  groups,
}: UseTabBarDerivedParams): TabBarDerivedState => {
  const sortedTabs = useMemo(
    () => [...tabs].sort((a, b) => a.order - b.order),
    [tabs]
  );

  const renderItems = useMemo(
    () => getRenderItems(sortedTabs, groups),
    [sortedTabs, groups]
  );

  const tabByIdMap = useMemo(
    () => new Map(sortedTabs.map((tab) => [tab.id, tab])),
    [sortedTabs]
  );

  const groupByIdMap = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups]
  );

  const { tabsByGroupId, groupStatsById } = useMemo(() => {
    const nextTabsByGroupId = new Map<string, Tab[]>();
    const nextGroupStatsById = new Map<string, GroupTabStats>();

    for (const tab of sortedTabs) {
      if (!tab.groupId) {
        continue;
      }

      const existingTabs = nextTabsByGroupId.get(tab.groupId) ?? [];
      existingTabs.push(tab);
      nextTabsByGroupId.set(tab.groupId, existingTabs);

      const existingStats = nextGroupStatsById.get(tab.groupId);

      if (!existingStats) {
        nextGroupStatsById.set(tab.groupId, {
          count: 1,
          startOrder: tab.order,
          endOrder: tab.order,
        });
        continue;
      }

      nextGroupStatsById.set(tab.groupId, {
        count: existingStats.count + 1,
        startOrder: existingStats.startOrder,
        endOrder: tab.order,
      });
    }

    return {
      tabsByGroupId: nextTabsByGroupId,
      groupStatsById: nextGroupStatsById,
    };
  }, [sortedTabs]);

  const topLevelSortableItems = useMemo(
    () =>
      renderItems.map((item) =>
        item.type === "group" ? toGroupSortableId(item.group.id) : item.tab.id
      ),
    [renderItems]
  );

  const groupDropItems = useMemo(
    () => groups.map((group) => toGroupDropId(group.id)),
    [groups]
  );

  const getTabById = useCallback(
    (tabId: string): Tab | undefined => tabByIdMap.get(tabId),
    [tabByIdMap]
  );

  const getGroupById = useCallback(
    (groupId: string): TabGroup | undefined => groupByIdMap.get(groupId),
    [groupByIdMap]
  );

  const getGroupStartIndex = useCallback(
    (groupId: string): number => groupStatsById.get(groupId)?.startOrder ?? -1,
    [groupStatsById]
  );

  const getGroupEndIndex = useCallback(
    (groupId: string): number => groupStatsById.get(groupId)?.endOrder ?? -1,
    [groupStatsById]
  );

  const getGroupTabCount = useCallback(
    (groupId: string): number => groupStatsById.get(groupId)?.count ?? 0,
    [groupStatsById]
  );

  return {
    sortedTabs,
    renderItems,
    tabByIdMap,
    groupByIdMap,
    tabsByGroupId,
    groupStatsById,
    topLevelSortableItems,
    groupDropItems,
    getTabById,
    getGroupById,
    getGroupStartIndex,
    getGroupEndIndex,
    getGroupTabCount,
  };
};
