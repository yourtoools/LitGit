import { toast } from "sonner";
import {
  cloneRepo,
  createLocalRepo,
  createRepoInitialCommit,
  getTauriInvoke,
  parsePickedRepository,
  validateOpenedRepositories,
} from "@/lib/tauri-repo-client";
import {
  clearRepoDataById,
  resolveErrorMessage,
} from "@/stores/repo/repo-store.helpers";
import type {
  RepoStoreGet,
  RepoStoreSet,
} from "@/stores/repo/repo-store.slice-types";
import type {
  GitIdentityWriteInput,
  OpenedRepository,
  PickedRepositorySelection,
  RepoStoreState,
} from "@/stores/repo/repo-store-types";

type RepoSessionSliceKeys =
  | "clearActiveRepo"
  | "cloneRepository"
  | "closeRepository"
  | "createLocalRepository"
  | "getRepositoryGitIdentity"
  | "initializeRepository"
  | "openRepository"
  | "refreshOpenedRepositories";

async function activateOrAppendRepository(
  get: RepoStoreGet,
  set: RepoStoreSet,
  repository: PickedRepositorySelection
): Promise<OpenedRepository> {
  const existing = get().openedRepos.find(
    (opened) => opened.path === repository.path
  );

  if (existing) {
    await get().setActiveRepo(existing.id);
    return existing;
  }

  const id = repository.path;
  const nextRepo: OpenedRepository = { ...repository, id };

  set((state) => ({
    activeRepoId: id,
    openedRepos: [...state.openedRepos, nextRepo],
  }));

  await get().setActiveRepo(id);
  return nextRepo;
}

async function getRepositoryGitIdentityByPath(
  repoPath: string
): Promise<import("@/stores/repo/repo-store-types").GitIdentityStatus | null> {
  const { getRepoGitIdentity } = await import("@/lib/tauri-repo-client");

  try {
    return await getRepoGitIdentity(repoPath);
  } catch {
    return null;
  }
}

