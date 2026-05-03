import { useDroppable } from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@litgit/ui/lib/utils";
import { GroupHeader } from "@/components/tabs/group-header";
import type { TabGroup } from "@/stores/tabs/tab-types";

interface TabGroupContainerProps {
  children: React.ReactNode;
  disableDrag?: boolean;
  group: TabGroup;
  groupDropId: string;
  isGhost?: boolean;
  isHoveredForDrop?: boolean;
  sortableId: string;
  tabIds: string[];
}

export function TabGroupContainer({
  group,
  sortableId,
  groupDropId,
  tabIds,
  disableDrag = false,
  isGhost = false,
  isHoveredForDrop = false,
  children,
}: TabGroupContainerProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    disabled: disableDrag,
    data: { type: "group", groupId: group.id },
  });

  const { setNodeRef: setDroppableRef } = useDroppable({
    id: groupDropId,
    data: { type: "group-drop", groupId: group.id },
  });

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
    ...(isHoveredForDrop ? { boxShadow: `0 0 0 2px ${group.color}` } : {}),
  };

  return (
    <div
      className={cn(
        "relative flex h-full items-center gap-1 px-1 py-1 transition-all",
        isDragging && "z-50",
        isHoveredForDrop && "bg-primary/5"
      )}
      ref={setNodeRef}
      style={style}
    >
      <div
        className="pointer-events-none absolute inset-x-4 top-0 z-20 h-7"
        ref={setDroppableRef}
      />

      <div
        className="pointer-events-none absolute inset-x-1 bottom-1 z-10 h-0.5 opacity-80"
        style={{ backgroundColor: group.color }}
      />

      <GroupHeader
        attributes={attributes}
        group={group}
        listeners={listeners}
      />
      <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
        <div
          className={cn(
            "z-0 flex h-full items-center gap-0.5",
            group.collapsed && "hidden"
          )}
        >
          {children}
        </div>
      </SortableContext>
    </div>
  );
}
