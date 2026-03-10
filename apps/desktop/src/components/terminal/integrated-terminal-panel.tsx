import { Button } from "@litgit/ui/components/button";
import { cn } from "@litgit/ui/lib/utils";
import { XIcon } from "@phosphor-icons/react";
import { isTauri } from "@tauri-apps/api/core";
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

const sessionCacheByContext = new Map<string, TerminalSessionCacheEntry>();

const INITIAL_COLS = 80;
const INITIAL_ROWS = 24;
const MAX_BUFFER_SIZE = 250_000;

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

export function IntegratedTerminalPanel({
  contextKey,
  cwd,
}: IntegratedTerminalPanelProps) {
  const isOpen = useTerminalPanelStore((state) => state.isOpen);
  const height = useTerminalPanelStore((state) => state.height);
  const setHeight = useTerminalPanelStore((state) => state.setHeight);
  const toggle = useTerminalPanelStore((state) => state.toggle);
  const [isReady, setIsReady] = useState(false);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);

  const canRenderTerminal = useMemo(
    () => isTauri() && cwd.trim().length > 0,
    [cwd]
  );

  useEffect(() => {
    if (!(canRenderTerminal && mountRef.current)) {
      return;
    }

    const rootStyles = window.getComputedStyle(document.documentElement);

    const terminal = new Terminal({
      allowTransparency: true,
      cols: INITIAL_COLS,
      convertEol: true,
      cursorBlink: true,
      fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', monospace",
      fontSize: 12,
      rows: INITIAL_ROWS,
      theme: {
        background: "rgba(0, 0, 0, 0)",
        cursor: resolveThemeColor(
          rootStyles,
          "--foreground",
          "rgb(17, 24, 39)"
        ),
        foreground: resolveThemeColor(
          rootStyles,
          "--foreground",
          "rgb(17, 24, 39)"
        ),
        selectionBackground: resolveThemeColor(
          rootStyles,
          "--accent",
          "rgb(229, 231, 235)"
        ),
      },
    });
    const fitAddon = new FitAddon();
    terminalRef.current = terminal;

    let unlistenOutput: (() => void) | null = null;
    let cleanupDone = false;

    terminal.loadAddon(fitAddon);
    terminal.open(mountRef.current);
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
    };
  }, [canRenderTerminal, contextKey, cwd]);

  useEffect(() => {
    if (!canRenderTerminal) {
      setIsReady(false);
    }
  }, [canRenderTerminal]);

  useEffect(() => {
    if (!(isOpen && isReady)) {
      return;
    }

    terminalRef.current?.focus();
  }, [isOpen, isReady]);

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

  if (!isTauri()) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute right-0 bottom-0 left-0 z-40 transform-gpu border-border/70 border-t bg-background shadow-[0_-10px_24px_hsl(var(--foreground)/0.07)] transition-transform duration-250 ease-out will-change-transform",
        isOpen ? "translate-y-0" : "pointer-events-none translate-y-full"
      )}
      ref={panelRef}
      style={{ height }}
    >
      <div
        className="absolute top-0 right-0 left-0 z-50 h-2 cursor-row-resize"
        onPointerDown={onStartResize}
        role="presentation"
      />
      <div className="flex h-9 items-center justify-between border-border/60 border-b bg-muted/30 pl-3">
        <p className="font-medium text-[0.68rem] text-muted-foreground uppercase tracking-[0.12em]">
          Terminal
        </p>
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
      <div className="h-[calc(100%-2.25rem)] py-2 pl-2">
        <div
          className={cn(
            "h-full overflow-hidden rounded-md bg-background",
            !isReady && "opacity-75"
          )}
          ref={mountRef}
        />
      </div>
    </div>
  );
}
