import { useMemo } from "react";
import {
  getRenderItems,
  toGroupDropId,
  toGroupSortableId,
} from "@/components/tabs/lib/tab-bar-utils";
import type {
  GroupTabStats,
  RenderItem,
} from "@/components/tabs/types/tab-bar-types";
import type { Tab, TabGroup } from "@/components/tabs/types/tab-types";

interface UseTabBarDerivedParams {
  groups: TabGroup[];
  tabs: Tab[];
}

export interface TabBarDerivedState {
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
  const sortedTabs = useMemo(() => {
    return [...tabs].sort((a, b) => a.order - b.order);
  }, [tabs]);

  const renderItems = useMemo(() => {
    return getRenderItems(sortedTabs, groups);
  }, [sortedTabs, groups]);

  const tabByIdMap = useMemo(() => {
    return new Map(sortedTabs.map((tab) => [tab.id, tab]));
  }, [sortedTabs]);

  const groupByIdMap = useMemo(() => {
    return new Map(groups.map((group) => [group.id, group]));
  }, [groups]);

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

  const topLevelSortableItems = useMemo(() => {
    return renderItems.map((item) =>
      item.type === "group" ? toGroupSortableId(item.group.id) : item.tab.id
    );
  }, [renderItems]);

  const groupDropItems = useMemo(() => {
    return groups.map((group) => toGroupDropId(group.id));
  }, [groups]);

  const getTabById = (tabId: string): Tab | undefined => {
    return tabByIdMap.get(tabId);
  };

  const getGroupById = (groupId: string): TabGroup | undefined => {
    return groupByIdMap.get(groupId);
  };

  const getGroupStartIndex = (groupId: string): number => {
    return groupStatsById.get(groupId)?.startOrder ?? -1;
  };

  const getGroupEndIndex = (groupId: string): number => {
    return groupStatsById.get(groupId)?.endOrder ?? -1;
  };

  const getGroupTabCount = (groupId: string): number => {
    return groupStatsById.get(groupId)?.count ?? 0;
  };

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
