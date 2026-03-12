import { Button } from "@litgit/ui/components/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@litgit/ui/components/context-menu";
import { Tabs, TabsList, TabsTrigger } from "@litgit/ui/components/tabs";
import { cn } from "@litgit/ui/lib/utils";
import { XIcon } from "@phosphor-icons/react";
import { isTauri } from "@tauri-apps/api/core";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { format } from "date-fns";
import { useTheme } from "next-themes";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import {
  createTerminalSession,
  listenTerminalOutput,
  resizeTerminalSession,
  writeTerminalSession,
} from "@/lib/tauri-terminal-client";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import {
  type OperationLogEntry,
  useOperationLogStore,
} from "@/stores/ui/use-operation-log-store";
import {
  terminalPanelHeightLimits,
  useTerminalPanelStore,
} from "@/stores/ui/use-terminal-panel-store";

interface IntegratedTerminalPanelProps {
  contextKey: string;
  cwd: string;
}

interface TerminalSessionCacheEntry {
  outputBuffer: string;
  sessionId: string;
}

const EMPTY_OPERATION_LOGS: readonly OperationLogEntry[] = [];

const sessionCacheByContext = new Map<string, TerminalSessionCacheEntry>();

const INITIAL_COLS = 80;
const INITIAL_ROWS = 24;
const MAX_BUFFER_SIZE = 250_000;
const MAX_RENDERED_SYSTEM_LOGS = 300;
const MAX_RENDERED_ACTIVITY_LOGS = 300;
type PanelTabValue = "terminal" | "output" | "activity";

const clampPanelHeight = (height: number): number =>
  Math.min(
    terminalPanelHeightLimits.max,
    Math.max(terminalPanelHeightLimits.min, Math.round(height))
  );

const appendOutputChunk = (
  entry: TerminalSessionCacheEntry,
  chunk: string
): void => {
  const next = entry.outputBuffer + chunk;

  if (next.length <= MAX_BUFFER_SIZE) {
    entry.outputBuffer = next;
    return;
  }

  entry.outputBuffer = next.slice(next.length - MAX_BUFFER_SIZE);
};

const resolveThemeColor = (
  styles: CSSStyleDeclaration,
  variableName: string,
  fallback: string
): string => {
  const token = styles.getPropertyValue(variableName).trim();

  if (token.length === 0 || typeof document === "undefined") {
    return fallback;
  }

  const probe = document.createElement("span");
  probe.style.color = token;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);

  const resolved = window.getComputedStyle(probe).color;
  probe.remove();

  return resolved || fallback;
};

const createTerminalTheme = (mode: "light" | "dark") => {
  if (typeof document === "undefined") {
    return {
      background: "rgba(0, 0, 0, 0)",
      cursor: mode === "light" ? "rgb(17, 24, 39)" : "rgb(243, 244, 246)",
      foreground: mode === "light" ? "rgb(17, 24, 39)" : "rgb(243, 244, 246)",
      selectionBackground:
        mode === "light"
          ? "rgba(59, 130, 246, 0.18)"
          : "rgba(148, 163, 184, 0.24)",
    };
  }

  const rootStyles = window.getComputedStyle(document.documentElement);
  const foregroundFallback =
    mode === "light" ? "rgb(17, 24, 39)" : "rgb(243, 244, 246)";
  const selectionFallback =
    mode === "light" ? "rgba(59, 130, 246, 0.18)" : "rgba(148, 163, 184, 0.24)";

  return {
    background: "rgba(0, 0, 0, 0)",
    cursor: resolveThemeColor(rootStyles, "--foreground", foregroundFallback),
    foreground: resolveThemeColor(
      rootStyles,
      "--foreground",
      foregroundFallback
    ),
    selectionBackground: resolveThemeColor(
      rootStyles,
      "--accent",
      selectionFallback
    ),
  };
};

const formatLogTimestamp = (timestampMs: number): string => {
  return format(timestampMs, "yyyy-MM-dd HH:mm:ss.SSS");
};

const formatSystemLogLine = (entry: OperationLogEntry) => {
  if (entry.command) {
    const durationLabel =
      typeof entry.durationMs === "number" ? ` [${entry.durationMs}ms]` : "";
    return `${formatLogTimestamp(entry.timestampMs)} [${entry.level}] > ${entry.command}${durationLabel}`;
  }

  return `${formatLogTimestamp(entry.timestampMs)} [${entry.level}] ${entry.message}`;
};

