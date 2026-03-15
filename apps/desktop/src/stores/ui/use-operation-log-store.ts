import { create } from "zustand";

const MAX_ENTRIES_PER_STREAM = 800;

type OperationLogLevel = "error" | "info" | "warn";

type OperationLogMetadataValue = boolean | number | string;

export interface OperationLogEntry {
  command?: string;
  durationMs?: number;
  id: string;
  level: OperationLogLevel;
  message: string;
  metadata?: Record<string, OperationLogMetadataValue>;
  timestampMs: number;
}

interface AppendOperationLogInput {
  command?: string;
  durationMs?: number;
  level: OperationLogLevel;
  message: string;
  metadata?: Record<string, OperationLogMetadataValue>;
  timestampMs?: number;
}

interface OperationLogStoreState {
  activityLogsByRepoPath: Record<string, OperationLogEntry[]>;
  appendActivityLog: (repoPath: string, entry: AppendOperationLogInput) => void;
  appendSystemLog: (repoPath: string, entry: AppendOperationLogInput) => void;
  clearActivityLogs: (repoPath: string) => void;
  clearSystemLogs: (repoPath: string) => void;
  systemLogsByRepoPath: Record<string, OperationLogEntry[]>;
}

let nextEntryId = 1;

const createEntryId = () => {
  const value = nextEntryId;
  nextEntryId += 1;
  return `op-log-${value}`;
};

const appendEntry = (
  current: Record<string, OperationLogEntry[]>,
  repoPath: string,
  entry: AppendOperationLogInput
) => {
  const trimmedRepoPath = repoPath.trim();

  if (trimmedRepoPath.length === 0) {
    return current;
  }

  const currentEntries = current[trimmedRepoPath] ?? [];
  const nextEntries = [
    ...currentEntries,
    {
      ...entry,
      id: createEntryId(),
      timestampMs: entry.timestampMs ?? Date.now(),
    } satisfies OperationLogEntry,
  ].slice(-MAX_ENTRIES_PER_STREAM);

  return {
    ...current,
    [trimmedRepoPath]: nextEntries,
  };
};

export const useOperationLogStore = create<OperationLogStoreState>((set) => ({
  systemLogsByRepoPath: {},
  activityLogsByRepoPath: {},
  appendSystemLog: (repoPath, entry) => {
    set((state) => ({
      systemLogsByRepoPath: appendEntry(
        state.systemLogsByRepoPath,
        repoPath,
        entry
      ),
    }));
  },
  appendActivityLog: (repoPath, entry) => {
    set((state) => ({
      activityLogsByRepoPath: appendEntry(
        state.activityLogsByRepoPath,
        repoPath,
        entry
      ),
    }));
  },
  clearSystemLogs: (repoPath) => {
    set((state) => {
      if (!(repoPath in state.systemLogsByRepoPath)) {
        return state;
      }

      const next = { ...state.systemLogsByRepoPath };
      delete next[repoPath];

      return { systemLogsByRepoPath: next };
    });
  },
  clearActivityLogs: (repoPath) => {
    set((state) => {
      if (!(repoPath in state.activityLogsByRepoPath)) {
        return state;
      }

      const next = { ...state.activityLogsByRepoPath };
      delete next[repoPath];

      return { activityLogsByRepoPath: next };
    });
  },
}));
