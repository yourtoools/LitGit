import type { Provider } from "@/lib/tauri-integrations-client";

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
  gitIdentity?: GitIdentityWriteInput | null;
  gitignoreTemplateContent: string | null;
  gitignoreTemplateKey: string | null;
  licenseTemplateContent: string | null;
  licenseTemplateKey: string | null;
  name: string;
}

export interface GitIdentityValue {
  email: string | null;
  isComplete: boolean;
  name: string | null;
}

export interface GitIdentityStatus {
  effective: GitIdentityValue;
  effectiveScope: GitIdentityScope | null;
  global: GitIdentityValue;
  local: GitIdentityValue | null;
  repoPath: string | null;
}

export type GitIdentityScope = "global" | "local";

export interface GitIdentityWriteInput {
  email: string;
  name: string;
  scope: GitIdentityScope;
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
  provider: Provider;
  repoName: string;
  targetId: string;
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
  messageDescription: string;
  messageSummary: string;
  parentHashes: string[];
  refs: string[];
  shortHash: string;
  syncState?: RepositoryCommitSyncState;
}

export type RepositoryCommitSyncState = "normal" | "pullable";

export interface RepositoryCommitGraphNode {
  color: string;
  lane: number;
  parentLanes: number[];
}

export interface RepositoryCommitGraphPayload {
  commitLanes: Record<string, RepositoryCommitGraphNode>;
  graphWidth: number;
}

export interface RepositoryBranch {
  aheadCount?: number;
  behindCount?: number;
  commitCount?: number;
  isCurrent: boolean;
  isRemote: boolean;
  lastCommitDate: string;
  name: string;
  refType: "branch" | "tag";
  shortHash: string;
}

