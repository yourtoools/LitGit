// Tab — represents a single tab
export interface Tab {
  groupId: string | null;
  id: string;
  order: number;
  repoId: string | null; // null = empty "New Tab"
  title: string;
}

// TabGroup — visual grouping of tabs
export interface TabGroup {
  collapsed?: boolean;
  color: string; // hex color value
  id: string;
  name: string;
  tabIds: string[];
}

// ClosedTabEntry — for reopen history (max 10)
export interface ClosedTabEntry {
  closedAt: number; // timestamp
  tab: Tab;
}

// TabStoreState — full store interface
export interface TabStoreState {
  activeTabId: string | null;
  // Actions
  addTab: () => string;
  addTabToGroup: (tabId: string, groupId: string) => void;
  closedTabHistory: ClosedTabEntry[];
  closeGroup: (groupId: string) => void;
  closeOtherTabs: (id: string) => void;
  closeTab: (id: string) => void;
  closeTabsForDeletedRepos: (tabIds: string[]) => number;
  closeTabsToRight: (id: string) => void;
  createGroup: (tabIds: string[], name?: string) => void;
  dismissEmptyGroupPrompt: () => void;
  editingGroupId: string | null;
  emptyGroupPromptId: string | null;
  groups: TabGroup[];
  linkTabToRepo: (tabId: string, repoId: string, repoName: string) => void;
  moveGroup: (id: string, newOrder: number) => void;
  moveTab: (id: string, newOrder: number) => void;
  moveTabOutOfGroup: (tabId: string, newOrder: number) => void;
  moveTabWithinGroup: (tabId: string, overTabId: string) => void;
  removeGroup: (groupId: string) => void;
  removeTabFromGroup: (tabId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  reopenClosedTab: () => void;
  setActiveTab: (id: string) => void;
  setEditingGroupId: (id: string | null) => void;
  tabs: Tab[];
  toggleGroupCollapse: (groupId: string) => void;
  ungroup: (groupId: string) => void;
  unlinkTabFromRepo: (tabId: string) => void;
  updateGroupColor: (groupId: string, color: string) => void;
}
