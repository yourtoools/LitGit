import type { RepoFileBrowserSortOrder } from "@/stores/preferences/preferences-store-types";
import type {
  RepositoryFileEntry,
  RepositoryWorkingTreeItem,
} from "@/stores/repo/repo-store-types";
import {
  buildRepositoryFileTree,
  type ChangeTreeNode,
} from "@/components/views/repo-info-tree-utils";

export interface BuildRepoInfoAllFilesModelInput {
  allRepositoryFiles: RepositoryFileEntry[];
  normalizedRepositoryFileFilter: string;
  sortOrder: RepoFileBrowserSortOrder;
  workingTreeItems: RepositoryWorkingTreeItem[];
}

export interface BuildRepoInfoAllFilesModelOutput {
  allFilesTree: ChangeTreeNode[];
  filteredRepositoryFiles: RepositoryFileEntry[];
}

export function buildRepoInfoAllFilesModel(
  input: BuildRepoInfoAllFilesModelInput
): BuildRepoInfoAllFilesModelOutput {
  const {
    allRepositoryFiles,
    normalizedRepositoryFileFilter,
    sortOrder,
    workingTreeItems,
  } = input;
  const filteredRepositoryFiles =
    normalizedRepositoryFileFilter.length === 0
      ? allRepositoryFiles
      : allRepositoryFiles.filter((file) =>
          file.path.toLowerCase().includes(normalizedRepositoryFileFilter)
        );
  const workingTreeItemByPath = new Map(
    workingTreeItems.map((item) => [item.path, item])
  );

  return {
    allFilesTree: buildRepositoryFileTree(
      filteredRepositoryFiles,
      workingTreeItemByPath,
      sortOrder
    ),
    filteredRepositoryFiles,
  };
}
