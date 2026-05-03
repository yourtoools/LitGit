import type { GitTimelineRow } from "@/components/views/git-graph-layout";
import {
  type BuildRepoInfoCommitFilesModelInput,
  type BuildRepoInfoCommitFilesModelOutput,
  buildRepoInfoCommitFilesModel,
} from "@/components/views/repo-info-commit-files-model";
import {
  type BuildRepoInfoAllFilesModelInput,
  type BuildRepoInfoAllFilesModelOutput,
  type BuildRepoInfoWorkingTreeModelInput,
  type BuildRepoInfoWorkingTreeModelOutput,
  buildRepoInfoAllFilesModel,
  buildRepoInfoWorkingTreeModel,
} from "@/components/views/repo-info-file-tree-model";
import {
  type BuildRepoInfoReferenceModelInput,
  buildRepoInfoReferenceModel,
  type RepoInfoReferenceModel,
} from "@/components/views/repo-info-reference-model";
import {
  type BuildRepoInfoSidebarGroupsInput,
  type BuildRepoInfoSidebarGroupsResult,
  buildRepoInfoSidebarGroups,
} from "@/components/views/repo-info-sidebar-model";
import {
  type BuildRepoInfoTimelineRowsInput,
  buildRepoInfoTimelineRows,
} from "@/components/views/repo-info-timeline-model";
import {
  type BuildRepoInfoVisibleCountsModelInput,
  type BuildRepoInfoVisibleCountsModelOutput,
  buildRepoInfoVisibleCountsModel,
} from "@/components/views/repo-info-visible-counts-model";
import {
  type BuildRepoInfoVisibleGraphModelInput,
  type BuildRepoInfoVisibleGraphModelOutput,
  buildRepoInfoVisibleGraphModel,
} from "@/components/views/repo-info-visible-graph-model";

export interface RepoInfoWorkerTaskMap {
  allFiles: {
    input: BuildRepoInfoAllFilesModelInput;
    output: BuildRepoInfoAllFilesModelOutput;
  };
  commitFiles: {
    input: BuildRepoInfoCommitFilesModelInput;
    output: BuildRepoInfoCommitFilesModelOutput;
  };
  reference: {
    input: BuildRepoInfoReferenceModelInput;
    output: RepoInfoReferenceModel;
  };
  sidebar: {
    input: BuildRepoInfoSidebarGroupsInput;
    output: BuildRepoInfoSidebarGroupsResult;
  };
  timeline: {
    input: BuildRepoInfoTimelineRowsInput;
    output: GitTimelineRow[];
  };
  visibleCounts: {
    input: BuildRepoInfoVisibleCountsModelInput;
    output: BuildRepoInfoVisibleCountsModelOutput;
  };
  visibleGraph: {
    input: BuildRepoInfoVisibleGraphModelInput;
    output: BuildRepoInfoVisibleGraphModelOutput;
  };
  workingTree: {
    input: BuildRepoInfoWorkingTreeModelInput;
    output: BuildRepoInfoWorkingTreeModelOutput;
  };
}

type RepoInfoWorkerTaskType = keyof RepoInfoWorkerTaskMap;

export type RepoInfoWorkerRequest<
  TType extends RepoInfoWorkerTaskType = RepoInfoWorkerTaskType,
> = {
  [Key in TType]: {
    payload: RepoInfoWorkerTaskMap[Key]["input"];
    type: Key;
  };
}[TType];

export type RepoInfoWorkerResponse<
  TType extends RepoInfoWorkerTaskType = RepoInfoWorkerTaskType,
> = {
  [Key in TType]: {
    payload: RepoInfoWorkerTaskMap[Key]["output"];
    type: Key;
  };
}[TType];

export function resolveRepoInfoWorkerRequest(
  request: RepoInfoWorkerRequest
): RepoInfoWorkerResponse {
  switch (request.type) {
    case "allFiles":
      return {
        payload: buildRepoInfoAllFilesModel(request.payload),
        type: request.type,
      };
    case "commitFiles":
      return {
        payload: buildRepoInfoCommitFilesModel(request.payload),
        type: request.type,
      };
    case "reference":
      return {
        payload: buildRepoInfoReferenceModel(request.payload),
        type: request.type,
      };
    case "sidebar":
      return {
        payload: buildRepoInfoSidebarGroups(request.payload),
        type: request.type,
      };
    case "timeline":
      return {
        payload: buildRepoInfoTimelineRows(request.payload),
        type: request.type,
      };
    case "visibleCounts":
      return {
        payload: buildRepoInfoVisibleCountsModel(request.payload),
        type: request.type,
      };
    case "visibleGraph":
      return {
        payload: buildRepoInfoVisibleGraphModel(request.payload),
        type: request.type,
      };
    case "workingTree":
      return {
        payload: buildRepoInfoWorkingTreeModel(request.payload),
        type: request.type,
      };
    default: {
      const exhaustiveRequest: never = request;
      throw new Error(
        `Unsupported repo-info worker request: ${exhaustiveRequest}`
      );
    }
  }
}
