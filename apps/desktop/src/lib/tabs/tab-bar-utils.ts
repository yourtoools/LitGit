import type { RenderItem } from "@/lib/tabs/tab-bar-types";
import type { Tab, TabGroup } from "@/stores/tabs/tab-types";

const GROUP_SORTABLE_PREFIX = "group:";
const GROUP_DROP_PREFIX = "group-drop:";

export const toGroupSortableId = (groupId: string): string =>
  `${GROUP_SORTABLE_PREFIX}${groupId}`;

export const toGroupDropId = (groupId: string): string =>
  `${GROUP_DROP_PREFIX}${groupId}`;

export const fromGroupSortableId = (sortableId: string): string | null => {
  if (!sortableId.startsWith(GROUP_SORTABLE_PREFIX)) {
    return null;
  }

  return sortableId.slice(GROUP_SORTABLE_PREFIX.length);
};

export const fromGroupDropId = (id: string): string | null => {
  if (!id.startsWith(GROUP_DROP_PREFIX)) {
    return null;
  }

  return id.slice(GROUP_DROP_PREFIX.length);
};

export const getDragId = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const isTabUngrouped = (tab: Tab | undefined): boolean =>
  Boolean(tab && !tab.groupId);

export function getRenderItems(tabs: Tab[], groups: TabGroup[]): RenderItem[] {
  const items: RenderItem[] = [];
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  let currentGroupId: string | null = null;
  let currentGroupTabs: Tab[] = [];

  const flush = () => {
    if (currentGroupTabs.length === 0) {
      return;
    }

    if (!currentGroupId) {
      for (const tab of currentGroupTabs) {
        items.push({ type: "tab", tab });
      }
      currentGroupTabs = [];
      return;
    }

    const group = groupsById.get(currentGroupId);

    if (!group) {
      for (const tab of currentGroupTabs) {
        items.push({ type: "tab", tab });
      }
      currentGroupTabs = [];
      currentGroupId = null;
      return;
    }

    items.push({ type: "group", group, tabs: [...currentGroupTabs] });
    currentGroupTabs = [];
    currentGroupId = null;
  };

  for (const tab of tabs) {
    if (!tab.groupId) {
      flush();
      items.push({ type: "tab", tab });
      continue;
    }

    if (currentGroupId !== tab.groupId) {
      flush();
      currentGroupId = tab.groupId;
    }

    currentGroupTabs.push(tab);
  }

  flush();

  return items;
}
