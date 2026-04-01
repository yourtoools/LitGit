import { useMemo } from "react";
import { useRepoStore } from "@/stores/repo/use-repo-store";

export const useRepoActions = () => {
  const addIgnoreRule = useRepoStore((state) => state.addIgnoreRule);
  const applyStash = useRepoStore((state) => state.applyStash);
  const checkoutCommit = useRepoStore((state) => state.checkoutCommit);
  const cherryPickCommit = useRepoStore((state) => state.cherryPickCommit);
  const clearRepoCommitDraftPrefill = useRepoStore(
    (state) => state.clearRepoCommitDraftPrefill
  );
  const commitChanges = useRepoStore((state) => state.commitChanges);
  const createBranch = useRepoStore((state) => state.createBranch);
  const createBranchAtReference = useRepoStore(
    (state) => state.createBranchAtReference
  );
  const createStash = useRepoStore((state) => state.createStash);
  const createTag = useRepoStore((state) => state.createTag);
  const deleteBranch = useRepoStore((state) => state.deleteBranch);
  const deleteRemoteBranch = useRepoStore((state) => state.deleteRemoteBranch);
  const discardAllChanges = useRepoStore((state) => state.discardAllChanges);
  const discardPathChanges = useRepoStore((state) => state.discardPathChanges);
  const dropCommit = useRepoStore((state) => state.dropCommit);
  const dropStash = useRepoStore((state) => state.dropStash);
  const generateAiCommitMessage = useRepoStore(
    (state) => state.generateAiCommitMessage
  );
  const getCommitFileContent = useRepoStore(
    (state) => state.getCommitFileContent
  );
  const getCommitFileHunks = useRepoStore((state) => state.getCommitFileHunks);
  const getCommitFilePreflight = useRepoStore(
    (state) => state.getCommitFilePreflight
  );
  const getCommitFiles = useRepoStore((state) => state.getCommitFiles);
  const getFileBlame = useRepoStore((state) => state.getFileBlame);
  const getFileContent = useRepoStore((state) => state.getFileContent);
  const getFileDetectedEncoding = useRepoStore(
    (state) => state.getFileDetectedEncoding
  );
  const getFileHistory = useRepoStore((state) => state.getFileHistory);
  const getFileHunks = useRepoStore((state) => state.getFileHunks);
  const getFilePreflight = useRepoStore((state) => state.getFilePreflight);
  const getFileText = useRepoStore((state) => state.getFileText);
  const getLatestCommitMessage = useRepoStore(
    (state) => state.getLatestCommitMessage
  );
  const getRepositoryFiles = useRepoStore((state) => state.getRepositoryFiles);
  const mergeReference = useRepoStore((state) => state.mergeReference);
  const popStash = useRepoStore((state) => state.popStash);
  const pullBranch = useRepoStore((state) => state.pullBranch);
  const pushBranch = useRepoStore((state) => state.pushBranch);
  const redoRepoAction = useRepoStore((state) => state.redoRepoAction);
  const renameBranch = useRepoStore((state) => state.renameBranch);
  const resetToReference = useRepoStore((state) => state.resetToReference);
  const revertCommit = useRepoStore((state) => state.revertCommit);
  const rewordCommitMessage = useRepoStore(
    (state) => state.rewordCommitMessage
  );
  const saveFileText = useRepoStore((state) => state.saveFileText);
  const setBranchUpstream = useRepoStore((state) => state.setBranchUpstream);
  const stageAll = useRepoStore((state) => state.stageAll);
  const stageFile = useRepoStore((state) => state.stageFile);
  const switchBranch = useRepoStore((state) => state.switchBranch);
  const undoRepoAction = useRepoStore((state) => state.undoRepoAction);
  const unstageAll = useRepoStore((state) => state.unstageAll);
  const unstageFile = useRepoStore((state) => state.unstageFile);

  return useMemo(
    () => ({
      addIgnoreRule,
      applyStash,
      checkoutCommit,
      cherryPickCommit,
      clearRepoCommitDraftPrefill,
      commitChanges,
      createBranch,
      createBranchAtReference,
      createStash,
      createTag,
      deleteBranch,
      deleteRemoteBranch,
      discardAllChanges,
      discardPathChanges,
      dropCommit,
      dropStash,
      generateAiCommitMessage,
      getCommitFileContent,
      getCommitFileHunks,
      getCommitFilePreflight,
      getCommitFiles,
      getFileBlame,
      getFileContent,
      getFileDetectedEncoding,
      getFileHistory,
      getFileHunks,
      getFilePreflight,
      getFileText,
      getLatestCommitMessage,
      getRepositoryFiles,
      mergeReference,
      popStash,
      pullBranch,
      pushBranch,
      redoRepoAction,
      renameBranch,
      resetToReference,
      revertCommit,
      rewordCommitMessage,
      saveFileText,
      setBranchUpstream,
      stageAll,
      stageFile,
      switchBranch,
      undoRepoAction,
      unstageAll,
      unstageFile,
    }),
    [
      addIgnoreRule,
      applyStash,
      checkoutCommit,
      cherryPickCommit,
      clearRepoCommitDraftPrefill,
      commitChanges,
      createBranch,
      createBranchAtReference,
      createStash,
      createTag,
      deleteBranch,
      deleteRemoteBranch,
      discardAllChanges,
      discardPathChanges,
      dropCommit,
      dropStash,
      generateAiCommitMessage,
      getCommitFileContent,
      getCommitFileHunks,
      getCommitFilePreflight,
      getCommitFiles,
      getFileBlame,
      getFileContent,
      getFileDetectedEncoding,
      getFileHistory,
      getFileHunks,
      getFilePreflight,
      getFileText,
      getLatestCommitMessage,
      getRepositoryFiles,
      mergeReference,
      popStash,
      pullBranch,
      pushBranch,
      redoRepoAction,
      renameBranch,
      resetToReference,
      revertCommit,
      rewordCommitMessage,
      saveFileText,
      setBranchUpstream,
      stageAll,
      stageFile,
      switchBranch,
      undoRepoAction,
      unstageAll,
      unstageFile,
    ]
  );
};

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