const formatActivityLogLine = (entry: OperationLogEntry) => {
  return `${formatLogTimestamp(entry.timestampMs)} [${entry.level}] ${entry.message}`;
};

export function IntegratedTerminalPanel({
  contextKey,
  cwd,
}: IntegratedTerminalPanelProps) {
  const isOpen = useTerminalPanelStore((state) => state.isOpen);
  const height = useTerminalPanelStore((state) => state.height);
  const setHeight = useTerminalPanelStore((state) => state.setHeight);
  const toggle = useTerminalPanelStore((state) => state.toggle);
  const cursorStyle = usePreferencesStore(
    (state) => state.terminal.cursorStyle
  );
  const fontFamily = usePreferencesStore((state) => state.terminal.fontFamily);
  const fontSize = usePreferencesStore((state) => state.terminal.fontSize);

  const lineHeight = usePreferencesStore((state) => state.terminal.lineHeight);
  const { resolvedTheme } = useTheme();
  const [isReady, setIsReady] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTabValue>("terminal");
  const mountRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const clearSystemLogs = useOperationLogStore(
    (state) => state.clearSystemLogs
  );
  const clearActivityLogs = useOperationLogStore(
    (state) => state.clearActivityLogs
  );
  const systemLogs = useOperationLogStore(
    (state) => state.systemLogsByRepoPath[cwd]
  );
  const activityLogs = useOperationLogStore(
    (state) => state.activityLogsByRepoPath[cwd]
  );
  const resolvedSystemLogs = systemLogs ?? EMPTY_OPERATION_LOGS;
  const resolvedActivityLogs = activityLogs ?? EMPTY_OPERATION_LOGS;
  const renderedSystemLogs = useMemo(() => {
    if (resolvedSystemLogs.length <= MAX_RENDERED_SYSTEM_LOGS) {
      return resolvedSystemLogs;
    }

    return resolvedSystemLogs.slice(-MAX_RENDERED_SYSTEM_LOGS);
  }, [resolvedSystemLogs]);
  const renderedActivityLogs = useMemo(() => {
    if (resolvedActivityLogs.length <= MAX_RENDERED_ACTIVITY_LOGS) {
      return resolvedActivityLogs;
    }

    return resolvedActivityLogs.slice(-MAX_RENDERED_ACTIVITY_LOGS);
  }, [resolvedActivityLogs]);
  const hiddenSystemLogCount =
    resolvedSystemLogs.length - renderedSystemLogs.length;
  const hiddenActivityLogCount =
    resolvedActivityLogs.length - renderedActivityLogs.length;

  const canRenderTerminal = useMemo(
    () => isTauri() && cwd.trim().length > 0,
    [cwd]
  );

  useEffect(() => {
    if (!(canRenderTerminal && mountRef.current)) {
      return;
    }

    const terminalTheme = createTerminalTheme(
      resolvedTheme === "light" ? "light" : "dark"
    );

    const terminal = new Terminal({
      allowTransparency: true,
      cols: INITIAL_COLS,
      convertEol: true,
      cursorBlink: true,
      cursorStyle,
      fontFamily,
      fontSize,
      lineHeight,
      rows: INITIAL_ROWS,
      theme: terminalTheme,
    });
    const fitAddon = new FitAddon();
    const clipboardAddon = new ClipboardAddon();
    const searchAddon = new SearchAddon();
    const serializeAddon = new SerializeAddon();
    const webLinksAddon = new WebLinksAddon();
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    let unlistenOutput: (() => void) | null = null;
    let cleanupDone = false;

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(clipboardAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(serializeAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(mountRef.current);
    serializeAddonRef.current = serializeAddon;
    fitAddon.fit();

    const syncSizeToBackend = async (sessionId: string) => {
      if (!(terminal.cols && terminal.rows)) {
        return;
      }

      await resizeTerminalSession(sessionId, terminal.cols, terminal.rows);
    };

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const sessionId = sessionCacheByContext.get(contextKey)?.sessionId;

      if (!sessionId) {
        return;
      }

      syncSizeToBackend(sessionId).catch(() => undefined);
    });

    if (panelRef.current) {
      resizeObserver.observe(panelRef.current);
    }

    const boot = async () => {
      let cacheEntry = sessionCacheByContext.get(contextKey);

      if (!cacheEntry) {
        const sessionId = await createTerminalSession(cwd);
        cacheEntry = { outputBuffer: "", sessionId };
        sessionCacheByContext.set(contextKey, cacheEntry);
      }

      if (cacheEntry.outputBuffer.length > 0) {
        terminal.write(cacheEntry.outputBuffer);
      }

      unlistenOutput = await listenTerminalOutput(
        cacheEntry.sessionId,
        (data) => {
          const currentEntry = sessionCacheByContext.get(contextKey);

          if (!currentEntry) {
            return;
          }

          appendOutputChunk(currentEntry, data);
          terminal.write(data);
        }
      );

      const inputSubscription = terminal.onData((input) => {
        const currentEntry = sessionCacheByContext.get(contextKey);

        if (!currentEntry) {
          return;
        }

        writeTerminalSession(currentEntry.sessionId, input).catch(
          () => undefined
        );
      });

      await syncSizeToBackend(cacheEntry.sessionId);
      setIsReady(true);
      terminal.focus();

      return inputSubscription;
    };

    let inputSubscription: { dispose: () => void } | null = null;

    boot()
      .then((subscription) => {
        inputSubscription = subscription;
      })
      .catch(() => {
        terminal.write("\r\nFailed to start terminal session.\r\n");
      });

    return () => {
      if (cleanupDone) {
        return;
      }

      cleanupDone = true;
      setIsReady(false);
      resizeObserver.disconnect();
      inputSubscription?.dispose();
      unlistenOutput?.();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      serializeAddonRef.current = null;
    };
  }, [
    canRenderTerminal,
    contextKey,
    cursorStyle,
    cwd,
    fontFamily,
    fontSize,
    lineHeight,
    resolvedTheme,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveTab("terminal");
  }, [isOpen]);

  useEffect(() => {
    if (!canRenderTerminal) {
      setIsReady(false);
    }
  }, [canRenderTerminal]);

  useEffect(() => {
    if (!(isOpen && isReady && activeTab === "terminal")) {
      return;
    }

    fitAddonRef.current?.fit();
    terminalRef.current?.focus();
  }, [activeTab, isOpen, isReady]);

  useEffect(() => {
    const terminal = terminalRef.current;

    if (!terminal) {
      return;
    }

    terminal.options.cursorStyle = cursorStyle;
    terminal.options.fontFamily = fontFamily;
    terminal.options.fontSize = fontSize;
    terminal.options.lineHeight = lineHeight;
    terminal.options.theme = createTerminalTheme(
      resolvedTheme === "light" ? "light" : "dark"
    );
    terminal.refresh(0, terminal.rows - 1);
  }, [cursorStyle, fontFamily, fontSize, lineHeight, resolvedTheme]);

  const onStartResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();

    const startY = event.clientY;
    const startHeight = height;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = startY - moveEvent.clientY;
      setHeight(clampPanelHeight(startHeight + delta));
    };

    const onStop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onStop);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onStop);
  };

  const copySelection = async (): Promise<void> => {
    const selection = terminalRef.current?.getSelection() ?? "";

    if (selection.length === 0) {
      return;
    }

    await navigator.clipboard.writeText(selection).catch(() => undefined);
    terminalRef.current?.focus();
  };

  const pasteClipboard = async (): Promise<void> => {
    const terminal = terminalRef.current;

    if (!terminal) {
      return;
    }

    const text = await navigator.clipboard.readText().catch(() => "");

    if (text.length === 0) {
      return;
    }

    terminal.paste(text);
    terminal.focus();
  };

  const copyBuffer = async (): Promise<void> => {
    const serialized = serializeAddonRef.current?.serialize() ?? "";

    if (serialized.length === 0) {
      return;
    }

    await navigator.clipboard.writeText(serialized).catch(() => undefined);
    terminalRef.current?.focus();
  };

  const handleTabValueChange = (value: string) => {
    if (value === "terminal" || value === "output" || value === "activity") {
      setActiveTab(value);
    }
  };

  if (!isTauri()) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute right-0 bottom-0 left-0 z-40 transform-gpu border-border/70 border-t bg-background shadow-[0_-10px_24px_hsl(var(--foreground)/0.07)] transition-transform duration-250 ease-out will-change-transform",
        isOpen ? "translate-y-0" : "pointer-events-none translate-y-full"
      )}
      data-integrated-terminal-panel="true"
      ref={panelRef}
      style={{ height }}
    >
      <div
        className="absolute top-0 right-0 left-0 z-50 h-2 cursor-row-resize"
        onPointerDown={onStartResize}
        role="presentation"
      />
      <Tabs
        className="h-full gap-0"
        onValueChange={handleTabValueChange}
        value={activeTab}
      >
        <div className="flex h-9 items-center justify-between border-border/60 border-b bg-muted/30 px-2">
          <TabsList
            className="h-8 rounded-none bg-transparent p-0"
            variant="line"
          >
            <TabsTrigger
              className="h-7 rounded-md px-2 font-medium text-[0.68rem] uppercase tracking-[0.12em]"
              value="terminal"
            >
              Terminal
            </TabsTrigger>
            <TabsTrigger
              className="h-7 rounded-md px-2 font-medium text-[0.68rem] uppercase tracking-[0.12em]"
              value="output"
            >
              Output
            </TabsTrigger>
            <TabsTrigger
              className="h-7 rounded-md px-2 font-medium text-[0.68rem] uppercase tracking-[0.12em]"
              value="activity"
            >
              Activity Log
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-1">
            {activeTab === "output" ? (
              <Button
                className="h-7 px-2 text-[0.65rem]"
                onClick={() => clearSystemLogs(cwd)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Clear
              </Button>
            ) : null}
            {activeTab === "activity" ? (
              <Button
                className="h-7 px-2 text-[0.65rem]"
                onClick={() => clearActivityLogs(cwd)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Clear
              </Button>
            ) : null}
            <Button
              aria-label="Close terminal"
              onClick={toggle}
              size="sm"
              type="button"
              variant="ghost"
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        </div>

        <div className="h-[calc(100%-2.25rem)]">
          <div
            className={cn(
              "h-full",
              activeTab === "terminal" ? "block" : "hidden"
            )}
          >
            <ContextMenu>
              <ContextMenuTrigger className="h-full pt-2 pl-2">
                <div
                  className={cn(
                    "h-full overflow-hidden rounded-md bg-background",
                    !isReady && "opacity-75"
                  )}
                  ref={mountRef}
                />
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={copySelection}>Copy</ContextMenuItem>
                <ContextMenuItem onClick={pasteClipboard}>
                  Paste
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => {
                    terminalRef.current?.selectAll();
                    terminalRef.current?.focus();
                  }}
                >
                  Select All
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={copyBuffer}>
                  Copy Terminal Buffer
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>

          <div
            className={cn(
              "h-full overflow-auto p-3 font-mono text-xs",
              activeTab === "output" ? "block" : "hidden"
            )}
          >
            {renderedSystemLogs.length > 0 ? (
              <div className="space-y-1 text-foreground/85">
                {hiddenSystemLogCount > 0 ? (
                  <p className="text-muted-foreground">
                    Showing latest {renderedSystemLogs.length} logs (
                    {hiddenSystemLogCount} older logs hidden)
                  </p>
                ) : null}
                {renderedSystemLogs.map((entry) => (
                  <p key={entry.id}>{formatSystemLogLine(entry)}</p>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">
                No backend/system output yet. Run repository actions to see
                logs.
              </p>
            )}
          </div>

          <div
            className={cn(
              "h-full overflow-auto p-3 font-mono text-xs",
              activeTab === "activity" ? "block" : "hidden"
            )}
          >
            {renderedActivityLogs.length > 0 ? (
              <div className="space-y-1 text-foreground/85">
                {hiddenActivityLogCount > 0 ? (
                  <p className="text-muted-foreground">
                    Showing latest {renderedActivityLogs.length} logs (
                    {hiddenActivityLogCount} older logs hidden)
                  </p>
                ) : null}
                {renderedActivityLogs.map((entry) => (
                  <p key={entry.id}>{formatActivityLogLine(entry)}</p>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">
                No activity yet. Commit/push/pull/stage actions will appear
                here.
              </p>
            )}
          </div>
        </div>
      </Tabs>
    </div>
  );
}
