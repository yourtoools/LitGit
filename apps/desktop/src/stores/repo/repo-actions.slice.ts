import { toast } from "sonner";
import {
  addRepoIgnoreRule,
  applyRepoStash,
  commitRepoChanges,
  discardAllRepoChanges,
  discardRepoPathChanges,
  dropRepoStash,
  getLatestRepoCommitMessage,
  getRepoCommitFileDiff,
  getRepoCommitFiles,
  getRepoFileDiff,
  popRepoStash,
  pushRepoBranch,
  runRepoPull,
  stageAllRepoChanges,
  stageRepoFile,
  switchRepoBranch,
  unstageAllRepoChanges,
  unstageRepoFile,
} from "@/lib/tauri-repo-client";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import { resolveErrorMessage } from "@/stores/repo/repo-store.helpers";
import type { RepoStoreGet } from "@/stores/repo/repo-store.slice-types";
import type { RepoStoreState } from "@/stores/repo/repo-store-types";
import { useOperationLogStore } from "@/stores/ui/use-operation-log-store";

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
  | "commitChanges"
  | "discardAllChanges"
  | "discardPathChanges"
  | "dropStash"
  | "getCommitFileDiff"
  | "getCommitFiles"
  | "getFileDiff"
  | "getLatestCommitMessage"
  | "popStash"
  | "pullBranch"
  | "pushBranch"
  | "stageAll"
  | "stageFile"
  | "switchBranch"
  | "unstageAll"
  | "unstageFile";

export const createRepoActionsSlice = (
  get: RepoStoreGet
): Pick<RepoStoreState, RepoActionsSliceKeys> => ({
  switchBranch: async (id, branchName) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
      level: "info",
      message: `User requested branch switch to ${branchName}`,
    });

    try {
      await switchRepoBranch(targetRepo.path, branchName);
      await get().setActiveRepo(id, { forceRefresh: true });
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
  pushBranch: async (id, forceWithLease = false) => {
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
        forceWithLease
      );
      await get().setActiveRepo(id, { forceRefresh: true });
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
      toast.success("Commit created");
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "info",
        message: amend ? "Commit amended" : "Commit created",
      });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to commit changes"));
      useOperationLogStore.getState().appendActivityLog(targetRepo.path, {
        level: "error",
        message: resolveErrorMessage(error, "Failed to commit changes"),
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
});
