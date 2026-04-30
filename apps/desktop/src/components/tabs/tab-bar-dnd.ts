import {
  type CollisionDetection,
  closestCenter,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  type Modifier,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { type RefObject, useState } from "react";
import {
  clamp,
  fromGroupDropId,
  fromGroupSortableId,
  getDragId,
  isTabUngrouped,
  toGroupSortableId,
} from "@/components/tabs/lib/tab-bar-utils";
import type {
  PendingUngroupTab,
  RenderItem,
} from "@/components/tabs/types/tab-bar-types";
import type { Tab } from "@/components/tabs/types/tab-types";
import { useGroupHoverIntent } from "@/hooks/tabs/use-group-hover-intent";

type CollisionArgs = Parameters<CollisionDetection>[0];

interface UseTabBarDndParams {
  addTabButtonWrapperRef: RefObject<HTMLDivElement | null>;
  addTabToGroup: (tabId: string, groupId: string) => void;
  getGroupEndIndex: (groupId: string) => number;
  getGroupStartIndex: (groupId: string) => number;
  getGroupTabCount: (groupId: string) => number;
  getTabById: (tabId: string) => Tab | undefined;
  groupDropItems: string[];
  moveGroup: (groupId: string, index: number) => void;
  moveTab: (tabId: string, index: number) => void;
  moveTabOutOfGroup: (tabId: string, index: number) => void;
  moveTabWithinGroup: (tabId: string, overId: string) => void;
  queuePendingUngroup: (pending: PendingUngroupTab) => void;
  renderItems: RenderItem[];
  sortedTabs: Tab[];
  tabBarRef: RefObject<HTMLDivElement | null>;
  tabsByGroupId: Map<string, Tab[]>;
  topLevelSortableItems: string[];
}

export interface UseTabBarDndReturn {
  activeDragId: string | null;
  clearDragState: () => void;
  collisionDetectionStrategy: CollisionDetection;
  handleDragEnd: (event: DragEndEvent) => void;
  handleDragOver: (event: DragOverEvent) => void;
  handleDragStart: (event: DragStartEvent) => void;
  hoveredGroupId: string | null;
  hoveredTabId: string | null;
  isGroupDragActive: boolean;
  restrictDragToTabStripBounds: Modifier;
  sensors: ReturnType<typeof useSensors>;
}

export const useTabBarDnd = ({
  tabBarRef,
  addTabButtonWrapperRef,
  topLevelSortableItems,
  groupDropItems,
  tabsByGroupId,
  renderItems,
  sortedTabs,
  getTabById,
  getGroupStartIndex,
  getGroupEndIndex,
  getGroupTabCount,
  addTabToGroup,
  moveGroup,
  moveTab,
  moveTabWithinGroup,
  moveTabOutOfGroup,
  queuePendingUngroup,
}: UseTabBarDndParams): UseTabBarDndReturn => {
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const { hoveredGroupId, clearGroupHoverState, queueHoveredGroup } =
    useGroupHoverIntent();

  const isGroupDragActive = Boolean(
    activeDragId && fromGroupSortableId(activeDragId)
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const resolveDropIndex = (overId: string): number | null => {
    const overGroupId = fromGroupSortableId(overId);

    if (overGroupId) {
      const groupStartIndex = getGroupStartIndex(overGroupId);
      return groupStartIndex >= 0 ? groupStartIndex : null;
    }

    const overTab = getTabById(overId);

    if (!overTab) {
      return null;
    }

    if (overTab.groupId) {
      const groupStartIndex = getGroupStartIndex(overTab.groupId);
      return groupStartIndex >= 0 ? groupStartIndex : null;
    }

    return overTab.order;
  };

  const clearDragState = () => {
    clearGroupHoverState();
    setHoveredTabId(null);
    setActiveDragId(null);
  };

  const handleGroupDragEnd = (activeId: string, overId: string) => {
    const resolvedOverId = (() => {
      const overGroupId = fromGroupSortableId(overId);

      if (overGroupId) {
        return toGroupSortableId(overGroupId);
      }

      const overTab = getTabById(overId);

      if (overTab?.groupId) {
        return toGroupSortableId(overTab.groupId);
      }

      return overId;
    })();

    const flatItems = renderItems.map((item) => ({
      id:
        item.type === "group" ? toGroupSortableId(item.group.id) : item.tab.id,
      tabCount: item.type === "group" ? item.tabs.length : 1,
    }));
    const flatIds = flatItems.map((item) => item.id);

    const oldIndex = flatIds.indexOf(activeId);
    const newIndex = flatIds.indexOf(resolvedOverId);
    const activeGroupId = fromGroupSortableId(activeId);

    if (oldIndex === -1 || newIndex === -1 || !activeGroupId) {
      return;
    }

    const reorderedItems = arrayMove(flatItems, oldIndex, newIndex);
    const movedIndex = reorderedItems.findIndex((item) => item.id === activeId);

    if (movedIndex < 0) {
      return;
    }

    const insertionIndex = reorderedItems
      .slice(0, movedIndex)
      .reduce((total, item) => total + item.tabCount, 0);

    moveGroup(activeGroupId, insertionIndex);
  };

  const handleGroupedTabDrop = (
    activeTab: Tab,
    activeId: string,
    overId: string
  ) => {
    const activeGroupId = activeTab.groupId;

    if (!activeGroupId) {
      return;
    }

    const overTab = getTabById(overId);
    const targetGroupId =
      fromGroupSortableId(overId) ?? overTab?.groupId ?? null;

    if (targetGroupId === activeGroupId) {
      if (overTab?.groupId === activeGroupId) {
        moveTabWithinGroup(activeId, overId);
      }
      return;
    }

    if (targetGroupId) {
      addTabToGroup(activeId, targetGroupId);
      return;
    }

    if (getGroupTabCount(activeGroupId) === 1) {
      queuePendingUngroup({
        tabId: activeId,
        groupId: activeGroupId,
        dropIndex: resolveDropIndex(overId),
        action: "ungroup",
      });
      return;
    }

    const groupStart = getGroupStartIndex(activeGroupId);
    const groupEnd = getGroupEndIndex(activeGroupId);
    const overOrder = overTab?.order ?? resolveDropIndex(overId);

    if (overOrder === null) {
      return;
    }

    const dropIndex = overOrder < groupStart ? groupStart : groupEnd;
    moveTabOutOfGroup(activeId, dropIndex);
  };

  const handleUngroupedTabDrop = (activeId: string, overId: string) => {
    const resolvedOverId = (() => {
      const overGroupId =
        fromGroupDropId(overId) ?? fromGroupSortableId(overId);

      if (overGroupId) {
        return toGroupSortableId(overGroupId);
      }

      const overTab = getTabById(overId);

      if (overTab?.groupId) {
        return toGroupSortableId(overTab.groupId);
      }

      return overId;
    })();

    const oldIndex = topLevelSortableItems.indexOf(activeId);
    const newIndex = topLevelSortableItems.indexOf(resolvedOverId);

    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return;
    }

    const reorderedItems = arrayMove(topLevelSortableItems, oldIndex, newIndex);
    const movedIndex = reorderedItems.indexOf(activeId);

    if (movedIndex < 0) {
      return;
    }

    const insertionIndex = reorderedItems
      .slice(0, movedIndex)
      .reduce((total, itemId) => {
        const groupId = fromGroupSortableId(itemId);

        if (!groupId) {
          return total + 1;
        }

        return total + getGroupTabCount(groupId);
      }, 0);

    moveTab(activeId, clamp(insertionIndex, 0, sortedTabs.length - 1));
  };

  const handleDragEndWithoutDropTarget = (activeId: string) => {
    const activeTab = getTabById(activeId);

    if (!activeTab?.groupId) {
      clearDragState();
      return;
    }

    if (getGroupTabCount(activeTab.groupId) === 1) {
      queuePendingUngroup({
        tabId: activeId,
        groupId: activeTab.groupId,
        dropIndex: activeTab.order,
        action: "ungroup",
      });
      clearDragState();
      return;
    }

    moveTabOutOfGroup(activeId, activeTab.order);
    clearDragState();
  };

  const getTopLevelDroppables = (
    droppableContainers: CollisionArgs["droppableContainers"]
  ) =>
    droppableContainers.filter((container) => {
      const containerId = getDragId(container.id);
      return containerId ? topLevelSortableItems.includes(containerId) : false;
    });

  const detectUngroupedTabCollision = (args: CollisionArgs) => {
    const groupDropContainers = args.droppableContainers.filter((container) => {
      const containerId = getDragId(container.id);
      return containerId ? groupDropItems.includes(containerId) : false;
    });

    const groupHitResult = pointerWithin({
      ...args,
      droppableContainers: groupDropContainers,
    });

    if (groupHitResult.length > 0) {
      return groupHitResult;
    }

    const topLevelDroppables = getTopLevelDroppables(args.droppableContainers);

    const topLevelPointerHit = pointerWithin({
      ...args,
      droppableContainers: topLevelDroppables,
    });

    if (topLevelPointerHit.length > 0) {
      return topLevelPointerHit;
    }

    return closestCenter({
      ...args,
      droppableContainers: topLevelDroppables,
    });
  };

  const detectGroupedTabCollision = (
    args: CollisionArgs,
    activeId: string,
    activeGroupId: string
  ) => {
    const sameGroupSortableId = toGroupSortableId(activeGroupId);
    const sameGroupTabIds = (tabsByGroupId.get(activeGroupId) ?? [])
      .filter((tab) => tab.id !== activeId)
      .map((tab) => tab.id);
    const groupRect = args.droppableRects.get(sameGroupSortableId);
    const pointerX = args.pointerCoordinates?.x;
    const isOutsideGroup =
      groupRect != null &&
      pointerX != null &&
      (pointerX < groupRect.left || pointerX > groupRect.right);

    if (isOutsideGroup) {
      const outsideContainers = args.droppableContainers.filter((container) => {
        const containerId = getDragId(container.id);

        if (!containerId) {
          return false;
        }

        return (
          topLevelSortableItems.includes(containerId) &&
          containerId !== sameGroupSortableId
        );
      });

      return closestCenter({
        ...args,
        droppableContainers: outsideContainers,
      });
    }

    const sameGroupContainers = args.droppableContainers.filter((container) => {
      const containerId = getDragId(container.id);
      return containerId != null && sameGroupTabIds.includes(containerId);
    });

    const withinResult = pointerWithin({
      ...args,
      droppableContainers: sameGroupContainers,
    });

    if (withinResult.length > 0) {
      return withinResult;
    }

    return closestCenter({
      ...args,
      droppableContainers: sameGroupContainers,
    });
  };

  const collisionDetectionStrategy: CollisionDetection = (args) => {
    const activeId = getDragId(args.active.id);

    if (!activeId) {
      return closestCenter(args);
    }

    if (fromGroupSortableId(activeId)) {
      return closestCenter({
        ...args,
        droppableContainers: getTopLevelDroppables(args.droppableContainers),
      });
    }

    const activeTab = getTabById(activeId);

    if (activeTab && !activeTab.groupId) {
      return detectUngroupedTabCollision(args);
    }

    if (activeTab?.groupId) {
      return detectGroupedTabCollision(args, activeId, activeTab.groupId);
    }

    return closestCenter(args);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(getDragId(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const activeId = getDragId(event.active.id);
    const overId = getDragId(event.over?.id);

    if (!(activeId && overId) || activeId === overId) {
      setHoveredTabId(null);
      clearGroupHoverState();
      return;
    }

    if (fromGroupSortableId(activeId)) {
      setHoveredTabId(null);
      clearGroupHoverState();
      return;
    }

    const activeTab = getTabById(activeId);
    const overTab = getTabById(overId);
    const isUngroupedTabDrag = isTabUngrouped(activeTab);

    if (isUngroupedTabDrag && overTab?.groupId) {
      setHoveredTabId(overId);
    } else {
      setHoveredTabId(null);
    }

    if (isUngroupedTabDrag) {
      const primaryOverGroupId = fromGroupDropId(overId);

      if (primaryOverGroupId) {
        queueHoveredGroup(primaryOverGroupId);
        return;
      }
    }

    clearGroupHoverState();
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = getDragId(event.active.id);
    const overId = getDragId(event.over?.id);
    const hoveredGroupIdAtDrop = hoveredGroupId;

    if (activeId && !overId) {
      handleDragEndWithoutDropTarget(activeId);
      return;
    }

    clearDragState();

    if (!(activeId && overId) || activeId === overId) {
      return;
    }

    if (fromGroupSortableId(activeId)) {
      handleGroupDragEnd(activeId, overId);
      return;
    }

    const activeTab = getTabById(activeId);

    if (!activeTab) {
      return;
    }

    if (activeTab.groupId) {
      handleGroupedTabDrop(activeTab, activeId, overId);
      return;
    }

    if (hoveredGroupIdAtDrop) {
      addTabToGroup(activeId, hoveredGroupIdAtDrop);
      return;
    }

    handleUngroupedTabDrop(activeId, overId);
  };

  const restrictDragToTabStripBounds: Modifier = ({
    active,
    activeNodeRect,
    transform,
  }) => {
    const activeId = getDragId(active?.id);

    if (!activeId) {
      return transform;
    }

    const isGroupDrag = Boolean(fromGroupSortableId(activeId));
    const isTabDrag = Boolean(getTabById(activeId));

    if (!(isGroupDrag || isTabDrag)) {
      return transform;
    }

    const tabStripRect = tabBarRef.current?.getBoundingClientRect();
    const addButtonRect =
      addTabButtonWrapperRef.current?.getBoundingClientRect();

    if (!(activeNodeRect && tabStripRect && addButtonRect)) {
      return transform;
    }

    const minX = tabStripRect.left - activeNodeRect.left;
    const maxX = Math.max(
      minX,
      addButtonRect.left - activeNodeRect.width - activeNodeRect.left
    );

    return {
      ...transform,
      x: clamp(transform.x, minX, maxX),
      y: 0,
    };
  };

  return {
    activeDragId,
    hoveredTabId,
    hoveredGroupId,
    isGroupDragActive,
    sensors,
    collisionDetectionStrategy,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    clearDragState,
    restrictDragToTabStripBounds,
  };
};
