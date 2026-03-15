import { type Edge, type Node, Position } from "@xyflow/react";
import type { RepositoryCommit } from "@/stores/repo/repo-store-types";

export type GitTimelineRowType = "commit" | "stash" | "tag" | "wip";

export interface GitTimelineRow {
  anchorCommitHash?: string;
  author?: string;
  authorAvatarUrl?: string | null;
  commitHash?: string;
  id: string;
  label?: string;
  type: GitTimelineRowType;
}

export interface GitGraphLayoutResult {
  edges: Edge[];
  nodes: Node[];
}

const LANE_COLORS = [
  "#00c8ff",
  "#db00ff",
  "#1f7cff",
  "#00b170",
  "#ff8a00",
  "#ff2f7d",
  "#8b7bff",
  "#00b8b8",
] as const;

const GRID_HORIZONTAL_PADDING = 12;
export const TIMELINE_BRANCH_COLUMN_WIDTH = 180;
export const MIN_TIMELINE_GRAPH_COLUMN_WIDTH = 60;
const GRAPH_COLUMN_START_X =
  GRID_HORIZONTAL_PADDING + TIMELINE_BRANCH_COLUMN_WIDTH;
const LANE_OFFSET_X = 8;
const LANE_SPACING_X = 16;
const GIT_NODE_SIZE_BY_TYPE: Record<GitTimelineRowType, number> = {
  commit: 28,
  stash: 28,
  tag: 28,
  wip: 28,
};
const MAX_NODE_SIZE = 28;
const DEFAULT_ROW_HEIGHT = 48;
const NODE_OPTICAL_VERTICAL_OFFSET = -1;
const DEFAULT_DASH_PATTERN = "4 3";
const REF_ROW_LANE_OFFSET = 2;

export function resolveGitTimelineNodeSize(type: GitTimelineRowType): number {
  return GIT_NODE_SIZE_BY_TYPE[type];
}

function getLaneColor(lane: number): string {
  return LANE_COLORS[Math.abs(lane) % LANE_COLORS.length] ?? "#00c8ff";
}

function getLowestUnusedLane(usedLanes: Set<number>): number {
  let lane = 0;

  while (usedLanes.has(lane)) {
    lane += 1;
  }

  return lane;
}

function buildCommitLaneMap(commits: RepositoryCommit[]): Map<string, number> {
  const commitHashSet = new Set(commits.map((commit) => commit.hash));
  const laneByHash = new Map<string, number>();

  for (const commit of commits) {
    if (!laneByHash.has(commit.hash)) {
      const usedLanes = new Set(laneByHash.values());
      laneByHash.set(commit.hash, getLowestUnusedLane(usedLanes));
    }

    const commitLane = laneByHash.get(commit.hash) ?? 0;
    const [primaryParentHash, ...mergeParentHashes] = commit.parentHashes;

    if (
      primaryParentHash &&
      commitHashSet.has(primaryParentHash) &&
      !laneByHash.has(primaryParentHash)
    ) {
      laneByHash.set(primaryParentHash, commitLane);
    }

    for (const mergeParentHash of mergeParentHashes) {
      if (
        !commitHashSet.has(mergeParentHash) ||
        laneByHash.has(mergeParentHash)
      ) {
        continue;
      }

      const usedLanes = new Set(laneByHash.values());
      laneByHash.set(mergeParentHash, getLowestUnusedLane(usedLanes));
    }
  }

  return laneByHash;
}

export function resolveGitGraphColumnWidth(
  commits: RepositoryCommit[]
): number {
  const laneByHash = buildCommitLaneMap(commits);
  const lanes = [...laneByHash.values()];
  const maxLane = lanes.length === 0 ? 0 : Math.max(...lanes);
  const maxLaneCenterOffset =
    LANE_OFFSET_X + (maxLane + REF_ROW_LANE_OFFSET) * LANE_SPACING_X;
  const horizontalSafetyMargin = 18;
  const graphWidth =
    maxLaneCenterOffset + MAX_NODE_SIZE + horizontalSafetyMargin;

  return Math.max(MIN_TIMELINE_GRAPH_COLUMN_WIDTH, graphWidth);
}

