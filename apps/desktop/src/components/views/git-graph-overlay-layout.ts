import {
  buildGitGraphLayout,
  type GitGraphLayoutResult,
  type GitTimelineRow,
  resolveGitTimelineNodeSize,
} from "@/components/views/git-graph-layout";
import type {
  RepositoryCommit,
  RepositoryCommitGraphPayload,
} from "@/stores/repo/repo-store-types";

interface GitGraphOverlayLayoutHitTarget {
  ariaLabel: string;
  id: string;
  rowId: string;
  size: number;
  x: number;
  y: number;
}

export interface ComputeGitGraphOverlayLayoutInput {
  branchColumnWidth?: number;
  commits: RepositoryCommit[];
  dottedStrokePattern: string;
  graph: RepositoryCommitGraphPayload;
  graphColumnWidth: number;
  rowHeight: number;
  rows: GitTimelineRow[];
  selectedRowId: null | string;
}

export interface ComputeGitGraphOverlayLayoutResult {
  hitTargets: GitGraphOverlayLayoutHitTarget[];
  layout: GitGraphLayoutResult;
}

const DEFAULT_DASHED_STROKE_PATTERN = "4 3";

export function computeGitGraphOverlayLayout(
  input: ComputeGitGraphOverlayLayoutInput
): ComputeGitGraphOverlayLayoutResult {
  const {
    branchColumnWidth,
    commits,
    dottedStrokePattern,
    graph,
    graphColumnWidth,
    rowHeight,
    rows,
    selectedRowId,
  } = input;
  const layout = buildGitGraphLayout(
    rows,
    commits,
    graph,
    selectedRowId,
    rowHeight,
    branchColumnWidth,
    graphColumnWidth,
    DEFAULT_DASHED_STROKE_PATTERN,
    dottedStrokePattern
  );
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const hitTargets = layout.nodes.map((node) => {
    const rowId = node.id.replace("graph-node:", "");
    const row = rowById.get(rowId);
    const size = resolveGitTimelineNodeSize(row?.type ?? "commit");

    return {
      ariaLabel: `Open actions for ${row?.label ?? row?.commitHash ?? rowId}`,
      id: node.id,
      rowId,
      size,
      x: node.position.x,
      y: node.position.y,
    } satisfies GitGraphOverlayLayoutHitTarget;
  });

  return { hitTargets, layout };
}
