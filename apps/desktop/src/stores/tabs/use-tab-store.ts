import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { TabStoreState } from "@/components/tabs/types/tab-types";
import { readRememberTabsPreference } from "@/stores/preferences/preferences-store-types";
import { createTabGroupsSlice } from "@/stores/tabs/tab-groups.slice";
import { createTabHistorySlice } from "@/stores/tabs/tab-history.slice";
import {
  createDefaultState,
  migrateFromRepoStore,
  TAB_STORE_KEY,
} from "@/stores/tabs/tab-store.helpers";
import { createTabsCoreSlice } from "@/stores/tabs/tabs-core.slice";

const applyMigratedOrDefaultState = () => {
  const migratedTabs = migrateFromRepoStore();

  if (migratedTabs && migratedTabs.length > 0) {
    useTabStore.setState({
      tabs: migratedTabs,
      groups: [],
      activeTabId: migratedTabs[0]?.id ?? null,
      closedTabHistory: [],
      editingGroupId: null,
      emptyGroupPromptId: null,
    });

    return;
  }

  useTabStore.setState(createDefaultState());
};

const rehydrateTabStore = (state: TabStoreState | undefined) => {
  const hasPersistedTabStore = localStorage.getItem(TAB_STORE_KEY) !== null;

  if (!hasPersistedTabStore) {
    applyMigratedOrDefaultState();
    return;
  }

  if (!state || state.tabs.length === 0) {
    useTabStore.setState(createDefaultState());
    return;
  }

  if (!state.tabs.some((tab) => tab.id === state.activeTabId)) {
    useTabStore.setState({ activeTabId: state.tabs[0]?.id ?? null });
  }
};

export const useTabStore = create<TabStoreState>()(
  persist(
    (set, get) => ({
      ...createDefaultState(),
      ...createTabsCoreSlice(set, get),
      ...createTabGroupsSlice(set),
      ...createTabHistorySlice(set),
    }),
    {
      name: TAB_STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        if (!readRememberTabsPreference()) {
          return {
            tabs: [],
            groups: [],
            activeTabId: null,
          };
        }

        return {
          tabs: state.tabs,
          groups: state.groups,
          activeTabId: state.activeTabId,
        };
      },
      onRehydrateStorage: () => (state) => {
        rehydrateTabStore(state);
      },
    }
  )
);
