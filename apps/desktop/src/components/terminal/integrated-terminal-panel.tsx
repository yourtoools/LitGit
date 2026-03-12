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
  useCallback,
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

import {
  type GitSuggestion,
  getGitSuggestions,
  parseCommandLine,
} from "@/lib/terminal/git-suggestions";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import { useRepoStore } from "@/stores/repo/use-repo-store";
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
  const activeRepoId = useRepoStore((state) => state.activeRepoId);
  const repoBranches = useRepoStore((state) => state.repoBranches);
  const repoRemoteNames = useRepoStore((state) => state.repoRemoteNames);
  const repoStashes = useRepoStore((state) => state.repoStashes);
  const repoWorkingTreeItems = useRepoStore(
    (state) => state.repoWorkingTreeItems
  );
  const repoWorkingTreeStatuses = useRepoStore(
    (state) => state.repoWorkingTreeStatuses
  );

  const repoSuggestionContext = useMemo(() => {
    const branches = activeRepoId ? (repoBranches[activeRepoId] ?? []) : [];
    const remotes = activeRepoId ? (repoRemoteNames[activeRepoId] ?? []) : [];
    const stashes = activeRepoId ? (repoStashes[activeRepoId] ?? []) : [];
    const files = activeRepoId
      ? (repoWorkingTreeItems[activeRepoId] ?? [])
      : [];
    const status = activeRepoId
      ? (repoWorkingTreeStatuses[activeRepoId] ?? null)
      : null;
    const currentBranch = branches.find((branch) => branch.isCurrent) ?? null;

    return {
      aheadCount: currentBranch?.aheadCount ?? 0,
      behindCount: currentBranch?.behindCount ?? 0,
      branches: branches.map((branch) => branch.name),
      files: files.map((file) => file.path),
      hasChanges: status?.hasChanges ?? false,
      remotes,
      stashes: stashes.map((stash) => stash.ref),
    };
  }, [
    activeRepoId,
    repoBranches,
    repoRemoteNames,
    repoStashes,
    repoWorkingTreeItems,
    repoWorkingTreeStatuses,
  ]);

  const [suggestionState, setSuggestionState] = useState<{
    active: boolean;
    completions: GitSuggestion[];
    nextCommands: string[];
    selectedIndex: number;
    currentWord: string;
  }>({
    active: false,
    completions: [],
    nextCommands: [],
    selectedIndex: 0,
    currentWord: "",
  });
  const [suggestionPosition, setSuggestionPosition] = useState({
    left: 16,
    top: 16,
  });

  const suggestionStateRef = useRef(suggestionState);
  useEffect(() => {
    suggestionStateRef.current = suggestionState;
  }, [suggestionState]);

  const commandLineRef = useRef("");
  const repoSuggestionContextRef = useRef(repoSuggestionContext);

  useEffect(() => {
    repoSuggestionContextRef.current = repoSuggestionContext;
  }, [repoSuggestionContext]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !suggestionStateRef.current.active) {
        return;
      }

      setSuggestionState((prev) => ({ ...prev, active: false }));
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (suggestionState.active) {
      const container = document.getElementById(
        "terminal-suggestions-container"
      );
      const selected = container?.querySelector(".bg-accent");
      if (selected) {
        selected.scrollIntoView({ block: "nearest" });
      }
    }
  }, [suggestionState]);
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

  const updateSuggestionPosition = useCallback(() => {
    const mountElement = mountRef.current;
    const terminal = terminalRef.current;

    if (!(mountElement && terminal)) {
      return;
    }

    const screenElement =
      mountElement.querySelector<HTMLElement>(".xterm-screen");
    const viewportElement =
      mountElement.querySelector<HTMLElement>(".xterm-viewport");

    if (!(screenElement && viewportElement)) {
      return;
    }

    const screenRect = screenElement.getBoundingClientRect();
    const mountRect = mountElement.getBoundingClientRect();
    const popupWidth = Math.min(
      320,
      Math.max(mountElement.clientWidth - 32, 240)
    );
    const popupHeight = 272;
    const cellWidth = screenRect.width / Math.max(terminal.cols, 1);
    const cellHeight = screenRect.height / Math.max(terminal.rows, 1);
    const buffer = terminal.buffer.active;
    const visibleCursorRow = buffer.cursorY - buffer.viewportY;
    const cursorColumn = Math.min(buffer.cursorX, terminal.cols);
    const cursorLeft =
      screenRect.left - mountRect.left + cursorColumn * cellWidth;
    const cursorTop =
      screenRect.top -
      mountRect.top +
      Math.max(visibleCursorRow, 0) * cellHeight -
      viewportElement.scrollTop;
    const left = Math.min(
      Math.max(cursorLeft, 16),
      Math.max(mountElement.clientWidth - popupWidth - 16, 16)
    );
    const preferredTop = cursorTop + cellHeight + 6;
    const top = Math.min(
      Math.max(preferredTop, 16),
      Math.max(mountElement.clientHeight - popupHeight - 16, 16)
    );

    setSuggestionPosition({
      left,
      top,
    });
  }, []);

  const canRenderTerminal = useMemo(
    () => isTauri() && cwd.trim().length > 0,
    [cwd]
  );

  useEffect(() => {
    if (commandLineRef.current.trim().length === 0) {
      return;
    }

    const parsed = parseCommandLine(commandLineRef.current);

    if (!parsed) {
      setSuggestionState((prev) =>
        prev.active ? { ...prev, active: false } : prev
      );
      return;
    }

    const suggestions = getGitSuggestions(
      parsed.currentWord,
      parsed.tokens,
      repoSuggestionContext
    );

    setSuggestionState((prev) => ({
      active:
        suggestions.completions.length > 0 ||
        suggestions.nextCommands.length > 0,
      completions: suggestions.completions,
      nextCommands: suggestions.nextCommands,
      selectedIndex: Math.min(
        prev.selectedIndex,
        Math.max(
          suggestions.completions.length + suggestions.nextCommands.length - 1,
          0
        )
      ),
      currentWord: parsed.currentWord,
    }));
  }, [repoSuggestionContext]);

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
    updateSuggestionPosition();

    const syncSizeToBackend = async (sessionId: string) => {
      if (!(terminal.cols && terminal.rows)) {
        return;
      }

      await resizeTerminalSession(sessionId, terminal.cols, terminal.rows);
    };

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      updateSuggestionPosition();
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

      const updateSuggestionState = (nextLine: string) => {
        commandLineRef.current = nextLine;

        const parsed = parseCommandLine(nextLine);

        if (!parsed) {
          setSuggestionState((prev) =>
            prev.active ? { ...prev, active: false } : prev
          );
          return;
        }

        const suggestions = getGitSuggestions(
          parsed.currentWord,
          parsed.tokens,
          repoSuggestionContextRef.current
        );

        setSuggestionState((prev) => ({
          active:
            suggestions.completions.length > 0 ||
            suggestions.nextCommands.length > 0,
          completions: suggestions.completions,
          nextCommands: suggestions.nextCommands,
          selectedIndex: Math.min(
            prev.selectedIndex,
            Math.max(
              suggestions.completions.length +
                suggestions.nextCommands.length -
                1,
              0
            )
          ),
          currentWord: parsed.currentWord,
        }));
      };

      const applyTerminalInputToLine = (currentLine: string, input: string) => {
        if (input === "\r") {
          return "";
        }

        if (input === "\u007F") {
          return currentLine.slice(0, -1);
        }

        if (input === "\u0015" || input === "\u0003" || input === "\u000c") {
          return "";
        }

        if (input.includes("\u001b")) {
          return currentLine;
        }

        return `${currentLine}${input}`;
      };

      const getInsertionText = (
        currentLine: string,
        currentWord: string,
        completion: string
      ) => {
        const trimmedStartLine = currentLine.trimStart();

        if (
          completion.startsWith("git ") &&
          trimmedStartLine.length > 0 &&
          completion.startsWith(trimmedStartLine)
        ) {
          return `${completion.slice(trimmedStartLine.length)} `;
        }

        return `${completion.slice(currentWord.length)} `;
      };

      terminal.attachCustomKeyEventHandler((e) => {
        const state = suggestionStateRef.current;
        if (!state.active) {
          return true;
        }

        if (e.type === "keydown") {
          const totalItems =
            state.completions.length + state.nextCommands.length;

          if (e.key === "Escape") {
            setSuggestionState((prev) => ({ ...prev, active: false }));
            return false;
          }

          if (e.key === "ArrowUp") {
            setSuggestionState((prev) => ({
              ...prev,
              selectedIndex:
                prev.selectedIndex > 0
                  ? prev.selectedIndex - 1
                  : totalItems - 1,
            }));
            return false;
          }

          if (e.key === "ArrowDown") {
            setSuggestionState((prev) => ({
              ...prev,
              selectedIndex:
                prev.selectedIndex < totalItems - 1
                  ? prev.selectedIndex + 1
                  : 0,
            }));
            return false;
          }

          if (e.key === "Tab") {
            const isCompletion = state.selectedIndex < state.completions.length;
            let textToInsert = "";

            if (isCompletion) {
              const suggestion = state.completions[state.selectedIndex];
              textToInsert = getInsertionText(
                commandLineRef.current,
                state.currentWord,
                suggestion.value
              );
            } else {
              const cmdIndex = state.selectedIndex - state.completions.length;
              const nextCmd = state.nextCommands[cmdIndex];
              textToInsert = getInsertionText(
                commandLineRef.current,
                state.currentWord,
                nextCmd
              );
            }

            if (textToInsert) {
              const sessionId =
                sessionCacheByContext.get(contextKey)?.sessionId;
              if (sessionId) {
                // Simulate typing
                writeTerminalSession(sessionId, textToInsert).catch(
                  () => undefined
                );
                updateSuggestionState(
                  `${commandLineRef.current}${textToInsert}`.trimEnd()
                );
              }
            }

            setSuggestionState((prev) => ({ ...prev, active: false }));
            return false;
          }

          if (e.key === "Enter") {
            setSuggestionState((prev) => ({ ...prev, active: false }));
            return true;
          }
        }
        return true;
      });

      const cursorMoveSubscription = terminal.onCursorMove(() => {
        updateSuggestionPosition();
      });

      const renderSubscription = terminal.onRender(() => {
        updateSuggestionPosition();
      });

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

        updateSuggestionState(
          applyTerminalInputToLine(commandLineRef.current, input)
        );

        writeTerminalSession(currentEntry.sessionId, input).catch(
          () => undefined
        );
      });

      await syncSizeToBackend(cacheEntry.sessionId);
      setIsReady(true);
      updateSuggestionPosition();
      terminal.focus();

      return {
        dispose: () => {
          cursorMoveSubscription.dispose();
          inputSubscription.dispose();
          renderSubscription.dispose();
        },
      };
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
      commandLineRef.current = "";
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
    updateSuggestionPosition,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveTab("terminal");
  }, [isOpen]);

  useEffect(() => {
    updateSuggestionPosition();
  }, [updateSuggestionPosition]);

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
              "relative h-full",
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

            {suggestionState.active &&
              (suggestionState.completions.length > 0 ||
                suggestionState.nextCommands.length > 0) && (
                <div
                  className="absolute z-50 flex max-h-64 w-80 flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
                  style={{
                    left: suggestionPosition.left,
                    top: suggestionPosition.top,
                  }}
                >
                  <div
                    className="flex-1 overflow-y-auto p-1"
                    id="terminal-suggestions-container"
                  >
                    {suggestionState.completions.length > 0 && (
                      <div className="mb-2">
                        <div className="px-2 py-1.5 font-semibold text-muted-foreground text-xs">
                          Completions
                        </div>
                        {suggestionState.completions.map((item, index) => (
                          <div
                            className={cn(
                              "flex items-center rounded-sm px-2 py-1.5 text-sm",
                              suggestionState.selectedIndex === index
                                ? "bg-accent text-accent-foreground"
                                : ""
                            )}
                            key={item.value}
                          >
                            <span className="font-medium">{item.value}</span>
                            {item.description && (
                              <span className="ml-2 truncate text-muted-foreground text-xs">
                                {item.description}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {suggestionState.nextCommands.length > 0 && (
                      <div>
                        <div className="px-2 py-1.5 font-semibold text-muted-foreground text-xs">
                          Suggested Next Commands
                        </div>
                        {suggestionState.nextCommands.map((cmd, index) => {
                          const globalIndex =
                            suggestionState.completions.length + index;
                          return (
                            <div
                              className={cn(
                                "flex items-center rounded-sm px-2 py-1.5 text-sm",
                                suggestionState.selectedIndex === globalIndex
                                  ? "bg-accent text-accent-foreground"
                                  : ""
                              )}
                              key={cmd}
                            >
                              <span className="font-medium">{cmd}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
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
              <p className="text-muted-foreground">No system output yet.</p>
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
              <p className="text-muted-foreground">No user activity yet.</p>
            )}
          </div>
        </div>
      </Tabs>
    </div>
  );
}
