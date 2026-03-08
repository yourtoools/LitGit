import { useMemo, useState } from "react";
import type {
  PendingUngroupTab,
  PendingUngroupTabDetails,
  UngroupConfirmDialogContent,
} from "@/components/tabs/types/tab-bar-types";
import type { Tab, TabGroup } from "@/components/tabs/types/tab-types";

interface UseUngroupConfirmationParams {
  closeTab: (tabId: string) => void;
  getGroupTabCount: (groupId: string) => number;
  groups: TabGroup[];
  moveTab: (tabId: string, newOrder: number) => void;
  removeTabFromGroup: (tabId: string) => void;
  tabs: Tab[];
  ungroup: (groupId: string) => void;
}

interface UseUngroupConfirmationReturn {
  clearPendingUngroup: () => void;
  confirmUngroupLastTab: () => void;
  dialogContent: UngroupConfirmDialogContent;
  pendingUngroupTab: PendingUngroupTab | null;
  pendingUngroupTabDetails: PendingUngroupTabDetails | null;
  queuePendingUngroup: (pending: PendingUngroupTab) => void;
  requestCloseTab: (tabId: string) => void;
  requestUngroupTab: (tabId: string) => void;
}

const DEFAULT_DIALOG_CONTENT: UngroupConfirmDialogContent = {
  title: "Ungroup this tab?",
  description: "This is the last tab in the group.",
  actionText: "Confirm ungroup",
};

export const useUngroupConfirmation = ({
  tabs,
  groups,
  getGroupTabCount,
  closeTab,
  removeTabFromGroup,
  moveTab,
  ungroup,
}: UseUngroupConfirmationParams): UseUngroupConfirmationReturn => {
  const [pendingUngroupTab, setPendingUngroupTab] =
    useState<PendingUngroupTab | null>(null);

  const pendingUngroupTabDetails = useMemo(() => {
    if (!pendingUngroupTab) {
      return null;
    }

    const tab = tabs.find(
      (candidate) => candidate.id === pendingUngroupTab.tabId
    );
    const group = groups.find(
      (candidate) => candidate.id === pendingUngroupTab.groupId
    );

    if (!(tab && group)) {
      return null;
    }

    return {
      tab,
      group,
    };
  }, [groups, pendingUngroupTab, tabs]);

  const dialogContent = useMemo(() => {
    if (!(pendingUngroupTab && pendingUngroupTabDetails)) {
      return DEFAULT_DIALOG_CONTENT;
    }

    const { tab, group } = pendingUngroupTabDetails;
    const isCloseAction = pendingUngroupTab.action === "close";

    return {
      title: isCloseAction ? "Close this tab?" : "Ungroup this tab?",
      description: isCloseAction
        ? `"${tab.title}" is the last tab in the "${group.name}" group. Group and Tab will be deleted/closed.`
        : `"${tab.title}" is the last tab in the "${group.name}" group. The group will be deleted, but the tab will remain.`,
      actionText: isCloseAction ? "Close" : "Confirm ungroup",
    };
  }, [pendingUngroupTab, pendingUngroupTabDetails]);

  const queuePendingUngroup = (pending: PendingUngroupTab) => {
    setPendingUngroupTab(pending);
  };

  const clearPendingUngroup = () => {
    setPendingUngroupTab(null);
  };

  const requestCloseTab = (tabId: string) => {
    const targetTab = tabs.find((tab) => tab.id === tabId);

    if (targetTab?.groupId) {
      const groupedTabsCount = getGroupTabCount(targetTab.groupId);

      if (groupedTabsCount === 1) {
        queuePendingUngroup({
          tabId,
          groupId: targetTab.groupId,
          dropIndex: null,
          action: "close",
        });
        return;
      }
    }

    closeTab(tabId);
  };

  const requestUngroupTab = (tabId: string) => {
    const targetTab = tabs.find((tab) => tab.id === tabId);

    if (!targetTab?.groupId) {
      return;
    }

    const groupedTabsCount = getGroupTabCount(targetTab.groupId);

    if (groupedTabsCount === 1) {
      queuePendingUngroup({
        tabId,
        groupId: targetTab.groupId,
        dropIndex: null,
        action: "ungroup",
      });
      return;
    }

    removeTabFromGroup(tabId);
  };

  const confirmUngroupLastTab = () => {
    if (!(pendingUngroupTabDetails && pendingUngroupTab)) {
      return;
    }

    ungroup(pendingUngroupTabDetails.group.id);

    if (pendingUngroupTab.action === "close") {
      closeTab(pendingUngroupTab.tabId);
    } else if (pendingUngroupTab.dropIndex !== null) {
      moveTab(pendingUngroupTabDetails.tab.id, pendingUngroupTab.dropIndex);
    }

    clearPendingUngroup();
  };

  return {
    pendingUngroupTab,
    pendingUngroupTabDetails,
    dialogContent,
    queuePendingUngroup,
    clearPendingUngroup,
    requestCloseTab,
    requestUngroupTab,
    confirmUngroupLastTab,
  };
};
