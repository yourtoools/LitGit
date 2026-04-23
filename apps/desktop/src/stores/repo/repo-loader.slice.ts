import { toast } from "sonner";
import {
  fetchLightRepoData,
  fetchRepoData,
  getRepoGitIdentity,
} from "@/lib/tauri-repo-client";
import { resolveErrorMessage } from "@/stores/repo/repo-store.helpers";
import type {
  RepoStoreGet,
  RepoStoreSet,
} from "@/stores/repo/repo-store.slice-types";
import type {
  RepoDataFetchResult,
  RepoStoreState,
} from "@/stores/repo/repo-store-types";

type RepoLoaderSliceKeys = "setActiveRepo";

interface RepoCacheState {
  hasBranches: boolean;
  hasCommits: boolean;
  hasRemoteNames: boolean;
  hasStashes: boolean;
  hasStatus: boolean;
  hasWipItems: boolean;
}

type RepoRefreshMode = "full" | "light";

const getRepoCacheState = (
  get: RepoStoreGet,
  id: string,
  forceRefresh: boolean
): RepoCacheState => ({
  hasCommits:
    !forceRefresh &&
    Boolean(get().repoCommits[id]) &&
    Boolean(get().repoHistoryGraphsById[id]),
  hasBranches: !forceRefresh && Boolean(get().repoBranches[id]),
  hasRemoteNames: !forceRefresh && Boolean(get().repoRemoteNames[id]),
  hasStashes: !forceRefresh && Boolean(get().repoStashes[id]),
  hasStatus: !forceRefresh && Boolean(get().repoWorkingTreeStatuses[id]),
  hasWipItems: !forceRefresh && Boolean(get().repoWorkingTreeItems[id]),
});

const hasAllRepoData = (cacheState: RepoCacheState): boolean =>
  cacheState.hasCommits &&
  cacheState.hasBranches &&
  cacheState.hasRemoteNames &&
  cacheState.hasStashes &&
  cacheState.hasStatus &&
  cacheState.hasWipItems;

const hasLightRepoData = (cacheState: RepoCacheState): boolean =>
  cacheState.hasStatus && cacheState.hasWipItems;

const setRepoLoadingFlags = (set: RepoStoreSet, cacheState: RepoCacheState) => {
  set({
    isLoadingHistory: !cacheState.hasCommits,
    isLoadingBranches: !cacheState.hasBranches,
    isLoadingStashes: !cacheState.hasStashes,
    isLoadingStatus: !cacheState.hasStatus,
    isLoadingWip: !cacheState.hasWipItems,
  });
};

const setRepoLoadingFlagsForMode = (
  set: RepoStoreSet,
  cacheState: RepoCacheState,
  refreshMode: RepoRefreshMode
) => {
  if (refreshMode === "light") {
    set({
      isLoadingHistory: false,
      isLoadingBranches: false,
      isLoadingStashes: false,
      isLoadingStatus: !cacheState.hasStatus,
      isLoadingWip: !cacheState.hasWipItems,
    });
    return;
  }

  setRepoLoadingFlags(set, cacheState);
};

const clearRepoLoadingFlags = (set: RepoStoreSet) => {
  set({
    isLoadingHistory: false,
    isLoadingBranches: false,
    isLoadingStashes: false,
    isLoadingStatus: false,
    isLoadingWip: false,
  });
};

const setRepoBackgroundRefreshState = (
  set: RepoStoreSet,
  id: string,
  isRefreshing: boolean
) => {
  set((state) => ({
    repoBackgroundRefreshById: {
      ...state.repoBackgroundRefreshById,
      [id]: isRefreshing,
    },
  }));
};

const markRepoLoadedAt = (set: RepoStoreSet, id: string) => {
  set((state) => ({
    repoLastLoadedAtById: {
      ...state.repoLastLoadedAtById,
      [id]: Date.now(),
    },
  }));
};

const applyRepoPayloads = (
  set: RepoStoreSet,
  id: string,
  result: RepoDataFetchResult
) => {
  const historyPayload = result.historyPayload;
  if (historyPayload) {
    set((state) => ({
      repoCommits: {
        ...state.repoCommits,
        [id]: historyPayload.commits,
      },
      repoHistoryGraphsById: {
        ...state.repoHistoryGraphsById,
        [id]: historyPayload.graph,
      },
    }));
  }

  const branchesPayload = result.branchesPayload;
  if (branchesPayload) {
    set((state) => ({
      repoBranches: {
        ...state.repoBranches,
        [id]: branchesPayload.branches,
      },
    }));
  }

  const remoteNamesPayload = result.remoteNamesPayload;
  if (remoteNamesPayload) {
    set((state) => ({
      repoRemoteNames: {
        ...state.repoRemoteNames,
        [id]: remoteNamesPayload.remoteNames,
      },
    }));
  }

  const stashesPayload = result.stashesPayload;
  if (stashesPayload) {
    set((state) => ({
      repoStashes: {
        ...state.repoStashes,
        [id]: stashesPayload.stashes,
      },
    }));
  }

  const statusPayload = result.statusPayload;
  if (statusPayload) {
    set((state) => ({
      repoWorkingTreeStatuses: {
        ...state.repoWorkingTreeStatuses,
        [id]: statusPayload.status,
      },
    }));
  }

  const wipItemsPayload = result.wipItemsPayload;
  if (wipItemsPayload) {
    set((state) => ({
      repoWorkingTreeItems: {
        ...state.repoWorkingTreeItems,
        [id]: wipItemsPayload.items,
      },
    }));
  }
};

