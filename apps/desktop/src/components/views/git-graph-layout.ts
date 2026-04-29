import { type Edge, type Node, Position } from "@xyflow/react";
import type {
  RepositoryCommit,
  RepositoryCommitGraphPayload,
  RepositoryCommitSyncState,
} from "@/stores/repo/repo-store-types";

export type GitTimelineRowType = "commit" | "stash" | "tag" | "wip";

export interface GitTimelineRow {
  anchorCommitHash?: string;
  author?: string;
  authorAvatarUrl?: string | null;
  commitHash?: string;
  id: string;
  label?: string;
  syncState?: RepositoryCommitSyncState;
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
const LANE_OFFSET_X = 8;
const LANE_SPACING_X = 16;
const GIT_NODE_SIZE_BY_TYPE: Record<GitTimelineRowType, number> = {
  commit: 28,
  stash: 28,
  tag: 28,
  wip: 28,
};
const DEFAULT_ROW_HEIGHT = 48;
const NODE_OPTICAL_VERTICAL_OFFSET = -1;
const DEFAULT_DASH_PATTERN = "4 3";
const REF_ROW_LANE_OFFSET = 2;

function resolveGraphWidth(maxLane: number): number {
  const graphWidth =
    LANE_OFFSET_X + (maxLane + REF_ROW_LANE_OFFSET) * LANE_SPACING_X + 28 + 18;

  return Math.max(MIN_TIMELINE_GRAPH_COLUMN_WIDTH, graphWidth);
}

export function resolveGitTimelineNodeSize(type: GitTimelineRowType): number {
  return GIT_NODE_SIZE_BY_TYPE[type];
}

function getLaneColor(lane: number): string {
  return LANE_COLORS[Math.abs(lane) % LANE_COLORS.length] ?? "#00c8ff";
}

function resolveCommitLane(
  graph: RepositoryCommitGraphPayload,
  commitHash: string
): number {
  return graph.commitLanes[commitHash]?.lane ?? 0;
}

function resolveCommitLaneColor(
  graph: RepositoryCommitGraphPayload,
  commitHash: string
): string {
  return graph.commitLanes[commitHash]?.color ?? getLaneColor(0);
}

export function resolveGitGraphColumnWidth(
  graph: RepositoryCommitGraphPayload
): number {
  return Math.max(MIN_TIMELINE_GRAPH_COLUMN_WIDTH, graph.graphWidth);
}

export function projectVisibleGitGraph(
  commits: RepositoryCommit[],
  graph: RepositoryCommitGraphPayload
): RepositoryCommitGraphPayload {
  const graphHashes = Object.keys(graph.commitLanes);
  const visibleHashes = new Set(commits.map((commit) => commit.hash));

  if (
    commits.length === graphHashes.length &&
    graphHashes.every((hash) => visibleHashes.has(hash))
  ) {
    return graph;
  }

  if (commits.length === 0) {
    return {
      commitLanes: {},
      graphWidth: MIN_TIMELINE_GRAPH_COLUMN_WIDTH,
    };
  }

  const usedVisibleLanes = [
    ...new Set(commits.map((commit) => resolveCommitLane(graph, commit.hash))),
  ].sort((left, right) => left - right);
  const projectedLaneByOriginalLane = new Map(
    usedVisibleLanes.map((lane, index) => [lane, index])
  );
  const commitLanes = Object.fromEntries(
    commits.map((commit) => {
      const lane =
        projectedLaneByOriginalLane.get(
          resolveCommitLane(graph, commit.hash)
        ) ?? 0;

      return [
        commit.hash,
        {
          color: getLaneColor(lane),
          lane,
          parentLanes: commit.parentHashes
            .filter((parentHash) => visibleHashes.has(parentHash))
            .map(
              (parentHash) =>
                projectedLaneByOriginalLane.get(
                  resolveCommitLane(graph, parentHash)
                ) ?? 0
            ),
        },
      ];
    })
  );
  const maxLane = usedVisibleLanes.length > 0 ? usedVisibleLanes.length - 1 : 0;

  return {
    commitLanes,
    graphWidth: resolveGraphWidth(maxLane),
  };
}

function resolveGraphColumnStartX(branchColumnWidth: number): number {
  return GRID_HORIZONTAL_PADDING + branchColumnWidth;
}

export function getCommitLaneColor(
  graph: RepositoryCommitGraphPayload,
  commitHash: string
): string {
  return resolveCommitLaneColor(graph, commitHash);
}

function createNode(
  id: string,
  lane: number,
  rowIndex: number,
  rowHeight: number,
  branchColumnWidth: number,
  graphScaleX: number,
  isCompact: boolean,
  color: string,
  isSelected: boolean,
  type: GitTimelineRowType,
  syncState: RepositoryCommitSyncState | undefined,
  author: string,
  authorAvatarUrl: string | null,
  dashedStrokePattern?: string,
  dottedStrokePattern?: string
): Node {
  const size = resolveGitTimelineNodeSize(type);
  let nodeStrokePattern: string | undefined;

  if (type === "wip") {
    nodeStrokePattern = dashedStrokePattern;
  } else if (syncState === "pullable") {
    nodeStrokePattern = dottedStrokePattern;
  }

  const graphColumnStartX = resolveGraphColumnStartX(branchColumnWidth);
  const baseCenterX = graphColumnStartX + LANE_OFFSET_X + lane * LANE_SPACING_X;
  const centerX =
    graphColumnStartX + (baseCenterX - graphColumnStartX) * graphScaleX;
  const centerY =
    rowIndex * rowHeight + rowHeight / 2 + NODE_OPTICAL_VERTICAL_OFFSET;

  return {
    data: {
      author,
      authorAvatarUrl,
      color,
      dashedStrokePattern: nodeStrokePattern,
      isCompact,
      isSelected,
      syncState,
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
  graph: RepositoryCommitGraphPayload,
  selectedRowId: string | null,
  rowHeight: number = DEFAULT_ROW_HEIGHT,
  branchColumnWidth: number = TIMELINE_BRANCH_COLUMN_WIDTH,
  graphColumnWidth?: number,
  dashedStrokePattern?: string,
  dottedStrokePattern?: string
): GitGraphLayoutResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const commitByHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const rowIndexById = new Map(rows.map((row, index) => [row.id, index]));
  const rowIndexByCommitHash = new Map<string, number>();
  const nodeIdByRowId = new Map<string, string>();
  const rowLaneById = new Map<string, number>();
  const baseGraphWidth = resolveGitGraphColumnWidth(graph);
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

    const lane = resolveCommitLane(graph, rowCommitHash);
    const color = resolveCommitLaneColor(graph, rowCommitHash);
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
        branchColumnWidth,
        graphScaleX,
        isCompactGraph,
        color,
        selectedRowId === row.id,
        row.type,
        row.syncState,
        nodeAuthor,
        nodeAuthorAvatarUrl,
        dashedStrokePattern,
        dottedStrokePattern
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

      const color = resolveCommitLaneColor(graph, parentHash);
      const targetCommit = commitByHash.get(parentHash);
      const shouldUseDottedConnector =
        sourceCommit.syncState === "pullable" ||
        targetCommit?.syncState === "pullable";
      edges.push(
        createEdge(
          `graph-edge:${row.id}:${targetRow.id}`,
          sourceNodeId,
          targetNodeId,
          color,
          shouldUseDottedConnector,
          shouldUseDottedConnector ? dottedStrokePattern : dashedStrokePattern
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

    const lane = resolveCommitLane(graph, row.anchorCommitHash);
    const sourceLane = rowLaneById.get(row.id) ?? lane;
    const targetLane = rowLaneById.get(targetRow.id) ?? lane;
    edges.push(
      createEdge(
        `graph-edge:${row.id}:${targetRow.id}`,
        sourceNodeId,
        targetNodeId,
        resolveCommitLaneColor(graph, row.anchorCommitHash),
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

    const lane = resolveCommitLane(graph, row.anchorCommitHash);
    const sourceLane = rowLaneById.get(row.id) ?? lane;
    const targetLane = rowLaneById.get(targetRow.id) ?? lane;
    edges.push(
      createEdge(
        `graph-edge:${row.id}:${targetRow.id}`,
        sourceNodeId,
        targetNodeId,
        resolveCommitLaneColor(graph, row.anchorCommitHash),
        true,
        dashedStrokePattern,
        sourceLane === targetLane ? "default" : "smoothstep"
      )
    );
  }

  return { edges, nodes };
}
