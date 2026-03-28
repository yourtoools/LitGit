import { toast } from "sonner";
import {
  addRepoIgnoreRule,
  applyRepoStash,
  checkoutRepoCommit,
  cherryPickRepoCommit,
  commitRepoChanges,
  createRepoBranch,
  createRepoBranchAtReference,
  createRepoStash,
  createRepoTag,
  deleteRemoteRepoBranch,
  deleteRepoBranch,
  discardAllRepoChanges,
  discardRepoPathChanges,
  dropRepoStash,
  getLatestRepoCommitMessage,
  getRepoCommitFileContent,
  getRepoCommitFileDiff,
  getRepoCommitFileHunks,
  getRepoCommitFilePreflight,
  getRepoCommitFiles,
  getRepoFileBlame,
  getRepoFileContent,
  getRepoFileDetectedEncoding,
  getRepoFileDiff,
  getRepoFileHistory,
  getRepoFileHunks,
  getRepoFilePreflight,
  getRepoFileText,
  getRepositoryFiles,
  popRepoStash,
  pushRepoBranch,
  renameRepoBranch,
  resetRepoToReference,
  revertRepoCommit,
  rewordRepoCommit,
  runRepoMergeAction,
  runRepoPull,
  saveRepoFileText,
  setRepoBranchUpstream,
  stageAllRepoChanges,
  stageRepoFile,
  switchRepoBranch,
  unstageAllRepoChanges,
  unstageRepoFile,
} from "@/lib/tauri-repo-client";
import { generateRepositoryCommitMessage } from "@/lib/tauri-settings-client";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import {
  resolveErrorMessage,
  resolveErrorSummary,
  resolveHeadCommit,
} from "@/stores/repo/repo-store.helpers";
import type {
  RepoStoreGet,
  RepoStoreSet,
} from "@/stores/repo/repo-store.slice-types";
import type {
  GeneratedRepositoryCommitMessage,
  LatestRepositoryCommitMessage,
  PublishRepositoryOptions,
  RepoStoreState,
} from "@/stores/repo/repo-store-types";
import { useAiGenerationMetricsStore } from "@/stores/ui/use-ai-generation-metrics-store";
import { useOperationLogStore } from "@/stores/ui/use-operation-log-store";

interface RepoUndoRedoEntry {
  commitDraftPrefill?: LatestRepositoryCommitMessage | null;
  label: string;
  redo: () => Promise<void>;
  rewritesHistory?: boolean;
  undo: () => Promise<void>;
}

const repoUndoStackById = new Map<string, RepoUndoRedoEntry[]>();
const repoRedoStackById = new Map<string, RepoUndoRedoEntry[]>();
const repoHistoryExecutionLocks = new Set<string>();

const getRepoUndoStack = (id: string): RepoUndoRedoEntry[] => {
  const existing = repoUndoStackById.get(id);

  if (existing) {
    return existing;
  }

  const created: RepoUndoRedoEntry[] = [];
  repoUndoStackById.set(id, created);
  return created;
};

const getRepoRedoStack = (id: string): RepoUndoRedoEntry[] => {
  const existing = repoRedoStackById.get(id);

  if (existing) {
    return existing;
  }

  const created: RepoUndoRedoEntry[] = [];
  repoRedoStackById.set(id, created);
  return created;
};

const updateRepoHistoryState = (set: RepoStoreSet, id: string) => {
  const undoStack = getRepoUndoStack(id);
  const redoStack = getRepoRedoStack(id);
  const undoLabel = undoStack.at(-1)?.label ?? null;
  const redoLabel = redoStack.at(-1)?.label ?? null;

  set((state) => ({
    repoRedoDepthById: {
      ...state.repoRedoDepthById,
      [id]: redoStack.length,
    },
    repoRedoLabelById: {
      ...state.repoRedoLabelById,
      [id]: redoLabel,
    },
    repoUndoDepthById: {
      ...state.repoUndoDepthById,
      [id]: undoStack.length,
    },
    repoUndoLabelById: {
      ...state.repoUndoLabelById,
      [id]: undoLabel,
    },
  }));
};

