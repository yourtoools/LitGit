import { useCallback, useMemo } from "react";
import {
  GroupDragOverlay,
  TabDragOverlay,
} from "@/components/tabs/tab-bar-overlays";
import { TabBarRender } from "@/components/tabs/tab-bar-render";
import { useTabBarDerived } from "@/hooks/tabs/use-tab-bar-derived";
import { useTabUrlState } from "@/hooks/tabs/use-tab-url-state";
import { useUngroupConfirmation } from "@/hooks/tabs/use-ungroup-confirmation";
import {
  createTabListKeyDownHandler,
  useTabBarShortcuts,
} from "@/lib/tabs/tab-bar-shortcuts";
import { fromGroupSortableId } from "@/lib/tabs/tab-bar-utils";
import { useTabBarDnd } from "@/lib/tabs/use-tab-bar-dnd";
import { useTabBarScroll } from "@/lib/tabs/use-tab-bar-scroll";
import { useTabBarStoreState } from "@/lib/tabs/use-tab-bar-store-state";

export function TabBar() {
  const { tabs, groups, emptyGroupPromptId, activeLoadingTabSignals, actions } =
    useTabBarStoreState();

  const { activeTabId, setActiveTabFromUrl } = useTabUrlState();
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const isActiveRepoTabLoading =
    activeLoadingTabSignals.isLoadingBranches ||
    activeLoadingTabSignals.isLoadingHistory ||
    activeLoadingTabSignals.isLoadingStatus ||
    activeLoadingTabSignals.isLoadingWip;
  const activeTabIsLoading = Boolean(
    activeTab &&
      (activeTab.repoId
        ? isActiveRepoTabLoading
        : activeLoadingTabSignals.isRefreshingOpenedRepos)
  );
  const activeLoadingTabId = activeTabIsLoading ? activeTabId : null;

  const derived = useTabBarDerived({ tabs, groups });

  const ungroupConfirmation = useUngroupConfirmation({
    tabs: derived.sortedTabs,
    groups,
    getGroupTabCount: derived.getGroupTabCount,
    closeTab: actions.closeTab,
    removeTabFromGroup: actions.removeTabFromGroup,
    moveTab: actions.moveTab,
    ungroup: actions.ungroup,
  });

  const isSingleTab = tabs.length === 1;
  const scroll = useTabBarScroll({
    activeTabId,
    tabCount: derived.sortedTabs.length,
    groupCount: groups.length,
  });

  const emptyGroupPrompt = emptyGroupPromptId
    ? (derived.getGroupById(emptyGroupPromptId) ?? null)
    : null;

  const dnd = useTabBarDnd({
    tabBarRef: scroll.tabBarRef,
    addTabButtonWrapperRef: scroll.addTabButtonWrapperRef,
    topLevelSortableItems: derived.topLevelSortableItems,
    groupDropItems: derived.groupDropItems,
    tabsByGroupId: derived.tabsByGroupId,
    renderItems: derived.renderItems,
    sortedTabs: derived.sortedTabs,
    getTabById: derived.getTabById,
    getGroupStartIndex: derived.getGroupStartIndex,
    getGroupEndIndex: derived.getGroupEndIndex,
    getGroupTabCount: derived.getGroupTabCount,
    addTabToGroup: actions.addTabToGroup,
    moveGroup: actions.moveGroup,
    moveTab: actions.moveTab,
    moveTabWithinGroup: actions.moveTabWithinGroup,
    moveTabOutOfGroup: actions.moveTabOutOfGroup,
    queuePendingUngroup: ungroupConfirmation.queuePendingUngroup,
  });

  const handleCreateTabInEmptyGroup = () => {
    if (!emptyGroupPrompt) {
      return;
    }

    const newTabId = actions.addTab();

    if (newTabId) {
      actions.addTabToGroup(newTabId, emptyGroupPrompt.id);
      setActiveTabFromUrl(newTabId);
    }

    actions.dismissEmptyGroupPrompt();
  };

  const handleDeleteEmptyGroup = () => {
    if (!emptyGroupPrompt) {
      return;
    }

    actions.removeGroup(emptyGroupPrompt.id);
    actions.dismissEmptyGroupPrompt();
  };

  const handleAddTab = useCallback(() => {
    const newTabId = actions.addTab();

    if (newTabId) {
      setActiveTabFromUrl(newTabId);
    }
  }, [actions, setActiveTabFromUrl]);

  const handleCloseActiveTab = useCallback(() => {
    if (isSingleTab || !activeTabId) {
      return;
    }

    const currentIndex = derived.sortedTabs.findIndex(
      (tab) => tab.id === activeTabId
    );
    const fallbackTab =
      derived.sortedTabs[currentIndex + 1] ??
      derived.sortedTabs[currentIndex - 1] ??
      null;

    scroll.queueKeyboardFocusTabId(fallbackTab?.id ?? null);
    ungroupConfirmation.requestCloseTab(activeTabId);
  }, [
    activeTabId,
    derived.sortedTabs,
    isSingleTab,
    scroll.queueKeyboardFocusTabId,
    ungroupConfirmation.requestCloseTab,
  ]);

  const handleCycleTabs = useCallback(
    (direction: "next" | "previous") => {
      if (derived.sortedTabs.length === 0) {
        return;
      }

      const activeIndex = activeTabId
        ? derived.sortedTabs.findIndex((tab) => tab.id === activeTabId)
        : -1;
      const currentIndex = activeIndex >= 0 ? activeIndex : 0;
      const delta = direction === "next" ? 1 : -1;
      const nextIndex =
        (currentIndex + delta + derived.sortedTabs.length) %
        derived.sortedTabs.length;
      const nextTab = derived.sortedTabs[nextIndex];

      if (!nextTab) {
        return;
      }

      scroll.queueKeyboardFocusTabId(nextTab.id);
      setActiveTabFromUrl(nextTab.id);
    },
    [
      activeTabId,
      derived.sortedTabs,
      scroll.queueKeyboardFocusTabId,
      setActiveTabFromUrl,
    ]
  );

  useTabBarShortcuts({
    handleAddTab,
    handleCloseActiveTab,
    handleCycleTabs,
    reopenClosedTab: actions.reopenClosedTab,
  });

  const handleTabListKeyDown = useMemo(
    () =>
      createTabListKeyDownHandler({
        isSingleTab,
        queueKeyboardFocusTabId: scroll.queueKeyboardFocusTabId,
        requestCloseTab: ungroupConfirmation.requestCloseTab,
        setActiveTabFromUrl,
        sortedTabs: derived.sortedTabs,
      }),
    [
      derived.sortedTabs,
      isSingleTab,
      scroll.queueKeyboardFocusTabId,
      setActiveTabFromUrl,
      ungroupConfirmation.requestCloseTab,
    ]
  );

  const activeDragTab = useMemo(() => {
    if (!dnd.activeDragId || fromGroupSortableId(dnd.activeDragId)) {
      return null;
    }

    return derived.tabByIdMap.get(dnd.activeDragId) ?? null;
  }, [derived.tabByIdMap, dnd.activeDragId]);

  const activeDragGroupPreview = useMemo(() => {
    const activeGroupId =
      dnd.activeDragId && fromGroupSortableId(dnd.activeDragId)
        ? fromGroupSortableId(dnd.activeDragId)
        : null;

    if (!activeGroupId) {
      return null;
    }

    const activeGroup = derived.groupByIdMap.get(activeGroupId);

    if (!activeGroup) {
      return null;
    }

    return {
      group: activeGroup,
      tabs: derived.tabsByGroupId.get(activeGroup.id) ?? [],
    };
  }, [derived.groupByIdMap, derived.tabsByGroupId, dnd.activeDragId]);

  const activeDragTabPreview = useMemo(() => {
    if (!activeDragTab) {
      return null;
    }

    const groupColor = activeDragTab.groupId
      ? derived.groupByIdMap.get(activeDragTab.groupId)?.color
      : undefined;

    return {
      tab: activeDragTab,
      groupColor,
    };
  }, [activeDragTab, derived.groupByIdMap]);

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

  return (
    <TabBarRender
      activeDragId={dnd.activeDragId}
      activeLoadingTabId={activeLoadingTabId}
      activeTabId={activeTabId}
      addTabButtonWrapperRef={scroll.addTabButtonWrapperRef}
      canScrollLeft={scroll.canScrollLeft}
      canScrollRight={scroll.canScrollRight}
      clearDragState={dnd.clearDragState}
      clearPendingUngroup={ungroupConfirmation.clearPendingUngroup}
      collisionDetectionStrategy={dnd.collisionDetectionStrategy}
      confirmUngroupLastTab={ungroupConfirmation.confirmUngroupLastTab}
      dialogContent={ungroupConfirmation.dialogContent}
      dismissEmptyGroupPrompt={actions.dismissEmptyGroupPrompt}
      dragOverlayContent={dragOverlayContent}
      emptyGroupPrompt={emptyGroupPrompt}
      handleAddTab={handleAddTab}
      handleCreateTabInEmptyGroup={handleCreateTabInEmptyGroup}
      handleDeleteEmptyGroup={handleDeleteEmptyGroup}
      handleDragEnd={dnd.handleDragEnd}
      handleDragOver={dnd.handleDragOver}
      handleDragStart={dnd.handleDragStart}
      handleTabListKeyDown={handleTabListKeyDown}
      hoveredGroupId={dnd.hoveredGroupId}
      hoveredTabId={dnd.hoveredTabId}
      isGroupDragActive={dnd.isGroupDragActive}
      isSingleTab={isSingleTab}
      pendingUngroupTabDetails={ungroupConfirmation.pendingUngroupTabDetails}
      renderItems={derived.renderItems}
      requestCloseTab={ungroupConfirmation.requestCloseTab}
      requestUngroupTab={ungroupConfirmation.requestUngroupTab}
      restrictDragToTabStripBounds={dnd.restrictDragToTabStripBounds}
      scrollTabStrip={scroll.scrollTabStrip}
      sensors={dnd.sensors}
      setActiveTabFromUrl={setActiveTabFromUrl}
      tabBarRef={scroll.tabBarRef}
      topLevelSortableItems={derived.topLevelSortableItems}
    />
  );
}
