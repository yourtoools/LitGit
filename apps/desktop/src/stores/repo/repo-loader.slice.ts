import { toast } from "sonner";
import {
  fetchLightRepoData,
  fetchRepoData,
  getRepoGitIdentity,
  loadRepoHistoryPage,
} from "@/lib/tauri-repo-client";
import { resolveErrorMessage } from "@/stores/repo/repo-store.helpers";
import type {
  RepoStoreGet,
  RepoStoreSet,
} from "@/stores/repo/repo-store.slice-types";
import type {
  RepoDataFetchResult,
  RepoStoreState,
  RepositoryCommit,
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

function hasCompleteCommitHistory(
  commits: RepositoryCommit[] | undefined
): boolean {
  if (!commits || commits.length === 0) {
    return false;
  }

  const oldestCommit = commits.at(-1);

  return Boolean(oldestCommit && oldestCommit.parentHashes.length === 0);
}

const getRepoCacheState = (
  get: RepoStoreGet,
  id: string,
  forceRefresh: boolean
): RepoCacheState => ({
  hasCommits: !forceRefresh && hasCompleteCommitHistory(get().repoCommits[id]),
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
  set((state) =>
    state.repoBackgroundRefreshById[id] === isRefreshing
      ? state
      : {
          repoBackgroundRefreshById: {
            ...state.repoBackgroundRefreshById,
            [id]: isRefreshing,
          },
        }
  );
};

const refreshRepoGitIdentity = async (
  get: RepoStoreGet,
  set: RepoStoreSet,
  id: string,
  repoPath: string
) => {
  try {
    const identity = await getRepoGitIdentity(repoPath);

    if (!get().openedRepos.some((repo) => repo.id === id)) {
      return;
    }

    set((state) => ({
      repoGitIdentities: {
        ...state.repoGitIdentities,
        [id]: identity,
      },
    }));
  } catch {
    if (!get().openedRepos.some((repo) => repo.id === id)) {
      return;
    }

    set((state) => ({
      repoGitIdentities: {
        ...state.repoGitIdentities,
        [id]: undefined,
      },
    }));
  }
};

const applyRepoPayloads = (
  set: RepoStoreSet,
  id: string,
  result: RepoDataFetchResult
) => {
  set((state) => ({
    repoBranches: result.branchesPayload
      ? {
          ...state.repoBranches,
          [id]: result.branchesPayload.branches,
        }
      : state.repoBranches,
    repoCommits: result.historyPayload
      ? {
          ...state.repoCommits,
          [id]: result.historyPayload.commits,
        }
      : state.repoCommits,
    repoHistoryHasMoreById: result.historyPayload
      ? {
          ...state.repoHistoryHasMoreById,
          [id]: result.historyPayload.hasMore,
        }
      : state.repoHistoryHasMoreById,
    repoHistoryNextCursorById: result.historyPayload
      ? {
          ...state.repoHistoryNextCursorById,
          [id]: result.historyPayload.nextCursor,
        }
      : state.repoHistoryNextCursorById,
    repoLastLoadedAtById: {
      ...state.repoLastLoadedAtById,
      [id]: Date.now(),
    },
    repoRemoteNames: result.remoteNamesPayload
      ? {
          ...state.repoRemoteNames,
          [id]: result.remoteNamesPayload.remoteNames,
        }
      : state.repoRemoteNames,
    repoStashes: result.stashesPayload
      ? {
          ...state.repoStashes,
          [id]: result.stashesPayload.stashes,
        }
      : state.repoStashes,
    repoWorkingTreeItems: result.wipItemsPayload
      ? {
          ...state.repoWorkingTreeItems,
          [id]: result.wipItemsPayload.items,
        }
      : state.repoWorkingTreeItems,
    repoWorkingTreeStatuses: result.statusPayload
      ? {
          ...state.repoWorkingTreeStatuses,
          [id]: result.statusPayload.status,
        }
      : state.repoWorkingTreeStatuses,
  }));
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
): Pick<RepoStoreState, RepoLoaderSliceKeys | "loadMoreRepoHistory"> => ({
  loadMoreRepoHistory: async (id) => {
    const state = get();
    const targetRepo = state.openedRepos.find((repo) => repo.id === id);
    const cursor = state.repoHistoryNextCursorById[id];

    if (
      !targetRepo ||
      state.repoHistoryNextPageLoadingById[id] === true ||
      state.repoHistoryHasMoreById[id] !== true ||
      !cursor
    ) {
      return;
    }

    set((currentState) => ({
      repoHistoryNextPageLoadingById: {
        ...currentState.repoHistoryNextPageLoadingById,
        [id]: true,
      },
    }));

    try {
      const historyPayload = await loadRepoHistoryPage(id, {
        cursor,
        repoPath: targetRepo.path,
      });

      if (!historyPayload) {
        return;
      }

      set((currentState) => {
        const currentCommits = currentState.repoCommits[id] ?? [];
        const seenHashes = new Set(currentCommits.map((commit) => commit.hash));
        const appendedCommits = historyPayload.commits.filter(
          (commit) => !seenHashes.has(commit.hash)
        );

        return {
          repoCommits: {
            ...currentState.repoCommits,
            [id]: [...currentCommits, ...appendedCommits],
          },
          repoHistoryHasMoreById: {
            ...currentState.repoHistoryHasMoreById,
            [id]: historyPayload.hasMore,
          },
          repoHistoryNextCursorById: {
            ...currentState.repoHistoryNextCursorById,
            [id]: historyPayload.nextCursor,
          },
        };
      });
    } catch (error) {
      toast.error(
        resolveErrorMessage(error, "Failed to load more repository history")
      );
    } finally {
      set((currentState) => ({
        repoHistoryNextPageLoadingById: {
          ...currentState.repoHistoryNextPageLoadingById,
          [id]: false,
        },
      }));
    }
  },
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

    refreshRepoGitIdentity(get, set, id, targetRepo.path).catch(
      () => undefined
    );

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