const recordRepoHistoryEntry = (
  set: RepoStoreSet,
  id: string,
  entry: RepoUndoRedoEntry
) => {
  const undoStack = getRepoUndoStack(id);
  const redoStack = getRepoRedoStack(id);

  undoStack.push(entry);
  redoStack.length = 0;
  updateRepoHistoryState(set, id);
};

const setRepoHistoryRewriteHint = (
  set: RepoStoreSet,
  id: string,
  value: boolean
) => {
  set((state) => ({
    repoHistoryRewriteHintById: {
      ...state.repoHistoryRewriteHintById,
      [id]: value,
    },
  }));
};

const getRepoCommandPreferences = () => {
  const preferences = usePreferencesStore.getState();

  return {
    enableProxy: preferences.network.enableProxy,
    gpgProgramPath: preferences.signing.gpgProgramPath,
    proxyAuthEnabled: preferences.network.proxyAuthEnabled,
    proxyHost: preferences.network.proxyHost,
    proxyPort: preferences.network.proxyPort,
    proxyType: preferences.network.proxyType,
    proxyUsername: preferences.network.proxyUsername,
    sshPrivateKeyPath: preferences.ssh.privateKeyPath,
    sshPublicKeyPath: preferences.ssh.publicKeyPath,
    signingFormat: preferences.signing.signingFormat,
    signingKey: preferences.signing.signingKey,
    signCommitsByDefault: preferences.signing.signCommitsByDefault,
    sslVerification: preferences.network.sslVerification,
    useGitCredentialManager: preferences.network.useGitCredentialManager,
    useLocalSshAgent: preferences.ssh.useLocalAgent,
  };
};

type RepoActionsSliceKeys =
  | "addIgnoreRule"
  | "applyStash"
  | "canRedoRepoAction"
  | "canUndoRepoAction"
  | "checkoutCommit"
  | "cherryPickCommit"
  | "clearRepoCommitDraftPrefill"
  | "commitChanges"
  | "createBranch"
  | "createBranchAtReference"
  | "createStash"
  | "createTag"
  | "deleteBranch"
  | "deleteRemoteBranch"
  | "discardAllChanges"
  | "discardPathChanges"
  | "dropStash"
  | "generateAiCommitMessage"
  | "getRedoRepoActionLabel"
  | "getUndoRepoActionLabel"
  | "getCommitFileDiff"
  | "getCommitFileHunks"
  | "getCommitFileContent"
  | "getCommitFilePreflight"
  | "getCommitFiles"
  | "getRepositoryFiles"
  | "getFileBlame"
  | "getFileDetectedEncoding"
  | "getFileDiff"
  | "getFileContent"
  | "getFileHistory"
  | "getFileHunks"
  | "getFilePreflight"
  | "getFileText"
  | "getLatestCommitMessage"
  | "popStash"
  | "pullBranch"
  | "mergeReference"
  | "pushBranch"
  | "rewordCommitMessage"
  | "renameBranch"
  | "resetToReference"
  | "revertCommit"
  | "setBranchUpstream"
  | "saveFileText"
  | "redoRepoAction"
  | "stageAll"
  | "stageFile"
  | "switchBranch"
  | "undoRepoAction"
  | "unstageAll"
  | "unstageFile";