const notifyRepoLoadErrors = (result: RepoDataFetchResult) => {
  const loadErrors = [
    {
      error: result.historyError,
      fallbackMessage: "Failed to load repository history",
    },
    {
      error: result.branchesError,
      fallbackMessage: "Failed to load repository branches",
    },
    {
      error: result.remoteNamesError,
      fallbackMessage: "Failed to load repository remotes",
    },
    {
      error: result.stashesError,
      fallbackMessage: "Failed to load repository stashes",
    },
    {
      error: result.statusError,
      fallbackMessage: "Failed to load repository status",
    },
    {
      error: result.wipItemsError,
      fallbackMessage: "Failed to load repository WIP items",
    },
  ] as const;

  for (const loadError of loadErrors) {
    if (!loadError.error) {
      continue;
    }

    toast.error(
      resolveErrorMessage(loadError.error, loadError.fallbackMessage)
    );
  }
};

const notifyRepoLoadErrorsForMode = (
  result: RepoDataFetchResult,
  refreshMode: RepoRefreshMode
) => {
  if (refreshMode === "light") {
    const loadErrors = [
      {
        error: result.statusError,
        fallbackMessage: "Failed to load repository status",
      },
      {
        error: result.wipItemsError,
        fallbackMessage: "Failed to load repository WIP items",
      },
    ] as const;

    for (const loadError of loadErrors) {
      if (!loadError.error) {
        continue;
      }

      toast.error(
        resolveErrorMessage(loadError.error, loadError.fallbackMessage)
      );
    }

    return;
  }

  notifyRepoLoadErrors(result);
};

export const createRepoLoaderSlice = (
  set: RepoStoreSet,
  get: RepoStoreGet
): Pick<RepoStoreState, RepoLoaderSliceKeys> => ({
  setActiveRepo: async (id, options) => {
    const targetRepo = get().openedRepos.find((repo) => repo.id === id);

    if (!targetRepo) {
      return;
    }

    const forceRefresh = options?.forceRefresh ?? false;
    const refreshMode = options?.refreshMode ?? "full";
    const hadCachedRepoData = hasAllRepoData(getRepoCacheState(get, id, false));
    const shouldRefreshInBackground =
      (options?.background ?? false) &&
      (refreshMode === "light"
        ? hasLightRepoData(getRepoCacheState(get, id, false))
        : hadCachedRepoData);

    set({ activeRepoId: id });

    try {
      const identity = await getRepoGitIdentity(targetRepo.path);

      set((state) => ({
        repoGitIdentities: {
          ...state.repoGitIdentities,
          [id]: identity,
        },
      }));
    } catch {
      set((state) => ({
        repoGitIdentities: {
          ...state.repoGitIdentities,
          [id]: undefined,
        },
      }));
    }

    const cacheState = getRepoCacheState(get, id, forceRefresh);

    if (
      (refreshMode === "light" && hasLightRepoData(cacheState)) ||
      (refreshMode === "full" && hasAllRepoData(cacheState))
    ) {
      return;
    }

    if (shouldRefreshInBackground) {
      setRepoBackgroundRefreshState(set, id, true);
    } else {
      setRepoLoadingFlagsForMode(set, cacheState, refreshMode);
    }

    try {
      const result =
        refreshMode === "light"
          ? await fetchLightRepoData(
              id,
              targetRepo.path,
              cacheState.hasStatus,
              cacheState.hasWipItems
            )
          : await fetchRepoData(
              id,
              targetRepo.path,
              cacheState.hasCommits,
              cacheState.hasBranches,
              cacheState.hasRemoteNames,
              cacheState.hasStashes,
              cacheState.hasStatus,
              cacheState.hasWipItems
            );

      const repoStillExists = get().openedRepos.some((repo) => repo.id === id);

      if (!repoStillExists) {
        return;
      }

      applyRepoPayloads(set, id, result);

      if (!shouldRefreshInBackground) {
        notifyRepoLoadErrorsForMode(result, refreshMode);
      }

      markRepoLoadedAt(set, id);
    } catch (error) {
      const repoStillExists = get().openedRepos.some((repo) => repo.id === id);

      if (!repoStillExists) {
        return;
      }

      if (!shouldRefreshInBackground) {
        toast.error(
          resolveErrorMessage(error, "Failed to load repository data")
        );
      }
    } finally {
      if (shouldRefreshInBackground) {
        setRepoBackgroundRefreshState(set, id, false);
      } else {
        clearRepoLoadingFlags(set);
      }
    }
  },
});
