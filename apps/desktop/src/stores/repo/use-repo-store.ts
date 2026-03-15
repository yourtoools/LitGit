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
      isLoadingStashes: false,
      isLoadingStatus: false,
      isLoadingWip: false,
      isRefreshingOpenedRepos: false,
      repoCommits: {},
      repoBranches: {},
      repoBackgroundRefreshById: {},
      repoUndoDepthById: {},
      repoRedoDepthById: {},
      repoUndoLabelById: {},
      repoRedoLabelById: {},
      repoCommitDraftPrefillById: {},
      repoHistoryRewriteHintById: {},
      repoFilesById: {},
      repoGitIdentities: {},
      repoLastLoadedAtById: {},
      repoRemoteNames: {},
      repoStashes: {},
      repoWorkingTreeStatuses: {},
      repoWorkingTreeItems: {},
      setRepoGitIdentity: (id, identity) => {
        set((state) => ({
          repoGitIdentities: {
            ...state.repoGitIdentities,
            [id]: identity ?? undefined,
          },
        }));
      },
      ...createRepoSessionSlice(set, get),
      ...createRepoLoaderSlice(set, get),
      ...createRepoActionsSlice(set, get),
    }),
    {
      name: "litgit-repo-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        openedRepos: state.openedRepos,
        activeRepoId: state.activeRepoId,
        repoCommits: state.repoCommits,
        repoFilesById: state.repoFilesById,
        repoBranches: state.repoBranches,
        repoGitIdentities: state.repoGitIdentities,
        repoRemoteNames: state.repoRemoteNames,
        repoStashes: state.repoStashes,
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
  RepositoryStash,
  RepositoryTemplateOption,
  RepositoryWorkingTreeItem,
  RepositoryWorkingTreeStatus,
} from "@/stores/repo/repo-store-types";
