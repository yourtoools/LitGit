import type { RepoFileBrowserSortOrder } from "@/stores/preferences/preferences-store-types";
import type {
  RepositoryCommitFile,
  RepositoryFileEntry,
  RepositoryWorkingTreeItem,
} from "@/stores/repo/repo-store-types";

export interface ChangeTreeNode {
  children: Map<string, ChangeTreeNode>;
  fullPath: string;
  item: RepositoryWorkingTreeItem | null;
  name: string;
}

export interface CommitFileTreeNode {
  children: Map<string, CommitFileTreeNode>;
  file: RepositoryCommitFile | null;
  fullPath: string;
  name: string;
}

interface CollapsedCommitTreeSummary {
  addedCount: number;
  modifiedCount: number;
  removedCount: number;
}

const changeTreeStatusCountCache = new WeakMap<
  ChangeTreeNode,
  Partial<Record<"staged" | "unstaged", Map<string, number>>>
>();
const commitTreeChangeSummaryCache = new WeakMap<
  CommitFileTreeNode,
  CollapsedCommitTreeSummary
>();

function createEmptyTreeNode(name: string, fullPath: string): ChangeTreeNode {
  return {
    children: new Map<string, ChangeTreeNode>(),
    fullPath,
    item: null,
    name,
  };
}

function createEmptyCommitTreeNode(
  name: string,
  fullPath: string
): CommitFileTreeNode {
  return {
    children: new Map<string, CommitFileTreeNode>(),
    file: null,
    fullPath,
    name,
  };
}

function getStatusCodes(
  item: RepositoryWorkingTreeItem,
  section: "staged" | "unstaged"
): string[] {
  if (section === "staged") {
    if (item.stagedStatus === " " || item.stagedStatus === "?") {
      return [];
    }

    return [item.stagedStatus];
  }

  if (item.isUntracked) {
    return ["?"];
  }

  if (item.unstagedStatus === " ") {
    return [];
  }

  return [item.unstagedStatus];
}

function getCollapsedTreeStatusCounts(
  node: ChangeTreeNode,
  section: "staged" | "unstaged"
): Map<string, number> {
  const cachedBySection = changeTreeStatusCountCache.get(node);
  const cachedCounts = cachedBySection?.[section];
  if (cachedCounts) {
    return cachedCounts;
  }

  const counts = new Map<string, number>();
  const stack = [node];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (current.item) {
      const statusCodes = getStatusCodes(current.item, section);

      for (const code of statusCodes) {
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
      continue;
    }

    stack.push(...current.children.values());
  }

  changeTreeStatusCountCache.set(node, {
    ...cachedBySection,
    [section]: counts,
  });
  return counts;
}

function getCollapsedCommitTreeChangeSummary(
  node: CommitFileTreeNode
): CollapsedCommitTreeSummary {
  const cachedSummary = commitTreeChangeSummaryCache.get(node);
  if (cachedSummary) {
    return cachedSummary;
  }

  let addedCount = 0;
  let modifiedCount = 0;
  let removedCount = 0;
  const stack = [node];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (current.file) {
      const statusCode = current.file.status.charAt(0);

      if (statusCode === "A") {
        addedCount += 1;
        continue;
      }

      if (statusCode === "D") {
        removedCount += 1;
        continue;
      }

      modifiedCount += 1;
      continue;
    }

    stack.push(...current.children.values());
  }

  const summary = {
    addedCount,
    modifiedCount,
    removedCount,
  } satisfies CollapsedCommitTreeSummary;
  commitTreeChangeSummaryCache.set(node, summary);
  return summary;
}

export function buildRepositoryFileTree(
  files: RepositoryFileEntry[],
  workingTreeItemByPath: Map<string, RepositoryWorkingTreeItem>,
  sortOrder: RepoFileBrowserSortOrder
): ChangeTreeNode[] {
  const items = files.map((file) => ({
    ...(workingTreeItemByPath.get(file.path) ?? {
      isUntracked: false,
      path: file.path,
      stagedStatus: " ",
      unstagedStatus: " ",
    }),
  })) satisfies RepositoryWorkingTreeItem[];

  return buildChangeTree(items, sortOrder);
}

