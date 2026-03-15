import { Button } from "@litgit/ui/components/button";
import {
  Combobox,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@litgit/ui/components/combobox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@litgit/ui/components/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { useWindowEvent } from "@mantine/hooks";
import {
  CaretDownIcon,
  FileIcon,
  GraphIcon,
  XIcon,
} from "@phosphor-icons/react";
import type React from "react";
import { useMemo, useState } from "react";
import { UngroupConfirmDialog } from "@/components/tabs/ungroup-confirm-dialog";
import { useOpenRepositoryTabRouting } from "@/hooks/tabs/use-open-repository-tab-routing";
import { useTabUrlState } from "@/hooks/tabs/use-tab-url-state";
import { useUngroupConfirmation } from "@/hooks/tabs/use-ungroup-confirmation";
import {
  COMBOBOX_DEBOUNCE_DELAY_MS,
  normalizeComboboxQuery,
  useDebouncedValue,
} from "@/hooks/use-debounced-value";
import {
  getSearchTabsShortcutLabel,
  isEditableTarget,
  isSearchTabsShortcut,
} from "@/lib/keyboard-shortcuts";
import { useTabStore } from "@/stores/tabs/use-tab-store";

interface SearchTabItem {
  groupId: string | null;
  id: string;
  repoId: string | null;
  tabId: string;
  title: string;
  type: "closed" | "open";
}

const SCROLLBAR_CLASSES =
  "[scrollbar-color:color-mix(in_oklab,var(--color-muted-foreground)_55%,transparent)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/45 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2";

export function HeaderTabsSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedDebouncedQuery = useDebouncedValue(
    query,
    COMBOBOX_DEBOUNCE_DELAY_MS,
    normalizeComboboxQuery
  );
  const tabs = useTabStore((state) => state.tabs);
  const groups = useTabStore((state) => state.groups);
  const closedTabHistory = useTabStore((state) => state.closedTabHistory);
  const closeTab = useTabStore((state) => state.closeTab);
  const removeTabFromGroup = useTabStore((state) => state.removeTabFromGroup);
  const moveTab = useTabStore((state) => state.moveTab);
  const ungroup = useTabStore((state) => state.ungroup);
  const { setActiveTabFromUrl } = useTabUrlState();
  const { routeRepository } = useOpenRepositoryTabRouting();
  const addTab = useTabStore((state) => state.addTab);

  const {
    dialogContent,
    pendingUngroupTabDetails,
    clearPendingUngroup,
    requestCloseTab,
    confirmUngroupLastTab,
  } = useUngroupConfirmation({
    tabs,
    groups,
    getGroupTabCount: (groupId) =>
      tabs.filter((t) => t.groupId === groupId).length,
    closeTab,
    removeTabFromGroup,
    moveTab,
    ungroup,
  });

  const parsedItems = useMemo(() => {
    const openItems: SearchTabItem[] = tabs.map((t) => ({
      groupId: t.groupId,
      id: `open-${t.id}`,
      repoId: t.repoId,
      tabId: t.id,
      title: t.title,
      type: "open",
    }));

    const openRepoIds = new Set(
      openItems.filter((i) => i.repoId !== null).map((i) => i.repoId)
    );
    const hasOpenNewTab = openItems.some((i) => i.repoId === null);

    const closedItems: SearchTabItem[] = [];
    let hasClosedNewTab = false;
    const seenClosedRepoIds = new Set<string>();

    for (let i = 0; i < closedTabHistory.length; i++) {
      if (!closedTabHistory[i]) {
        continue;
      }

      const c = closedTabHistory[i];

      if (c.tab.repoId === null) {
        if (hasOpenNewTab || hasClosedNewTab) {
          continue;
        }
        hasClosedNewTab = true;
      } else {
        if (
          openRepoIds.has(c.tab.repoId) ||
          seenClosedRepoIds.has(c.tab.repoId)
        ) {
          continue;
        }
        seenClosedRepoIds.add(c.tab.repoId);
      }

      closedItems.push({
        groupId: c.tab.groupId,
        id: `closed-${c.tab.id}-${i}`,
        repoId: c.tab.repoId,
        tabId: c.tab.id,
        title: c.tab.title,
        type: "closed",
      });
    }

    return { closedItems, openItems };
  }, [tabs, closedTabHistory]);

  const filteredOpen = useMemo(() => {
    if (normalizedDebouncedQuery.length === 0) {
      return parsedItems.openItems;
    }

    return parsedItems.openItems.filter((i) =>
      i.title.toLowerCase().includes(normalizedDebouncedQuery)
    );
  }, [normalizedDebouncedQuery, parsedItems.openItems]);

  const filteredClosed = useMemo(() => {
    if (normalizedDebouncedQuery.length === 0) {
      return parsedItems.closedItems;
    }

    return parsedItems.closedItems.filter((i) =>
      i.title.toLowerCase().includes(normalizedDebouncedQuery)
    );
  }, [normalizedDebouncedQuery, parsedItems.closedItems]);

  const hasResults = filteredOpen.length > 0 || filteredClosed.length > 0;

  useWindowEvent("keydown", (event) => {
    if (event.repeat || isEditableTarget(event.target)) {
      return;
    }

    if (!isSearchTabsShortcut(event)) {
      return;
    }

    event.preventDefault();
    setOpen((prev) => !prev);
  });

  const handleSelect = async (val: SearchTabItem | null) => {
    if (!val) {
      return;
    }
    setOpen(false);
    if (val.type === "open") {
      setActiveTabFromUrl(val.tabId);
    } else if (val.repoId) {
      const existingOpen = tabs.find((t) => t.repoId === val.repoId);
      if (existingOpen) {
        setActiveTabFromUrl(existingOpen.id);
        return;
      }
      await routeRepository(val.repoId, val.title);
    } else {
      const newId = addTab();
      setActiveTabFromUrl(newId);
    }
  };

  const handleCloseTab = (event: React.MouseEvent, item: SearchTabItem) => {
    event.stopPropagation();
    event.preventDefault();
    requestCloseTab(item.tabId);
  };

  return (
    <>
      <Popover
        onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) {
            setQuery("");
          }
        }}
        open={open}
      >
        <TooltipProvider delay={1000}>
          <Tooltip>
            <TooltipTrigger
              render={
                <PopoverTrigger
                  render={
                    <Button
                      aria-label="Search Opened Tabs"
                      className="focus-visible:desktop-focus text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:ring-0! focus-visible:ring-offset-0! dark:hover:bg-transparent"
                      size="icon"
                      variant="ghost"
                    />
                  }
                />
              }
            >
              <CaretDownIcon />
            </TooltipTrigger>
            <TooltipContent>
              Search Opened Tabs ({getSearchTabsShortcutLabel()})
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <PopoverContent align="end" className="w-88 p-0" sideOffset={8}>
          <Combobox
            filter={null}
            inputValue={query}
            itemToStringLabel={(item: SearchTabItem) => item.title}
            onInputValueChange={(nextInputValue) => {
              setQuery(nextInputValue);
            }}
            onValueChange={(val) => {
              handleSelect(val).catch(() => {
                return;
              });
            }}
            open
          >
            <div className="border-b px-3 py-2">
              <ComboboxInput
                autoFocus
                className="flex h-7 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
                placeholder="Search tabs..."
                showClear
                showTrigger={false}
              />
            </div>
            <ComboboxList
              className={`overflow-x-hidden overscroll-contain p-1.5 ${SCROLLBAR_CLASSES}`}
              style={{ maxHeight: "min(40vh, 320px)" }}
            >
              {!hasResults && (
                <div className="py-6 text-center text-muted-foreground text-sm">
                  No matching tabs found.
                </div>
              )}

              {filteredOpen.length > 0 && (
                <ComboboxGroup>
                  <ComboboxLabel className="px-2 py-1.5 font-semibold text-muted-foreground text-xs">
                    Open Tabs
                  </ComboboxLabel>
                  {filteredOpen.map((item) => (
                    <ComboboxItem
                      className="group/tab-item relative flex w-full cursor-default select-none items-center px-2 py-1.5 text-sm outline-hidden data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50"
                      key={item.id}
                      value={item}
                    >
                      {item.repoId ? (
                        <GraphIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <FileIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="flex-1 truncate">{item.title}</span>
                      <button
                        aria-label={`Close ${item.title}`}
                        className="focus-visible:desktop-focus-strong ml-auto flex size-6 shrink-0 items-center justify-center opacity-0 transition-opacity hover:bg-muted focus-visible:opacity-100 group-data-highlighted/tab-item:opacity-100"
                        onClick={(e) => handleCloseTab(e, item)}
                        type="button"
                      >
                        <XIcon className="size-3.5 text-muted-foreground" />
                      </button>
                    </ComboboxItem>
                  ))}
                </ComboboxGroup>
              )}

              {filteredClosed.length > 0 && (
                <>
                  {filteredOpen.length > 0 && (
                    <div className="-mx-1 my-1 h-px bg-border" />
                  )}
                  <ComboboxGroup>
                    <ComboboxLabel className="px-2 py-1.5 font-semibold text-muted-foreground text-xs">
                      Closed Recently
                    </ComboboxLabel>
                    {filteredClosed.map((item) => (
                      <ComboboxItem
                        className="relative flex w-full cursor-default select-none items-center px-2 py-1.5 text-sm outline-hidden data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50"
                        key={item.id}
                        value={item}
                      >
                        {item.repoId ? (
                          <GraphIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <FileIcon className="mr-2 size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="flex-1 truncate">{item.title}</span>
                      </ComboboxItem>
                    ))}
                  </ComboboxGroup>
                </>
              )}
            </ComboboxList>
          </Combobox>
        </PopoverContent>
      </Popover>

      <UngroupConfirmDialog
        actionText={dialogContent.actionText}
        description={dialogContent.description}
        onConfirm={confirmUngroupLastTab}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            clearPendingUngroup();
          }
        }}
        open={Boolean(pendingUngroupTabDetails)}
        title={dialogContent.title}
      />
    </>
  );
}
