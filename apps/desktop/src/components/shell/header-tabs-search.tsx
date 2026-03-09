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
import {
  CaretDownIcon,
  FileIcon,
  GraphIcon,
  XIcon,
} from "@phosphor-icons/react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { UngroupConfirmDialog } from "@/components/tabs/ungroup-confirm-dialog";
import { useOpenRepositoryTabRouting } from "@/hooks/tabs/use-open-repository-tab-routing";
import { useTabUrlState } from "@/hooks/tabs/use-tab-url-state";
import { useUngroupConfirmation } from "@/hooks/tabs/use-ungroup-confirmation";
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
    if (!query) {
      return parsedItems.openItems;
    }
    const lowerQuery = query.toLowerCase();
    return parsedItems.openItems.filter((i) =>
      i.title.toLowerCase().includes(lowerQuery)
    );
  }, [parsedItems.openItems, query]);

  const filteredClosed = useMemo(() => {
    if (!query) {
      return parsedItems.closedItems;
    }
    const lowerQuery = query.toLowerCase();
    return parsedItems.closedItems.filter((i) =>
      i.title.toLowerCase().includes(lowerQuery)
    );
  }, [parsedItems.closedItems, query]);

  const hasResults = filteredOpen.length > 0 || filteredClosed.length > 0;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleSearchTabsShortcut = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) {
        return;
      }

      if (!isSearchTabsShortcut(event)) {
        return;
      }

      event.preventDefault();
      setOpen((prev) => !prev);
    };

    window.addEventListener("keydown", handleSearchTabsShortcut);

    return () => {
      window.removeEventListener("keydown", handleSearchTabsShortcut);
    };
  }, []);

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
                      className="text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
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

        <PopoverContent
          align="end"
          className="w-88 overflow-hidden p-0 shadow-lg"
          sideOffset={8}
        >
          <Combobox
            inputValue={query}
            itemToStringLabel={(item: SearchTabItem) => item.title}
            onInputValueChange={setQuery}
            onValueChange={(val) => {
              handleSelect(val).catch(() => {
                return;
              });
            }}
            open
          >
            <div className="border-border/40 border-b bg-muted/30 px-3 py-3">
              <ComboboxInput
                autoFocus
                className="h-8 w-full border-0 bg-transparent text-sm placeholder:text-muted-foreground/50 focus:outline-hidden focus:ring-0"
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
                <div className="py-8 text-center text-muted-foreground/70 text-sm">
                  No matching tabs found.
                </div>
              )}

              {filteredOpen.length > 0 && (
                <ComboboxGroup>
                  <ComboboxLabel className="px-2.5 pt-2 pb-1 font-medium text-muted-foreground/60 text-xs uppercase tracking-wider">
                    Open Tabs
                  </ComboboxLabel>
                  {filteredOpen.map((item) => (
                    <ComboboxItem
                      className="group/tab-item gap-2.5 rounded-md py-2 pr-2 pl-2.5"
                      key={item.id}
                      value={item}
                    >
                      {item.repoId ? (
                        <GraphIcon className="shrink-0 text-muted-foreground/60" />
                      ) : (
                        <FileIcon className="shrink-0 text-muted-foreground/60" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {item.title}
                      </span>
                      <button
                        aria-label={`Close ${item.title}`}
                        className="flex size-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted group-hover/tab-item:opacity-100"
                        onClick={(e) => handleCloseTab(e, item)}
                        type="button"
                      >
                        <XIcon className="size-3 text-muted-foreground" />
                      </button>
                    </ComboboxItem>
                  ))}
                </ComboboxGroup>
              )}

              {filteredClosed.length > 0 && (
                <>
                  {filteredOpen.length > 0 && (
                    <div className="-mx-1.5 my-2 h-px bg-border/40" />
                  )}
                  <ComboboxGroup>
                    <ComboboxLabel className="px-2.5 pt-2 pb-1 font-medium text-muted-foreground/60 text-xs uppercase tracking-wider">
                      Closed Recently
                    </ComboboxLabel>
                    {filteredClosed.map((item) => (
                      <ComboboxItem
                        className="gap-2.5 rounded-md py-2 pr-2 pl-2.5"
                        key={item.id}
                        value={item}
                      >
                        {item.repoId ? (
                          <GraphIcon className="shrink-0 text-muted-foreground/60" />
                        ) : (
                          <FileIcon className="shrink-0 text-muted-foreground/60" />
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {item.title}
                        </span>
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
