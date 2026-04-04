import {
  toGroupDropId,
  toGroupSortableId,
} from "@/components/tabs/lib/tab-bar-utils";
import { SortableTabItem } from "@/components/tabs/sortable-tab-item";
import { TabContextMenu } from "@/components/tabs/tab-context-menu";
import { TabGroupContainer } from "@/components/tabs/tab-group-container";
import type { RenderItem } from "@/components/tabs/types/tab-bar-types";
import type { Tab } from "@/components/tabs/types/tab-types";

interface TabStripContentProps {
  activeDragId: string | null;
  activeLoadingTabId: string | null;
  activeTabId: string | null;
  hoveredGroupId: string | null;
  hoveredTabId: string | null;
  isGroupDragActive: boolean;
  isSingleTab: boolean;
  onActivateTab: (id: string) => void;
  onRequestCloseTab: (id: string) => void;
  onRequestUngroupTab: (id: string) => void;
  renderItems: RenderItem[];
}

export function TabStripContent({
  renderItems,
  activeTabId,
  activeLoadingTabId,
  activeDragId,
  isGroupDragActive,
  isSingleTab,
  hoveredTabId,
  hoveredGroupId,
  onActivateTab,
  onRequestCloseTab,
  onRequestUngroupTab,
}: TabStripContentProps) {
  // Find the first tab ID in the entire tab strip
  const getFirstTabId = (): string | null => {
    if (renderItems.length === 0) {
      return null;
    }
    const firstItem = renderItems[0];
    if (firstItem.type === "group") {
      return firstItem.tabs[0]?.id ?? null;
    }
    return firstItem.tab.id;
  };

  const firstTabId = getFirstTabId();

  const renderTabNode = (tab: Tab, groupColor?: string) => {
    return (
      <TabContextMenu
        key={tab.id}
        onCloseTab={onRequestCloseTab}
        onUngroupTab={onRequestUngroupTab}
        tabId={tab.id}
      >
        <SortableTabItem
          disabled={isGroupDragActive}
          groupColor={groupColor}
          isActive={tab.id === activeTabId}
          isFirst={tab.id === firstTabId}
          isGhost={!isGroupDragActive && activeDragId === tab.id}
          isHoveredForGroup={hoveredTabId === tab.id}
          isLoading={tab.id === activeLoadingTabId}
          isSingleTab={isSingleTab}
          onActivate={onActivateTab}
          onClose={onRequestCloseTab}
          tab={tab}
        />
      </TabContextMenu>
    );
  };

  return (
    <>
      {renderItems.map((item) => {
        if (item.type === "group") {
          return (
            <TabGroupContainer
              group={item.group}
              groupDropId={toGroupDropId(item.group.id)}
              isGhost={
                isGroupDragActive &&
                activeDragId === toGroupSortableId(item.group.id)
              }
              isHoveredForDrop={hoveredGroupId === item.group.id}
              key={item.group.id}
              sortableId={toGroupSortableId(item.group.id)}
              tabIds={item.tabs.map((tab) => tab.id)}
            >
              {item.tabs.map((tab) => renderTabNode(tab, item.group.color))}
            </TabGroupContainer>
          );
        }

        return renderTabNode(item.tab);
      })}
    </>
  );
}
