import { toast } from "sonner";
import {
  addRepoIgnoreRule,
  applyRepoStash,
  commitRepoChanges,
  discardRepoPathChanges,
  dropRepoStash,
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
import { resolveErrorMessage } from "@/stores/repo/repo-store.helpers";
import type { RepoStoreGet } from "@/stores/repo/repo-store.slice-types";
import type { RepoStoreState } from "@/stores/repo/repo-store-types";

type RepoActionsSliceKeys =
  | "addIgnoreRule"
  | "applyStash"
  | "commitChanges"
  | "discardPathChanges"
  | "dropStash"
  | "getCommitFileDiff"
  | "getCommitFiles"
  | "getFileDiff"
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

    await switchRepoBranch(targetRepo.path, branchName);
    await get().setActiveRepo(id, { forceRefresh: true });
  },
  pushBranch: async (id) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    try {
      await pushRepoBranch(targetRepo.path);
      await get().setActiveRepo(id, { forceRefresh: true });
      toast.success("Push completed");
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to push branch"));
      throw error;
    }
  },
  pullBranch: async (id, mode) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      throw new Error("Repository is no longer available");
    }

    try {
      const result = await runRepoPull(targetRepo.path, mode);
      await get().setActiveRepo(id, { forceRefresh: true });
      return result;
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to pull changes"));
      throw error;
    }
  },
  addIgnoreRule: async (id, pattern) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    try {
      await addRepoIgnoreRule(targetRepo.path, pattern);
      await get().setActiveRepo(id, { forceRefresh: true });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to update .gitignore"));
    }
  },
  applyStash: async (id, stashRef) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    try {
      await applyRepoStash(targetRepo.path, stashRef);
      await get().setActiveRepo(id, { forceRefresh: true });
      toast.success(`Stash ${stashRef} applied`);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to apply stash"));
    }
  },
  popStash: async (id, stashRef) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    try {
      await popRepoStash(targetRepo.path, stashRef);
      await get().setActiveRepo(id, { forceRefresh: true });
      toast.success(`Stash ${stashRef} popped`);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to pop stash"));
    }
  },
  dropStash: async (id, stashRef) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    try {
      await dropRepoStash(targetRepo.path, stashRef);
      await get().setActiveRepo(id, { forceRefresh: true });
      toast.success(`Stash ${stashRef} deleted`);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to delete stash"));
    }
  },
  commitChanges: async (id, summary, description, includeAll) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    try {
      await commitRepoChanges(
        targetRepo.path,
        summary,
        description,
        includeAll
      );
      await get().setActiveRepo(id, { forceRefresh: true });
      toast.success("Commit created");
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to commit changes"));
    }
  },
  stageAll: async (id) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    try {
      await stageAllRepoChanges(targetRepo.path);
      await get().setActiveRepo(id, { forceRefresh: true });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to stage all files"));
    }
  },
  unstageAll: async (id) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    try {
      await unstageAllRepoChanges(targetRepo.path);
      await get().setActiveRepo(id, { forceRefresh: true });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to unstage all files"));
    }
  },
  stageFile: async (id, filePath) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    try {
      await stageRepoFile(targetRepo.path, filePath);
      await get().setActiveRepo(id, { forceRefresh: true });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to stage file"));
    }
  },
  discardPathChanges: async (id, filePath) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    try {
      await discardRepoPathChanges(targetRepo.path, filePath);
      await get().setActiveRepo(id, { forceRefresh: true });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to discard changes"));
    }
  },
  unstageFile: async (id, filePath) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    try {
      await unstageRepoFile(targetRepo.path, filePath);
      await get().setActiveRepo(id, { forceRefresh: true });
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to unstage file"));
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
});