export function getCommitLaneColor(
  commits: RepositoryCommit[],
  commitHash: string
): string {
  const laneByHash = buildCommitLaneMap(commits);
  const lane = laneByHash.get(commitHash) ?? 0;
  return getLaneColor(lane);
}

function createNode(
  id: string,
  lane: number,
  rowIndex: number,
  rowHeight: number,
  graphScaleX: number,
  isCompact: boolean,
  color: string,
  isSelected: boolean,
  type: GitTimelineRowType,
  author: string,
  authorAvatarUrl: string | null,
  dashedStrokePattern?: string
): Node {
  const size = resolveGitTimelineNodeSize(type);
  const baseCenterX =
    GRAPH_COLUMN_START_X + LANE_OFFSET_X + lane * LANE_SPACING_X;
  const centerX =
    GRAPH_COLUMN_START_X + (baseCenterX - GRAPH_COLUMN_START_X) * graphScaleX;
  const centerY =
    rowIndex * rowHeight + rowHeight / 2 + NODE_OPTICAL_VERTICAL_OFFSET;

  return {
    data: {
      author,
      authorAvatarUrl,
      color,
      dashedStrokePattern: type === "wip" ? dashedStrokePattern : undefined,
      isCompact,
      isSelected,
      type,
    },
    draggable: false,
    id,
    position: {
      x: centerX - size / 2,
      y: centerY - size / 2,
    },
    selectable: false,
    sourcePosition: Position.Bottom,
    type: "gitNode",
  };
}

function createEdge(
  id: string,
  sourceId: string,
  targetId: string,
  color: string,
  isDashed: boolean,
  dashedStrokePattern?: string,
  edgeType: Edge["type"] = "default"
): Edge {
  return {
    animated: false,
    id,
    selectable: false,
    source: sourceId,
    style: {
      stroke: color,
      strokeDasharray: isDashed
        ? (dashedStrokePattern ?? DEFAULT_DASH_PATTERN)
        : undefined,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 2,
    },
    target: targetId,
    type: edgeType,
  };
}

