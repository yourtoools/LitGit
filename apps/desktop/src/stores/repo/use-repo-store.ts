import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createRepoActionsSlice } from "@/stores/repo/repo-actions.slice";
import { createRepoLoaderSlice } from "@/stores/repo/repo-loader.slice";
import { createRepoSessionSlice } from "@/stores/repo/repo-session.slice";
import type { RepoStoreState } from "@/stores/repo/repo-store-types";

export const useRepoStore = create<RepoStoreState>()(
  persist(
    (set, get) => ({
      openedRepos: [],
      activeRepoId: null,
      isPickingRepo: false,
      isLoadingHistory: false,
      isLoadingBranches: false,
      isLoadingStatus: false,
      isLoadingWip: false,
      isRefreshingOpenedRepos: false,
      repoCommits: {},
      repoBranches: {},
      repoWorkingTreeStatuses: {},
      repoWorkingTreeItems: {},
      ...createRepoSessionSlice(set, get),
      ...createRepoLoaderSlice(set, get),
      ...createRepoActionsSlice(get),
    }),
    {
      name: "litgit-repo-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        openedRepos: state.openedRepos,
        activeRepoId: state.activeRepoId,
        repoCommits: state.repoCommits,
        repoBranches: state.repoBranches,
        repoWorkingTreeStatuses: state.repoWorkingTreeStatuses,
        repoWorkingTreeItems: state.repoWorkingTreeItems,
      }),
    }
  )
);

export type {
  OpenedRepository,
  OpenRepositoryResult,
  PickedRepository,
  PickedRepositorySelection,
  RepoStoreState,
  RepositoryBranch,
  RepositoryCommit,
  RepositoryFileDiff,
  RepositoryWorkingTreeItem,
  RepositoryWorkingTreeStatus,
} from "@/stores/repo/repo-store-types";
