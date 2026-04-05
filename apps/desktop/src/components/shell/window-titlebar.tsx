import { Popover, PopoverTrigger } from "@litgit/ui/components/popover";
import { CopyIcon, MinusIcon, SquareIcon, XIcon } from "@phosphor-icons/react";
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { HeaderTabsSearch } from "@/components/shell/header-tabs-search";
import {
  getCommandPaletteShortcutLabel,
  getSearchTabsShortcutLabel,
} from "@/lib/keyboard-shortcuts";
import { isWindowsPlatform } from "@/lib/runtime-platform";
import { useTabSearchStore } from "@/stores/ui/use-tab-search-store";

const TITLEBAR_HEIGHT_CLASS = "h-7";
const CONTROL_BUTTON_BASE_CLASS =
  "tauri-no-drag inline-flex items-center justify-center border-0 bg-transparent text-muted-foreground transition-colors focus-visible:desktop-focus focus-visible:text-foreground";
const CONTROL_BUTTON_SIZE_CLASS = `${TITLEBAR_HEIGHT_CLASS} w-8`;
const CONTROL_BUTTON_HOVER_CLASS = "hover:bg-muted/70 hover:text-foreground";
const CONTROL_BUTTON_CLOSE_HOVER_CLASS =
  "hover:bg-destructive hover:text-destructive-foreground";

interface WindowTitlebarProps {
  hideSearch?: boolean;
}

export function WindowTitlebar({ hideSearch = false }: WindowTitlebarProps) {
  const isWindows = isWindowsPlatform();
  const tauriRuntime = isTauri();
  const [isMaximized, setIsMaximized] = useState(false);
  const isOpen = useTabSearchStore((state) => state.isOpen);
  const openSearch = useTabSearchStore((state) => state.open);
  const closeSearch = useTabSearchStore((state) => state.close);
  const toggleSearch = useTabSearchStore((state) => state.toggle);

  const syncMaximizedState = useCallback(async () => {
    if (!tauriRuntime) {
      return;
    }

    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const maximized = await getCurrentWindow().isMaximized();
    setIsMaximized(maximized);
  }, [tauriRuntime]);

  useEffect(() => {
    if (!tauriRuntime) {
      return;
    }

    let isDisposed = false;
    let unlistenResize: (() => void) | null = null;

    const bindWindowResizeListener = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();

      const refreshMaximizedState = async () => {
        const maximized = await appWindow.isMaximized();

        if (!isDisposed) {
          setIsMaximized(maximized);
        }
      };

      await refreshMaximizedState();
      unlistenResize = await appWindow.onResized(() => {
        refreshMaximizedState().catch(() => undefined);
      });
    };

    bindWindowResizeListener().catch(() => undefined);

    return () => {
      isDisposed = true;

      if (unlistenResize) {
        unlistenResize();
      }
    };
  }, [tauriRuntime]);

  const handleMinimizeWindow = useCallback(() => {
    if (!tauriRuntime) {
      return;
    }

    const minimizeWindow = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().minimize();
    };

    minimizeWindow().catch(() => undefined);
  }, [tauriRuntime]);

  const handleToggleMaximizeWindow = useCallback(() => {
    if (!tauriRuntime) {
      return;
    }

    const toggleMaximizeWindow = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().toggleMaximize();
      await syncMaximizedState();
    };

    toggleMaximizeWindow().catch(() => undefined);
  }, [syncMaximizedState, tauriRuntime]);

  const handleCloseWindow = useCallback(() => {
    if (!tauriRuntime) {
      return;
    }

    const closeWindow = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    };

    closeWindow().catch(() => undefined);
  }, [tauriRuntime]);

  return (
    <div
      className="relative flex h-7 shrink-0 select-none items-center justify-between border-border/70 border-b bg-muted/25 pl-3"
      data-tauri-drag-region
    >
      <div
        className="pointer-events-none flex min-w-0 items-center text-[11px] text-muted-foreground uppercase tracking-[0.08em]"
        data-tauri-drag-region
      >
        <span className="truncate font-semibold" data-tauri-drag-region>
          LitGit Desktop
        </span>
      </div>

      {/* Centered Command Trigger with Popover */}
      {!hideSearch && (
        <Popover
          onOpenChange={(nextOpen: boolean) => {
            if (nextOpen) {
              openSearch("tabs");
            } else {
              closeSearch();
            }
          }}
          open={isOpen}
        >
          <PopoverTrigger
            render={
              <button
                aria-label={`Search opened tabs (${getSearchTabsShortcutLabel()}) or open commands (${getCommandPaletteShortcutLabel()})`}
                className="tauri-no-drag focus-visible:desktop-focus absolute left-1/2 flex h-5 w-[36rem] max-w-[calc(100vw-16rem)] -translate-x-1/2 items-center justify-center gap-2 rounded-md border border-border/50 bg-background/50 px-3 text-[11px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                data-tauri-drag-region="false"
                onClick={() => toggleSearch("tabs")}
                type="button"
              >
                <span className="line-clamp-1">
                  Search tabs or shortcuts, or start with &gt; for commands
                </span>
                <span className="hidden text-muted-foreground/60 sm:inline">
                  {getSearchTabsShortcutLabel()}
                </span>
              </button>
            }
          />
          <HeaderTabsSearch />
        </Popover>
      )}

      {tauriRuntime ? (
        <div
          className="tauri-no-drag flex items-center gap-3"
          data-tauri-drag-region="false"
        >
          <div className="flex items-stretch">
            <button
              aria-label="Minimize window"
              className={`${CONTROL_BUTTON_BASE_CLASS} ${CONTROL_BUTTON_SIZE_CLASS} ${CONTROL_BUTTON_HOVER_CLASS}`}
              onClick={handleMinimizeWindow}
              type="button"
            >
              <MinusIcon className="size-3" weight="bold" />
            </button>
            <button
              aria-label={isMaximized ? "Restore window" : "Maximize window"}
              className={`${CONTROL_BUTTON_BASE_CLASS} ${CONTROL_BUTTON_SIZE_CLASS} ${CONTROL_BUTTON_HOVER_CLASS}`}
              onClick={handleToggleMaximizeWindow}
              title={
                isWindows ? "Windows: use Win + Z for Snap Layouts." : undefined
              }
              type="button"
            >
              {isMaximized ? (
                <CopyIcon className="size-3" weight="bold" />
              ) : (
                <SquareIcon className="size-3" weight="bold" />
              )}
            </button>
            <button
              aria-label="Close window"
              className={`${CONTROL_BUTTON_BASE_CLASS} ${CONTROL_BUTTON_SIZE_CLASS} ${CONTROL_BUTTON_CLOSE_HOVER_CLASS}`}
              onClick={handleCloseWindow}
              type="button"
            >
              <XIcon className="size-3" weight="bold" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
