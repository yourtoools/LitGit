import {
  DEFAULT_GROUP_NAME,
  DEFAULT_TAB_TITLE,
  getNextGroupColor,
  MAX_CLOSED_TAB_HISTORY,
} from "@/lib/tabs/tab-constants";
import type {
  ClosedTabEntry,
  Tab,
  TabStoreState,
} from "@/stores/tabs/tab-types";

export const TAB_STORE_KEY = "litgit-tab-store";
const REPO_STORE_KEY = "litgit-repo-store";

export const createDefaultState = (): Pick<
  TabStoreState,
  | "tabs"
  | "groups"
  | "activeTabId"
  | "closedTabHistory"
  | "editingGroupId"
  | "emptyGroupPromptId"
> => {
  const defaultTabId = crypto.randomUUID();

  return {
    tabs: [
      {
        id: defaultTabId,
        title: DEFAULT_TAB_TITLE,
        repoId: null,
        groupId: null,
        order: 0,
      },
    ],
    groups: [],
    activeTabId: defaultTabId,
    closedTabHistory: [],
    editingGroupId: null,
    emptyGroupPromptId: null,
  };
};

export const getEmptyGroupPromptId = (
  groups: TabStoreState["groups"],
  currentPromptId: string | null
): string | null => {
  if (currentPromptId) {
    const currentPromptGroup = groups.find(
      (group) => group.id === currentPromptId
    );

    if (currentPromptGroup && currentPromptGroup.tabIds.length === 0) {
      return currentPromptId;
    }
  }

  return groups.find((group) => group.tabIds.length === 0)?.id ?? null;
};

export const normalizeTabOrder = (tabs: Tab[]): Tab[] =>
  tabs.map((tab, index) => ({
    ...tab,
    order: index,
  }));

const moveItemInArray = <T>(items: T[], fromIndex: number, toIndex: number) => {
  if (fromIndex === toIndex) {
    return [...items];
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);

  if (!movedItem) {
    return nextItems;
  }

  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
};

export const reorderTabsWithinGroup = (
  tabs: Tab[],
  groupId: string,
  tabId: string,
  overTabId: string
) => {
  const sortedTabs = [...tabs].sort((a, b) => a.order - b.order);
  const groupTabs = sortedTabs.filter((tab) => tab.groupId === groupId);
  const fromIndex = groupTabs.findIndex((tab) => tab.id === tabId);
  const toIndex = groupTabs.findIndex((tab) => tab.id === overTabId);

  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return sortedTabs;
  }

  const reorderedGroupTabs = moveItemInArray(groupTabs, fromIndex, toIndex);
  let groupTabCursor = 0;

  return sortedTabs.map((tab) => {
    if (tab.groupId !== groupId) {
      return tab;
    }

    const nextTab = reorderedGroupTabs[groupTabCursor];
    groupTabCursor += 1;
    return nextTab ?? tab;
  });
};

export const closeHistoryWithLimit = (
  existingHistory: ClosedTabEntry[],
  closedTabs: Tab[]
): ClosedTabEntry[] => {
  if (closedTabs.length === 0) {
    return existingHistory;
  }

  const timestamp = Date.now();
  const newEntries = closedTabs.map((tab) => ({ tab, closedAt: timestamp }));

  return [...newEntries, ...existingHistory].slice(0, MAX_CLOSED_TAB_HISTORY);
};

export function migrateFromRepoStore(): Tab[] | null {
  try {
    const stored = localStorage.getItem(REPO_STORE_KEY);

    if (!stored) {
      return null;
    }

    const parsed: unknown = JSON.parse(stored);

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const parsedRecord = parsed as Record<string, unknown>;
    const state = parsedRecord.state;

    if (typeof state !== "object" || state === null) {
      return null;
    }

    const openedRepos = (state as Record<string, unknown>).openedRepos;

    if (!Array.isArray(openedRepos) || openedRepos.length === 0) {
      return null;
    }

    return openedRepos
      .map((repo, index): Tab | null => {
        if (typeof repo !== "object" || repo === null) {
          return null;
        }

        const repoRecord = repo as Record<string, unknown>;
        const repoId = repoRecord.id;
        const repoName = repoRecord.name;

        if (typeof repoId !== "string" || typeof repoName !== "string") {
          return null;
        }

        return {
          id: crypto.randomUUID(),
          title: repoName,
          repoId,
          groupId: null,
          order: index,
        };
      })
      .filter((tab): tab is Tab => tab !== null);
  } catch {
    return null;
  }
}

export const getDefaultTabTitle = () => DEFAULT_TAB_TITLE;
export const getDefaultGroupName = () => DEFAULT_GROUP_NAME;
export const pickNextGroupColor = getNextGroupColor;
