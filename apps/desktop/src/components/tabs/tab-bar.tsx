import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Button } from "@litgit/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@litgit/ui/components/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import {
  CaretLeftIcon,
  CaretRightIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MAX_DRAG_PREVIEW_TABS } from "@/components/tabs/lib/constants";
import {
  clamp,
  fromGroupDropId,
  fromGroupSortableId,
  getDragId,
  isTabUngrouped,
  toGroupSortableId,
} from "@/components/tabs/lib/tab-bar-utils";
import { TabItem } from "@/components/tabs/tab-item";
import { TabStripContent } from "@/components/tabs/tab-strip-content";
import type { Tab, TabGroup } from "@/components/tabs/types/tab-types";
import { UngroupConfirmDialog } from "@/components/tabs/ungroup-confirm-dialog";
import { useGroupHoverIntent } from "@/hooks/tabs/use-group-hover-intent";
import { useTabBarDerived } from "@/hooks/tabs/use-tab-bar-derived";
import { useTabUrlState } from "@/hooks/tabs/use-tab-url-state";
import { useUngroupConfirmation } from "@/hooks/tabs/use-ungroup-confirmation";
import {
  getNewTabShortcutLabel,
  isCloseTabShortcut,
  isEditableTarget,
  isPrimaryShortcut,
  isReopenClosedTabShortcut,
} from "@/lib/keyboard-shortcuts";
import { useRepoStore } from "@/stores/repo/use-repo-store";
import { useTabStore } from "@/stores/tabs/use-tab-store";

type DndModifier = NonNullable<
  ComponentProps<typeof DndContext>["modifiers"]
>[number];
type CollisionArgs = Parameters<CollisionDetection>[0];

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
const TAB_STRIP_SCROLL_EDGE_THRESHOLD = 2;
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

