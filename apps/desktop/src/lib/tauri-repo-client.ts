import type {
  PickedRepositorySelection,
  RepoDataFetchResult,
  RepositoryBranch,
  RepositoryCommit,
  RepositoryFileDiff,
  RepositoryWorkingTreeItem,
  RepositoryWorkingTreeStatus,
} from "@/stores/repo/repo-store-types";

interface TauriCoreLike {
  invoke?: (
    command: string,
    args?: Record<string, unknown>
  ) => Promise<unknown>;
}

interface TauriV1Like {
  core?: TauriCoreLike;
  invoke?: (
    command: string,
    args?: Record<string, unknown>
  ) => Promise<unknown>;
}

interface TauriInternalsLike {
  invoke?: (
    command: string,
    args?: Record<string, unknown>
  ) => Promise<unknown>;
}

interface GlobalTauriLike {
  __TAURI__?: TauriV1Like;
  __TAURI_INTERNALS__?: TauriInternalsLike;
}

export interface CloneRepositoryProgress {
  message: string;
  percent?: number;
  phase: "preparing" | "receiving" | "resolving" | "complete";
  receivedObjects?: number;
  resolvedObjects?: number;
  totalObjects?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseStringArray(value: unknown, errorMessage: string): string[] {
  if (
    !(
      Array.isArray(value) &&
      value.every((entry): entry is string => typeof entry === "string")
    )
  ) {
    throw new Error(errorMessage);
  }

  return value;
}

export function parsePickedRepository(
  value: unknown
): PickedRepositorySelection | null {
  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new Error("Invalid repository payload");
  }

  const { hasInitialCommit, isGitRepository, name, path } = value;

  if (
    typeof hasInitialCommit !== "boolean" ||
    typeof isGitRepository !== "boolean" ||
    typeof name !== "string" ||
    typeof path !== "string"
  ) {
    throw new Error("Invalid repository payload");
  }

  return { hasInitialCommit, isGitRepository, name, path };
}

function parseRepositoryCommit(value: unknown): RepositoryCommit {
  if (!isRecord(value)) {
    throw new Error("Invalid repository history payload");
  }

  const { hash, shortHash, parentHashes, message, author, date, refs } = value;

  if (
    typeof hash !== "string" ||
    typeof shortHash !== "string" ||
    !Array.isArray(parentHashes) ||
    parentHashes.some((parentHash) => typeof parentHash !== "string") ||
    typeof message !== "string" ||
    typeof author !== "string" ||
    typeof date !== "string"
  ) {
    throw new Error("Invalid repository history payload");
  }

  const parsedRefs = Array.isArray(refs)
    ? refs.filter(
        (reference): reference is string => typeof reference === "string"
      )
    : [];

  return {
    hash,
    shortHash,
    parentHashes,
    message,
    author,
    date,
    refs: parsedRefs,
  };
}

function parseRepositoryBranch(value: unknown): RepositoryBranch {
  if (!isRecord(value)) {
    throw new Error("Invalid repository branches payload");
  }

  const { name, shortHash, lastCommitDate, isCurrent, commitCount } = value;

  if (
    typeof name !== "string" ||
    typeof shortHash !== "string" ||
    typeof lastCommitDate !== "string" ||
    typeof isCurrent !== "boolean" ||
    typeof commitCount !== "number"
  ) {
    throw new Error("Invalid repository branches payload");
  }

  return {
    name,
    shortHash,
    lastCommitDate,
    isCurrent,
    commitCount,
  };
}

function parseRepositoryBranches(value: unknown): RepositoryBranch[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid repository branches payload");
  }

  return value.map(parseRepositoryBranch);
}

function parseRepositoryWorkingTreeStatus(
  value: unknown
): RepositoryWorkingTreeStatus {
  if (!isRecord(value)) {
    throw new Error("Invalid repository working tree payload");
  }

  const { hasChanges, stagedCount, unstagedCount, untrackedCount } = value;

  if (
    typeof hasChanges !== "boolean" ||
    typeof stagedCount !== "number" ||
    typeof unstagedCount !== "number" ||
    typeof untrackedCount !== "number"
  ) {
    throw new Error("Invalid repository working tree payload");
  }

  return {
    hasChanges,
    stagedCount,
    unstagedCount,
    untrackedCount,
  };
}

function parseRepositoryWorkingTreeItem(
  value: unknown
): RepositoryWorkingTreeItem {
  if (!isRecord(value)) {
    throw new Error("Invalid repository working tree item payload");
  }

  const { path, stagedStatus, unstagedStatus, isUntracked } = value;

  if (
    typeof path !== "string" ||
    typeof stagedStatus !== "string" ||
    typeof unstagedStatus !== "string" ||
    typeof isUntracked !== "boolean"
  ) {
    throw new Error("Invalid repository working tree item payload");
  }

  return {
    path,
    stagedStatus,
    unstagedStatus,
    isUntracked,
  };
}

function parseRepositoryWorkingTreeItems(
  value: unknown
): RepositoryWorkingTreeItem[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid repository working tree items payload");
  }

  return value.map(parseRepositoryWorkingTreeItem);
}

function parseRepositoryHistory(value: unknown): RepositoryCommit[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid repository history payload");
  }

  return value.map(parseRepositoryCommit);
}

export function getTauriInvoke() {
  const tauri = globalThis as GlobalTauriLike;

  return (
    tauri.__TAURI_INTERNALS__?.invoke ??
    tauri.__TAURI__?.core?.invoke ??
    tauri.__TAURI__?.invoke ??
    null
  );
}

