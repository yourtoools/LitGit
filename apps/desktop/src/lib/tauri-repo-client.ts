import type {
  CreateLocalRepositoryInput,
  GitIdentityStatus,
  GitIdentityValue,
  GitIdentityWriteInput,
  LatestRepositoryCommitMessage,
  PickedRepositorySelection,
  PublishRepositoryOptions,
  PullActionMode,
  PullActionResult,
  RepoCommandPreferences,
  RepoDataFetchResult,
  RepositoryBranch,
  RepositoryCommit,
  RepositoryCommitFile,
  RepositoryCommitFileDiff,
  RepositoryFileDiff,
  RepositoryStash,
  RepositoryWorkingTreeItem,
  RepositoryWorkingTreeStatus,
} from "@/stores/repo/repo-store-types";
import { useOperationLogStore } from "@/stores/ui/use-operation-log-store";

interface TauriCoreLike {
  invoke?: (
    command: string,
    args?: Record<string, unknown>
  ) => Promise<unknown>;
}

function parseRepositoryRemoteNames(value: unknown): string[] {
  if (value === null) {
    return [];
  }

  return parseStringArray(value, "Invalid repository remotes payload");
}

function parseGitIdentityValue(value: unknown): GitIdentityValue {
  if (!isRecord(value)) {
    throw new Error("Invalid Git identity payload");
  }

  const { email, isComplete, name } = value;

  if (
    !(typeof email === "string" || email === null) ||
    typeof isComplete !== "boolean" ||
    !(typeof name === "string" || name === null)
  ) {
    throw new Error("Invalid Git identity payload");
  }

  return {
    email,
    isComplete,
    name,
  } satisfies GitIdentityValue;
}

function parseGitIdentityStatus(value: unknown): GitIdentityStatus {
  if (!isRecord(value)) {
    throw new Error("Invalid Git identity status payload");
  }

  const { effective, effectiveScope, global, local, repoPath } = value;

  if (
    !(
      (effectiveScope === "global" ||
        effectiveScope === "local" ||
        effectiveScope === null) &&
      (typeof repoPath === "string" || repoPath === null)
    )
  ) {
    throw new Error("Invalid Git identity status payload");
  }

  return {
    effective: parseGitIdentityValue(effective),
    effectiveScope,
    global: parseGitIdentityValue(global),
    local: local === null ? null : parseGitIdentityValue(local),
    repoPath,
  } satisfies GitIdentityStatus;
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

  const {
    hash,
    shortHash,
    parentHashes,
    message,
    author,
    authorEmail,
    authorUsername,
    authorAvatarUrl,
    date,
    refs,
  } = value;

  if (
    typeof hash !== "string" ||
    typeof shortHash !== "string" ||
    !Array.isArray(parentHashes) ||
    parentHashes.some((parentHash) => typeof parentHash !== "string") ||
    typeof message !== "string" ||
    typeof author !== "string" ||
    !(typeof authorEmail === "string" || authorEmail === null) ||
    !(typeof authorUsername === "string" || authorUsername === null) ||
    !(typeof authorAvatarUrl === "string" || authorAvatarUrl === null) ||
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
    authorEmail,
    authorUsername,
    authorAvatarUrl,
    date,
    refs: parsedRefs,
  };
}

function parseRepositoryBranch(value: unknown): RepositoryBranch {
  if (!isRecord(value)) {
    throw new Error("Invalid repository branches payload");
  }

  const {
    name,
    refType,
    shortHash,
    lastCommitDate,
    isCurrent,
    isRemote,
    commitCount,
    aheadCount,
    behindCount,
  } = value;

  if (
    typeof name !== "string" ||
    (refType !== "branch" && refType !== "tag") ||
    typeof shortHash !== "string" ||
    typeof lastCommitDate !== "string" ||
    typeof isCurrent !== "boolean" ||
    typeof isRemote !== "boolean" ||
    typeof commitCount !== "number" ||
    typeof aheadCount !== "number" ||
    typeof behindCount !== "number"
  ) {
    throw new Error("Invalid repository branches payload");
  }

  return {
    name,
    refType,
    shortHash,
    lastCommitDate,
    isCurrent,
    isRemote,
    commitCount,
    aheadCount,
    behindCount,
  };
}

