import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@litgit/ui/lib/utils";
import { TabItem } from "@/components/tabs/tab-item";
import type { Tab } from "@/stores/tabs/tab-types";

interface SortableTabItemProps {
  disabled?: boolean;
  groupColor?: string;
  isActive: boolean;
  isFirst?: boolean;
  isGhost?: boolean;
  isHoveredForGroup?: boolean;
  isLoading?: boolean;
  isSingleTab: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  tab: Tab;
}

export function SortableTabItem(props: SortableTabItemProps) {
  const {
    tab,
    disabled = false,
    isGhost = false,
    isActive,
    isFirst = false,
    isLoading = false,
    isSingleTab,
    groupColor,
    onActivate,
    onClose,
    isHoveredForGroup,
  } = props;
  const sortable = useSortable({ id: tab.id, disabled });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = sortable;

  const opacity = (() => {
    if (isGhost) {
      return 0;
    }

    return isDragging ? 0.5 : 1;
  })();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity,
  };

  return (
    <div
      className={cn(
        "relative",
        isGhost && "pointer-events-none",
        isHoveredForGroup && "ring-2 ring-primary ring-offset-1"
      )}
      data-tab-id={tab.id}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <TabItem
        groupColor={groupColor}
        isActive={isActive}
        isFirst={isFirst}
        isLoading={isLoading}
        isSingleTab={isSingleTab}
        onActivate={onActivate}
        onClose={onClose}
        tab={tab}
      />
    </div>
  );
}
