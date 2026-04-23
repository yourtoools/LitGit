import { Button } from "@litgit/ui/components/button";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { HeaderTabsSearch } from "@/components/shell/header-tabs-search";
import {
  getCommandPaletteShortcutLabel,
  getSearchTabsShortcutLabel,
} from "@/lib/keyboard-shortcuts";
import { useTabSearchStore } from "@/stores/ui/use-tab-search-store";

interface TabSearchTriggerProps {
  variant: "icon" | "pill";
}

export function TabSearchTrigger({ variant }: TabSearchTriggerProps) {
  const openSearch = useTabSearchStore((state) => state.open);

  return (
    <>
      {variant === "pill" ? (
        <button
          aria-label={`Search opened tabs (${getSearchTabsShortcutLabel()}) or open commands (${getCommandPaletteShortcutLabel()})`}
          className="tauri-no-drag focus-visible:desktop-focus flex h-5 w-full min-w-0 max-w-xl items-center justify-between gap-2 rounded-md border border-border/50 bg-background/50 px-3 text-[11px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          data-tauri-drag-region="false"
          onClick={() => openSearch("tabs")}
          type="button"
        >
          <span className="line-clamp-1 text-left">
            Search tabs or shortcuts, or start with &gt; for commands
          </span>
          <span className="hidden shrink-0 text-muted-foreground/60 sm:inline">
            {getSearchTabsShortcutLabel()}
          </span>
        </button>
      ) : (
        <Button
          aria-label={`Search tabs and commands (${getSearchTabsShortcutLabel()})`}
          className="focus-visible:desktop-focus shrink-0 focus-visible:ring-0! focus-visible:ring-offset-0!"
          onClick={() => openSearch("tabs")}
          size="icon"
          title={`Search tabs and commands (${getSearchTabsShortcutLabel()})`}
          type="button"
          variant="ghost"
        >
          <MagnifyingGlassIcon className="size-4" />
        </Button>
      )}
      <HeaderTabsSearch />
    </>
  );
}