export const createRepoActionsSlice = (
  set: RepoStoreSet,
  get: RepoStoreGet
): Pick<RepoStoreState, RepoActionsSliceKeys> => ({
  clearRepoCommitDraftPrefill: (id) => {
    set((state) => ({
      repoCommitDraftPrefillById: {
        ...state.repoCommitDraftPrefillById,
        [id]: null,
      },
    }));
  },
  canUndoRepoAction: (id) => {
    return (get().repoUndoDepthById[id] ?? 0) > 0;
  },
  canRedoRepoAction: (id) => {
    return (get().repoRedoDepthById[id] ?? 0) > 0;
  },
  checkoutCommit: async (id, target) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested checkout commit: ${target}`,
    });

    try {
      await checkoutRepoCommit(targetRepo.path, target);
      await get().setActiveRepo(id, { forceRefresh: true });
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: `Checked out commit: ${target}`,
      });
    } catch (error) {
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to checkout commit"),
      });
      throw error;
    }
  },
  cherryPickCommit: async (id, target) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested cherry-pick: ${target}`,
    });

    try {
      await cherryPickRepoCommit(targetRepo.path, target);
      await get().setActiveRepo(id, { forceRefresh: true });
      setRepoHistoryRewriteHint(set, id, false);
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: `Cherry-picked commit: ${target}`,
      });
    } catch (error) {
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to cherry-pick commit"),
      });
      throw error;
    }
  },
  getUndoRepoActionLabel: (id) => {
    return get().repoUndoLabelById[id] ?? null;
  },
  getRedoRepoActionLabel: (id) => {
    return get().repoRedoLabelById[id] ?? null;
  },
  createBranch: async (id, branchName) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested branch creation: ${branchName}`,
    });

    try {
      await createRepoBranch(targetRepo.path, branchName);
      await get().setActiveRepo(id, { forceRefresh: true });
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: `Branch created and checked out: ${branchName}`,
      });
    } catch (error) {
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to create branch"),
      });
      throw error;
    }
  },
  createBranchAtReference: async (id, branchName, target) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested branch creation at ${target}: ${branchName}`,
    });

    try {
      await createRepoBranchAtReference(targetRepo.path, branchName, target);
      await get().setActiveRepo(id, { forceRefresh: true });
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: `Branch created at ${target}: ${branchName}`,
      });
    } catch (error) {
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(
          error,
          "Failed to create branch at selected reference"
        ),
      });
      throw error;
    }
  },
  deleteBranch: async (id, branchName) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested branch deletion: ${branchName}`,
    });

    try {
      await deleteRepoBranch(targetRepo.path, branchName);
      await get().setActiveRepo(id, { forceRefresh: true });
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: `Branch deleted: ${branchName}`,
      });
    } catch (error) {
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to delete branch"),
      });
      throw error;
    }
  },
  deleteRemoteBranch: async (id, remoteName, branchName) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested remote branch deletion: ${remoteName}/${branchName}`,
    });

    try {
      await deleteRemoteRepoBranch(targetRepo.path, remoteName, branchName);
      await get().setActiveRepo(id, { forceRefresh: true });
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: `Remote branch deleted: ${remoteName}/${branchName}`,
      });
    } catch (error) {
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to delete remote branch"),
      });
      throw error;
    }
  },
  renameBranch: async (id, branchName, newBranchName) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested branch rename: ${branchName} -> ${newBranchName}`,
    });

    try {
      await renameRepoBranch(targetRepo.path, branchName, newBranchName);
      await get().setActiveRepo(id, { forceRefresh: true });
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: `Branch renamed: ${branchName} -> ${newBranchName}`,
      });
    } catch (error) {
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to rename branch"),
      });
      throw error;
    }
  },
  rewordCommitMessage: async (id, target, summary, description) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested commit reword: ${target}`,
    });

    try {
      const result = await rewordRepoCommit(
        targetRepo.path,
        target,
        summary,
        description
      );
      await get().setActiveRepo(id, { forceRefresh: true });
      setRepoHistoryRewriteHint(set, id, true);
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: `Commit reworded: ${target}`,
      });
      return result;
    } catch (error) {
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to reword commit"),
      });
      throw error;
    }
  },
  resetToReference: async (id, target, mode = "mixed") => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested reset ${mode} to ${target}`,
    });

    try {
      await resetRepoToReference(targetRepo.path, target, mode);
      await get().setActiveRepo(id, { forceRefresh: true });
      setRepoHistoryRewriteHint(set, id, true);
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: `Repository reset ${mode} to ${target}`,
      });
    } catch (error) {
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to reset repository"),
      });
      throw error;
    }
  },
  revertCommit: async (id, target) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested revert commit: ${target}`,
    });

    try {
      await revertRepoCommit(targetRepo.path, target);
      await get().setActiveRepo(id, { forceRefresh: true });
      setRepoHistoryRewriteHint(set, id, false);
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: `Reverted commit: ${target}`,
      });
    } catch (error) {
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to revert commit"),
      });
      throw error;
    }
  },
  setBranchUpstream: async (
    id,
    localBranchName,
    remoteName,
    remoteBranchName
  ) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested set upstream: ${localBranchName} -> ${remoteName}/${remoteBranchName}`,
    });

    try {
      await setRepoBranchUpstream(
        targetRepo.path,
        localBranchName,
        remoteName,
        remoteBranchName,
        getRepoCommandPreferences()
      );
      await get().setActiveRepo(id, { forceRefresh: true });
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: `Upstream set: ${localBranchName} -> ${remoteName}/${remoteBranchName}`,
      });
    } catch (error) {
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to set branch upstream"),
      });
      throw error;
    }
  },
  undoRepoAction: async (id) => {
    if (repoHistoryExecutionLocks.has(id)) {
      return;
    }

    const undoStack = getRepoUndoStack(id);
    const entry = undoStack.pop();

    if (!entry) {
      updateRepoHistoryState(set, id);
      return;
    }

    const redoStack = getRepoRedoStack(id);
    repoHistoryExecutionLocks.add(id);

    try {
      await entry.undo();
      redoStack.push(entry);
      await get().setActiveRepo(id, { forceRefresh: true });
      const commitDraftPrefill = entry.commitDraftPrefill;
      if (commitDraftPrefill) {
        set((state) => ({
          repoCommitDraftPrefillById: {
            ...state.repoCommitDraftPrefillById,
            [id]: commitDraftPrefill,
          },
        }));
      }
      if (entry.rewritesHistory) {
        setRepoHistoryRewriteHint(set, id, true);
      }
    } catch (error) {
      undoStack.push(entry);
      throw error;
    } finally {
      repoHistoryExecutionLocks.delete(id);
      updateRepoHistoryState(set, id);
    }
  },
  redoRepoAction: async (id) => {
    if (repoHistoryExecutionLocks.has(id)) {
      return;
    }

    const redoStack = getRepoRedoStack(id);
    const entry = redoStack.pop();

    if (!entry) {
      updateRepoHistoryState(set, id);
      return;
    }

    const undoStack = getRepoUndoStack(id);
    repoHistoryExecutionLocks.add(id);

    try {
      await entry.redo();
      undoStack.push(entry);
      await get().setActiveRepo(id, { forceRefresh: true });
      set((state) => ({
        repoCommitDraftPrefillById: {
          ...state.repoCommitDraftPrefillById,
          [id]: null,
        },
      }));
      if (entry.rewritesHistory) {
        setRepoHistoryRewriteHint(set, id, true);
      }
    } catch (error) {
      redoStack.push(entry);
      throw error;
    } finally {
      repoHistoryExecutionLocks.delete(id);
      updateRepoHistoryState(set, id);
    }
  },
  switchBranch: async (id, branchName) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    const previousBranchName =
      get().repoBranches[id]?.find((branch) => branch.isCurrent)?.name ?? null;

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested branch switch to ${branchName}`,
    });

    try {
      await switchRepoBranch(targetRepo.path, branchName);
      await get().setActiveRepo(id, { forceRefresh: true });
      if (previousBranchName && previousBranchName !== branchName) {
        recordRepoHistoryEntry(set, id, {
          label: `Switch to ${branchName}`,
          redo: async () => {
            await switchRepoBranch(targetRepo.path, branchName);
          },
          undo: async () => {
            await switchRepoBranch(targetRepo.path, previousBranchName);
          },
        });
      }
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: `Branch switched to ${branchName}`,
      });
    } catch (error) {
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to switch branch"),
      });
      throw error;
    }
  },
  pushBranch: async (
    id,
    forceWithLease = false,
    publishOptions?: PublishRepositoryOptions
  ) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: forceWithLease
        ? "User requested push with force-with-lease"
        : "User requested push",
    });

    try {
      await pushRepoBranch(
        targetRepo.path,
        getRepoCommandPreferences(),
        forceWithLease,
        publishOptions
      );
      await get().setActiveRepo(id, { forceRefresh: true });
      setRepoHistoryRewriteHint(set, id, false);
      toast.success("Push completed");
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: "Push completed",
      });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to push branch"));
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to push branch"),
      });
      throw error;
    }
  },
  pullBranch: async (id, mode) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested pull mode: ${mode}`,
    });

    try {
      const result = await runRepoPull(
        targetRepo.path,
        mode,
        getRepoCommandPreferences()
      );
      await get().setActiveRepo(id, { forceRefresh: true });
      setRepoHistoryRewriteHint(set, id, false);
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: result.headChanged
          ? `Pull completed with updates (${mode})`
          : `Pull completed with no updates (${mode})`,
      });
      return result;
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to pull changes"));
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to pull changes"),
      });
      throw error;
    }
  },
  mergeReference: async (id, targetRef, mode) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested ${mode} using target: ${targetRef}`,
    });

    try {
      const result = await runRepoMergeAction(
        targetRepo.path,
        targetRef,
        mode,
        getRepoCommandPreferences()
      );
      await get().setActiveRepo(id, { forceRefresh: true });
      setRepoHistoryRewriteHint(set, id, false);
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: result.headChanged
          ? `${mode} completed with updates from ${targetRef}`
          : `${mode} completed with no updates from ${targetRef}`,
      });
      return result;
    } catch (error) {
      toast.error(resolveErrorMessage(error, `Failed to run ${mode}`));
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, `Failed to run ${mode}`),
      });
      throw error;
    }
  },
  addIgnoreRule: async (id, pattern) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested add ignore rule: ${pattern}`,
    });

    try {
      await addRepoIgnoreRule(targetRepo.path, pattern);
      await get().setActiveRepo(id, { forceRefresh: true });
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: "Ignore rule added",
      });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to update .gitignore"));
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to update .gitignore"),
      });
    }
  },
  applyStash: async (id, stashRef) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested apply stash ${stashRef}`,
    });

    try {
      await applyRepoStash(targetRepo.path, stashRef);
      await get().setActiveRepo(id, { forceRefresh: true });
      toast.success(`Stash ${stashRef} applied`);
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: `Stash applied: ${stashRef}`,
      });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to apply stash"));
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to apply stash"),
      });
    }
  },
  popStash: async (id, stashRef) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested pop stash ${stashRef}`,
    });

    try {
      await popRepoStash(targetRepo.path, stashRef);
      await get().setActiveRepo(id, { forceRefresh: true });
      toast.success(`Stash ${stashRef} popped`);
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: `Stash popped: ${stashRef}`,
      });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to pop stash"));
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to pop stash"),
      });
    }
  },
  dropStash: async (id, stashRef) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested drop stash ${stashRef}`,
    });

    try {
      await dropRepoStash(targetRepo.path, stashRef);
      await get().setActiveRepo(id, { forceRefresh: true });
      toast.success(`Stash ${stashRef} deleted`);
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: `Stash dropped: ${stashRef}`,
      });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to delete stash"));
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to delete stash"),
      });
    }
  },
  commitChanges: async (
    id,
    summary,
    description,
    includeAll,
    amend,
    skipHooks
  ) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);
    const headBeforeCommit =
      resolveHeadCommit(get().repoCommits[id] ?? [])?.hash ?? null;

    if (!targetRepo) {
      return;
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: amend ? "User requested amend commit" : "User requested commit",
    });

    try {
      await commitRepoChanges(
        targetRepo.path,
        summary,
        description,
        includeAll,
        amend,
        skipHooks,
        getRepoCommandPreferences()
      );
      await get().setActiveRepo(id, { forceRefresh: true });
      const headAfterCommit =
        resolveHeadCommit(get().repoCommits[id] ?? [])?.hash ?? null;

      if (headAfterCommit && headAfterCommit !== headBeforeCommit) {
        const undoTarget = headBeforeCommit ?? `${headAfterCommit}^`;
        const label = amend ? "Amend commit" : "Commit";

        recordRepoHistoryEntry(set, id, {
          commitDraftPrefill: {
            description,
            summary,
          },
          label,
          redo: async () => {
            await resetRepoToReference(
              targetRepo.path,
              headAfterCommit,
              "mixed"
            );
          },
          rewritesHistory: true,
          undo: async () => {
            await resetRepoToReference(targetRepo.path, undoTarget, "mixed");
          },
        });
      }
      setRepoHistoryRewriteHint(set, id, false);
      toast.success("Commit created");
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: amend ? "Commit amended" : "Commit created",
      });
    } catch (error) {
      let detailedMessage = "Failed to commit changes";

      if (error instanceof Error) {
        detailedMessage = error.message;
      } else if (typeof error === "string") {
        detailedMessage = error;
      }

      toast.error("Commit failed", {
        description: resolveErrorSummary(error, "Failed to commit changes"),
      });
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: detailedMessage,
      });
      throw error;
    }
  },
  createStash: async (id, summary, description) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: "User requested create stash",
    });

    try {
      await createRepoStash(targetRepo.path, summary, description, true);
      await get().setActiveRepo(id, { forceRefresh: true });
      toast.success("Stash created");
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: "Stash created",
      });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to create stash"));
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to create stash"),
      });
      throw error;
    }
  },
  createTag: async (
    id,
    tagName,
    target,
    annotated = false,
    annotationMessage = ""
  ) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: annotated
        ? `User requested annotated tag at ${target}: ${tagName}`
        : `User requested tag at ${target}: ${tagName}`,
    });

    try {
      await createRepoTag(
        targetRepo.path,
        tagName,
        target,
        annotated,
        annotationMessage
      );
      await get().setActiveRepo(id, { forceRefresh: true });
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: annotated
          ? `Annotated tag created at ${target}: ${tagName}`
          : `Tag created at ${target}: ${tagName}`,
      });
    } catch (error) {
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to create tag"),
      });
      throw error;
    }
  },
  stageAll: async (id) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: "User requested stage all changes",
    });

    try {
      await stageAllRepoChanges(targetRepo.path);
      await get().setActiveRepo(id, { forceRefresh: true });
      recordRepoHistoryEntry(set, id, {
        label: "Stage all changes",
        redo: async () => {
          await stageAllRepoChanges(targetRepo.path);
        },
        undo: async () => {
          await unstageAllRepoChanges(targetRepo.path);
        },
      });
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: "All changes staged",
      });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to stage all files"));
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to stage all files"),
      });
    }
  },
  unstageAll: async (id) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: "User requested unstage all changes",
    });

    try {
      await unstageAllRepoChanges(targetRepo.path);
      await get().setActiveRepo(id, { forceRefresh: true });
      recordRepoHistoryEntry(set, id, {
        label: "Unstage all changes",
        redo: async () => {
          await unstageAllRepoChanges(targetRepo.path);
        },
        undo: async () => {
          await stageAllRepoChanges(targetRepo.path);
        },
      });
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: "All changes unstaged",
      });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to unstage all files"));
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to unstage all files"),
      });
    }
  },
  stageFile: async (id, filePath) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested stage file: ${filePath}`,
    });

    try {
      await stageRepoFile(targetRepo.path, filePath);
      await get().setActiveRepo(id, { forceRefresh: true });
      recordRepoHistoryEntry(set, id, {
        label: `Stage ${filePath}`,
        redo: async () => {
          await stageRepoFile(targetRepo.path, filePath);
        },
        undo: async () => {
          await unstageRepoFile(targetRepo.path, filePath);
        },
      });
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: `File staged: ${filePath}`,
      });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to stage file"));
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to stage file"),
      });
    }
  },
  discardAllChanges: async (id) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "warn",
      message: "User requested discard all changes",
    });

    try {
      await discardAllRepoChanges(targetRepo.path);
      await get().setActiveRepo(id, { forceRefresh: true });
      toast.success("All changes discarded");
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "warn",
        message: "All changes discarded",
      });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to discard all changes"));
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to discard all changes"),
      });
      throw error;
    }
  },
  discardPathChanges: async (id, filePath) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "warn",
      message: `User requested discard path changes: ${filePath}`,
    });

    try {
      await discardRepoPathChanges(targetRepo.path, filePath);
      await get().setActiveRepo(id, { forceRefresh: true });
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "warn",
        message: `Path changes discarded: ${filePath}`,
      });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to discard changes"));
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to discard changes"),
      });
    }
  },
  unstageFile: async (id, filePath) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested unstage file: ${filePath}`,
    });

    try {
      await unstageRepoFile(targetRepo.path, filePath);
      await get().setActiveRepo(id, { forceRefresh: true });
      recordRepoHistoryEntry(set, id, {
        label: `Unstage ${filePath}`,
        redo: async () => {
          await unstageRepoFile(targetRepo.path, filePath);
        },
        undo: async () => {
          await stageRepoFile(targetRepo.path, filePath);
        },
      });
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: `File unstaged: ${filePath}`,
      });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to unstage file"));
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to unstage file"),
      });
    }
  },
  getCommitFiles: async (id, commitHash) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return [];
    }

    try {
      return await getRepoCommitFiles(targetRepo.path, commitHash);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to load commit files"));
      return [];
    }
  },
  getRepositoryFiles: async (id) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return [];
    }

    const cachedFiles = get().repoFilesById[id];

    if (cachedFiles) {
      return cachedFiles;
    }

    try {
      const files = await getRepositoryFiles(targetRepo.path);

      set((state) => ({
        repoFilesById: {
          ...state.repoFilesById,
          [id]: files,
        },
      }));

      return files;
    } catch (error) {
      toast.error(
        resolveErrorMessage(error, "Failed to load repository files")
      );
      return [];
    }
  },
  getCommitFileDiff: async (id, commitHash, filePath) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return null;
    }

    try {
      return await getRepoCommitFileDiff(targetRepo.path, commitHash, filePath);
    } catch (error) {
      toast.error(
        resolveErrorMessage(error, "Failed to load commit file diff")
      );
      return null;
    }
  },
  getCommitFilePreflight: async (id, commitHash, filePath, mode) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return null;
    }

    try {
      return await getRepoCommitFilePreflight(
        targetRepo.path,
        commitHash,
        filePath,
        mode
      );
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Error rendering diff"));
      return null;
    }
  },
  getCommitFileContent: async (
    id,
    commitHash,
    filePath,
    mode,
    forceRender,
    encoding
  ) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return null;
    }

    try {
      return await getRepoCommitFileContent(
        targetRepo.path,
        commitHash,
        filePath,
        mode,
        forceRender,
        encoding
      );
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Error rendering diff"));
      return null;
    }
  },
  getCommitFileHunks: async (
    id,
    commitHash,
    filePath,
    ignoreTrimWhitespace
  ) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return null;
    }

    try {
      return await getRepoCommitFileHunks(
        targetRepo.path,
        commitHash,
        filePath,
        ignoreTrimWhitespace
      );
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Error rendering diff"));
      return null;
    }
  },
  getFileDiff: async (id, filePath) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return null;
    }

    try {
      return await getRepoFileDiff(targetRepo.path, filePath);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to load file diff"));
      return null;
    }
  },
  getFilePreflight: async (id, filePath, mode) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return null;
    }

    try {
      return await getRepoFilePreflight(targetRepo.path, filePath, mode);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Error loading file"));
      return null;
    }
  },
  getFileContent: async (id, filePath, mode, forceRender, encoding) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return null;
    }

    try {
      return await getRepoFileContent(
        targetRepo.path,
        filePath,
        mode,
        forceRender,
        encoding
      );
    } catch (error) {
      if (mode === "file") {
        toast.error(resolveErrorMessage(error, "Error loading file"));
      } else {
        toast.error(resolveErrorMessage(error, "Error rendering diff"));
      }
      return null;
    }
  },
  getFileHunks: async (id, filePath, ignoreTrimWhitespace) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return null;
    }

    try {
      return await getRepoFileHunks(
        targetRepo.path,
        filePath,
        ignoreTrimWhitespace
      );
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Error rendering diff"));
      return null;
    }
  },
  getFileHistory: async (id, filePath, limit) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return null;
    }

    try {
      return await getRepoFileHistory(targetRepo.path, filePath, limit);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Error loading file history"));
      return null;
    }
  },
  getFileBlame: async (id, filePath, revision) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return null;
    }

    try {
      return await getRepoFileBlame(targetRepo.path, filePath, revision);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Error loading blame"));
      return null;
    }
  },
  getFileDetectedEncoding: async (id, filePath, revision) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return null;
    }

    try {
      return await getRepoFileDetectedEncoding(
        targetRepo.path,
        filePath,
        revision
      );
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Error detecting file encoding"));
      return null;
    }
  },
  getFileText: async (id, filePath, encoding) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return null;
    }

    try {
      return await getRepoFileText(targetRepo.path, filePath, encoding);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Error loading file"));
      return null;
    }
  },
  saveFileText: async (id, filePath, text, encoding) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return false;
    }

    try {
      await saveRepoFileText(targetRepo.path, filePath, text, encoding);
      return true;
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Error saving file"));
      return false;
    }
  },
  getLatestCommitMessage: async (id) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return null;
    }

    try {
      return await getLatestRepoCommitMessage(targetRepo.path);
    } catch (error) {
      toast.error(
        resolveErrorMessage(error, "Failed to load latest commit message")
      );
      return null;
    }
  },
  generateAiCommitMessage: async (
    id,
    instruction
  ): Promise<GeneratedRepositoryCommitMessage> => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    const preferences = usePreferencesStore.getState().ai;
    const startedAt = performance.now();

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: "User requested AI commit message generation",
    });

    try {
      const result = await generateRepositoryCommitMessage({
        customEndpoint: preferences.customEndpoint,
        instruction:
          instruction.trim().length > 0
            ? instruction
            : preferences.commitInstruction,
        maxInputTokens: preferences.maxInputTokens,
        maxOutputTokens: preferences.maxOutputTokens,
        model: preferences.model,
        provider: preferences.provider,
        repoPath: targetRepo.path,
      });
      const durationMs = Math.max(0, Math.round(performance.now() - startedAt));

      useAiGenerationMetricsStore.getState().recordSuccess({
        durationMs,
        promptMode: result.promptMode,
        providerKind: result.providerKind,
        schemaFallbackUsed: result.schemaFallbackUsed,
      });
      useOperationLogStore.getState().appendSystemLog(targetRepo.path, {
        command: "ai.generate_commit_message",
        durationMs,
        level: "info",
        message: "Command completed",
        metadata: {
          prompt_mode: result.promptMode,
          provider_kind: result.providerKind,
          schema_fallback_used: result.schemaFallbackUsed,
        },
      });
      return result;
    } catch (error) {
      const message = resolveErrorMessage(
        error,
        "Failed to generate AI commit message"
      );
      useAiGenerationMetricsStore
        .getState()
        .recordFailure(preferences.provider);
      useOperationLogStore.getState().appendSystemLog(targetRepo.path, {
        command: "ai.generate_commit_message",
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        level: "error",
        message,
      });
      toast.error(message);
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message,
      });
      throw error;
    }
  },
});
