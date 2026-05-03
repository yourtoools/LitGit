import { DndContext, DragOverlay } from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  horizontalListSortingStrategy,
  SortableContext,
} from "@dnd-kit/sortable";
import { Button } from "@litgit/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { CaretLeftIcon, CaretRightIcon, PlusIcon } from "@phosphor-icons/react";
import type { KeyboardEventHandler, ReactNode, RefObject } from "react";
import { EmptyGroupDialog } from "@/components/tabs/empty-group-dialog";
import { TabStripContent } from "@/components/tabs/tab-strip-content";
import { UngroupConfirmDialog } from "@/components/tabs/ungroup-confirm-dialog";
import { getNewTabShortcutLabel } from "@/lib/keyboard-shortcuts";
import type {
  PendingUngroupTabDetails,
  RenderItem,
  UngroupConfirmDialogContent,
} from "@/lib/tabs/tab-bar-types";
import type { UseTabBarDndReturn } from "@/lib/tabs/use-tab-bar-dnd";
import type { TabGroup } from "@/stores/tabs/tab-types";

interface TabBarRenderProps {
  activeDragId: string | null;
  activeLoadingTabId: string | null;
  activeTabId: string | null;
  addTabButtonWrapperRef: RefObject<HTMLDivElement | null>;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  clearDragState: UseTabBarDndReturn["clearDragState"];
  clearPendingUngroup: () => void;
  collisionDetectionStrategy: UseTabBarDndReturn["collisionDetectionStrategy"];
  confirmUngroupLastTab: () => void;
  dialogContent: UngroupConfirmDialogContent;
  dismissEmptyGroupPrompt: () => void;
  dragOverlayContent: ReactNode;
  emptyGroupPrompt: TabGroup | null;
  handleAddTab: () => void;
  handleCreateTabInEmptyGroup: () => void;
  handleDeleteEmptyGroup: () => void;
  handleDragEnd: UseTabBarDndReturn["handleDragEnd"];
  handleDragOver: UseTabBarDndReturn["handleDragOver"];
  handleDragStart: UseTabBarDndReturn["handleDragStart"];
  handleTabListKeyDown: KeyboardEventHandler<HTMLDivElement>;
  hoveredGroupId: string | null;
  hoveredTabId: string | null;
  isGroupDragActive: boolean;
  isSingleTab: boolean;
  pendingUngroupTabDetails: PendingUngroupTabDetails | null;
  renderItems: RenderItem[];
  requestCloseTab: (id: string) => void;
  requestUngroupTab: (id: string) => void;
  restrictDragToTabStripBounds: UseTabBarDndReturn["restrictDragToTabStripBounds"];
  scrollTabStrip: (direction: "left" | "right") => void;
  sensors: UseTabBarDndReturn["sensors"];
  setActiveTabFromUrl: (id: string) => void;
  tabBarRef: RefObject<HTMLDivElement | null>;
  topLevelSortableItems: string[];
}

export function TabBarRender(props: TabBarRenderProps) {
  const {
    activeDragId,
    activeLoadingTabId,
    activeTabId,
    addTabButtonWrapperRef,
    canScrollLeft,
    canScrollRight,
    clearDragState,
    clearPendingUngroup,
    collisionDetectionStrategy,
    confirmUngroupLastTab,
    dialogContent,
    dismissEmptyGroupPrompt,
    dragOverlayContent,
    emptyGroupPrompt,
    handleAddTab,
    handleCreateTabInEmptyGroup,
    handleDeleteEmptyGroup,
    handleDragEnd,
    handleDragOver,
    handleDragStart,
    handleTabListKeyDown,
    hoveredGroupId,
    hoveredTabId,
    isGroupDragActive,
    isSingleTab,
    pendingUngroupTabDetails,
    renderItems,
    requestCloseTab,
    requestUngroupTab,
    restrictDragToTabStripBounds,
    scrollTabStrip,
    sensors,
    setActiveTabFromUrl,
    tabBarRef,
    topLevelSortableItems,
  } = props;
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

                {/* Inline add tab button - visible when no overflow */}
                {!canScrollRight && (
                  <div className="shrink-0" ref={addTabButtonWrapperRef}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            aria-label="Add new tab"
                            className="focus-visible:desktop-focus h-8 w-8 focus-visible:ring-0! focus-visible:ring-offset-0!"
                            onClick={handleAddTab}
                            size="icon"
                            variant="ghost"
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
                )}
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

            {/* Fixed add tab button - visible when overflow */}
            {canScrollRight && (
              <div className="shrink-0" ref={addTabButtonWrapperRef}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Add new tab"
                        className="focus-visible:desktop-focus h-8 w-8 focus-visible:ring-0! focus-visible:ring-offset-0!"
                        onClick={handleAddTab}
                        size="icon"
                        variant="ghost"
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
            )}
          </TooltipProvider>

          <EmptyGroupDialog
            group={emptyGroupPrompt}
            onDeleteGroup={handleDeleteEmptyGroup}
            onKeepGroup={handleCreateTabInEmptyGroup}
            onOpenChange={(open) => {
              if (!open) {
                dismissEmptyGroupPrompt();
              }
            }}
          />
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
