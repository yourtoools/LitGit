export interface PickedRepository {
  name: string;
  path: string;
}

export interface PickedRepositorySelection extends PickedRepository {
  hasInitialCommit: boolean;
  isGitRepository: boolean;
}

export interface RepositoryCommit {
  author: string;
  date: string;
  hash: string;
  message: string;
  parentHashes: string[];
  refs: string[];
  shortHash: string;
}

export interface RepositoryBranch {
  aheadCount: number;
  behindCount: number;
  commitCount: number;
  isCurrent: boolean;
  isRemote: boolean;
  lastCommitDate: string;
  name: string;
  refType: "branch" | "tag";
  shortHash: string;
}

export interface RepositoryStash {
  message: string;
  ref: string;
  shortHash: string;
}

export interface OpenedRepository extends PickedRepository {
  id: string;
}

export interface RepositoryWorkingTreeStatus {
  hasChanges: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
}

export interface RepositoryWorkingTreeItem {
  isUntracked: boolean;
  path: string;
  stagedStatus: string;
  unstagedStatus: string;
}

export interface RepositoryFileDiff {
  newText: string;
  oldText: string;
  path: string;
}

export type OpenRepositoryResult =
  | {
      repository: OpenedRepository;
      status: "opened";
    }
  | {
      repository: PickedRepositorySelection;
      status: "requires-initial-commit";
    }
  | null;

export interface RepoStoreState {
  activeRepoId: string | null;
  applyStash: (id: string, stashRef: string) => Promise<void>;
  clearActiveRepo: () => void;
  cloneRepository: (
    repositoryUrl: string,
    destinationParent: string,
    folderName: string,
    recurseSubmodules: boolean
  ) => Promise<OpenedRepository | null>;
  closeRepository: (id: string) => void;
  commitChanges: (
    id: string,
    summary: string,
    description: string,
    includeAll: boolean
  ) => Promise<void>;
  dropStash: (id: string, stashRef: string) => Promise<void>;
  getFileDiff: (
    id: string,
    filePath: string
  ) => Promise<RepositoryFileDiff | null>;
  initializeRepository: (
    repository: PickedRepositorySelection
  ) => Promise<OpenedRepository | null>;
  isLoadingBranches: boolean;
  isLoadingHistory: boolean;
  isLoadingStashes: boolean;
  isLoadingStatus: boolean;
  isLoadingWip: boolean;
  isPickingRepo: boolean;
  isRefreshingOpenedRepos: boolean;
  openedRepos: OpenedRepository[];
  openRepository: () => Promise<OpenRepositoryResult>;
  popStash: (id: string, stashRef: string) => Promise<void>;
  refreshOpenedRepositories: () => Promise<void>;
  repoBranches: Record<string, RepositoryBranch[]>;
  repoCommits: Record<string, RepositoryCommit[]>;
  repoStashes: Record<string, RepositoryStash[]>;
  repoWorkingTreeItems: Record<string, RepositoryWorkingTreeItem[]>;
  repoWorkingTreeStatuses: Record<string, RepositoryWorkingTreeStatus>;
  setActiveRepo: (
    id: string,
    options?: { forceRefresh?: boolean }
  ) => Promise<void>;
  stageAll: (id: string) => Promise<void>;
  stageFile: (id: string, filePath: string) => Promise<void>;
  switchBranch: (id: string, branchName: string) => Promise<void>;
  unstageAll: (id: string) => Promise<void>;
  unstageFile: (id: string, filePath: string) => Promise<void>;
}

export interface RepoDataFetchResult {
  branchesError: unknown;
  branchesPayload: { branches: RepositoryBranch[]; id: string } | null;
  historyError: unknown;
  historyPayload: { commits: RepositoryCommit[]; id: string } | null;
  stashesError: unknown;
  stashesPayload: { id: string; stashes: RepositoryStash[] } | null;
  statusError: unknown;
  statusPayload: { id: string; status: RepositoryWorkingTreeStatus } | null;
  wipItemsError: unknown;
  wipItemsPayload: { id: string; items: RepositoryWorkingTreeItem[] } | null;
}
