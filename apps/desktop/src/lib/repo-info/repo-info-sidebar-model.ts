import { formatStashLabel } from "@/lib/repo-info/repo-info-reference-labels";
import type {
  RepositoryBranch,
  RepositoryStash,
} from "@/stores/repo/repo-store-types";

export interface SidebarEntry {
  active?: boolean;
  isRemote?: boolean;
  name: string;
  pendingPushCount?: number;
  pendingSyncCount?: number;
  searchName: string;
  stashMessage?: string;
  stashRef?: string;
  type: "branch" | "stash" | "tag";
}

export interface BranchTreeNode {
  children: BranchTreeNode[];
  entry: SidebarEntry | null;
  fullPath: string;
  name: string;
}

export interface SidebarGroupItem {
  count: number;
  entries: SidebarEntry[];
  key: string;
  name: string;
  treeNodes?: BranchTreeNode[];
}

export interface BuildRepoInfoSidebarGroupsInput {
  branches: RepositoryBranch[];
  normalizedSidebarFilter: string;
  stashes: RepositoryStash[];
}

export interface BuildRepoInfoSidebarGroupsResult {
  filteredSidebarEntryCount: number;
  filteredSidebarGroups: SidebarGroupItem[];
}

function createEmptyBranchTreeNode(
  name: string,
  fullPath: string
): BranchTreeNode {
  return {
    children: [],
    entry: null,
    fullPath,
    name,
  };
}

