import { useMemo } from "react";
import type {
  GitIdentityStatus,
  LatestRepositoryCommitMessage,
  RepositoryBranch,
  RepositoryCommit,
  RepositoryFileEntry,
  RepositoryStash,
  RepositoryWorkingTreeItem,
} from "@/stores/repo/repo-store-types";
import { useRepoStore } from "@/stores/repo/use-repo-store";

const EMPTY_BRANCHES: RepositoryBranch[] = [];
const EMPTY_COMMITS: RepositoryCommit[] = [];
const EMPTY_FILES: RepositoryFileEntry[] = [];
const EMPTY_REMOTE_NAMES: string[] = [];
const EMPTY_STASHES: RepositoryStash[] = [];
const EMPTY_WORKING_TREE_ITEMS: RepositoryWorkingTreeItem[] = [];

export const useRepoActions = () =>
  useMemo(() => {
    const state = useRepoStore.getState();
    return {
      addIgnoreRule: state.addIgnoreRule,
      applyStash: state.applyStash,
      checkoutCommit: state.checkoutCommit,
      cherryPickCommit: state.cherryPickCommit,
      clearRepoCommitDraftPrefill: state.clearRepoCommitDraftPrefill,
      commitChanges: state.commitChanges,
      createBranch: state.createBranch,
      createBranchAtReference: state.createBranchAtReference,
      createStash: state.createStash,
      createTag: state.createTag,
      deleteBranch: state.deleteBranch,
      deleteRemoteBranch: state.deleteRemoteBranch,
      discardAllChanges: state.discardAllChanges,
      discardPathChanges: state.discardPathChanges,
      dropCommit: state.dropCommit,
      dropStash: state.dropStash,
      generateAiCommitMessage: state.generateAiCommitMessage,
      getCommitFileContent: state.getCommitFileContent,
      getCommitFileHunks: state.getCommitFileHunks,
      getCommitFilePreflight: state.getCommitFilePreflight,
      getCommitFiles: state.getCommitFiles,
      getFileBlame: state.getFileBlame,
      getFileContent: state.getFileContent,
      getFileDetectedEncoding: state.getFileDetectedEncoding,
      getFileHistory: state.getFileHistory,
      getFileHunks: state.getFileHunks,
      getFilePreflight: state.getFilePreflight,
      getFileText: state.getFileText,
      getLatestCommitMessage: state.getLatestCommitMessage,
      getRepositoryFiles: state.getRepositoryFiles,
      loadMoreRepoHistory: state.loadMoreRepoHistory,
      mergeReference: state.mergeReference,
      popStash: state.popStash,
      pullBranch: state.pullBranch,
      pushBranch: state.pushBranch,
      redoRepoAction: state.redoRepoAction,
      renameBranch: state.renameBranch,
      resetToReference: state.resetToReference,
      revertCommit: state.revertCommit,
      rewordCommitMessage: state.rewordCommitMessage,
      saveFileText: state.saveFileText,
      setActiveRepo: state.setActiveRepo,
      setBranchUpstream: state.setBranchUpstream,
      stageAll: state.stageAll,
      stageFile: state.stageFile,
      switchBranch: state.switchBranch,
      undoRepoAction: state.undoRepoAction,
      unstageAll: state.unstageAll,
      unstageFile: state.unstageFile,
    };
  }, []);

export const useRepoActiveContext = () => {
  const activeRepoId = useRepoStore((state) => state.activeRepoId);
  const openedRepos = useRepoStore((state) => state.openedRepos);
  const activeRepo = useMemo(
    () => openedRepos.find((repo) => repo.id === activeRepoId) ?? null,
    [activeRepoId, openedRepos]
  );

  return useMemo(
    () => ({
      activeRepo,
      activeRepoId,
      openedRepos,
    }),
    [activeRepo, activeRepoId, openedRepos]
  );
};

export const useRepoBranches = (repoId: null | string): RepositoryBranch[] =>
  useRepoStore((state) =>
    repoId ? (state.repoBranches[repoId] ?? EMPTY_BRANCHES) : EMPTY_BRANCHES
  );

export const useRepoCommits = (repoId: null | string): RepositoryCommit[] =>
  useRepoStore((state) =>
    repoId ? (state.repoCommits[repoId] ?? EMPTY_COMMITS) : EMPTY_COMMITS
  );

