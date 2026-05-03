import { useEffect, useState } from "react";
import type { BranchTreeNode } from "@/lib/repo-info/repo-info-sidebar-model";
import type {
  ChangeTreeNode,
  CommitFileTreeNode,
} from "@/lib/repo-info/repo-info-tree-utils";

interface ProgressiveRenderOptions {
  chunkSize?: number;
  initialCount?: number;
}

export interface RenderBudget {
  remaining: number;
}

export function createRenderBudget(limit: number): RenderBudget {
  return { remaining: limit };
}

export function useProgressiveRenderLimit(
  totalCount: number,
  resetKeys: readonly unknown[],
  options?: ProgressiveRenderOptions
) {
  const chunkSize = options?.chunkSize ?? 200;
  const initialCount = options?.initialCount ?? 200;
  const [limit, setLimit] = useState(() => Math.min(totalCount, initialCount));

  useEffect(() => {
    setLimit(Math.min(totalCount, initialCount));
  }, [initialCount, totalCount, ...resetKeys]);

  useEffect(() => {
    if (limit >= totalCount) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setLimit((current) => Math.min(totalCount, current + chunkSize));
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [chunkSize, limit, totalCount]);

  return limit;
}

export function countVisibleChangeTreeNodes(
  nodes: ChangeTreeNode[],
  expandedTreeNodePaths: Record<string, boolean>,
  section: "all" | "staged" | "unstaged",
  depth = 0
): number {
  let count = 0;

  for (const node of nodes) {
    count += 1;

    if (node.item || node.children.size === 0) {
      continue;
    }

    const nodeStateKey = `${section}:${node.fullPath}`;
    const isExpanded = expandedTreeNodePaths[nodeStateKey] ?? depth < 1;

    if (isExpanded) {
      count += countVisibleChangeTreeNodes(
        Array.from(node.children.values()),
        expandedTreeNodePaths,
        section,
        depth + 1
      );
    }
  }

  return count;
}

export function countVisibleCommitTreeNodes(
  nodes: CommitFileTreeNode[],
  expandedCommitTreeNodePaths: Record<string, boolean>,
  commitHash: string,
  depth = 0
): number {
  let count = 0;

  for (const node of nodes) {
    count += 1;

    if (node.file || node.children.size === 0) {
      continue;
    }

    const nodeStateKey = `${commitHash}:${node.fullPath}`;
    const isExpanded = expandedCommitTreeNodePaths[nodeStateKey] ?? depth < 1;

    if (isExpanded) {
      count += countVisibleCommitTreeNodes(
        Array.from(node.children.values()),
        expandedCommitTreeNodePaths,
        commitHash,
        depth + 1
      );
    }
  }

  return count;
}

export function countVisibleSidebarBranchTreeNodes(
  groupKey: string,
  nodes: BranchTreeNode[],
  collapsedBranchFolderKeys: Record<string, boolean>,
  depth = 0
): number {
  let count = 0;

  for (const node of nodes) {
    count += 1;

    if (node.entry || node.children.length === 0) {
      continue;
    }

    const folderStateKey = `${groupKey}:${node.fullPath}`;
    const isCollapsed = collapsedBranchFolderKeys[folderStateKey] ?? depth > 0;

    if (!isCollapsed) {
      count += countVisibleSidebarBranchTreeNodes(
        groupKey,
        node.children,
        collapsedBranchFolderKeys,
        depth + 1
      );
    }
  }

  return count;
}
