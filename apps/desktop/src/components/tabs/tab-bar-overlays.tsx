import { TabItem } from "@/components/tabs/tab-item";
import { MAX_DRAG_PREVIEW_TABS } from "@/lib/tabs/tab-constants";
import type { Tab, TabGroup } from "@/stores/tabs/tab-types";

interface GroupDragOverlayProps {
  group: TabGroup;
  tabs: Tab[];
}

interface TabDragOverlayProps {
  groupColor?: string;
  isActive: boolean;
  isSingleTab: boolean;
  tab: Tab;
}

const noop = () => undefined;

export function GroupDragOverlay({ group, tabs }: GroupDragOverlayProps) {
  const shouldPreviewTabs = !group.collapsed;

  return (
    <div className="flex items-center gap-1 px-1 py-1">
      <div
        className="z-10 flex h-7 max-w-36 items-center gap-1.5 px-2 font-medium text-white text-xs"
        style={{ backgroundColor: group.color }}
      >
        <span className="truncate" title={group.name}>
          {group.name}
        </span>
      </div>
      {shouldPreviewTabs && (
        <div className="flex items-center gap-0.5">
          {tabs.slice(0, MAX_DRAG_PREVIEW_TABS).map((tab) => (
            <div
              className="inline-flex h-8 w-28 items-center border border-border/70 bg-muted/70 px-2 text-xs"
              key={tab.id}
            >
              <span className="truncate">{tab.title}</span>
            </div>
          ))}
          {tabs.length > MAX_DRAG_PREVIEW_TABS && (
            <div className="inline-flex h-8 items-center border border-border/70 bg-muted/60 px-2 text-xs">
              +{tabs.length - MAX_DRAG_PREVIEW_TABS}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TabDragOverlay({
  tab,
  isSingleTab,
  isActive,
  groupColor,
}: TabDragOverlayProps) {
  return (
    <div className="pointer-events-none">
      <TabItem
        groupColor={groupColor}
        isActive={isActive}
        isSingleTab={isSingleTab}
        onActivate={noop}
        onClose={noop}
        tab={tab}
      />
    </div>
  );
}
