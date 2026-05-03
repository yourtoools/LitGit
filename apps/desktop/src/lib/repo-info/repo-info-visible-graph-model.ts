import type { GitTimelineRow } from "@/lib/git-graph/git-graph-layout";
import {
  buildGitGraphRows,
  DEFAULT_GIT_GRAPH_COLOR,
  type GitGraphRowsResult,
  resolveGitGraphRowsWidth,
} from "@/lib/git-graph/git-graph-model";
import type { RepositoryCommitSyncState } from "@/stores/repo/repo-store-types";

interface GraphLayoutCommitInput {
  hash: string;
  parentHashes: string[];
}

interface GraphLayoutTimelineRowInput {
  anchorCommitHash?: string;
  author?: string;
  authorAvatarUrl?: string | null;
  commitHash?: string;
  id: string;
  label?: string;
  syncState?: RepositoryCommitSyncState;
  type: GitTimelineRow["type"];
}

export interface BuildRepoInfoVisibleGraphModelInput {
  localHeadCommitHash: string | null;
  timelineCommits: GraphLayoutCommitInput[];
  timelineRows: GraphLayoutTimelineRowInput[];
}

export interface BuildRepoInfoVisibleGraphModelOutput {
  commitColorByHash: Record<string, string>;
  currentBranchLaneColor: string;
  graphRows: GitGraphRowsResult;
  graphWidth: number;
  rowColorById: Record<string, string>;
}

export function buildRepoInfoVisibleGraphModel(
  input: BuildRepoInfoVisibleGraphModelInput
): BuildRepoInfoVisibleGraphModelOutput {
  const graphRows = buildGitGraphRows({
    commits: input.timelineCommits,
    rows: input.timelineRows,
  });
  const rowColorById: Record<string, string> = {};
  const commitColorByHash: Record<string, string> = {};

  for (const graphRow of graphRows.rows) {
    rowColorById[graphRow.id] = graphRow.color;

    if (graphRow.row.commitHash) {
      commitColorByHash[graphRow.row.commitHash] = graphRow.color;
    }
  }

  return {
    commitColorByHash,
    currentBranchLaneColor:
      (input.localHeadCommitHash
        ? commitColorByHash[input.localHeadCommitHash]
        : undefined) ?? DEFAULT_GIT_GRAPH_COLOR,
    graphRows,
    graphWidth: resolveGitGraphRowsWidth(graphRows.maxColumns),
    rowColorById,
  };
}
