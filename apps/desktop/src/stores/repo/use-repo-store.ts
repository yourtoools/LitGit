import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createRepoActionsSlice } from "@/stores/repo/repo-actions.slice";
import { createRepoLoaderSlice } from "@/stores/repo/repo-loader.slice";
import { createRepoSessionSlice } from "@/stores/repo/repo-session.slice";
import type { RepoStoreState } from "@/stores/repo/repo-store-types";

const REPO_STORE_PERSIST_VERSION = 2;

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
      repoHistoryHasMoreById: {},
      repoHistoryNextCursorById: {},
      repoHistoryNextPageLoadingById: {},
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
      version: REPO_STORE_PERSIST_VERSION,
      migrate: (persistedState) => {
        if (!(persistedState && typeof persistedState === "object")) {
          return persistedState;
        }

        const nextState = persistedState as Record<string, unknown>;
        nextState.repoCommits = {};
        nextState.repoHistoryGraphsById = undefined;

        return nextState;
      },
      partialize: (state) => ({
        openedRepos: state.openedRepos,
        activeRepoId: state.activeRepoId,
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
