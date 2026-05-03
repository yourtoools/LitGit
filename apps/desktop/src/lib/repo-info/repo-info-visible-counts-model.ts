import {
  countVisibleChangeTreeNodes,
  countVisibleCommitTreeNodes,
  countVisibleSidebarBranchTreeNodes,
} from "@/lib/repo-info/repo-info-progressive-render";
import type { SidebarGroupItem } from "@/lib/repo-info/repo-info-sidebar-model";
import type {
  ChangeTreeNode,
  CommitFileTreeNode,
} from "@/lib/repo-info/repo-info-tree-utils";

export interface BuildRepoInfoVisibleCountsModelInput {
  allFilesTree: ChangeTreeNode[];
  changesViewMode: "path" | "tree";
  collapsedBranchFolderKeys: Record<string, boolean>;
  commitDetailsViewMode: "path" | "tree";
  expandedCommitTreeNodePaths: Record<string, boolean>;
  expandedTreeNodePaths: Record<string, boolean>;
  filteredSidebarGroups: SidebarGroupItem[];
  selectedCommitHash: string | null;
  selectedCommitTree: CommitFileTreeNode[];
  selectedReferenceRevision: string | null;
  selectedReferenceTree: CommitFileTreeNode[];
  sortedCommitPathRowsLength: number;
  sortedSelectedReferencePathRowsLength: number;
  stagedItemsLength: number;
  stagedTree: ChangeTreeNode[];
  unstagedItemsLength: number;
  unstagedTree: ChangeTreeNode[];
}

export interface BuildRepoInfoVisibleCountsModelOutput {
  allFilesVisibleNodeCount: number;
  selectedCommitVisibleNodeCount: number;
  selectedReferenceVisibleNodeCount: number;
  sidebarVisibleNodeCount: number;
  stagedVisibleNodeCount: number;
  unstagedVisibleNodeCount: number;
}

export function buildRepoInfoVisibleCountsModel(
  input: BuildRepoInfoVisibleCountsModelInput
): BuildRepoInfoVisibleCountsModelOutput {
  const sidebarVisibleNodeCount = input.filteredSidebarGroups.reduce(
    (total, group) => {
      if (group.treeNodes) {
        return (
          total +
          countVisibleSidebarBranchTreeNodes(
            group.key,
            group.treeNodes,
            input.collapsedBranchFolderKeys
          )
        );
      }

      return total + group.entries.length;
    },
    0
  );

  const allFilesVisibleNodeCount = countVisibleChangeTreeNodes(
    input.allFilesTree,
    input.expandedTreeNodePaths,
    "all"
  );

  const unstagedVisibleNodeCount =
    input.changesViewMode === "tree"
      ? countVisibleChangeTreeNodes(
          input.unstagedTree,
          input.expandedTreeNodePaths,
          "unstaged"
        )
      : input.unstagedItemsLength;

  const stagedVisibleNodeCount =
    input.changesViewMode === "tree"
      ? countVisibleChangeTreeNodes(
          input.stagedTree,
          input.expandedTreeNodePaths,
          "staged"
        )
      : input.stagedItemsLength;

  let selectedCommitVisibleNodeCount = 0;

  if (input.selectedCommitHash) {
    selectedCommitVisibleNodeCount =
      input.commitDetailsViewMode === "tree"
        ? countVisibleCommitTreeNodes(
            input.selectedCommitTree,
            input.expandedCommitTreeNodePaths,
            input.selectedCommitHash
          )
        : input.sortedCommitPathRowsLength;
  }

  let selectedReferenceVisibleNodeCount = 0;

  if (input.selectedReferenceRevision) {
    selectedReferenceVisibleNodeCount =
      input.commitDetailsViewMode === "tree"
        ? countVisibleCommitTreeNodes(
            input.selectedReferenceTree,
            input.expandedCommitTreeNodePaths,
            input.selectedReferenceRevision
          )
        : input.sortedSelectedReferencePathRowsLength;
  }

  return {
    allFilesVisibleNodeCount,
    selectedCommitVisibleNodeCount,
    selectedReferenceVisibleNodeCount,
    sidebarVisibleNodeCount,
    stagedVisibleNodeCount,
    unstagedVisibleNodeCount,
  };
}
