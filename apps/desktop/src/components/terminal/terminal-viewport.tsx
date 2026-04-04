import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@litgit/ui/components/context-menu";
import { cn } from "@litgit/ui/lib/utils";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";

import { TerminalPlaceholder } from "@/components/terminal/terminal-placeholder";
import {
  closeTerminalSession,
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

interface TerminalViewportProps {
  autoFocus?: boolean;
  contextKey: string;
  cwd: string;
  isActive: boolean;
  persistSessionOnUnmount?: boolean;
}

interface TerminalSessionCacheEntry {
  outputBuffer: string;
  sessionId: string;
}

const sessionCacheByContext = new Map<string, TerminalSessionCacheEntry>();

const INITIAL_COLS = 80;
const INITIAL_ROWS = 24;
const MAX_BUFFER_SIZE = 250_000;

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

const resolveOkLchToRgb = (oklchValue: string): string => {
  // Create a temporary element to convert oklch to rgb
  if (typeof document === "undefined") {
    return oklchValue;
  }

  const probe = document.createElement("span");
  probe.style.color = oklchValue;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);

  const resolved = window.getComputedStyle(probe).color;
  probe.remove();

  return resolved || oklchValue;
};

interface TerminalTheme {
  background: string;
  black: string;
  blue: string;
  brightBlack: string;
  brightBlue: string;
  brightCyan: string;
  brightGreen: string;
  brightMagenta: string;
  brightRed: string;
  brightWhite: string;
  brightYellow: string;
  cursor: string;
  cursorAccent: string;
  cyan: string;
  foreground: string;
  green: string;
  magenta: string;
  red: string;
  selectionBackground: string;
  selectionForeground: string;
  white: string;
  yellow: string;
}

const createTerminalTheme = (mode: "light" | "dark") => {
  // Design system colors matching CodeMirror theme
  const themes: Record<"light" | "dark", TerminalTheme> = {
    light: {
      // Background/foreground - using actual design system values (not transparent)
      background: "oklch(0.9818 0.0054 95.0986)", // --background
      foreground: "oklch(0.3438 0.0269 95.7226)", // --foreground
      // ANSI colors matching CodeMirror light theme (GitHub-inspired)
      black: "oklch(0.25 0 0)",
      red: "oklch(0.55 0.18 25)", // GitHub red cf222e
      green: "oklch(0.55 0.15 145)", // GitHub green 0a7f32
      yellow: "oklch(0.65 0.14 85)", // GitHub yellow/brown 9a6700
      blue: "oklch(0.55 0.15 250)", // GitHub blue 0550ae
      magenta: "oklch(0.55 0.18 310)", // GitHub purple 8250df
      cyan: "oklch(0.55 0.12 195)", // Cyan variant
      white: "oklch(0.95 0.005 95)",
      // Bright variants
      brightBlack: "oklch(0.45 0.01 95)",
      brightRed: "oklch(0.65 0.2 25)",
      brightGreen: "oklch(0.65 0.18 145)",
      brightYellow: "oklch(0.75 0.16 85)",
      brightBlue: "oklch(0.65 0.18 250)",
      brightMagenta: "oklch(0.65 0.22 310)",
      brightCyan: "oklch(0.65 0.15 195)",
      brightWhite: "oklch(1 0 0)",
      // Cursor and selection
      cursor: "oklch(0.3438 0.0269 95.7226)", // --foreground
      cursorAccent: "oklch(0.9818 0.0054 95.0986)", // --background
      selectionBackground:
        "color-mix(in oklab, oklch(0.7623 0.1519 229.9901) 22%, transparent)", // primary with opacity
      selectionForeground: "oklch(0.3438 0.0269 95.7226)", // --foreground
    },
    dark: {
      // Background/foreground - using actual design system values (not transparent)
      background: "oklch(0.2679 0.0036 106.6427)", // --background
      foreground: "oklch(0.8074 0.0142 93.0137)", // --foreground
      // ANSI colors matching CodeMirror dark theme (Ayu-mirage inspired)
      black: "oklch(0.2 0.01 95)",
      red: "oklch(0.65 0.2 25)", // ffad66 orange-red
      green: "oklch(0.65 0.18 145)", // aad94c lime green
      yellow: "oklch(0.75 0.15 85)", // ffd173 yellow
      blue: "oklch(0.65 0.15 250)", // 73d0ff cyan
      magenta: "oklch(0.65 0.18 310)", // d4bfff purple
      cyan: "oklch(0.7 0.14 195)", // 5ccfe6 cyan
      white: "oklch(0.85 0.02 95)",
      // Bright variants
      brightBlack: "oklch(0.4 0.02 95)",
      brightRed: "oklch(0.75 0.22 25)",
      brightGreen: "oklch(0.75 0.2 145)", // bae67e green
      brightYellow: "oklch(0.85 0.18 85)",
      brightBlue: "oklch(0.75 0.18 250)",
      brightMagenta: "oklch(0.75 0.2 310)",
      brightCyan: "oklch(0.8 0.16 195)",
      brightWhite: "oklch(1 0 0)",
      // Cursor and selection
      cursor: "oklch(0.8074 0.0142 93.0137)", // --foreground
      cursorAccent: "oklch(0.2679 0.0036 106.6427)", // --background
      selectionBackground:
        "color-mix(in oklab, oklch(0.7623 0.1519 229.9901) 28%, transparent)", // primary with opacity
      selectionForeground: "oklch(0.8074 0.0142 93.0137)", // --foreground
    },
  };

  const theme = themes[mode];

  // Convert all oklch colors to rgb for xterm.js compatibility
  return {
    background: resolveOkLchToRgb(theme.background),
    black: resolveOkLchToRgb(theme.black),
    blue: resolveOkLchToRgb(theme.blue),
    brightBlack: resolveOkLchToRgb(theme.brightBlack),
    brightBlue: resolveOkLchToRgb(theme.brightBlue),
    brightCyan: resolveOkLchToRgb(theme.brightCyan),
    brightGreen: resolveOkLchToRgb(theme.brightGreen),
    brightMagenta: resolveOkLchToRgb(theme.brightMagenta),
    brightRed: resolveOkLchToRgb(theme.brightRed),
    brightWhite: resolveOkLchToRgb(theme.brightWhite),
    brightYellow: resolveOkLchToRgb(theme.brightYellow),
    cursor: resolveOkLchToRgb(theme.cursor),
    cursorAccent: resolveOkLchToRgb(theme.cursorAccent),
    cyan: resolveOkLchToRgb(theme.cyan),
    foreground: resolveOkLchToRgb(theme.foreground),
    green: resolveOkLchToRgb(theme.green),
    magenta: resolveOkLchToRgb(theme.magenta),
    red: resolveOkLchToRgb(theme.red),
    selectionBackground: theme.selectionBackground, // Keep as color-mix
    selectionForeground: resolveOkLchToRgb(theme.selectionForeground),
    white: resolveOkLchToRgb(theme.white),
    yellow: resolveOkLchToRgb(theme.yellow),
  };
};