export const useRepoDataMaps = () => {
  const repoBranches = useRepoStore((state) => state.repoBranches);
  const repoCommitDraftPrefillById = useRepoStore(
    (state) => state.repoCommitDraftPrefillById
  );
  const repoCommits = useRepoStore((state) => state.repoCommits);
  const repoFilesById = useRepoStore((state) => state.repoFilesById);
  const repoGitIdentities = useRepoStore((state) => state.repoGitIdentities);
  const repoHistoryRewriteHintById = useRepoStore(
    (state) => state.repoHistoryRewriteHintById
  );
  const repoRedoDepthById = useRepoStore((state) => state.repoRedoDepthById);
  const repoRedoLabelById = useRepoStore((state) => state.repoRedoLabelById);
  const repoRemoteNames = useRepoStore((state) => state.repoRemoteNames);
  const repoStashes = useRepoStore((state) => state.repoStashes);
  const repoUndoDepthById = useRepoStore((state) => state.repoUndoDepthById);
  const repoUndoLabelById = useRepoStore((state) => state.repoUndoLabelById);
  const repoWorkingTreeItems = useRepoStore(
    (state) => state.repoWorkingTreeItems
  );

  return useMemo(
    () => ({
      repoBranches,
      repoCommitDraftPrefillById,
      repoCommits,
      repoFilesById,
      repoGitIdentities,
      repoHistoryRewriteHintById,
      repoRedoDepthById,
      repoRedoLabelById,
      repoRemoteNames,
      repoStashes,
      repoUndoDepthById,
      repoUndoLabelById,
      repoWorkingTreeItems,
    }),
    [
      repoBranches,
      repoCommitDraftPrefillById,
      repoCommits,
      repoFilesById,
      repoGitIdentities,
      repoHistoryRewriteHintById,
      repoRedoDepthById,
      repoRedoLabelById,
      repoRemoteNames,
      repoStashes,
      repoUndoDepthById,
      repoUndoLabelById,
      repoWorkingTreeItems,
    ]
  );
};

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
