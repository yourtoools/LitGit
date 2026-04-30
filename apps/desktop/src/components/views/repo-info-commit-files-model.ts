import {
  buildCommitFileTree,
  type CommitFileTreeNode,
} from "@/components/views/repo-info-tree-utils";
import type { RepoFileBrowserSortOrder } from "@/stores/preferences/preferences-store-types";
import type {
  RepositoryCommitFile,
  RepositoryFileEntry,
} from "@/stores/repo/repo-store-types";

interface RepoInfoCommitFilesSummary {
  addedCount: number;
  modifiedCount: number;
  removedCount: number;
  totalCount: number;
}

export interface BuildRepoInfoCommitFilesModelInput {
  allRepositoryFiles: RepositoryFileEntry[];
  normalizedCommitFileFilter: string;
  selectedFiles: RepositoryCommitFile[];
  showAllCommitFiles: boolean;
  sortOrder: RepoFileBrowserSortOrder;
}

export interface BuildRepoInfoCommitFilesModelOutput {
  filteredFiles: RepositoryCommitFile[];
  sortedPathRows: RepositoryCommitFile[];
  summary: RepoInfoCommitFilesSummary;
  tree: CommitFileTreeNode[];
}

function createPlaceholderCommitFile(path: string): RepositoryCommitFile {
  return {
    additions: 0,
    deletions: 0,
    path,
    previousPath: null,
    status: " ",
  };
}

function summarizeSelectedFiles(
  selectedFiles: RepositoryCommitFile[]
): RepoInfoCommitFilesSummary {
  let addedCount = 0;
  let modifiedCount = 0;
  let removedCount = 0;

  for (const file of selectedFiles) {
    const status = file.status.charAt(0);

    if (status === "A") {
      addedCount += 1;
      continue;
    }

    if (status === "D") {
      removedCount += 1;
      continue;
    }

    modifiedCount += 1;
  }

  return {
    addedCount,
    modifiedCount,
    removedCount,
    totalCount: selectedFiles.length,
  };
}

export function buildRepoInfoCommitFilesModel(
  input: BuildRepoInfoCommitFilesModelInput
): BuildRepoInfoCommitFilesModelOutput {
  const {
    allRepositoryFiles,
    normalizedCommitFileFilter,
    selectedFiles,
    showAllCommitFiles,
    sortOrder,
  } = input;
  const selectedFileByPath = new Map(
    selectedFiles.map((file) => [file.path, file])
  );
  const viewFiles = showAllCommitFiles
    ? allRepositoryFiles.map(
        (file) =>
          selectedFileByPath.get(file.path) ??
          createPlaceholderCommitFile(file.path)
      )
    : selectedFiles;
  const filteredFiles =
    !showAllCommitFiles || normalizedCommitFileFilter.length === 0
      ? viewFiles
      : viewFiles.filter((file) =>
          file.path.toLowerCase().includes(normalizedCommitFileFilter)
        );
  const sortedPathRows = [...filteredFiles].sort((left, right) => {
    const comparison = left.path.localeCompare(right.path);
    return sortOrder === "asc" ? comparison : comparison * -1;
  });

  return {
    filteredFiles,
    sortedPathRows,
    summary: summarizeSelectedFiles(selectedFiles),
    tree: buildCommitFileTree(filteredFiles, sortOrder),
  };
}