function parseRepositoryBranches(value: unknown): RepositoryBranch[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid repository branches payload");
  }

  return value.map(parseRepositoryBranch);
}

function parseRepositoryStash(value: unknown): RepositoryStash {
  if (!isRecord(value)) {
    throw new Error("Invalid repository stashes payload");
  }

  const { message, ref, shortHash } = value;

  if (
    typeof message !== "string" ||
    typeof ref !== "string" ||
    typeof shortHash !== "string"
  ) {
    throw new Error("Invalid repository stashes payload");
  }

  return {
    message,
    ref,
    shortHash,
  };
}

function parseRepositoryStashes(value: unknown): RepositoryStash[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid repository stashes payload");
  }

  return value.map(parseRepositoryStash);
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

function parseRepositoryCommitFile(value: unknown): RepositoryCommitFile {
  if (!isRecord(value)) {
    throw new Error("Invalid repository commit files payload");
  }

  const { additions, deletions, path, previousPath, status } = value;

  if (
    typeof additions !== "number" ||
    typeof deletions !== "number" ||
    typeof path !== "string" ||
    typeof status !== "string" ||
    !(typeof previousPath === "string" || previousPath === null)
  ) {
    throw new Error("Invalid repository commit files payload");
  }

  return {
    additions,
    deletions,
    path,
    previousPath,
    status,
  };
}

function parseRepositoryCommitFiles(value: unknown): RepositoryCommitFile[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid repository commit files payload");
  }

  return value.map(parseRepositoryCommitFile);
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

const invokeRepoCommandWithSystemLog = async <T>(params: {
  command: string;
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  invokeArgs: Record<string, unknown>;
  invokeCommand: string;
  repoPath: string;
}): Promise<T> => {
  const { appendSystemLog } = useOperationLogStore.getState();
  const { command, invoke, invokeArgs, invokeCommand, repoPath } = params;
  const startedAt = performance.now();

  try {
    const result = await invoke(invokeCommand, invokeArgs);
    appendSystemLog(repoPath, {
      command,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      level: "info",
      message: "Command completed",
    });

    return result as T;
  } catch (error) {
    let message = "Command failed";

    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === "string") {
      message = error;
    }

    appendSystemLog(repoPath, {
      command,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      level: "error",
      message,
    });

    throw error;
  }
};

async function loadHistoryForRepo(id: string, path: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return null;
  }

  const result = await invokeRepoCommandWithSystemLog<unknown>({
    command: "git log --date=iso-strict --decorate=short",
    invoke,
    invokeArgs: { repoPath: path },
    invokeCommand: "get_repository_history",
    repoPath: path,
  });
  const commits = parseRepositoryHistory(result);

  return { commits, id };
}

async function loadBranchesForRepo(id: string, path: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return null;
  }

  const result = await invokeRepoCommandWithSystemLog<unknown>({
    command: "git for-each-ref --sort=-committerdate",
    invoke,
    invokeArgs: { repoPath: path },
    invokeCommand: "get_repository_branches",
    repoPath: path,
  });
  const branches = parseRepositoryBranches(result);

  return { branches, id };
}

async function loadRemoteNamesForRepo(id: string, path: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return null;
  }

  const result = await invokeRepoCommandWithSystemLog<unknown>({
    command: "git remote",
    invoke,
    invokeArgs: { repoPath: path },
    invokeCommand: "get_repository_remote_names",
    repoPath: path,
  });
  const remoteNames = parseRepositoryRemoteNames(result);

  return { id, remoteNames };
}

async function loadStashesForRepo(id: string, path: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return null;
  }

  const result = await invokeRepoCommandWithSystemLog<unknown>({
    command: "git stash list",
    invoke,
    invokeArgs: { repoPath: path },
    invokeCommand: "get_repository_stashes",
    repoPath: path,
  });
  const stashes = parseRepositoryStashes(result);

  return { id, stashes };
}

