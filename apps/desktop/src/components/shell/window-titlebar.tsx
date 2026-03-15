import { CopyIcon, MinusIcon, SquareIcon, XIcon } from "@phosphor-icons/react";
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { isWindowsPlatform } from "@/lib/runtime-platform";

const TITLEBAR_HEIGHT_CLASS = "h-7";
const CONTROL_BUTTON_BASE_CLASS =
  "tauri-no-drag inline-flex items-center justify-center border-0 bg-transparent text-muted-foreground transition-colors focus-visible:desktop-focus focus-visible:text-foreground";
const CONTROL_BUTTON_SIZE_CLASS = `${TITLEBAR_HEIGHT_CLASS} w-8`;
const CONTROL_BUTTON_HOVER_CLASS = "hover:bg-muted/70 hover:text-foreground";
const CONTROL_BUTTON_CLOSE_HOVER_CLASS =
  "hover:bg-destructive hover:text-destructive-foreground";

export function WindowTitlebar() {
  const isWindows = isWindowsPlatform();
  const tauriRuntime = isTauri();
  const [isMaximized, setIsMaximized] = useState(false);

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
      className="flex h-7 shrink-0 select-none items-center justify-between border-border/70 border-b bg-muted/25 pl-3"
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

      {tauriRuntime ? (
        <div
          className="tauri-no-drag flex items-stretch"
          data-tauri-drag-region="false"
        >
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
      ) : null}
    </div>
  );
}