export function buildChangeTree(
  items: RepositoryWorkingTreeItem[],
  sortOrder: RepoFileBrowserSortOrder = "asc"
): ChangeTreeNode[] {
  const root = createEmptyTreeNode("", "");

  for (const item of items) {
    const normalizedPath = item.path.replaceAll("\\", "/");
    const segments = normalizedPath
      .split("/")
      .filter((segment) => segment.length > 0);

    let cursor = root;
    let segmentPath = "";

    for (const segment of segments) {
      segmentPath =
        segmentPath.length > 0 ? `${segmentPath}/${segment}` : segment;
      const existing = cursor.children.get(segment);

      if (existing) {
        cursor = existing;
        continue;
      }

      const nextNode = createEmptyTreeNode(segment, segmentPath);
      cursor.children.set(segment, nextNode);
      cursor = nextNode;
    }

    cursor.item = item;
  }

  const toSortedArray = (node: ChangeTreeNode): ChangeTreeNode[] =>
    Array.from(node.children.values())
      .map((childNode) => ({
        ...childNode,
        children: new Map(
          toSortedArray(childNode).map((entry) => [entry.name, entry])
        ),
      }))
      .sort((left, right) => {
        const leftIsFolder = left.item === null;
        const rightIsFolder = right.item === null;

        if (leftIsFolder !== rightIsFolder) {
          return leftIsFolder ? -1 : 1;
        }

        const comparison = left.name.localeCompare(right.name);

        return sortOrder === "asc" ? comparison : comparison * -1;
      });

  return toSortedArray(root);
}

export function buildCommitFileTree(
  files: RepositoryCommitFile[],
  sortOrder: RepoFileBrowserSortOrder = "asc"
): CommitFileTreeNode[] {
  const root = createEmptyCommitTreeNode("", "");

  for (const file of files) {
    const normalizedPath = file.path.replaceAll("\\", "/");
    const segments = normalizedPath
      .split("/")
      .filter((segment) => segment.length > 0);

    let cursor = root;
    let segmentPath = "";

    for (const segment of segments) {
      segmentPath =
        segmentPath.length > 0 ? `${segmentPath}/${segment}` : segment;
      const existing = cursor.children.get(segment);

      if (existing) {
        cursor = existing;
        continue;
      }

      const nextNode = createEmptyCommitTreeNode(segment, segmentPath);
      cursor.children.set(segment, nextNode);
      cursor = nextNode;
    }

    cursor.file = file;
  }

  const toSortedArray = (node: CommitFileTreeNode): CommitFileTreeNode[] =>
    Array.from(node.children.values())
      .map((childNode) => ({
        ...childNode,
        children: new Map(
          toSortedArray(childNode).map((entry) => [entry.name, entry])
        ),
      }))
      .sort((left, right) => {
        const leftIsFolder = left.file === null;
        const rightIsFolder = right.file === null;

        if (leftIsFolder !== rightIsFolder) {
          return leftIsFolder ? -1 : 1;
        }

        const comparison = left.name.localeCompare(right.name);

        return sortOrder === "asc" ? comparison : comparison * -1;
      });

  return toSortedArray(root);
}

export function collectExpandableTreeKeys(
  nodes: ChangeTreeNode[],
  section: "all" | "staged" | "unstaged",
  getTreeNodeStateKey: (
    section: "all" | "staged" | "unstaged",
    nodePath: string
  ) => string
): Record<string, boolean> {
  const nextState: Record<string, boolean> = {};
  const stack = [...nodes];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || node.children.size === 0) {
      continue;
    }

    nextState[getTreeNodeStateKey(section, node.fullPath)] = true;
    stack.push(...node.children.values());
  }

  return nextState;
}

export function collectTreeStatusCounts(
  node: ChangeTreeNode,
  section: "staged" | "unstaged"
): Map<string, number> {
  return getCollapsedTreeStatusCounts(node, section);
}

export function collectCommitTreeChangeSummary(
  node: CommitFileTreeNode
): CollapsedCommitTreeSummary {
  return getCollapsedCommitTreeChangeSummary(node);
}

export function collectExpandableCommitTreeKeys(
  nodes: CommitFileTreeNode[],
  commitHash: string,
  getCommitTreeNodeStateKey: (commitHash: string, nodePath: string) => string
): Record<string, boolean> {
  const nextState: Record<string, boolean> = {};
  const stack = [...nodes];

  while (stack.length > 0) {
    const currentNode = stack.pop();

    if (!currentNode || currentNode.children.size === 0) {
      continue;
    }

    nextState[getCommitTreeNodeStateKey(commitHash, currentNode.fullPath)] =
      true;
    stack.push(...currentNode.children.values());
  }

  return nextState;
}