async function loadWorkingTreeStatusForRepo(id: string, path: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return null;
  }

  const result = await invokeRepoCommandWithSystemLog<unknown>({
    command: "git status --porcelain --untracked-files=all",
    invoke,
    invokeArgs: { repoPath: path },
    invokeCommand: "get_repository_working_tree_status",
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

  const result = await invokeRepoCommandWithSystemLog<unknown>({
    command: "git status --porcelain --untracked-files=all",
    invoke,
    invokeArgs: { repoPath: path },
    invokeCommand: "get_repository_working_tree_items",
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

  await invokeRepoCommandWithSystemLog<void>({
    command: `git switch ${branchName}`,
    invoke,
    invokeArgs: {
      repoPath: path,
      branchName,
    },
    invokeCommand: "switch_repository_branch",
    repoPath: path,
  });
}

export async function createRepoBranch(path: string, branchName: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Create branch works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: `git switch -c ${branchName}`,
    invoke,
    invokeArgs: {
      branchName,
      repoPath: path,
    },
    invokeCommand: "create_repository_branch",
    repoPath: path,
  });
}

export async function deleteRepoBranch(path: string, branchName: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Delete branch works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: `git branch -d ${branchName}`,
    invoke,
    invokeArgs: {
      branchName,
      repoPath: path,
    },
    invokeCommand: "delete_repository_branch",
    repoPath: path,
  });
}

export async function renameRepoBranch(
  path: string,
  branchName: string,
  newBranchName: string
) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Rename branch works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: `git branch -m ${branchName} ${newBranchName}`,
    invoke,
    invokeArgs: {
      branchName,
      newBranchName,
      repoPath: path,
    },
    invokeCommand: "rename_repository_branch",
    repoPath: path,
  });
}

export async function deleteRemoteRepoBranch(
  path: string,
  remoteName: string,
  branchName: string
) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Delete remote branch works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: `git push ${remoteName} --delete ${branchName}`,
    invoke,
    invokeArgs: {
      branchName,
      remoteName,
      repoPath: path,
    },
    invokeCommand: "delete_remote_repository_branch",
    repoPath: path,
  });
}

export async function setRepoBranchUpstream(
  path: string,
  localBranchName: string,
  remoteName: string,
  remoteBranchName: string,
  preferences?: RepoCommandPreferences
) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Set upstream works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: `git branch --set-upstream-to=${remoteName}/${remoteBranchName} ${localBranchName}`,
    invoke,
    invokeArgs: {
      localBranchName,
      preferences,
      remoteBranchName,
      remoteName,
      repoPath: path,
    },
    invokeCommand: "set_repository_branch_upstream",
    repoPath: path,
  });
}

export async function getLatestRepoCommitMessage(
  path: string
): Promise<LatestRepositoryCommitMessage> {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Latest commit message works in Tauri desktop app only");
  }

  const result = await invokeRepoCommandWithSystemLog<unknown>({
    command: "git log -1 --pretty=format:%s%x1f%b",
    invoke,
    invokeArgs: { repoPath: path },
    invokeCommand: "get_latest_repository_commit_message",
    repoPath: path,
  });

  if (!isRecord(result)) {
    throw new Error("Invalid latest commit message payload");
  }

  const { summary, description } = result;

  if (typeof summary !== "string" || typeof description !== "string") {
    throw new Error("Invalid latest commit message payload");
  }

  return {
    description,
    summary,
  } satisfies LatestRepositoryCommitMessage;
}

export async function pushRepoBranch(
  path: string,
  preferences?: RepoCommandPreferences,
  forceWithLease = false,
  publishOptions?: PublishRepositoryOptions
) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Push works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: forceWithLease ? "git push --force-with-lease" : "git push",
    invoke,
    invokeArgs: {
      forceWithLease,
      publishRepoName: publishOptions?.repoName,
      publishVisibility: publishOptions?.visibility,
      preferences,
      repoPath: path,
    },
    invokeCommand: "push_repository_branch",
    repoPath: path,
  });
}

export async function applyRepoStash(path: string, stashRef: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Apply stash works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: `git stash apply ${stashRef}`,
    invoke,
    invokeArgs: {
      repoPath: path,
      stashRef,
    },
    invokeCommand: "apply_repository_stash",
    repoPath: path,
  });
}