export function TerminalViewport({
  autoFocus = true,
  contextKey,
  cwd,
  isActive,
  persistSessionOnUnmount = true,
}: TerminalViewportProps) {
  const cursorStyle = usePreferencesStore(
    (state) => state.terminal.cursorStyle
  );
  const fontFamily = usePreferencesStore((state) => state.terminal.fontFamily);
  const fontSize = usePreferencesStore((state) => state.terminal.fontSize);
  const lineHeight = usePreferencesStore((state) => state.terminal.lineHeight);
  const { resolvedTheme } = useTheme();
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
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
    if (!suggestionState.active) {
      return;
    }

    const container = document.getElementById("terminal-suggestions-container");
    const selected = container?.querySelector(".bg-accent");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [suggestionState]);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);

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
    if (!mountRef.current) {
      return;
    }

    setErrorMessage(null);

    const terminalTheme = createTerminalTheme(
      resolvedTheme === "light" ? "light" : "dark"
    );

    const terminal = new Terminal({
      cols: INITIAL_COLS,
      convertEol: true,
      cursorBlink: true,
      cursorStyle,
      fontFamily,
      fontSize,
      lineHeight,
      overviewRuler: {
        width: 0,
      },
      rows: INITIAL_ROWS,
      scrollback: 1000,
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

    resizeObserver.observe(mountRef.current);

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

      terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        const state = suggestionStateRef.current;
        if (!state.active) {
          return true;
        }

        if (event.type === "keydown") {
          const totalItems =
            state.completions.length + state.nextCommands.length;

          if (event.key === "Escape") {
            setSuggestionState((prev) => ({ ...prev, active: false }));
            return false;
          }

          if (event.key === "ArrowUp") {
            setSuggestionState((prev) => ({
              ...prev,
              selectedIndex:
                prev.selectedIndex > 0
                  ? prev.selectedIndex - 1
                  : totalItems - 1,
            }));
            return false;
          }

          if (event.key === "ArrowDown") {
            setSuggestionState((prev) => ({
              ...prev,
              selectedIndex:
                prev.selectedIndex < totalItems - 1
                  ? prev.selectedIndex + 1
                  : 0,
            }));
            return false;
          }

          if (event.key === "Tab") {
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
              const commandIndex =
                state.selectedIndex - state.completions.length;
              const nextCommand = state.nextCommands[commandIndex];
              textToInsert = getInsertionText(
                commandLineRef.current,
                state.currentWord,
                nextCommand
              );
            }

            if (textToInsert) {
              const sessionId =
                sessionCacheByContext.get(contextKey)?.sessionId;
              if (sessionId) {
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

          if (event.key === "Enter") {
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

      const inputSubscription = terminal.onData((input: string) => {
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

      if (isActive && autoFocus) {
        terminal.focus();
      }

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
      .catch((error: unknown) => {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Failed to start terminal session.";
        setErrorMessage(message);
        terminal.write(`\r\n${message}\r\n`);
      });

    return () => {
      if (cleanupDone) {
        return;
      }

      cleanupDone = true;
      const currentEntry = sessionCacheByContext.get(contextKey);
      setIsReady(false);
      resizeObserver.disconnect();
      inputSubscription?.dispose();
      unlistenOutput?.();
      commandLineRef.current = "";
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      serializeAddonRef.current = null;

      if (!(persistSessionOnUnmount && currentEntry) && currentEntry) {
        closeTerminalSession(currentEntry.sessionId).catch(() => undefined);
        sessionCacheByContext.delete(contextKey);
      }
    };
  }, [
    persistSessionOnUnmount,
    contextKey,
    cursorStyle,
    cwd,
    fontFamily,
    fontSize,
    autoFocus,
    isActive,
    lineHeight,
    resolvedTheme,
    updateSuggestionPosition,
  ]);

  useEffect(() => {
    updateSuggestionPosition();
  }, [updateSuggestionPosition]);

  useEffect(() => {
    if (!(isActive && isReady && autoFocus)) {
      return;
    }

    fitAddonRef.current?.fit();
    terminalRef.current?.focus();
  }, [autoFocus, isActive, isReady]);

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

  return (
    <div className="relative h-full">
      <style>{`
        .terminal-theme .xterm .xterm-viewport {
          background-color: transparent !important;
        }
        .terminal-theme .xterm .xterm-screen {
          background-color: transparent !important;
        }
        .terminal-theme .xterm canvas {
          background-color: transparent !important;
        }
      `}</style>
      <ContextMenu>
        <ContextMenuTrigger className="h-full pt-2 pl-2">
          <div className="terminal-theme relative h-full overflow-hidden bg-background">
            <div className="h-full" ref={mountRef} />
            {isReady ? null : (
              <div className="absolute inset-0">
                <TerminalPlaceholder
                  description={
                    errorMessage ??
                    "Preparing the terminal runtime and session…"
                  }
                  title={errorMessage ? "Terminal unavailable" : undefined}
                />
              </div>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={copySelection}>Copy</ContextMenuItem>
          <ContextMenuItem onClick={pasteClipboard}>Paste</ContextMenuItem>
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
            className="absolute z-50 flex max-h-64 w-80 flex-col overflow-hidden border border-border bg-popover text-popover-foreground shadow-lg"
            style={{
              left: suggestionPosition.left,
              top: suggestionPosition.top,
            }}
          >
            <div
              className="flex-1 overflow-y-auto p-1"
              id="terminal-suggestions-container"
            >
              {suggestionState.completions.length > 0 ? (
                <div className="mb-2">
                  <div className="px-2 py-1.5 font-semibold text-muted-foreground text-xs">
                    Completions
                  </div>
                  {suggestionState.completions.map((item, index) => (
                    <div
                      className={cn(
                        "flex items-center px-2 py-1.5 text-sm",
                        suggestionState.selectedIndex === index
                          ? "bg-accent text-accent-foreground"
                          : ""
                      )}
                      key={item.value}
                    >
                      <span className="font-medium">{item.value}</span>
                      {item.description ? (
                        <span className="ml-2 truncate text-muted-foreground text-xs">
                          {item.description}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {suggestionState.nextCommands.length > 0 ? (
                <div>
                  <div className="px-2 py-1.5 font-semibold text-muted-foreground text-xs">
                    Suggested Next Commands
                  </div>
                  {suggestionState.nextCommands.map((command, index) => {
                    const globalIndex =
                      suggestionState.completions.length + index;
                    return (
                      <div
                        className={cn(
                          "flex items-center px-2 py-1.5 text-sm",
                          suggestionState.selectedIndex === globalIndex
                            ? "bg-accent text-accent-foreground"
                            : ""
                        )}
                        key={command}
                      >
                        <span className="font-medium">{command}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        )}
    </div>
  );
}