export const createRepoSessionSlice = (
  set: RepoStoreSet,
  get: RepoStoreGet
): Pick<RepoStoreState, RepoSessionSliceKeys> => ({
  clearActiveRepo: () => {
    set({ activeRepoId: null });
  },
  getRepositoryGitIdentity: async (id) => {
    const repository = get().openedRepos.find((repo) => repo.id === id);

    if (!repository) {
      return null;
    }

    return await getRepositoryGitIdentityByPath(repository.path);
  },
  cloneRepository: async (
    repositoryUrl,
    destinationParent,
    folderName,
    recurseSubmodules,
    preferences
  ) => {
    const invoke = getTauriInvoke();

    if (!invoke) {
      toast.error("Clone repository works in Tauri desktop app only");
      return null;
    }

    try {
      const cloned = await cloneRepo(
        repositoryUrl,
        destinationParent,
        folderName,
        recurseSubmodules,
        preferences
      );

      if (!cloned) {
        return null;
      }

      return await activateOrAppendRepository(get, set, cloned);
    } catch (error) {
      toast.error(resolveErrorMessage(error, "Failed to clone repository"));
      return null;
    }
  },
  createLocalRepository: async (input) => {
    const invoke = getTauriInvoke();

    if (!invoke) {
      const message = "Create local repository works in Tauri desktop app only";
      toast.error(message);
      throw new Error(message);
    }

    try {
      const created = await createLocalRepo(input);

      if (!created) {
        return null;
      }

      toast.success(`Created repository ${created.name}`);
      return await activateOrAppendRepository(get, set, created);
    } catch (error) {
      const message = resolveErrorMessage(
        error,
        "Failed to create local repository"
      );
      toast.error(message);
      throw error instanceof Error ? error : new Error(message);
    }
  },
  closeRepository: (id) => {
    const {
      activeRepoId,
      openedRepos,
      repoCommits,
      repoBranches,
      repoRemoteNames,
      repoStashes,
      repoWorkingTreeStatuses,
      repoWorkingTreeItems,
      setActiveRepo,
    } = get();
    const index = openedRepos.findIndex((repo) => repo.id === id);

    if (index < 0) {
      return;
    }

    const nextOpenedRepos = openedRepos.filter((repo) => repo.id !== id);

    const nextRepoCommits = clearRepoDataById(repoCommits, id);
    const nextRepoBranches = clearRepoDataById(repoBranches, id);
    const nextRepoRemoteNames = clearRepoDataById(repoRemoteNames, id);
    const nextRepoStashes = clearRepoDataById(repoStashes, id);
    const nextRepoWorkingTreeStatuses = clearRepoDataById(
      repoWorkingTreeStatuses,
      id
    );
    const nextRepoWorkingTreeItems = clearRepoDataById(
      repoWorkingTreeItems,
      id
    );

    set({
      openedRepos: nextOpenedRepos,
      repoCommits: nextRepoCommits,
      repoBranches: nextRepoBranches,
      repoRemoteNames: nextRepoRemoteNames,
      repoStashes: nextRepoStashes,
      repoWorkingTreeStatuses: nextRepoWorkingTreeStatuses,
      repoWorkingTreeItems: nextRepoWorkingTreeItems,
    });

    if (activeRepoId !== id) {
      return;
    }

    const fallbackRepo =
      nextOpenedRepos[index] ?? nextOpenedRepos[index - 1] ?? null;

    if (!fallbackRepo) {
      set({ activeRepoId: null });
      return;
    }

    setActiveRepo(fallbackRepo.id).catch((error) => {
      toast.error(resolveErrorMessage(error, "Failed to switch repository"));
    });
  },
  initializeRepository: async (
    repository,
    gitIdentity?: GitIdentityWriteInput | null
  ) => {
    const invoke = getTauriInvoke();

    if (!invoke) {
      toast.error("Initialize repository works in Tauri desktop app only");
      return null;
    }

    try {
      await createRepoInitialCommit(repository.path, gitIdentity);
      return await activateOrAppendRepository(get, set, repository);
    } catch (error) {
      toast.error(
        resolveErrorMessage(error, "Failed to initialize repository")
      );
      return null;
    }
  },
  openRepository: async () => {
    const invoke = getTauriInvoke();

    if (!invoke) {
      toast.error("Open folder works in Tauri desktop app only");
      return null;
    }

    set({ isPickingRepo: true });

    try {
      const picked = parsePickedRepository(await invoke("pick_git_repository"));

      if (!picked) {
        return null;
      }

      const existing = get().openedRepos.find(
        (repo) => repo.path === picked.path
      );

      if (existing) {
        await get().setActiveRepo(existing.id);
        return {
          repository: existing,
          status: "opened",
        };
      }

      const repository = {
        hasInitialCommit: picked.hasInitialCommit,
        isGitRepository: picked.isGitRepository,
        name: picked.name,
        path: picked.path,
      } satisfies PickedRepositorySelection;

      if (!picked.hasInitialCommit) {
        return {
          repository,
          status: "requires-initial-commit",
        };
      }

      const openedRepository = await activateOrAppendRepository(
        get,
        set,
        repository
      );

      return {
        repository: openedRepository,
        status: "opened",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to open repository";
      toast.error(message);
      return null;
    } finally {
      set({ isPickingRepo: false });
    }
  },
  refreshOpenedRepositories: async () => {
    const openedRepos = get().openedRepos;

    if (openedRepos.length === 0) {
      return;
    }

    set({ isRefreshingOpenedRepos: true });

    try {
      const validRepoPaths = await validateOpenedRepositories(
        openedRepos.map((repo) => repo.path)
      );
      const validPathSet = new Set(validRepoPaths);
      const staleRepoIds = new Set(
        openedRepos
          .filter((repo) => !validPathSet.has(repo.path))
          .map((repo) => repo.id)
      );

      if (staleRepoIds.size === 0) {
        return;
      }

      set((state) => {
        let nextRepoCommits = state.repoCommits;
        let nextRepoBranches = state.repoBranches;
        let nextRepoStashes = state.repoStashes;
        let nextRepoWorkingTreeStatuses = state.repoWorkingTreeStatuses;
        let nextRepoWorkingTreeItems = state.repoWorkingTreeItems;

        for (const staleRepoId of staleRepoIds) {
          nextRepoCommits = clearRepoDataById(nextRepoCommits, staleRepoId);
          nextRepoBranches = clearRepoDataById(nextRepoBranches, staleRepoId);
          nextRepoStashes = clearRepoDataById(nextRepoStashes, staleRepoId);
          nextRepoWorkingTreeStatuses = clearRepoDataById(
            nextRepoWorkingTreeStatuses,
            staleRepoId
          );
          nextRepoWorkingTreeItems = clearRepoDataById(
            nextRepoWorkingTreeItems,
            staleRepoId
          );
        }

        return {
          openedRepos: state.openedRepos.filter(
            (repo) => !staleRepoIds.has(repo.id)
          ),
          repoCommits: nextRepoCommits,
          repoBranches: nextRepoBranches,
          repoStashes: nextRepoStashes,
          repoWorkingTreeStatuses: nextRepoWorkingTreeStatuses,
          repoWorkingTreeItems: nextRepoWorkingTreeItems,
          activeRepoId:
            state.activeRepoId && staleRepoIds.has(state.activeRepoId)
              ? null
              : state.activeRepoId,
        };
      });
    } catch (error) {
      toast.error(
        resolveErrorMessage(error, "Failed to refresh recent repositories")
      );
    } finally {
      set({ isRefreshingOpenedRepos: false });
    }
  },
});
