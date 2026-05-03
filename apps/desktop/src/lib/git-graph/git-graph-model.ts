import type { GitTimelineRow } from "@/lib/git-graph/git-graph-layout";
import type { RepositoryCommit } from "@/stores/repo/repo-store-types";

export interface GitGraphEdgeSegment {
  color: string;
  fromColumn: number;
  id: string;
  toColumn: number;
}

export interface GitGraphRow {
  color: string;
  commitColumn: number;
  edgesToParent: GitGraphEdgeSegment[];
  id: string;
  row: GitTimelineRow;
  type: GitTimelineRow["type"];
}

export interface GitGraphRowsResult {
  maxColumns: number;
  rows: GitGraphRow[];
}

interface BuildGitGraphRowsInput {
  commits: Pick<RepositoryCommit, "hash" | "parentHashes">[];
  rows: GitTimelineRow[];
}

export interface GitGraphRenderRow {
  index: number;
  row: GitTimelineRow;
}

interface BuildGitGraphRenderRowsInput {
  rows: GitTimelineRow[];
  visibleEndIndex: number;
  visibleStartIndex: number;
}

interface VirtualTimelineRowIndex {
  index: number;
}

interface CollectVisibleGitTimelineRowsInput {
  rows: GitTimelineRow[];
  virtualRows: VirtualTimelineRowIndex[];
}

export const DEFAULT_GIT_GRAPH_COLOR = "#00c8ff";
export const GIT_GRAPH_COLUMN_PADDING_X = 8;
export const GIT_GRAPH_LANE_WIDTH = 16;
export const GIT_GRAPH_NODE_RADIUS = 5;
export const GIT_GRAPH_COMPACT_COLUMN_WIDTH = 64;

const MIN_GIT_GRAPH_COLUMN_WIDTH = 60;
const GIT_GRAPH_COLUMN_TRAILING_SPACE = 44;

const GRAPH_COLORS = [
  "#00c8ff",
  "#db00ff",
  "#1f7cff",
  "#00b170",
  "#ff8a00",
  "#ff2f7d",
  "#8b7bff",
  "#00b8b8",
] as const;

function getGraphColor(index: number): string {
  return (
    GRAPH_COLORS[Math.abs(index) % GRAPH_COLORS.length] ??
    DEFAULT_GIT_GRAPH_COLOR
  );
}

export function resolveGitGraphRowsWidth(maxColumns: number): number {
  return Math.max(
    MIN_GIT_GRAPH_COLUMN_WIDTH,
    maxColumns * GIT_GRAPH_LANE_WIDTH + GIT_GRAPH_COLUMN_TRAILING_SPACE
  );
}

export function buildGitGraphRenderRows(
  input: BuildGitGraphRenderRowsInput
): GitGraphRenderRow[] {
  const { rows, visibleEndIndex, visibleStartIndex } = input;

  if (rows.length === 0 || visibleEndIndex < 0 || visibleStartIndex < 0) {
    return [];
  }

  const startIndex = Math.max(0, visibleStartIndex - 1);
  const endIndex = Math.min(rows.length - 1, visibleEndIndex + 1);

  if (endIndex < startIndex) {
    return [];
  }

  return rows.slice(startIndex, endIndex + 1).map((row, offset) => ({
    index: startIndex + offset,
    row,
  }));
}

export function collectVisibleGitTimelineRows(
  input: CollectVisibleGitTimelineRowsInput
): GitTimelineRow[] {
  const visibleRows: GitTimelineRow[] = [];

  for (const virtualRow of input.virtualRows) {
    const row = input.rows[virtualRow.index];

    if (row) {
      visibleRows.push(row);
    }
  }

  return visibleRows;
}

function resolveActiveLane(
  activeLanes: Array<null | string>,
  commitHash: string
): number {
  const existingLane = activeLanes.indexOf(commitHash);

  if (existingLane >= 0) {
    return existingLane;
  }

  const emptyLane = activeLanes.indexOf(null);

  if (emptyLane >= 0) {
    activeLanes[emptyLane] = commitHash;
    return emptyLane;
  }

  activeLanes.push(commitHash);
  return activeLanes.length - 1;
}

function trimInactiveTail(activeLanes: Array<null | string>): void {
  while (activeLanes.length > 0 && activeLanes.at(-1) === null) {
    activeLanes.pop();
  }
}

function getOrCreateColorIndex(
  colorByHash: Map<string, number>,
  hash: string,
  fallback: number,
  nextColor: { value: number }
): number {
  const existingColor = colorByHash.get(hash);

  if (typeof existingColor === "number") {
    return existingColor;
  }

  const color = fallback >= 0 ? fallback : nextColor.value;

  if (fallback < 0) {
    nextColor.value += 1;
  }

  colorByHash.set(hash, color);
  return color;
}