export async function popRepoStash(path: string, stashRef: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Pop stash works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: `git stash pop ${stashRef}`,
    invoke,
    invokeArgs: {
      repoPath: path,
      stashRef,
    },
    invokeCommand: "pop_repository_stash",
    repoPath: path,
  });
}

export async function dropRepoStash(path: string, stashRef: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Drop stash works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: `git stash drop ${stashRef}`,
    invoke,
    invokeArgs: {
      repoPath: path,
      stashRef,
    },
    invokeCommand: "drop_repository_stash",
    repoPath: path,
  });
}

export async function createRepoStash(
  path: string,
  summary: string,
  description: string,
  includeUntracked = true
) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Create stash works in Tauri desktop app only");
  }

  const summaryTrimmed = summary.trim();
  const descriptionTrimmed = description.trim();
  let stashMessage: string | null = null;

  if (summaryTrimmed.length > 0 && descriptionTrimmed.length > 0) {
    stashMessage = `${summaryTrimmed}\n\n${descriptionTrimmed}`;
  } else if (summaryTrimmed.length > 0) {
    stashMessage = summaryTrimmed;
  } else if (descriptionTrimmed.length > 0) {
    stashMessage = descriptionTrimmed;
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: includeUntracked
      ? "git stash push --include-untracked"
      : "git stash push",
    invoke,
    invokeArgs: {
      includeUntracked,
      repoPath: path,
      stashMessage,
    },
    invokeCommand: "create_repository_stash",
    repoPath: path,
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
  includeAll: boolean,
  amend: boolean,
  skipHooks: boolean,
  preferences?: RepoCommandPreferences
) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Commit changes works in Tauri desktop app only");
  }

  let command = "git commit";

  if (amend) {
    command = "git commit --amend";
  } else if (includeAll) {
    command = "git add -A && git commit";
  }

  await invokeRepoCommandWithSystemLog<void>({
    command,
    invoke,
    invokeArgs: {
      preferences,
      repoPath: path,
      summary,
      description,
      includeAll,
      amend,
      skipHooks,
    },
    invokeCommand: "commit_repository_changes",
    repoPath: path,
  });
}

export async function createRepoInitialCommit(
  path: string,
  gitIdentity?: GitIdentityWriteInput | null
) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Initialize repository works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: "git add -A && git commit -m Initial commit",
    invoke,
    invokeArgs: {
      repoPath: path,
      gitIdentity: gitIdentity ?? null,
    },
    invokeCommand: "create_repository_initial_commit",
    repoPath: path,
  });
}

export async function getRepoGitIdentity(
  repoPath?: string | null
): Promise<GitIdentityStatus> {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Git identity works in Tauri desktop app only");
  }

  const result = await invoke("get_git_identity", {
    repoPath: repoPath ?? null,
  });

  return parseGitIdentityStatus(result);
}

export async function setRepoGitIdentity(params: {
  gitIdentity: GitIdentityWriteInput;
  repoPath?: string | null;
}): Promise<GitIdentityStatus> {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Git identity works in Tauri desktop app only");
  }

  const result = await invoke("set_git_identity", {
    gitIdentity: params.gitIdentity,
    repoPath: params.repoPath ?? null,
  });

  return parseGitIdentityStatus(result);
}

export async function createLocalRepo(input: CreateLocalRepositoryInput) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Create local repository works in Tauri desktop app only");
  }

  const result = await invoke("create_local_repository", {
    defaultBranch: input.defaultBranch,
    destinationParent: input.destinationParent,
    gitIdentity: input.gitIdentity ?? null,
    gitignoreTemplateContent: input.gitignoreTemplateContent,
    gitignoreTemplateKey: input.gitignoreTemplateKey,
    licenseTemplateContent: input.licenseTemplateContent,
    licenseTemplateKey: input.licenseTemplateKey,
    name: input.name,
  });

  return parsePickedRepository(result);
}