function buildBranchTree(entries: SidebarEntry[]): BranchTreeNode[] {
  const root = createEmptyBranchTreeNode("", "");
  const childMapByPath = new Map<string, Map<string, BranchTreeNode>>([
    ["", new Map<string, BranchTreeNode>()],
  ]);

  for (const entry of entries) {
    const segments = entry.name
      .split("/")
      .filter((segment) => segment.length > 0);

    if (segments.length === 0) {
      continue;
    }

    let cursor = root;
    let segmentPath = "";
    let childrenByName =
      childMapByPath.get("") ?? new Map<string, BranchTreeNode>();

    for (const segment of segments) {
      segmentPath =
        segmentPath.length > 0 ? `${segmentPath}/${segment}` : segment;
      const existing = childrenByName.get(segment);

      if (existing) {
        cursor = existing;
        childrenByName =
          childMapByPath.get(segmentPath) ?? new Map<string, BranchTreeNode>();
        continue;
      }

      const nextNode = createEmptyBranchTreeNode(segment, segmentPath);
      cursor.children.push(nextNode);
      childrenByName.set(segment, nextNode);
      childMapByPath.set(segmentPath, new Map<string, BranchTreeNode>());
      cursor = nextNode;
      childrenByName = childMapByPath.get(segmentPath) ?? new Map();
    }

    cursor.entry = entry;
  }

  const toSortedArray = (node: BranchTreeNode): BranchTreeNode[] =>
    node.children
      .map((childNode) => ({
        ...childNode,
        children: toSortedArray(childNode),
      }))
      .sort((left, right) => {
        const leftIsFolder = left.entry === null;
        const rightIsFolder = right.entry === null;

        if (leftIsFolder !== rightIsFolder) {
          return leftIsFolder ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      });

  const compressBranchTree = (nodes: BranchTreeNode[]): BranchTreeNode[] =>
    nodes.map((node) => {
      if (node.entry) {
        return node;
      }

      const compressedChildren = compressBranchTree(node.children);

      if (compressedChildren.length !== 1) {
        return {
          ...node,
          children: compressedChildren,
        };
      }

      const [onlyChild] = compressedChildren;

      if (!onlyChild || onlyChild.entry) {
        return {
          ...node,
          children: compressedChildren,
        };
      }

      return {
        ...onlyChild,
        fullPath: onlyChild.fullPath,
        name: `${node.name}/${onlyChild.name}`,
      };
    });

  return compressBranchTree(toSortedArray(root));
}

function countBranchTreeEntries(nodes: BranchTreeNode[]): number {
  let total = 0;

  for (const node of nodes) {
    if (node.entry) {
      total += 1;
    }

    if (node.children.length > 0) {
      total += countBranchTreeEntries(node.children);
    }
  }

  return total;
}

function filterBranchTree(
  nodes: BranchTreeNode[],
  normalizedFilter: string
): { count: number; nodes: BranchTreeNode[] } {
  if (normalizedFilter.length === 0) {
    return {
      count: countBranchTreeEntries(nodes),
      nodes,
    };
  }

  let count = 0;
  const filteredNodes = nodes.flatMap((node) => {
    const filteredChildren = filterBranchTree(node.children, normalizedFilter);
    const matchesSelf =
      node.fullPath.toLowerCase().includes(normalizedFilter) ||
      node.entry?.searchName.includes(normalizedFilter) === true;

    if (!matchesSelf && filteredChildren.count === 0) {
      return [];
    }

    if (node.entry) {
      count += 1;
    } else {
      count += filteredChildren.count;
    }

    return {
      ...node,
      children: filteredChildren.nodes,
    };
  });

  return {
    count,
    nodes: filteredNodes,
  };
}

export function buildRepoInfoSidebarGroups(
  input: BuildRepoInfoSidebarGroupsInput
): BuildRepoInfoSidebarGroupsResult {
  const { branches, normalizedSidebarFilter, stashes } = input;
  const localEntries: SidebarEntry[] = [];
  const remoteEntries: SidebarEntry[] = [];
  const stashEntries: SidebarEntry[] = stashes.map((stash) => {
    const label = formatStashLabel(stash);

    return {
      name: label,
      searchName: label.toLowerCase(),
      stashMessage: stash.message,
      stashRef: stash.ref,
      type: "stash",
    };
  });
  const tagEntries: SidebarEntry[] = [];

  for (const branch of branches) {
    if (branch.refType === "tag") {
      tagEntries.push({
        active: branch.isCurrent,
        name: branch.name,
        searchName: branch.name.toLowerCase(),
        type: "tag",
      });
      continue;
    }

    const branchEntry: SidebarEntry = {
      active: branch.isCurrent,
      isRemote: branch.isRemote,
      name: branch.name,
      pendingPushCount:
        (branch.aheadCount ?? 0) > 0 ? branch.aheadCount : undefined,
      pendingSyncCount:
        (branch.behindCount ?? 0) > 0 ? branch.behindCount : undefined,
      searchName: branch.name.toLowerCase(),
      type: "branch",
    };

    if (branch.isRemote) {
      remoteEntries.push(branchEntry);
      continue;
    }

    localEntries.push(branchEntry);
  }

  const sidebarGroups: SidebarGroupItem[] = [
    {
      count: localEntries.length,
      entries: localEntries,
      key: "local",
      name: "LOCAL",
      treeNodes: buildBranchTree(localEntries),
    },
    {
      count: remoteEntries.length,
      entries: remoteEntries,
      key: "remote",
      name: "REMOTE",
      treeNodes: buildBranchTree(remoteEntries),
    },
    {
      count: stashEntries.length,
      entries: stashEntries,
      key: "stashes",
      name: "STASHES",
    },
    {
      count: tagEntries.length,
      entries: tagEntries,
      key: "tags",
      name: "TAGS",
    },
  ];

  const filteredSidebarGroups =
    normalizedSidebarFilter.length === 0
      ? sidebarGroups
      : sidebarGroups.map((group) => {
          const entries = group.entries.filter((entry) =>
            entry.searchName.includes(normalizedSidebarFilter)
          );
          const filteredTree = group.treeNodes
            ? filterBranchTree(group.treeNodes, normalizedSidebarFilter)
            : null;

          return {
            ...group,
            count: filteredTree ? filteredTree.count : entries.length,
            entries,
            treeNodes: filteredTree?.nodes,
          };
        });
  const filteredSidebarEntryCount = filteredSidebarGroups.reduce(
    (total, group) => total + group.count,
    0
  );

  return {
    filteredSidebarEntryCount,
    filteredSidebarGroups,
  };
}
