export interface PickedRepository {
  name: string;
  path: string;
}

export interface PickedRepositorySelection extends PickedRepository {
  hasInitialCommit: boolean;
  isGitRepository: boolean;
}

export interface RepositoryTemplateOption {
  description?: string;
  key: string;
  label: string;
}

export interface CreateLocalRepositoryInput {
  defaultBranch: string;
  destinationParent: string;
  gitignoreTemplateContent: string | null;
  gitignoreTemplateKey: string | null;
  licenseTemplateContent: string | null;
  licenseTemplateKey: string | null;
  name: string;
}

export interface RepoCommandPreferences {
  enableProxy?: boolean;
  gpgProgramPath?: string;
  proxyAuthEnabled?: boolean;
  proxyAuthPassword?: string;
  proxyHost?: string;
  proxyPort?: number;
  proxyType?: "http" | "https" | "socks5";
  proxyUsername?: string;
  signCommitsByDefault?: boolean;
  signingFormat?: "gpg" | "ssh";
  signingKey?: string;
  sshPrivateKeyPath?: string;
  sshPublicKeyPath?: string;
  sslVerification?: boolean;
  useGitCredentialManager?: boolean;
  useLocalSshAgent?: boolean;
}

export interface PublishRepositoryOptions {
  repoName: string;
  visibility: "private" | "public";
}

export interface RepositoryCommit {
  author: string;
  authorAvatarUrl: string | null;
  authorEmail: string | null;
  authorUsername: string | null;
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

export interface RepositoryCommitFile {
  additions: number;
  deletions: number;
  path: string;
  previousPath: string | null;
  status: string;
}

export interface RepositoryCommitFileDiff {
  commitHash: string;
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

export type PullActionMode =
  | "fetch-all"
  | "pull-ff-possible"
  | "pull-ff-only"
  | "pull-rebase";

export interface PullActionResult {
  headChanged: boolean;
}

export interface LatestRepositoryCommitMessage {
  description: string;
  summary: string;
}

export interface RepoStoreState {
  activeRepoId: string | null;
  addIgnoreRule: (id: string, pattern: string) => Promise<void>;
  applyStash: (id: string, stashRef: string) => Promise<void>;
  canRedoRepoAction: (id: string) => boolean;
  canUndoRepoAction: (id: string) => boolean;
  clearActiveRepo: () => void;
  clearRepoCommitDraftPrefill: (id: string) => void;
  cloneRepository: (
    repositoryUrl: string,
    destinationParent: string,
    folderName: string,
    recurseSubmodules: boolean,
    preferences?: RepoCommandPreferences
  ) => Promise<OpenedRepository | null>;
  closeRepository: (id: string) => void;
  commitChanges: (
    id: string,
    summary: string,
    description: string,
    includeAll: boolean,
    amend: boolean,
    skipHooks: boolean,
    preferences?: RepoCommandPreferences
  ) => Promise<void>;
  createBranch: (id: string, branchName: string) => Promise<void>;
  createLocalRepository: (
    input: CreateLocalRepositoryInput
  ) => Promise<OpenedRepository | null>;
  createStash: (
    id: string,
    summary: string,
    description: string
  ) => Promise<void>;
  discardAllChanges: (id: string) => Promise<void>;
  discardPathChanges: (id: string, filePath: string) => Promise<void>;
  dropStash: (id: string, stashRef: string) => Promise<void>;
  getCommitFileDiff: (
    id: string,
    commitHash: string,
    filePath: string
  ) => Promise<RepositoryCommitFileDiff | null>;
  getCommitFiles: (
    id: string,
    commitHash: string
  ) => Promise<RepositoryCommitFile[]>;
  getFileDiff: (
    id: string,
    filePath: string
  ) => Promise<RepositoryFileDiff | null>;
  getLatestCommitMessage: (
    id: string
  ) => Promise<LatestRepositoryCommitMessage | null>;
  getRedoRepoActionLabel: (id: string) => string | null;
  getUndoRepoActionLabel: (id: string) => string | null;
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
  pullBranch: (id: string, mode: PullActionMode) => Promise<PullActionResult>;
  pushBranch: (
    id: string,
    forceWithLease?: boolean,
    publishOptions?: PublishRepositoryOptions
  ) => Promise<void>;
  redoRepoAction: (id: string) => Promise<void>;
  refreshOpenedRepositories: () => Promise<void>;
  repoBranches: Record<string, RepositoryBranch[]>;
  repoCommitDraftPrefillById: Record<
    string,
    LatestRepositoryCommitMessage | null
  >;
  repoCommits: Record<string, RepositoryCommit[]>;
  repoHistoryRewriteHintById: Record<string, boolean>;
  repoRedoDepthById: Record<string, number>;
  repoRedoLabelById: Record<string, string | null>;
  repoRemoteNames: Record<string, string[]>;
  repoStashes: Record<string, RepositoryStash[]>;
  repoUndoDepthById: Record<string, number>;
  repoUndoLabelById: Record<string, string | null>;
  repoWorkingTreeItems: Record<string, RepositoryWorkingTreeItem[]>;
  repoWorkingTreeStatuses: Record<string, RepositoryWorkingTreeStatus>;
  setActiveRepo: (
    id: string,
    options?: { forceRefresh?: boolean }
  ) => Promise<void>;
  stageAll: (id: string) => Promise<void>;
  stageFile: (id: string, filePath: string) => Promise<void>;
  switchBranch: (id: string, branchName: string) => Promise<void>;
  undoRepoAction: (id: string) => Promise<void>;
  unstageAll: (id: string) => Promise<void>;
  unstageFile: (id: string, filePath: string) => Promise<void>;
}

export interface RepoDataFetchResult {
  branchesError: unknown;
  branchesPayload: { branches: RepositoryBranch[]; id: string } | null;
  historyError: unknown;
  historyPayload: { commits: RepositoryCommit[]; id: string } | null;
  remoteNamesError: unknown;
  remoteNamesPayload: { id: string; remoteNames: string[] } | null;
  stashesError: unknown;
  stashesPayload: { id: string; stashes: RepositoryStash[] } | null;
  statusError: unknown;
  statusPayload: { id: string; status: RepositoryWorkingTreeStatus } | null;
  wipItemsError: unknown;
  wipItemsPayload: { id: string; items: RepositoryWorkingTreeItem[] } | null;
}