export interface RepositoryStash {
  anchorCommitHash: string;
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

export interface RepositoryFileEntry {
  path: string;
}

export interface RepositoryFileDiff {
  newImageDataUrl: string | null;
  newText: string;
  oldImageDataUrl: string | null;
  oldText: string;
  path: string;
  unsupportedExtension: string | null;
  viewerKind: "image" | "text" | "unsupported";
}

export type RepositoryDiffPreviewMode = "diff" | "file";

export type RepositoryDiffPreviewGate =
  | "binary_unsupported"
  | "diff_changed_line_limit"
  | "diff_line_count_unavailable"
  | "file_line_limit"
  | "non_text_size_limit"
  | "none";

export interface RepositoryDiffPreviewGateDetails {
  current: number | null;
  limit: number | null;
}

export interface RepositoryFilePreflight {
  fileSizeBytes: number | null;
  gate: RepositoryDiffPreviewGate;
  gateDetails: RepositoryDiffPreviewGateDetails | null;
  isBinary: boolean;
  lineCountChanged: number | null;
  lineCountFile: number | null;
  mode: RepositoryDiffPreviewMode;
  newSideBytes: number | null;
  oldSideBytes: number | null;
  path: string;
  unsupportedExtension: string | null;
  viewerKind: "image" | "text" | "unsupported";
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
  newImageDataUrl: string | null;
  newText: string;
  oldImageDataUrl: string | null;
  oldText: string;
  path: string;
  unsupportedExtension: string | null;
  viewerKind: "image" | "text" | "unsupported";
}

export interface RepositoryCommitFilePreflight extends RepositoryFilePreflight {
  commitHash: string;
}

export interface RepositoryFileHunk {
  header: string;
  index: number;
  lines: string[];
  newLines: number;
  newStart: number;
  oldLines: number;
  oldStart: number;
}

export interface RepositoryFileHunks {
  hunks: RepositoryFileHunk[];
  path: string;
}

export interface RepositoryCommitFileHunks extends RepositoryFileHunks {
  commitHash: string;
}

export interface RepositoryFileHistoryEntry {
  author: string;
  authorAvatarUrl: string | null;
  authorEmail: string;
  authorUsername: string | null;
  commitHash: string;
  date: string;
  messageSummary: string;
  shortHash: string;
}

export interface RepositoryFileHistoryPayload {
  entries: RepositoryFileHistoryEntry[];
  path: string;
}

export interface RepositoryFileDetectedEncoding {
  encoding: string;
}

export interface RepositoryFileBlameLine {
  author: string;
  authorAvatarUrl: string | null;
  authorEmail: string;
  authorTime: number | null;
  authorUsername: string | null;
  commitHash: string;
  lineNumber: number;
  summary: string;
  text: string;
}

export interface RepositoryFileBlamePayload {
  lines: RepositoryFileBlameLine[];
  path: string;
  revision: string;
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

export type MergeActionMode = "ff-only" | "merge" | "rebase";

export interface MergeActionResult {
  headChanged: boolean;
}

export interface LatestRepositoryCommitMessage {
  description: string;
  summary: string;
}

export interface GeneratedRepositoryCommitMessage {
  body: string;
  promptMode: string;
  providerKind: string;
  schemaFallbackUsed: boolean;
  title: string;
}

export interface RewordRepositoryCommitResult {
  headHash: string;
  updatedCommitHash: string;
}

export interface DropRepositoryCommitResult {
  headHash: string;
  selectedCommitHash: string | null;
}

export interface RepoStoreState {
  activeRepoId: string | null;
  addIgnoreRule: (id: string, pattern: string) => Promise<void>;
  applyStash: (id: string, stashRef: string) => Promise<void>;
  canRedoRepoAction: (id: string) => boolean;
  canUndoRepoAction: (id: string) => boolean;
  checkoutCommit: (id: string, target: string) => Promise<void>;
  cherryPickCommit: (id: string, target: string) => Promise<void>;
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
  createBranchAtReference: (
    id: string,
    branchName: string,
    target: string
  ) => Promise<void>;
  createLocalRepository: (
    input: CreateLocalRepositoryInput
  ) => Promise<OpenedRepository | null>;
  createStash: (
    id: string,
    summary: string,
    description: string
  ) => Promise<void>;
  createTag: (
    id: string,
    tagName: string,
    target: string,
    annotated?: boolean,
    annotationMessage?: string
  ) => Promise<void>;
  deleteBranch: (id: string, branchName: string) => Promise<void>;
  deleteRemoteBranch: (
    id: string,
    remoteName: string,
    branchName: string
  ) => Promise<void>;
  discardAllChanges: (id: string) => Promise<void>;
  discardPathChanges: (id: string, filePath: string) => Promise<void>;
  dropCommit: (
    id: string,
    target: string
  ) => Promise<DropRepositoryCommitResult>;
  dropStash: (id: string, stashRef: string) => Promise<void>;
  generateAiCommitMessage: (
    id: string,
    instruction: string
  ) => Promise<GeneratedRepositoryCommitMessage>;
  getCommitFileContent: (
    id: string,
    commitHash: string,
    filePath: string,
    mode: RepositoryDiffPreviewMode,
    forceRender: boolean,
    encoding?: string | null
  ) => Promise<RepositoryCommitFileDiff | null>;
  getCommitFileDiff: (
    id: string,
    commitHash: string,
    filePath: string
  ) => Promise<RepositoryCommitFileDiff | null>;
  getCommitFileHunks: (
    id: string,
    commitHash: string,
    filePath: string,
    ignoreTrimWhitespace: boolean
  ) => Promise<RepositoryCommitFileHunks | null>;
  getCommitFilePreflight: (
    id: string,
    commitHash: string,
    filePath: string,
    mode: RepositoryDiffPreviewMode
  ) => Promise<RepositoryCommitFilePreflight | null>;
  getCommitFiles: (
    id: string,
    commitHash: string
  ) => Promise<RepositoryCommitFile[]>;
  getFileBlame: (
    id: string,
    filePath: string,
    revision?: string | null
  ) => Promise<RepositoryFileBlamePayload | null>;
  getFileContent: (
    id: string,
    filePath: string,
    mode: RepositoryDiffPreviewMode,
    forceRender: boolean,
    encoding?: string | null
  ) => Promise<RepositoryFileDiff | null>;
  getFileDetectedEncoding: (
    id: string,
    filePath: string,
    revision?: string | null
  ) => Promise<RepositoryFileDetectedEncoding | null>;
  getFileDiff: (
    id: string,
    filePath: string
  ) => Promise<RepositoryFileDiff | null>;
  getFileHistory: (
    id: string,
    filePath: string,
    limit?: number
  ) => Promise<RepositoryFileHistoryPayload | null>;
  getFileHunks: (
    id: string,
    filePath: string,
    ignoreTrimWhitespace: boolean
  ) => Promise<RepositoryFileHunks | null>;
  getFilePreflight: (
    id: string,
    filePath: string,
    mode: RepositoryDiffPreviewMode
  ) => Promise<RepositoryFilePreflight | null>;
  getFileText: (
    id: string,
    filePath: string,
    encoding?: string | null
  ) => Promise<string | null>;
  getLatestCommitMessage: (
    id: string
  ) => Promise<LatestRepositoryCommitMessage | null>;
  getRedoRepoActionLabel: (id: string) => string | null;
  getRepositoryFiles: (id: string) => Promise<RepositoryFileEntry[]>;
  getRepositoryGitIdentity: (id: string) => Promise<GitIdentityStatus | null>;
  getUndoRepoActionLabel: (id: string) => string | null;
  initializeRepository: (
    repository: PickedRepositorySelection,
    gitIdentity?: GitIdentityWriteInput | null
  ) => Promise<OpenedRepository | null>;
  isLoadingBranches: boolean;
  isLoadingHistory: boolean;
  isLoadingStashes: boolean;
  isLoadingStatus: boolean;
  isLoadingWip: boolean;
  isPickingRepo: boolean;
  isRefreshingOpenedRepos: boolean;
  mergeReference: (
    id: string,
    targetRef: string,
    mode: MergeActionMode
  ) => Promise<MergeActionResult>;
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
  renameBranch: (
    id: string,
    branchName: string,
    newBranchName: string
  ) => Promise<void>;
  repoBackgroundRefreshById: Record<string, boolean>;
  repoBranches: Record<string, RepositoryBranch[]>;
  repoCommitDraftPrefillById: Record<
    string,
    LatestRepositoryCommitMessage | null
  >;
  repoCommits: Record<string, RepositoryCommit[]>;
  repoFilesById: Record<string, RepositoryFileEntry[]>;
  repoGitIdentities: Record<string, GitIdentityStatus | undefined>;
  repoHistoryGraphsById: Record<string, RepositoryCommitGraphPayload>;
  repoHistoryRewriteHintById: Record<string, boolean>;
  repoLastLoadedAtById: Record<string, number>;
  repoRedoDepthById: Record<string, number>;
  repoRedoLabelById: Record<string, string | null>;
  repoRemoteNames: Record<string, string[]>;
  repoStashes: Record<string, RepositoryStash[]>;
  repoUndoDepthById: Record<string, number>;
  repoUndoLabelById: Record<string, string | null>;
  repoWorkingTreeItems: Record<string, RepositoryWorkingTreeItem[]>;
  repoWorkingTreeStatuses: Record<string, RepositoryWorkingTreeStatus>;
  resetToReference: (
    id: string,
    target: string,
    mode?: "hard" | "mixed" | "soft"
  ) => Promise<void>;
  revertCommit: (id: string, target: string) => Promise<void>;
  rewordCommitMessage: (
    id: string,
    target: string,
    summary: string,
    description: string
  ) => Promise<RewordRepositoryCommitResult>;
  saveFileText: (
    id: string,
    filePath: string,
    text: string,
    encoding?: string | null
  ) => Promise<boolean>;
  setActiveRepo: (
    id: string,
    options?: {
      background?: boolean;
      forceRefresh?: boolean;
      refreshMode?: "full" | "light";
    }
  ) => Promise<void>;
  setBranchUpstream: (
    id: string,
    localBranchName: string,
    remoteName: string,
    remoteBranchName: string
  ) => Promise<void>;
  setRepoGitIdentity: (id: string, identity: GitIdentityStatus | null) => void;
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
  historyPayload: RepositoryHistoryPayload | null;
  remoteNamesError: unknown;
  remoteNamesPayload: { id: string; remoteNames: string[] } | null;
  repoFilesError: unknown;
  repoFilesPayload: { files: RepositoryFileEntry[]; id: string } | null;
  stashesError: unknown;
  stashesPayload: { id: string; stashes: RepositoryStash[] } | null;
  statusError: unknown;
  statusPayload: { id: string; status: RepositoryWorkingTreeStatus } | null;
  wipItemsError: unknown;
  wipItemsPayload: { id: string; items: RepositoryWorkingTreeItem[] } | null;
}

export interface RepositoryHistoryPayload {
  commits: RepositoryCommit[];
  graph: RepositoryCommitGraphPayload;
  id: string;
}
