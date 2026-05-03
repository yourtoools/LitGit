import { CopyIcon, MinusIcon, SquareIcon, XIcon } from "@phosphor-icons/react";
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { TabSearchTrigger } from "@/components/shell/tab-search-trigger";
import { getRuntimeWindowChromeMode } from "@/lib/runtime-window-chrome";

const TITLEBAR_HEIGHT_CLASS = "h-7";
const WINDOWS_OVERLAY_CONTROLS_RESERVED_WIDTH = 144;
const CONTROL_BUTTON_BASE_CLASS =
  "tauri-no-drag inline-flex shrink-0 flex-none items-center justify-center border-0 bg-transparent text-muted-foreground transition-colors focus-visible:desktop-focus focus-visible:text-foreground";
const CONTROL_BUTTON_SIZE_CLASS = `${TITLEBAR_HEIGHT_CLASS} w-8`;
const CONTROL_BUTTON_HOVER_CLASS = "hover:bg-muted/70 hover:text-foreground";
const CONTROL_BUTTON_CLOSE_HOVER_CLASS =
  "hover:bg-destructive hover:text-destructive-foreground";

interface WindowTitlebarProps {
  hideSearch?: boolean;
}

export function WindowTitlebar({ hideSearch = false }: WindowTitlebarProps) {
  const windowChromeMode = getRuntimeWindowChromeMode();
  const useCustomWindowControls = windowChromeMode === "custom";
  const useOverlayNativeControls =
    windowChromeMode === "overlay-native-controls";
  const useDraggableTitlebar = windowChromeMode !== "native";
  const showTitle =
    useCustomWindowControls || useOverlayNativeControls || hideSearch;
  const tauriRuntime = isTauri();
  const [isMaximized, setIsMaximized] = useState(false);
  const dragRegionProps = useDraggableTitlebar
    ? { "data-tauri-drag-region": true as const }
    : {};

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
      const currentWindow = getCurrentWindow();
      await currentWindow.toggleMaximize();
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
      className="grid h-7 shrink-0 select-none grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] items-center gap-3 border-border/70 border-b bg-muted/25 px-3"
      {...dragRegionProps}
    >
      <div
        className="pointer-events-none flex min-w-0 items-center text-[11px] text-muted-foreground uppercase tracking-[0.08em]"
        {...dragRegionProps}
      >
        {showTitle ? (
          <span className="truncate font-semibold" {...dragRegionProps}>
            LitGit Desktop
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 justify-center">
        {hideSearch ? null : <TabSearchTrigger variant="pill" />}
      </div>

      <div className="flex min-w-0 justify-end">
        {tauriRuntime && useCustomWindowControls ? (
          <div
            className="tauri-no-drag flex items-center"
            data-tauri-drag-region="false"
          >
            <div className="flex shrink-0 items-stretch">
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
        {useOverlayNativeControls ? (
          <div
            aria-hidden="true"
            className="pointer-events-none shrink-0"
            style={{ width: `${WINDOWS_OVERLAY_CONTROLS_RESERVED_WIDTH}px` }}
          />
        ) : null}
      </div>
    </div>
  );
}