function GroupDragOverlay({ group, tabs }: GroupDragOverlayProps) {
  const shouldPreviewTabs = !group.collapsed;

  return (
    <div className="flex items-center gap-1 px-1 py-1">
      <div
        className="z-10 flex h-7 max-w-36 items-center gap-1.5 rounded-md px-2 font-medium text-white text-xs"
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

function TabDragOverlay({
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

export function TabBar() {
  const tabs = useTabStore((state) => state.tabs);
  const groups = useTabStore((state) => state.groups);
  const addTab = useTabStore((state) => state.addTab);
  const addTabToGroup = useTabStore((state) => state.addTabToGroup);
  const removeTabFromGroup = useTabStore((state) => state.removeTabFromGroup);
  const ungroup = useTabStore((state) => state.ungroup);
  const moveTab = useTabStore((state) => state.moveTab);
  const moveTabWithinGroup = useTabStore((state) => state.moveTabWithinGroup);
  const moveTabOutOfGroup = useTabStore((state) => state.moveTabOutOfGroup);
  const closeTab = useTabStore((state) => state.closeTab);
  const reopenClosedTab = useTabStore((state) => state.reopenClosedTab);
  const moveGroup = useTabStore((state) => state.moveGroup);
  const removeGroup = useTabStore((state) => state.removeGroup);
  const emptyGroupPromptId = useTabStore((state) => state.emptyGroupPromptId);
  const dismissEmptyGroupPrompt = useTabStore(
    (state) => state.dismissEmptyGroupPrompt
  );
  const isLoadingBranches = useRepoStore((state) => state.isLoadingBranches);
  const isLoadingHistory = useRepoStore((state) => state.isLoadingHistory);
  const isLoadingStatus = useRepoStore((state) => state.isLoadingStatus);
  const isLoadingWip = useRepoStore((state) => state.isLoadingWip);
  const isRefreshingOpenedRepos = useRepoStore(
    (state) => state.isRefreshingOpenedRepos
  );

  const { activeTabId, setActiveTabFromUrl } = useTabUrlState();
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const isActiveRepoTabLoading =
    isLoadingBranches || isLoadingHistory || isLoadingStatus || isLoadingWip;
  const activeTabIsLoading = Boolean(
    activeTab &&
      (activeTab.repoId ? isActiveRepoTabLoading : isRefreshingOpenedRepos)
  );
  const activeLoadingTabId = activeTabIsLoading ? activeTabId : null;

  const tabBarRef = useRef<HTMLDivElement>(null);
  const addTabButtonWrapperRef = useRef<HTMLDivElement>(null);
  const pendingKeyboardFocusTabIdRef = useRef<string | null>(null);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const {
    sortedTabs,
    renderItems,
    tabByIdMap,
    groupByIdMap,
    tabsByGroupId,
    topLevelSortableItems,
    groupDropItems,
    getTabById,
    getGroupById,
    getGroupStartIndex,
    getGroupEndIndex,
    getGroupTabCount,
  } = useTabBarDerived({ tabs, groups });

  const { hoveredGroupId, clearGroupHoverState, queueHoveredGroup } =
    useGroupHoverIntent();

  const {
    pendingUngroupTabDetails,
    dialogContent,
    queuePendingUngroup,
    clearPendingUngroup,
    requestCloseTab,
    requestUngroupTab,
    confirmUngroupLastTab,
  } = useUngroupConfirmation({
    tabs: sortedTabs,
    groups,
    getGroupTabCount,
    closeTab,
    removeTabFromGroup,
    moveTab,
    ungroup,
  });

  const isGroupDragActive = Boolean(
    activeDragId && fromGroupSortableId(activeDragId)
  );
  const isSingleTab = tabs.length === 1;
  const updateTabStripOverflow = useCallback(() => {
    const tabStrip = tabBarRef.current;

    if (!tabStrip) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    const maxScrollLeft = Math.max(
      0,
      tabStrip.scrollWidth - tabStrip.clientWidth
    );
    setCanScrollLeft(tabStrip.scrollLeft > TAB_STRIP_SCROLL_EDGE_THRESHOLD);
    setCanScrollRight(
      tabStrip.scrollLeft < maxScrollLeft - TAB_STRIP_SCROLL_EDGE_THRESHOLD
    );
  }, []);
  const focusTabButton = useCallback((tabId: string) => {
    const tabButton = tabBarRef.current?.querySelector<HTMLButtonElement>(
      `[data-tab-button="true"][data-tab-id="${tabId}"]`
    );

    tabButton?.focus({ preventScroll: true });
  }, []);
  const scrollTabStrip = useCallback((direction: "left" | "right") => {
    const tabStrip = tabBarRef.current;

    if (!tabStrip) {
      return;
    }

    const scrollDelta = Math.max(160, Math.round(tabStrip.clientWidth * 0.5));
    tabStrip.scrollBy({
      behavior: "smooth",
      left: direction === "left" ? -scrollDelta : scrollDelta,
    });
  }, []);

  useEffect(() => {
    if (!(tabBarRef.current && activeTabId)) {
      return;
    }

    const activeElement = tabBarRef.current.querySelector(
      `[data-tab-id="${activeTabId}"]`
    );

    activeElement?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeTabId]);

  useEffect(() => {
    if (pendingKeyboardFocusTabIdRef.current !== activeTabId || !activeTabId) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      focusTabButton(activeTabId);
      pendingKeyboardFocusTabIdRef.current = null;
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [activeTabId, focusTabButton]);

  useEffect(() => {
    const tabStrip = tabBarRef.current;

    if (!tabStrip) {
      return;
    }

    updateTabStripOverflow();
    const handleScroll = () => {
      updateTabStripOverflow();
    };
    tabStrip.addEventListener("scroll", handleScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      updateTabStripOverflow();
    });
    resizeObserver.observe(tabStrip);

    return () => {
      tabStrip.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
    };
  }, [updateTabStripOverflow]);

  useEffect(() => {
    const itemCount = sortedTabs.length + groups.length;
    const frameId = requestAnimationFrame(() => {
      if (itemCount >= 0) {
        updateTabStripOverflow();
      }
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [groups.length, sortedTabs.length, updateTabStripOverflow]);

  const emptyGroupPrompt = emptyGroupPromptId
    ? (getGroupById(emptyGroupPromptId) ?? null)
    : null;

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
  ) => {
    return droppableContainers.filter((container) => {
      const containerId = getDragId(container.id);
      return containerId ? topLevelSortableItems.includes(containerId) : false;
    });
  };

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

    if (topLevelDroppables.length > 0) {
      return closestCenter({
        ...args,
        droppableContainers: topLevelDroppables,
      });
    }

    return closestCenter({
      ...args,
      droppableContainers: getTopLevelDroppables(args.droppableContainers),
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

  const handleCreateTabInEmptyGroup = () => {
    if (!emptyGroupPrompt) {
      return;
    }

    const newTabId = addTab();

    if (newTabId) {
      addTabToGroup(newTabId, emptyGroupPrompt.id);
      setActiveTabFromUrl(newTabId);
    }

    dismissEmptyGroupPrompt();
  };

  const handleAddTab = useCallback(() => {
    const newTabId = addTab();

    if (newTabId) {
      setActiveTabFromUrl(newTabId);
    }
  }, [addTab, setActiveTabFromUrl]);

  const handleCloseActiveTab = useCallback(() => {
    if (isSingleTab || !activeTabId) {
      return;
    }

    const currentIndex = sortedTabs.findIndex((tab) => tab.id === activeTabId);
    const fallbackTab =
      sortedTabs[currentIndex + 1] ?? sortedTabs[currentIndex - 1] ?? null;

    pendingKeyboardFocusTabIdRef.current = fallbackTab?.id ?? null;
    requestCloseTab(activeTabId);
  }, [activeTabId, isSingleTab, requestCloseTab, sortedTabs]);

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

  const handleTabListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
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

      pendingKeyboardFocusTabIdRef.current = nextTab.id;
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

      pendingKeyboardFocusTabIdRef.current = fallbackTab?.id ?? null;
      requestCloseTab(focusedTabId);
    }
  };

  const activeDragTab = useMemo(() => {
    if (!activeDragId || fromGroupSortableId(activeDragId)) {
      return null;
    }

    return tabByIdMap.get(activeDragId) ?? null;
  }, [activeDragId, tabByIdMap]);

  const activeDragGroupPreview = useMemo(() => {
    const activeGroupId =
      activeDragId && fromGroupSortableId(activeDragId)
        ? fromGroupSortableId(activeDragId)
        : null;

    if (!activeGroupId) {
      return null;
    }

    const activeGroup = groupByIdMap.get(activeGroupId);

    if (!activeGroup) {
      return null;
    }

    return {
      group: activeGroup,
      tabs: tabsByGroupId.get(activeGroup.id) ?? [],
    };
  }, [activeDragId, groupByIdMap, tabsByGroupId]);

  const activeDragTabPreview = useMemo(() => {
    if (!activeDragTab) {
      return null;
    }

    const groupColor = activeDragTab.groupId
      ? groupByIdMap.get(activeDragTab.groupId)?.color
      : undefined;

    return {
      tab: activeDragTab,
      groupColor,
    };
  }, [activeDragTab, groupByIdMap]);

  const dragOverlayContent = useMemo(() => {
    if (activeDragGroupPreview) {
      return (
        <GroupDragOverlay
          group={activeDragGroupPreview.group}
          tabs={activeDragGroupPreview.tabs}
        />
      );
    }

    if (activeDragTabPreview) {
      return (
        <TabDragOverlay
          groupColor={activeDragTabPreview.groupColor}
          isActive={activeDragTabPreview.tab.id === activeTabId}
          isSingleTab={isSingleTab}
          tab={activeDragTabPreview.tab}
        />
      );
    }

    return null;
  }, [activeDragGroupPreview, activeDragTabPreview, activeTabId, isSingleTab]);

  const restrictDragToTabStripBounds: DndModifier = ({
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

  return (
    <DndContext
      collisionDetection={collisionDetectionStrategy}
      modifiers={[restrictToHorizontalAxis, restrictDragToTabStripBounds]}
      onDragCancel={clearDragState}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <SortableContext
        items={topLevelSortableItems}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex w-0 min-w-0 flex-1 items-center gap-1">
          <TooltipProvider delay={1000} timeout={0}>
            {canScrollLeft && (
              <Button
                aria-label="Scroll tabs left"
                className="h-8 w-6 shrink-0"
                onClick={() => scrollTabStrip("left")}
                size="icon-xs"
                variant="ghost"
              >
                <CaretLeftIcon />
              </Button>
            )}

            <div className="relative min-w-0 flex-1">
              {canScrollLeft && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-linear-to-r from-background to-transparent"
                />
              )}
              {canScrollRight && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-linear-to-l from-background to-transparent"
                />
              )}
              <div
                className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto"
                ref={tabBarRef}
              >
                <div
                  aria-describedby="tablist-keyboard-help"
                  aria-label="Open tabs"
                  aria-orientation="horizontal"
                  className="flex shrink-0 items-center gap-1"
                  onKeyDown={handleTabListKeyDown}
                  role="tablist"
                >
                  <p className="sr-only" id="tablist-keyboard-help">
                    Use Left and Right Arrow keys to switch tabs. Press Home or
                    End to jump. Press Delete to close the focused tab.
                  </p>
                  <TabStripContent
                    activeDragId={activeDragId}
                    activeLoadingTabId={activeLoadingTabId}
                    activeTabId={activeTabId}
                    hoveredGroupId={hoveredGroupId}
                    hoveredTabId={hoveredTabId}
                    isGroupDragActive={isGroupDragActive}
                    isSingleTab={isSingleTab}
                    onActivateTab={setActiveTabFromUrl}
                    onRequestCloseTab={requestCloseTab}
                    onRequestUngroupTab={requestUngroupTab}
                    renderItems={renderItems}
                  />
                </div>

                <div className="shrink-0" ref={addTabButtonWrapperRef}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          aria-label="Add new tab"
                          className="h-8 w-8"
                          onClick={handleAddTab}
                          size="icon"
                          variant="outline"
                        >
                          <PlusIcon />
                        </Button>
                      }
                    />
                    <TooltipContent side="bottom" sideOffset={8}>
                      {`New Tab (${getNewTabShortcutLabel()})`}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>

            {canScrollRight && (
              <Button
                aria-label="Scroll tabs right"
                className="h-8 w-6 shrink-0"
                onClick={() => scrollTabStrip("right")}
                size="icon-xs"
                variant="ghost"
              >
                <CaretRightIcon />
              </Button>
            )}
          </TooltipProvider>

          <Popover open={Boolean(emptyGroupPrompt)}>
            <PopoverTrigger
              render={
                <button className="sr-only" tabIndex={-1} type="button" />
              }
            >
              <span className="hidden" />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-80"
              side="bottom"
              sideOffset={8}
            >
              <PopoverHeader>
                <PopoverTitle>Empty group detected</PopoverTitle>
                <PopoverDescription>
                  {emptyGroupPrompt
                    ? `Group "${emptyGroupPrompt.name}" has no tabs.`
                    : "A group has no tabs."}
                </PopoverDescription>
              </PopoverHeader>
              <div className="flex items-center justify-end gap-2">
                <Button
                  onClick={handleCreateTabInEmptyGroup}
                  size="sm"
                  variant="outline"
                >
                  Add tab to group
                </Button>
                {emptyGroupPrompt && (
                  <Button
                    onClick={() => {
                      removeGroup(emptyGroupPrompt.id);
                      dismissEmptyGroupPrompt();
                    }}
                    size="sm"
                    variant="destructive"
                  >
                    <TrashIcon className="mr-1.5" />
                    Delete group
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </SortableContext>

      <UngroupConfirmDialog
        actionText={dialogContent.actionText}
        description={dialogContent.description}
        onConfirm={confirmUngroupLastTab}
        onOpenChange={(open) => {
          if (!open) {
            clearPendingUngroup();
          }
        }}
        open={Boolean(pendingUngroupTabDetails)}
        title={dialogContent.title}
      />

      <DragOverlay modifiers={[restrictDragToTabStripBounds]}>
        {dragOverlayContent}
      </DragOverlay>
    </DndContext>
  );
}
