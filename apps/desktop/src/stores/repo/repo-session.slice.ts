import { toast } from "sonner";
import {
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
  OpenedRepository,
  PickedRepository,
  RepoStoreState,
} from "@/stores/repo/repo-store-types";

type RepoSessionSliceKeys =
  | "clearActiveRepo"
  | "closeRepository"
  | "initializeRepository"
  | "openRepository"
  | "refreshOpenedRepositories";

async function activateOrAppendRepository(
  get: RepoStoreGet,
  set: RepoStoreSet,
  repository: PickedRepository
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

export const createRepoSessionSlice = (
  set: RepoStoreSet,
  get: RepoStoreGet
): Pick<RepoStoreState, RepoSessionSliceKeys> => ({
  clearActiveRepo: () => {
    set({ activeRepoId: null });
  },
  closeRepository: (id) => {
    const {
      activeRepoId,
      openedRepos,
      repoCommits,
      repoBranches,
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
  initializeRepository: async (repository) => {
    const invoke = getTauriInvoke();

    if (!invoke) {
      toast.error("Initialize repository works in Tauri desktop app only");
      return null;
    }

    try {
      await createRepoInitialCommit(repository.path);
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
        name: picked.name,
        path: picked.path,
      } satisfies PickedRepository;

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
        let nextRepoWorkingTreeStatuses = state.repoWorkingTreeStatuses;
        let nextRepoWorkingTreeItems = state.repoWorkingTreeItems;

        for (const staleRepoId of staleRepoIds) {
          nextRepoCommits = clearRepoDataById(nextRepoCommits, staleRepoId);
          nextRepoBranches = clearRepoDataById(nextRepoBranches, staleRepoId);
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