export function buildGitGraphLayout(
  rows: GitTimelineRow[],
  commits: RepositoryCommit[],
  selectedRowId: string | null,
  rowHeight: number = DEFAULT_ROW_HEIGHT,
  graphColumnWidth?: number,
  dashedStrokePattern?: string
): GitGraphLayoutResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const commitByHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const rowIndexById = new Map(rows.map((row, index) => [row.id, index]));
  const rowIndexByCommitHash = new Map<string, number>();
  const nodeIdByRowId = new Map<string, string>();
  const laneByHash = buildCommitLaneMap(commits);
  const rowLaneById = new Map<string, number>();
  const baseGraphWidth = resolveGitGraphColumnWidth(commits);
  const targetGraphWidth = graphColumnWidth ?? baseGraphWidth;
  const graphScaleX =
    baseGraphWidth > 0 ? targetGraphWidth / baseGraphWidth : 1;
  const isCompactGraph = targetGraphWidth <= 64;
  const compactAnchorLane = 0;

  for (const [rowIndex, row] of rows.entries()) {
    if (row.type === "commit" && row.commitHash) {
      rowIndexByCommitHash.set(row.commitHash, rowIndex);
    }
  }

  for (const row of rows) {
    const rowIndex = rowIndexById.get(row.id);

    if (typeof rowIndex !== "number") {
      continue;
    }

    const rowCommitHash = row.commitHash ?? row.anchorCommitHash;

    if (!rowCommitHash) {
      continue;
    }

    const lane = laneByHash.get(rowCommitHash) ?? 0;
    const color = getLaneColor(lane);
    const isReferenceRow = row.type === "stash" || row.type === "tag";
    const referenceLaneOffset = isReferenceRow ? REF_ROW_LANE_OFFSET : 0;
    const positionedLane = isCompactGraph
      ? compactAnchorLane
      : lane + referenceLaneOffset;
    const nodeId = `graph-node:${row.id}`;
    const commit = commitByHash.get(rowCommitHash);
    const nodeAuthor = row.author ?? commit?.author ?? "";
    const nodeAuthorAvatarUrl =
      row.authorAvatarUrl ?? commit?.authorAvatarUrl ?? null;
    nodeIdByRowId.set(row.id, nodeId);
    rowLaneById.set(row.id, positionedLane);
    nodes.push(
      createNode(
        nodeId,
        positionedLane,
        rowIndex,
        rowHeight,
        graphScaleX,
        isCompactGraph,
        color,
        selectedRowId === row.id,
        row.type,
        nodeAuthor,
        nodeAuthorAvatarUrl,
        dashedStrokePattern
      )
    );
  }

  for (const row of rows) {
    if (!(row.type === "commit" && row.commitHash)) {
      continue;
    }

    const sourceNodeId = nodeIdByRowId.get(row.id);
    const sourceCommit = commitByHash.get(row.commitHash);

    if (!(sourceNodeId && sourceCommit)) {
      continue;
    }

    const sourceLane = laneByHash.get(row.commitHash) ?? 0;

    const parentHashes = isCompactGraph
      ? sourceCommit.parentHashes.slice(0, 1)
      : sourceCommit.parentHashes;

    for (const parentHash of parentHashes) {
      const parentRowIndex = rowIndexByCommitHash.get(parentHash);

      if (typeof parentRowIndex !== "number") {
        continue;
      }

      const targetRow = rows[parentRowIndex];

      if (!targetRow) {
        continue;
      }

      const targetNodeId = nodeIdByRowId.get(targetRow.id);

      if (!targetNodeId) {
        continue;
      }

      const parentLane = laneByHash.get(parentHash) ?? sourceLane;
      const color = getLaneColor(parentLane);
      edges.push(
        createEdge(
          `graph-edge:${row.id}:${targetRow.id}`,
          sourceNodeId,
          targetNodeId,
          color,
          false,
          dashedStrokePattern
        )
      );
    }
  }

  for (const row of rows) {
    if (!(row.type === "wip" && row.anchorCommitHash)) {
      continue;
    }

    const targetRowIndex = rowIndexByCommitHash.get(row.anchorCommitHash);

    if (typeof targetRowIndex !== "number") {
      continue;
    }

    const targetRow = rows[targetRowIndex];

    if (!targetRow) {
      continue;
    }

    const sourceNodeId = nodeIdByRowId.get(row.id);
    const targetNodeId = nodeIdByRowId.get(targetRow.id);

    if (!(sourceNodeId && targetNodeId)) {
      continue;
    }

    const lane = laneByHash.get(row.anchorCommitHash) ?? 0;
    const sourceLane = rowLaneById.get(row.id) ?? lane;
    const targetLane = rowLaneById.get(targetRow.id) ?? lane;
    edges.push(
      createEdge(
        `graph-edge:${row.id}:${targetRow.id}`,
        sourceNodeId,
        targetNodeId,
        getLaneColor(lane),
        true,
        dashedStrokePattern,
        sourceLane === targetLane ? "default" : "smoothstep"
      )
    );
  }

  for (const row of rows) {
    if (
      !((row.type === "stash" || row.type === "tag") && row.anchorCommitHash)
    ) {
      continue;
    }

    const targetRowIndex = rowIndexByCommitHash.get(row.anchorCommitHash);

    if (typeof targetRowIndex !== "number") {
      continue;
    }

    const targetRow = rows[targetRowIndex];

    if (!targetRow) {
      continue;
    }

    const sourceNodeId = nodeIdByRowId.get(row.id);
    const targetNodeId = nodeIdByRowId.get(targetRow.id);

    if (!(sourceNodeId && targetNodeId)) {
      continue;
    }

    const lane = laneByHash.get(row.anchorCommitHash) ?? 0;
    const sourceLane = rowLaneById.get(row.id) ?? lane;
    const targetLane = rowLaneById.get(targetRow.id) ?? lane;
    edges.push(
      createEdge(
        `graph-edge:${row.id}:${targetRow.id}`,
        sourceNodeId,
        targetNodeId,
        getLaneColor(lane),
        true,
        dashedStrokePattern,
        sourceLane === targetLane ? "default" : "smoothstep"
      )
    );
  }

  return { edges, nodes };
}
