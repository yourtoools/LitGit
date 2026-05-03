import { type KeyboardEvent as ReactKeyboardEvent, useEffect } from "react";
import {
  isCloseTabShortcut,
  isEditableTarget,
  isNextTabShortcut,
  isPreviousTabShortcut,
  isPrimaryShortcut,
  isReopenClosedTabShortcut,
} from "@/lib/keyboard-shortcuts";
import type { Tab } from "@/stores/tabs/tab-types";

interface UseTabBarShortcutsOptions {
  readonly handleAddTab: () => void;
  readonly handleCloseActiveTab: () => void;
  readonly handleCycleTabs: (direction: "next" | "previous") => void;
  readonly reopenClosedTab: () => void;
}

interface CreateTabListKeyDownHandlerOptions {
  readonly isSingleTab: boolean;
  readonly queueKeyboardFocusTabId: (tabId: string | null) => void;
  readonly requestCloseTab: (tabId: string) => void;
  readonly setActiveTabFromUrl: (tabId: string) => void;
  readonly sortedTabs: readonly Tab[];
}

const getFocusedTabButtonId = (target: EventTarget | null): string | null => {
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  const tabButton = target.closest<HTMLElement>(
    `[data-tab-button="true"][data-tab-id]`
  );
  return tabButton?.dataset.tabId ?? null;
};

const getTabIndexByKeyboardKey = (
  key: string,
  currentIndex: number,
  tabCount: number
): number | null => {
  if (tabCount === 0) {
    return null;
  }

  if (key === "ArrowRight") {
    return (currentIndex + 1) % tabCount;
  }

  if (key === "ArrowLeft") {
    return (currentIndex - 1 + tabCount) % tabCount;
  }

  if (key === "Home") {
    return 0;
  }

  if (key === "End") {
    return tabCount - 1;
  }

  return null;
};

export const useTabBarShortcuts = ({
  handleAddTab,
  handleCloseActiveTab,
  handleCycleTabs,
  reopenClosedTab,
}: UseTabBarShortcutsOptions) => {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleNewTabShortcut = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      if (!isPrimaryShortcut(event, "t")) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      handleAddTab();
    };

    window.addEventListener("keydown", handleNewTabShortcut);

    return () => {
      window.removeEventListener("keydown", handleNewTabShortcut);
    };
  }, [handleAddTab]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleReopenClosedTabShortcut = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      if (!isReopenClosedTabShortcut(event)) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      reopenClosedTab();
    };

    window.addEventListener("keydown", handleReopenClosedTabShortcut);

    return () => {
      window.removeEventListener("keydown", handleReopenClosedTabShortcut);
    };
  }, [reopenClosedTab]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleCloseTabShortcut = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) {
        return;
      }

      if (!isCloseTabShortcut(event)) {
        return;
      }

      event.preventDefault();
      handleCloseActiveTab();
    };

    window.addEventListener("keydown", handleCloseTabShortcut);

    return () => {
      window.removeEventListener("keydown", handleCloseTabShortcut);
    };
  }, [handleCloseActiveTab]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleCycleTabShortcut = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (isPreviousTabShortcut(event)) {
        event.preventDefault();
        handleCycleTabs("previous");
        return;
      }

      if (isNextTabShortcut(event)) {
        event.preventDefault();
        handleCycleTabs("next");
      }
    };

    window.addEventListener("keydown", handleCycleTabShortcut);

    return () => {
      window.removeEventListener("keydown", handleCycleTabShortcut);
    };
  }, [handleCycleTabs]);
};

export const createTabListKeyDownHandler =
  ({
    isSingleTab,
    queueKeyboardFocusTabId,
    requestCloseTab,
    setActiveTabFromUrl,
    sortedTabs,
  }: CreateTabListKeyDownHandlerOptions) =>
  (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const focusedTabId = getFocusedTabButtonId(event.target);

    if (!focusedTabId || sortedTabs.length === 0) {
      return;
    }

    const currentIndex = sortedTabs.findIndex((tab) => tab.id === focusedTabId);

    if (currentIndex < 0) {
      return;
    }

    const activateTabAtIndex = (index: number) => {
      const nextTab = sortedTabs[index];

      if (!nextTab) {
        return;
      }

      queueKeyboardFocusTabId(nextTab.id);
      setActiveTabFromUrl(nextTab.id);
    };

    const nextIndex = getTabIndexByKeyboardKey(
      event.key,
      currentIndex,
      sortedTabs.length
    );

    if (nextIndex !== null) {
      event.preventDefault();
      activateTabAtIndex(nextIndex);
      return;
    }

    if (event.key === "Delete" && !isSingleTab) {
      event.preventDefault();

      const fallbackTab =
        sortedTabs[currentIndex + 1] ?? sortedTabs[currentIndex - 1] ?? null;

      queueKeyboardFocusTabId(fallbackTab?.id ?? null);
      requestCloseTab(focusedTabId);
    }
  };