function resolveReferenceColumn(
  activeLanes: Array<null | string>,
  anchorColumn: number
): number {
  const reusableColumn = activeLanes.findIndex(
    (laneHash, lane) => lane !== anchorColumn && laneHash === null
  );

  return reusableColumn >= 0 ? reusableColumn : activeLanes.length;
}

function buildPassThroughEdges({
  activeLanes,
  colorByHash,
  nextColor,
  rowId,
}: {
  activeLanes: Array<null | string>;
  colorByHash: Map<string, number>;
  nextColor: { value: number };
  rowId: string;
}): GitGraphEdgeSegment[] {
  return activeLanes.flatMap((laneHash, lane) => {
    if (!laneHash) {
      return [];
    }

    return [
      {
        color: getGraphColor(
          getOrCreateColorIndex(colorByHash, laneHash, -1, nextColor)
        ),
        fromColumn: lane,
        id: `${rowId}:pass:${lane}:${laneHash}`,
        toColumn: lane,
      },
    ];
  });
}

export function buildGitGraphRows(
  input: BuildGitGraphRowsInput
): GitGraphRowsResult {
  const { commits, rows: timelineRows } = input;
  const commitByHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const visibleCommitHashes = new Set(
    timelineRows
      .map((row) => row.commitHash ?? null)
      .filter((hash): hash is string => hash !== null)
  );
  const activeLanes: Array<null | string> = [];
  const colorByHash = new Map<string, number>();
  const nextColor = { value: 0 };
  const graphRows: GitGraphRow[] = [];
  let maxColumns = 0;

  for (const row of timelineRows) {
    if (row.type !== "commit") {
      const anchorHash = row.anchorCommitHash;

      if (!(anchorHash && visibleCommitHashes.has(anchorHash))) {
        continue;
      }

      const anchorColumn = resolveActiveLane(activeLanes, anchorHash);
      const referenceColumn = resolveReferenceColumn(activeLanes, anchorColumn);
      const referenceColor = getGraphColor(
        getOrCreateColorIndex(colorByHash, row.id, -1, nextColor)
      );
      const edgesToParent = buildPassThroughEdges({
        activeLanes,
        colorByHash,
        nextColor,
        rowId: row.id,
      });

      edgesToParent.push({
        color: referenceColor,
        fromColumn: referenceColumn,
        id: `${row.id}:reference:${anchorHash}:${referenceColumn}:${anchorColumn}`,
        toColumn: anchorColumn,
      });

      maxColumns = Math.max(
        maxColumns,
        activeLanes.length,
        referenceColumn + 1
      );
      graphRows.push({
        color: referenceColor,
        commitColumn: referenceColumn,
        edgesToParent,
        id: row.id,
        row,
        type: row.type,
      });
      continue;
    }

    if (!row.commitHash) {
      continue;
    }

    const commit = commitByHash.get(row.commitHash);

    if (!commit) {
      continue;
    }

    const commitColumn = resolveActiveLane(activeLanes, commit.hash);
    const commitColor = getOrCreateColorIndex(
      colorByHash,
      commit.hash,
      -1,
      nextColor
    );
    const edgesToParent = buildPassThroughEdges({
      activeLanes,
      colorByHash,
      nextColor,
      rowId: row.id,
    }).filter((edge) => edge.fromColumn !== commitColumn);

    if (commit.parentHashes.length === 0) {
      activeLanes[commitColumn] = null;
    }

    for (const [parentIndex, parentHash] of commit.parentHashes.entries()) {
      if (!visibleCommitHashes.has(parentHash)) {
        continue;
      }

      const parentColor = getOrCreateColorIndex(
        colorByHash,
        parentHash,
        parentIndex === 0 ? commitColor : -1,
        nextColor
      );
      const existingParentLane = activeLanes.indexOf(parentHash);
      let parentColumn = existingParentLane;

      if (existingParentLane >= 0) {
        if (parentIndex === 0) {
          activeLanes[commitColumn] = null;
        }
      } else if (parentIndex === 0) {
        activeLanes[commitColumn] = parentHash;
        parentColumn = commitColumn;
      } else {
        const emptyLane = activeLanes.indexOf(null);
        parentColumn = emptyLane >= 0 ? emptyLane : activeLanes.length;
        activeLanes[parentColumn] = parentHash;
      }

      edgesToParent.push({
        color: getGraphColor(parentColor),
        fromColumn: commitColumn,
        id: `${row.id}:parent:${parentHash}:${commitColumn}:${parentColumn}`,
        toColumn: parentColumn,
      });
    }

    maxColumns = Math.max(maxColumns, activeLanes.length, commitColumn + 1);
    graphRows.push({
      color: getGraphColor(commitColor),
      commitColumn,
      edgesToParent,
      id: row.id,
      row,
      type: row.type,
    });
    trimInactiveTail(activeLanes);
  }

  return {
    maxColumns: Math.max(maxColumns, 1),
    rows: graphRows,
  };
}
