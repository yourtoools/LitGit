import { listen } from "@tauri-apps/api/event";
import { getTauriInvoke } from "@/lib/tauri-repo-client";

export interface TerminalOutputPayload {
  data: string;
}

export async function createTerminalSession(cwd: string): Promise<string> {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Terminal works in Tauri desktop app only");
  }

  const result = await invoke("create_terminal_session", { cwd });

  if (typeof result !== "string") {
    throw new Error("Invalid terminal session id");
  }

  return result;
}

export async function writeTerminalSession(
  sessionId: string,
  data: string
): Promise<void> {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return;
  }

  await invoke("write_terminal_session", {
    data,
    sessionId,
  });
}

export async function resizeTerminalSession(
  sessionId: string,
  cols: number,
  rows: number
): Promise<void> {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return;
  }

  await invoke("resize_terminal_session", {
    cols,
    rows,
    sessionId,
  });
}

export async function closeTerminalSession(sessionId: string): Promise<void> {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return;
  }

  await invoke("close_terminal_session", {
    sessionId,
  });
}

export async function listenTerminalOutput(
  sessionId: string,
  onData: (data: string) => void
): Promise<() => void> {
  const eventName = `terminal-output:${sessionId}`;

  return await listen<TerminalOutputPayload>(eventName, (event) => {
    const data = event.payload?.data;

    if (typeof data === "string" && data.length > 0) {
      onData(data);
    }
  });
}