async function loadHistoryForRepo(id: string, path: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return null;
  }

  const result = await invoke("get_repository_history", { repoPath: path });
  const commits = parseRepositoryHistory(result);

  return { commits, id };
}

async function loadBranchesForRepo(id: string, path: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return null;
  }

  const result = await invoke("get_repository_branches", { repoPath: path });
  const branches = parseRepositoryBranches(result);

  return { branches, id };
}

async function loadWorkingTreeStatusForRepo(id: string, path: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return null;
  }

  const result = await invoke("get_repository_working_tree_status", {
    repoPath: path,
  });
  const status = parseRepositoryWorkingTreeStatus(result);

  return { id, status };
}

async function loadWorkingTreeItemsForRepo(id: string, path: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return null;
  }

  const result = await invoke("get_repository_working_tree_items", {
    repoPath: path,
  });
  const items = parseRepositoryWorkingTreeItems(result);

  return { id, items };
}

export async function switchRepoBranch(path: string, branchName: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Switch branch works in Tauri desktop app only");
  }

  await invoke("switch_repository_branch", {
    repoPath: path,
    branchName,
  });
}

export async function validateOpenedRepositories(paths: string[]) {
  if (paths.length === 0) {
    return [];
  }

  const invoke = getTauriInvoke();

  if (!invoke) {
    return paths;
  }

  const result = await invoke("validate_opened_repositories", {
    repoPaths: paths,
  });

  return parseStringArray(result, "Invalid repository validation payload");
}

export async function commitRepoChanges(
  path: string,
  summary: string,
  description: string,
  includeAll: boolean
) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Commit changes works in Tauri desktop app only");
  }

  await invoke("commit_repository_changes", {
    repoPath: path,
    summary,
    description,
    includeAll,
  });
}

export async function createRepoInitialCommit(path: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Initialize repository works in Tauri desktop app only");
  }

  await invoke("create_repository_initial_commit", {
    repoPath: path,
  });
}

export async function cloneRepo(
  repositoryUrl: string,
  destinationParent: string,
  folderName: string,
  recurseSubmodules: boolean
) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Clone repository works in Tauri desktop app only");
  }

  const result = await invoke("clone_git_repository", {
    destinationParent,
    destinationFolderName: folderName,
    recurseSubmodules,
    repositoryUrl,
  });

  return parsePickedRepository(result);
}

export async function pickCloneDestinationFolder() {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Pick folder works in Tauri desktop app only");
  }

  const result = await invoke("pick_clone_destination_folder");

  if (result === null) {
    return null;
  }

  if (typeof result !== "string") {
    throw new Error("Invalid clone destination payload");
  }

  return result;
}

export async function stageAllRepoChanges(path: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Stage all works in Tauri desktop app only");
  }

  await invoke("stage_all_repository_changes", {
    repoPath: path,
  });
}

export async function unstageAllRepoChanges(path: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Unstage all works in Tauri desktop app only");
  }

  await invoke("unstage_all_repository_changes", {
    repoPath: path,
  });
}

export async function stageRepoFile(path: string, filePath: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Stage file works in Tauri desktop app only");
  }

  await invoke("stage_repository_file", {
    repoPath: path,
    filePath,
  });
}

export async function unstageRepoFile(path: string, filePath: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Unstage file works in Tauri desktop app only");
  }

  await invoke("unstage_repository_file", {
    repoPath: path,
    filePath,
  });
}

export async function getRepoFileDiff(path: string, filePath: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("File diff works in Tauri desktop app only");
  }

  const result = await invoke("get_repository_file_diff", {
    repoPath: path,
    filePath,
  });

  if (!isRecord(result)) {
    throw new Error("Invalid repository file diff payload");
  }

  const { path: diffPath, oldText, newText } = result;

  if (
    typeof diffPath !== "string" ||
    typeof oldText !== "string" ||
    typeof newText !== "string"
  ) {
    throw new Error("Invalid repository file diff payload");
  }

  return {
    path: diffPath,
    oldText,
    newText,
  } satisfies RepositoryFileDiff;
}

export async function fetchRepoData(
  id: string,
  path: string,
  hasCommits: boolean,
  hasBranches: boolean,
  hasStatus: boolean,
  hasWipItems: boolean
): Promise<RepoDataFetchResult> {
  const [historyResult, branchesResult, statusResult, wipItemsResult] =
    await Promise.allSettled([
      hasCommits ? Promise.resolve(null) : loadHistoryForRepo(id, path),
      hasBranches ? Promise.resolve(null) : loadBranchesForRepo(id, path),
      hasStatus
        ? Promise.resolve(null)
        : loadWorkingTreeStatusForRepo(id, path),
      hasWipItems
        ? Promise.resolve(null)
        : loadWorkingTreeItemsForRepo(id, path),
    ]);

  const historyPayload =
    historyResult.status === "fulfilled" ? historyResult.value : null;
  const branchesPayload =
    branchesResult.status === "fulfilled" ? branchesResult.value : null;
  const statusPayload =
    statusResult.status === "fulfilled" ? statusResult.value : null;
  const wipItemsPayload =
    wipItemsResult.status === "fulfilled" ? wipItemsResult.value : null;

  const historyError =
    historyResult.status === "rejected" ? historyResult.reason : null;
  const branchesError =
    branchesResult.status === "rejected" ? branchesResult.reason : null;
  const statusError =
    statusResult.status === "rejected" ? statusResult.reason : null;
  const wipItemsError =
    wipItemsResult.status === "rejected" ? wipItemsResult.reason : null;

  return {
    branchesError,
    branchesPayload,
    historyError,
    historyPayload,
    statusError,
    statusPayload,
    wipItemsError,
    wipItemsPayload,
  };
}
