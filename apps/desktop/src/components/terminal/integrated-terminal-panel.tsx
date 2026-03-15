import { Button } from "@litgit/ui/components/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@litgit/ui/components/context-menu";
import { Tabs, TabsList, TabsTrigger } from "@litgit/ui/components/tabs";
import { cn } from "@litgit/ui/lib/utils";
import { XIcon } from "@phosphor-icons/react";
import { isTauri } from "@tauri-apps/api/core";
import { format } from "date-fns";
import {
  lazy,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TerminalPlaceholder } from "@/components/terminal/terminal-placeholder";
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

const EMPTY_OPERATION_LOGS: readonly OperationLogEntry[] = [];
const MAX_RENDERED_SYSTEM_LOGS = 300;
const MAX_RENDERED_ACTIVITY_LOGS = 300;
type PanelTabValue = "terminal" | "output" | "activity";

const LazyTerminalViewport = lazy(async () => {
  const module = await import("@/components/terminal/terminal-viewport");

  return {
    default: module.TerminalViewport,
  };
});

const clampPanelHeight = (height: number): number =>
  Math.min(
    terminalPanelHeightLimits.max,
    Math.max(terminalPanelHeightLimits.min, Math.round(height))
  );

const formatLogTimestamp = (timestampMs: number): string => {
  return format(timestampMs, "yyyy-MM-dd HH:mm:ss.SSS");
};

const formatSystemLogLine = (entry: OperationLogEntry) => {
  const detail = getSystemLogDetail(entry);

  if (entry.command) {
    const durationLabel =
      typeof entry.durationMs === "number" ? ` [${entry.durationMs}ms]` : "";
    const header = `${formatLogTimestamp(entry.timestampMs)} [${entry.level}] > ${entry.command}${durationLabel}`;

    return detail ? `${header}\n${detail}` : header;
  }

  return `${formatLogTimestamp(entry.timestampMs)} [${entry.level}] ${entry.message}`;
};

const getSystemLogDetail = (entry: OperationLogEntry): string | null => {
  const trimmedMessage = entry.message.trim();

  if (trimmedMessage.length === 0 || trimmedMessage === "Command completed") {
    return null;
  }

  return trimmedMessage;
};

const formatActivityLogLine = (entry: OperationLogEntry) => {
  return `${formatLogTimestamp(entry.timestampMs)} [${entry.level}] ${entry.message}`;
};

const getLogLevelClassName = (level: OperationLogEntry["level"]): string => {
  if (level === "error") {
    return "text-red-400";
  }

  if (level === "warn") {
    return "text-amber-400";
  }

  return "text-foreground/85";
};

const getSelectedTextInContainer = (container: HTMLElement | null): string => {
  if (typeof window === "undefined") {
    return "";
  }

  const selection = window.getSelection();

  if (!(selection && container && selection.rangeCount > 0)) {
    return "";
  }

  const { anchorNode, focusNode } = selection;

  if (
    !(
      anchorNode &&
      focusNode &&
      container.contains(anchorNode) &&
      container.contains(focusNode)
    )
  ) {
    return "";
  }

  return selection.toString().trim();
};

