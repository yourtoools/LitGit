import { toast } from "sonner";
import {
  applyRepoStash,
  commitRepoChanges,
  dropRepoStash,
  getRepoFileDiff,
  popRepoStash,
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
  | "applyStash"
  | "commitChanges"
  | "dropStash"
  | "getFileDiff"
  | "popStash"
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
