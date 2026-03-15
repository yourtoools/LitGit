import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@litgit/ui/components/context-menu";
import type { ReactNode } from "react";
import { useTabStore } from "@/stores/tabs/use-tab-store";

interface TabContextMenuProps {
  children: ReactNode;
  onCloseTab?: (tabId: string) => void;
  onUngroupTab?: (tabId: string) => void;
  tabId: string;
}

export function TabContextMenu({
  tabId,
  children,
  onCloseTab,
  onUngroupTab,
}: TabContextMenuProps) {
  const tabs = useTabStore((state) => state.tabs);
  const groups = useTabStore((state) => state.groups);
  const closeTab = useTabStore((state) => state.closeTab);
  const closeOtherTabs = useTabStore((state) => state.closeOtherTabs);
  const closeTabsToRight = useTabStore((state) => state.closeTabsToRight);
  const reopenClosedTab = useTabStore((state) => state.reopenClosedTab);
  const createGroup = useTabStore((state) => state.createGroup);
  const removeTabFromGroup = useTabStore((state) => state.removeTabFromGroup);
  const addTabToGroup = useTabStore((state) => state.addTabToGroup);
  const hasClosedTabs = useTabStore(
    (state) => state.closedTabHistory.length > 0
  );

  const tab = tabs.find((t) => t.id === tabId);
  const handleCloseTab = () => {
    if (onCloseTab) {
      onCloseTab(tabId);
      return;
    }

    closeTab(tabId);
  };

  const handleUngroupTab = () => {
    if (onUngroupTab) {
      onUngroupTab(tabId);
      return;
    }

    removeTabFromGroup(tabId);
  };

  if (!tab) {
    return <>{children}</>;
  }

  const hasTabsToRight = tabs.some((t) => t.order > tab.order);
  const isInGroup = tab.groupId !== null;
  const availableGroups = groups.filter((group) => group.id !== tab.groupId);

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={handleCloseTab}>Close</ContextMenuItem>
        <ContextMenuItem onClick={() => closeOtherTabs(tabId)}>
          Close Others
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!hasTabsToRight}
          onClick={() => closeTabsToRight(tabId)}
        >
          Close Right
        </ContextMenuItem>

        <ContextMenuSeparator />

        {!isInGroup &&
          (availableGroups.length > 0 ? (
            <ContextMenuSub>
              <ContextMenuSubTrigger>Add to group</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem onClick={() => createGroup([tabId])}>
                  New group
                </ContextMenuItem>
                <ContextMenuSeparator />
                {availableGroups.map((group) => (
                  <ContextMenuItem
                    key={group.id}
                    onClick={() => addTabToGroup(tabId, group.id)}
                  >
                    {group.name}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          ) : (
            <ContextMenuItem onClick={() => createGroup([tabId])}>
              Add to new group
            </ContextMenuItem>
          ))}
        {isInGroup && (
          <ContextMenuItem onClick={handleUngroupTab}>
            Remove from group
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        <ContextMenuItem disabled={!hasClosedTabs} onClick={reopenClosedTab}>
          Reopen Closed
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