export function IntegratedTerminalPanel({
  contextKey,
  cwd,
}: IntegratedTerminalPanelProps) {
  const isOpen = useTerminalPanelStore((state) => state.isOpen);
  const height = useTerminalPanelStore((state) => state.height);
  const setHeight = useTerminalPanelStore((state) => state.setHeight);
  const toggle = useTerminalPanelStore((state) => state.toggle);
  const [activeTab, setActiveTab] = useState<PanelTabValue>("terminal");
  const [hasRequestedTerminal, setHasRequestedTerminal] =
    useState<boolean>(false);
  const [selectedLogText, setSelectedLogText] = useState<string>("");
  const panelRef = useRef<HTMLDivElement | null>(null);
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
  const renderedSystemLogText = renderedSystemLogs
    .map((entry) => formatSystemLogLine(entry))
    .join("\n");
  const renderedActivityLogText = renderedActivityLogs
    .map((entry) => formatActivityLogLine(entry))
    .join("\n");

  const copyText = async (value: string): Promise<void> => {
    if (value.length === 0) {
      return;
    }

    await navigator.clipboard.writeText(value).catch(() => undefined);
  };

  useEffect(() => {
    const updateSelectedText = () => {
      if (!(activeTab === "output" || activeTab === "activity")) {
        setSelectedLogText("");
        return;
      }

      setSelectedLogText(getSelectedTextInContainer(panelRef.current));
    };

    document.addEventListener("selectionchange", updateSelectedText);
    updateSelectedText();

    return () => {
      document.removeEventListener("selectionchange", updateSelectedText);
    };
  }, [activeTab]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveTab("terminal");
  }, [isOpen]);

  useEffect(() => {
    if (!(isOpen && activeTab === "terminal" && cwd.trim().length > 0)) {
      return;
    }

    setHasRequestedTerminal(true);
  }, [activeTab, cwd, isOpen]);

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
          <TabsList className="h-8 bg-transparent p-0" variant="line">
            <TabsTrigger
              className="h-7 px-2 font-medium text-[0.68rem] uppercase tracking-[0.12em]"
              value="terminal"
            >
              Terminal
            </TabsTrigger>
            <TabsTrigger
              className="h-7 px-2 font-medium text-[0.68rem] uppercase tracking-[0.12em]"
              value="output"
            >
              Output
            </TabsTrigger>
            <TabsTrigger
              className="h-7 px-2 font-medium text-[0.68rem] uppercase tracking-[0.12em]"
              value="activity"
            >
              Activity Log
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-1">
            {activeTab === "output" || activeTab === "activity" ? (
              <Button
                className="h-7 px-2 text-[0.65rem]"
                disabled={selectedLogText.length === 0}
                onClick={() => copyText(selectedLogText)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Copy
              </Button>
            ) : null}
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
              "relative h-full",
              activeTab === "terminal" ? "block" : "hidden"
            )}
          >
            {hasRequestedTerminal ? (
              <Suspense
                fallback={
                  <div className="h-full pt-2 pl-2">
                    <TerminalPlaceholder />
                  </div>
                }
              >
                <LazyTerminalViewport
                  contextKey={contextKey}
                  cwd={cwd}
                  isActive={isOpen && activeTab === "terminal"}
                />
              </Suspense>
            ) : (
              <div className="h-full pt-2 pl-2">
                <TerminalPlaceholder
                  description="Open the terminal to start a shell session on demand."
                  title="Terminal ready on demand"
                />
              </div>
            )}
          </div>

          <div
            className={cn(
              "h-full overflow-auto p-3 font-mono text-xs",
              activeTab === "output" ? "block" : "hidden"
            )}
          >
            <ContextMenu>
              <ContextMenuTrigger className="h-full w-full select-text">
                {renderedSystemLogs.length > 0 ? (
                  <div className="space-y-2">
                    {hiddenSystemLogCount > 0 ? (
                      <p className="text-muted-foreground">
                        Showing latest {renderedSystemLogs.length} logs (
                        {hiddenSystemLogCount} older logs hidden)
                      </p>
                    ) : null}
                    {renderedSystemLogs.map((entry) => {
                      const detail = getSystemLogDetail(entry);
                      let detailContent: ReactNode = null;

                      if (detail) {
                        detailContent = <p>{detail}</p>;
                      } else if (!entry.command) {
                        detailContent = <p>{entry.message}</p>;
                      }

                      return (
                        <div
                          className={cn(
                            "whitespace-pre-wrap break-words",
                            getLogLevelClassName(entry.level)
                          )}
                          key={entry.id}
                        >
                          <p>
                            {formatLogTimestamp(entry.timestampMs)} [
                            {entry.level}]
                          </p>
                          {entry.command ? <p>{`> ${entry.command}`}</p> : null}
                          {typeof entry.durationMs === "number" ? (
                            <p className="text-[0.7rem] opacity-80">{`[${entry.durationMs}ms]`}</p>
                          ) : null}
                          {detailContent}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No system output yet.</p>
                )}
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  disabled={selectedLogText.length === 0}
                  onClick={() => copyText(selectedLogText)}
                >
                  Copy
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={renderedSystemLogText.length === 0}
                  onClick={() => copyText(renderedSystemLogText)}
                >
                  Copy All
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>

          <div
            className={cn(
              "h-full overflow-auto p-3 font-mono text-xs",
              activeTab === "activity" ? "block" : "hidden"
            )}
          >
            <ContextMenu>
              <ContextMenuTrigger className="h-full w-full select-text">
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
                  <p className="text-muted-foreground">No user activity yet.</p>
                )}
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  disabled={selectedLogText.length === 0}
                  onClick={() => copyText(selectedLogText)}
                >
                  Copy
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={renderedActivityLogText.length === 0}
                  onClick={() => copyText(renderedActivityLogText)}
                >
                  Copy All
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