export async function cloneRepo(
  repositoryUrl: string,
  destinationParent: string,
  folderName: string,
  recurseSubmodules: boolean,
  preferences?: RepoCommandPreferences
) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Clone repository works in Tauri desktop app only");
  }

  const result = await invoke("clone_git_repository", {
    destinationParent,
    destinationFolderName: folderName,
    preferences,
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

export async function pickLocalRepositoryParentFolder() {
  return await pickCloneDestinationFolder();
}

export async function stageAllRepoChanges(path: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Stage all works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: "git add -A",
    invoke,
    invokeArgs: { repoPath: path },
    invokeCommand: "stage_all_repository_changes",
    repoPath: path,
  });
}

export async function unstageAllRepoChanges(path: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Unstage all works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: "git reset HEAD -- .",
    invoke,
    invokeArgs: { repoPath: path },
    invokeCommand: "unstage_all_repository_changes",
    repoPath: path,
  });
}

export async function stageRepoFile(path: string, filePath: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Stage file works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: `git add -- ${filePath}`,
    invoke,
    invokeArgs: {
      repoPath: path,
      filePath,
    },
    invokeCommand: "stage_repository_file",
    repoPath: path,
  });
}

export async function unstageRepoFile(path: string, filePath: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Unstage file works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: `git reset HEAD -- ${filePath}`,
    invoke,
    invokeArgs: {
      repoPath: path,
      filePath,
    },
    invokeCommand: "unstage_repository_file",
    repoPath: path,
  });
}

export async function addRepoIgnoreRule(path: string, pattern: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Ignore rule update works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: `append .gitignore rule: ${pattern}`,
    invoke,
    invokeArgs: {
      repoPath: path,
      pattern,
    },
    invokeCommand: "add_repository_ignore_rule",
    repoPath: path,
  });
}
export async function discardRepoPathChanges(path: string, filePath: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Discard changes works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: `git restore --source=HEAD --staged --worktree -- ${filePath}`,
    invoke,
    invokeArgs: {
      repoPath: path,
      filePath,
    },
    invokeCommand: "discard_repository_path_changes",
    repoPath: path,
  });
}
export async function discardAllRepoChanges(path: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Discard changes works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: "git reset --hard HEAD && git clean -fd",
    invoke,
    invokeArgs: { repoPath: path },
    invokeCommand: "discard_all_repository_changes",
    repoPath: path,
  });
}

export type RepoResetMode = "hard" | "mixed" | "soft";

export async function resetRepoToReference(
  path: string,
  target: string,
  mode: RepoResetMode = "mixed"
) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Reset repository works in Tauri desktop app only");
  }

  await invokeRepoCommandWithSystemLog<void>({
    command: `git reset --${mode} ${target}`,
    invoke,
    invokeArgs: {
      repoPath: path,
      target,
      mode,
    },
    invokeCommand: "reset_repository_to_reference",
    repoPath: path,
  });
}

export async function getRepoCommitFiles(
  path: string,
  commitHash: string
): Promise<RepositoryCommitFile[]> {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Commit files works in Tauri desktop app only");
  }

  const result = await invokeRepoCommandWithSystemLog<unknown>({
    command: `git show --name-status ${commitHash}`,
    invoke,
    invokeArgs: {
      repoPath: path,
      commitHash,
    },
    invokeCommand: "get_repository_commit_files",
    repoPath: path,
  });

  return parseRepositoryCommitFiles(result);
}

export async function getRepoCommitFileDiff(
  path: string,
  commitHash: string,
  filePath: string
): Promise<RepositoryCommitFileDiff> {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Commit diff works in Tauri desktop app only");
  }

  const result = await invokeRepoCommandWithSystemLog<unknown>({
    command: `git show ${commitHash}:${filePath}`,
    invoke,
    invokeArgs: {
      repoPath: path,
      commitHash,
      filePath,
    },
    invokeCommand: "get_repository_commit_file_diff",
    repoPath: path,
  });

  if (!isRecord(result)) {
    throw new Error("Invalid repository commit file diff payload");
  }

  const {
    commitHash: parsedCommitHash,
    path: diffPath,
    oldText,
    newText,
  } = result;

  if (
    typeof parsedCommitHash !== "string" ||
    typeof diffPath !== "string" ||
    typeof oldText !== "string" ||
    typeof newText !== "string"
  ) {
    throw new Error("Invalid repository commit file diff payload");
  }

  return {
    commitHash: parsedCommitHash,
    path: diffPath,
    oldText,
    newText,
  } satisfies RepositoryCommitFileDiff;
}