export const useRepoFiles = (repoId: null | string): RepositoryFileEntry[] =>
  useRepoStore((state) =>
    repoId ? (state.repoFilesById[repoId] ?? EMPTY_FILES) : EMPTY_FILES
  );

export const useRepoGitIdentity = (
  repoId: null | string
): GitIdentityStatus | null =>
  useRepoStore((state) =>
    repoId ? (state.repoGitIdentities[repoId] ?? null) : null
  );

export const useRepoHistoryRewriteHint = (repoId: null | string): boolean =>
  useRepoStore((state) =>
    repoId ? (state.repoHistoryRewriteHintById[repoId] ?? false) : false
  );

export const useRepoHistoryPagination = (repoId: null | string) => {
  const hasMore = useRepoStore((state) =>
    repoId ? (state.repoHistoryHasMoreById[repoId] ?? false) : false
  );
  const isLoadingMore = useRepoStore((state) =>
    repoId ? (state.repoHistoryNextPageLoadingById[repoId] ?? false) : false
  );

  return useMemo(
    () => ({
      hasMore,
      isLoadingMore,
    }),
    [hasMore, isLoadingMore]
  );
};

export const useRepoRemoteNames = (repoId: null | string): string[] =>
  useRepoStore((state) =>
    repoId
      ? (state.repoRemoteNames[repoId] ?? EMPTY_REMOTE_NAMES)
      : EMPTY_REMOTE_NAMES
  );

export const useRepoStashes = (repoId: null | string): RepositoryStash[] =>
  useRepoStore((state) =>
    repoId ? (state.repoStashes[repoId] ?? EMPTY_STASHES) : EMPTY_STASHES
  );

export const useRepoWorkingTreeItems = (
  repoId: null | string
): RepositoryWorkingTreeItem[] =>
  useRepoStore((state) =>
    repoId
      ? (state.repoWorkingTreeItems[repoId] ?? EMPTY_WORKING_TREE_ITEMS)
      : EMPTY_WORKING_TREE_ITEMS
  );

export const useRepoUndoDepth = (repoId: null | string): number =>
  useRepoStore((state) =>
    repoId ? (state.repoUndoDepthById[repoId] ?? 0) : 0
  );

export const useRepoRedoDepth = (repoId: null | string): number =>
  useRepoStore((state) =>
    repoId ? (state.repoRedoDepthById[repoId] ?? 0) : 0
  );

export const useRepoUndoLabel = (repoId: null | string): null | string =>
  useRepoStore((state) =>
    repoId ? (state.repoUndoLabelById[repoId] ?? null) : null
  );

export const useRepoRedoLabel = (repoId: null | string): null | string =>
  useRepoStore((state) =>
    repoId ? (state.repoRedoLabelById[repoId] ?? null) : null
  );

export const useRepoCommitDraftPrefill = (
  repoId: null | string
): LatestRepositoryCommitMessage | null =>
  useRepoStore((state) =>
    repoId ? (state.repoCommitDraftPrefillById[repoId] ?? null) : null
  );

export const useRepoLoadingState = () => {
  const isLoadingBranches = useRepoStore((state) => state.isLoadingBranches);
  const isLoadingHistory = useRepoStore((state) => state.isLoadingHistory);
  const isLoadingStatus = useRepoStore((state) => state.isLoadingStatus);
  const isLoadingWip = useRepoStore((state) => state.isLoadingWip);

  return useMemo(
    () => ({
      isLoadingBranches,
      isLoadingHistory,
      isLoadingStatus,
      isLoadingWip,
    }),
    [isLoadingBranches, isLoadingHistory, isLoadingStatus, isLoadingWip]
  );
};

export const useRepoRefreshStatus = (repoId: string | null) => {
  const isBackgroundRefreshing = useRepoStore((state) =>
    repoId ? (state.repoBackgroundRefreshById[repoId] ?? false) : false
  );
  const lastLoadedAt = useRepoStore((state) =>
    repoId ? (state.repoLastLoadedAtById[repoId] ?? null) : null
  );

  return useMemo(
    () => ({
      isBackgroundRefreshing,
      lastLoadedAt,
    }),
    [isBackgroundRefreshing, lastLoadedAt]
  );
};
