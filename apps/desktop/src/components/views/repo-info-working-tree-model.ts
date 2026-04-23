import type { RepoFileBrowserSortOrder } from "@/stores/preferences/preferences-store-types";
import type { RepositoryWorkingTreeItem } from "@/stores/repo/repo-store-types";
import {
  buildChangeTree,
  type ChangeTreeNode,
} from "@/components/views/repo-info-tree-utils";

export interface BuildRepoInfoWorkingTreeModelInput {
  sortOrder: RepoFileBrowserSortOrder;
  stagedItems: RepositoryWorkingTreeItem[];
  unstagedItems: RepositoryWorkingTreeItem[];
}

export interface BuildRepoInfoWorkingTreeModelOutput {
  stagedTree: ChangeTreeNode[];
  unstagedTree: ChangeTreeNode[];
}

export function buildRepoInfoWorkingTreeModel(
  input: BuildRepoInfoWorkingTreeModelInput
): BuildRepoInfoWorkingTreeModelOutput {
  const { sortOrder, stagedItems, unstagedItems } = input;

  return {
    stagedTree: buildChangeTree(stagedItems, sortOrder),
    unstagedTree: buildChangeTree(unstagedItems, sortOrder),
  };
}