export async function getRepoFileDiff(path: string, filePath: string) {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("File diff works in Tauri desktop app only");
  }

  const result = await invokeRepoCommandWithSystemLog<unknown>({
    command: `git show HEAD:${filePath}`,
    invoke,
    invokeArgs: {
      repoPath: path,
      filePath,
    },
    invokeCommand: "get_repository_file_diff",
    repoPath: path,
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
  hasRemoteNames: boolean,
  hasStashes: boolean,
  hasStatus: boolean,
  hasWipItems: boolean
): Promise<RepoDataFetchResult> {
  const [
    historyResult,
    branchesResult,
    remoteNamesResult,
    stashesResult,
    statusResult,
    wipItemsResult,
  ] = await Promise.allSettled([
    hasCommits ? Promise.resolve(null) : loadHistoryForRepo(id, path),
    hasBranches ? Promise.resolve(null) : loadBranchesForRepo(id, path),
    hasRemoteNames ? Promise.resolve(null) : loadRemoteNamesForRepo(id, path),
    hasStashes ? Promise.resolve(null) : loadStashesForRepo(id, path),
    hasStatus ? Promise.resolve(null) : loadWorkingTreeStatusForRepo(id, path),
    hasWipItems ? Promise.resolve(null) : loadWorkingTreeItemsForRepo(id, path),
  ]);

  const historyPayload =
    historyResult.status === "fulfilled" ? historyResult.value : null;
  const branchesPayload =
    branchesResult.status === "fulfilled" ? branchesResult.value : null;
  const stashesPayload =
    stashesResult.status === "fulfilled" ? stashesResult.value : null;
  const remoteNamesPayload =
    remoteNamesResult.status === "fulfilled" ? remoteNamesResult.value : null;
  const statusPayload =
    statusResult.status === "fulfilled" ? statusResult.value : null;
  const wipItemsPayload =
    wipItemsResult.status === "fulfilled" ? wipItemsResult.value : null;

  const historyError =
    historyResult.status === "rejected" ? historyResult.reason : null;
  const branchesError =
    branchesResult.status === "rejected" ? branchesResult.reason : null;
  const stashesError =
    stashesResult.status === "rejected" ? stashesResult.reason : null;
  const remoteNamesError =
    remoteNamesResult.status === "rejected" ? remoteNamesResult.reason : null;
  const statusError =
    statusResult.status === "rejected" ? statusResult.reason : null;
  const wipItemsError =
    wipItemsResult.status === "rejected" ? wipItemsResult.reason : null;

  return {
    branchesError,
    branchesPayload,
    historyError,
    historyPayload,
    remoteNamesError,
    remoteNamesPayload,
    stashesError,
    stashesPayload,
    statusError,
    statusPayload,
    wipItemsError,
    wipItemsPayload,
  };
}

export async function runRepoPull(
  path: string,
  mode: PullActionMode,
  preferences?: RepoCommandPreferences
): Promise<PullActionResult> {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Pull works in Tauri desktop app only");
  }

  const commandByMode: Record<PullActionMode, string> = {
    "fetch-all": "git fetch --all --prune",
    "pull-ff-only": "git pull --ff-only",
    "pull-ff-possible": "git pull",
    "pull-rebase": "git pull --rebase",
  };

  const result = await invokeRepoCommandWithSystemLog<unknown>({
    command: commandByMode[mode],
    invoke,
    invokeArgs: {
      repoPath: path,
      mode,
      preferences,
    },
    invokeCommand: "pull_repository_action",
    repoPath: path,
  });

  if (!isRecord(result) || typeof result.headChanged !== "boolean") {
    throw new Error("Invalid pull action payload");
  }

  return {
    headChanged: result.headChanged,
  };
}
