import { toast } from "sonner";
import { fetchRepoData } from "@/lib/tauri-repo-client";
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
  hasStatus: boolean;
  hasWipItems: boolean;
}

const getRepoCacheState = (
  get: RepoStoreGet,
  id: string,
  forceRefresh: boolean
): RepoCacheState => ({
  hasCommits: !forceRefresh && Boolean(get().repoCommits[id]),
  hasBranches: !forceRefresh && Boolean(get().repoBranches[id]),
  hasStatus: !forceRefresh && Boolean(get().repoWorkingTreeStatuses[id]),
  hasWipItems: !forceRefresh && Boolean(get().repoWorkingTreeItems[id]),
});

const hasAllRepoData = (cacheState: RepoCacheState): boolean =>
  cacheState.hasCommits &&
  cacheState.hasBranches &&
  cacheState.hasStatus &&
  cacheState.hasWipItems;

const setRepoLoadingFlags = (set: RepoStoreSet, cacheState: RepoCacheState) => {
  set({
    isLoadingHistory: !cacheState.hasCommits,
    isLoadingBranches: !cacheState.hasBranches,
    isLoadingStatus: !cacheState.hasStatus,
    isLoadingWip: !cacheState.hasWipItems,
  });
};

const clearRepoLoadingFlags = (set: RepoStoreSet) => {
  set({
    isLoadingHistory: false,
    isLoadingBranches: false,
    isLoadingStatus: false,
    isLoadingWip: false,
  });
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

    set({ activeRepoId: id });

    const cacheState = getRepoCacheState(get, id, forceRefresh);

    if (hasAllRepoData(cacheState)) {
      return;
    }

    setRepoLoadingFlags(set, cacheState);

    try {
      const result = await fetchRepoData(
        id,
        targetRepo.path,
        cacheState.hasCommits,
        cacheState.hasBranches,
        cacheState.hasStatus,
        cacheState.hasWipItems
      );

      applyRepoPayloads(set, id, result);
      notifyRepoLoadErrors(result);
    } finally {
      clearRepoLoadingFlags(set);
    }
  },
});
