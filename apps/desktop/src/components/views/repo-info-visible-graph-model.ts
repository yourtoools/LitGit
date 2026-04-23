import {
  getCommitLaneColor,
  projectVisibleGitGraph,
} from "@/components/views/git-graph-layout";
import type {
  RepositoryCommit,
  RepositoryCommitGraphPayload,
} from "@/stores/repo/repo-store-types";

export interface BuildRepoInfoVisibleGraphModelInput {
  historyGraph: RepositoryCommitGraphPayload;
  localHeadCommitHash: string | null;
  timelineCommits: RepositoryCommit[];
}

export interface BuildRepoInfoVisibleGraphModelOutput {
  currentBranchLaneColor: string;
  visibleHistoryGraph: RepositoryCommitGraphPayload;
}

export function buildRepoInfoVisibleGraphModel(
  input: BuildRepoInfoVisibleGraphModelInput
): BuildRepoInfoVisibleGraphModelOutput {
  const visibleHistoryGraph = projectVisibleGitGraph(
    input.timelineCommits,
    input.historyGraph
  );

  return {
    currentBranchLaneColor: getCommitLaneColor(
      visibleHistoryGraph,
      input.localHeadCommitHash ?? ""
    ),
    visibleHistoryGraph,
  };
}
