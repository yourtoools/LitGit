import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@litgit/ui/components/avatar";
import {
  ContextMenu,
  ContextMenuTrigger,
} from "@litgit/ui/components/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { StackSimpleIcon } from "@phosphor-icons/react";
import { type ReactNode, useMemo } from "react";
import type { GitTimelineRow } from "@/components/views/git-graph-layout";
import type {
  GitGraphEdgeSegment,
  GitGraphRenderRow,
  GitGraphRow,
  GitGraphRowsResult,
} from "@/components/views/git-graph-model";
import {
  GIT_GRAPH_COLUMN_PADDING_X,
  GIT_GRAPH_COMPACT_COLUMN_WIDTH,
  GIT_GRAPH_LANE_WIDTH,
  GIT_GRAPH_NODE_RADIUS,
} from "@/components/views/git-graph-model";

const EDGE_WIDTH = 2.5;

interface GitGraphOverlayProps {
  branchColumnWidth?: number;
  getNodeContextMenu?: (row: GitTimelineRow) => ReactNode;
  graphColumnWidth: number;
  graphRows: GitGraphRowsResult;
  onNodeHoverChange?: (rowId: string | null) => void;
  onNodeMenuOpenChange?: (rowId: string, open: boolean) => void;
  onNodeSelect?: (row: GitTimelineRow) => void;
  rowHeight: number;
  rows: GitGraphRenderRow[];
  selectedRowId: string | null;
  topOffset?: number;
  visibleStartIndex: number;
}

function resolveLaneX(column: number, graphColumnWidth: number): number {
  if (graphColumnWidth <= GIT_GRAPH_COMPACT_COLUMN_WIDTH) {
    return GIT_GRAPH_COLUMN_PADDING_X + GIT_GRAPH_LANE_WIDTH / 2;
  }

  return (
    GIT_GRAPH_COLUMN_PADDING_X +
    column * GIT_GRAPH_LANE_WIDTH +
    GIT_GRAPH_LANE_WIDTH / 2
  );
}

function resolveEdgePath(
  edge: GitGraphEdgeSegment,
  rowHeight: number,
  graphColumnWidth: number
): string {
  const fromX = resolveLaneX(edge.fromColumn, graphColumnWidth);
  const toX = resolveLaneX(edge.toColumn, graphColumnWidth);
  const centerY = rowHeight / 2;
  const bottomY = rowHeight;

  if (fromX === toX) {
    return `M ${fromX} ${centerY} L ${toX} ${bottomY}`;
  }

  return [
    `M ${fromX} ${centerY}`,
    `C ${fromX} ${bottomY}, ${toX} ${centerY}, ${toX} ${bottomY}`,
  ].join(" ");
}

function GitGraphCell({
  graphColumnWidth,
  graphRow,
  isSelected,
  previousGraphRow,
  rowHeight,
}: {
  graphColumnWidth: number;
  graphRow: GitGraphRow;
  isSelected: boolean;
  previousGraphRow: GitGraphRow | null;
  rowHeight: number;
}) {
  const centerX = resolveLaneX(graphRow.commitColumn, graphColumnWidth);
  const centerY = rowHeight / 2;
  const isReference = graphRow.type === "tag";
  const shouldDrawNode = graphRow.type === "tag";

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0"
      height={rowHeight}
      width={graphColumnWidth}
    >
      <title>Git graph row</title>
      {previousGraphRow?.edgesToParent.map((edge) => {
        const x = resolveLaneX(edge.toColumn, graphColumnWidth);

        return (
          <path
            d={`M ${x} 0 L ${x} ${centerY}`}
            fill="none"
            key={`${edge.id}:incoming`}
            stroke={edge.color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={EDGE_WIDTH}
          />
        );
      })}
      {graphRow.edgesToParent.map((edge) => (
        <path
          d={resolveEdgePath(edge, rowHeight, graphColumnWidth)}
          fill="none"
          key={edge.id}
          stroke={edge.color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={EDGE_WIDTH}
        />
      ))}
      {shouldDrawNode ? (
        <circle
          cx={centerX}
          cy={centerY}
          fill={isReference ? "var(--background)" : graphRow.color}
          r={GIT_GRAPH_NODE_RADIUS}
          stroke={graphRow.color}
          strokeDasharray={isReference ? "3 3" : undefined}
          strokeWidth={isSelected ? 3 : 2}
        />
      ) : null}
      {isSelected ? (
        <circle
          cx={centerX}
          cy={centerY}
          fill="none"
          r={GIT_GRAPH_NODE_RADIUS + 5}
          stroke={graphRow.color}
          strokeOpacity={0.28}
          strokeWidth={4}
        />
      ) : null}
    </svg>
  );
}

export function GitGraphOverlay({
  branchColumnWidth,
  graphColumnWidth,
  graphRows,
  onNodeMenuOpenChange,
  onNodeHoverChange,
  onNodeSelect,
  getNodeContextMenu,
  rowHeight,
  rows,
  selectedRowId,
  topOffset = 0,
  visibleStartIndex,
}: GitGraphOverlayProps) {
  const graphRowById = useMemo(
    () => new Map(graphRows.rows.map((row) => [row.id, row])),
    [graphRows.rows]
  );
  const graphRowIndexById = useMemo(
    () => new Map(graphRows.rows.map((row, index) => [row.id, index])),
    [graphRows.rows]
  );
  const rowById = useMemo(
    () => new Map(rows.map((entry) => [entry.row.id, entry.row])),
    [rows]
  );
  const graphColumnStartX =
    (branchColumnWidth ?? 0) + GIT_GRAPH_COLUMN_PADDING_X;
  const graphHeight = Math.max(rowHeight * rows.length, rowHeight);

  return (
    <div
      className="pointer-events-none absolute right-0 left-0 z-20"
      style={{ height: graphHeight, top: topOffset }}
    >
      {rows.map(({ index, row }) => {
        const graphRow = graphRowById.get(row.id);

        if (!graphRow) {
          return null;
        }

        const target = rowById.get(row.id);

        if (!target) {
          return null;
        }

        const graphRowIndex = graphRowIndexById.get(graphRow.id) ?? 0;
        const previousGraphRow = graphRows.rows[graphRowIndex - 1] ?? null;
        const localRowIndex = index - visibleStartIndex;
        const nodeX =
          graphColumnStartX +
          resolveLaneX(graphRow.commitColumn, graphColumnWidth) -
          GIT_GRAPH_NODE_RADIUS * 2;
        const nodeY =
          localRowIndex * rowHeight + rowHeight / 2 - GIT_GRAPH_NODE_RADIUS * 2;
        const graphCellTop = localRowIndex * rowHeight;
        const nodeSize =
          graphRow.type === "stash"
            ? GIT_GRAPH_NODE_RADIUS * 3
            : GIT_GRAPH_NODE_RADIUS * 4;
        const nodeVisualX =
          resolveLaneX(graphRow.commitColumn, graphColumnWidth) - nodeSize / 2;
        const nodeVisualY = rowHeight / 2 - nodeSize / 2;
        const fallbackLabel = (target.author ?? target.label ?? "?")
          .trim()
          .slice(0, 2)
          .toUpperCase();
        const nodeTooltipLabel =
          target.type === "commit"
            ? [
                target.label ?? "Commit",
                target.author ? `Author: ${target.author}` : null,
                target.commitHash ? `SHA: ${target.commitHash}` : null,
              ]
                .filter(Boolean)
                .join("\n")
            : (target.label ?? target.id);

        return (
          <div
            className="absolute"
            key={graphRow.id}
            style={{
              height: rowHeight,
              left: graphColumnStartX,
              top: graphCellTop,
              width: graphColumnWidth,
            }}
          >
            <GitGraphCell
              graphColumnWidth={graphColumnWidth}
              graphRow={graphRow}
              isSelected={selectedRowId === graphRow.id}
              previousGraphRow={previousGraphRow}
              rowHeight={rowHeight}
            />
            {graphRow.type === "commit" ? (
              <Avatar
                aria-hidden
                className="pointer-events-none absolute z-20 border bg-background shadow-sm"
                style={{
                  borderColor: graphRow.color,
                  height: nodeSize,
                  left: nodeVisualX,
                  top: nodeVisualY,
                  width: nodeSize,
                }}
              >
                {target.authorAvatarUrl ? (
                  <AvatarImage alt="" src={target.authorAvatarUrl} />
                ) : null}
                <AvatarFallback className="bg-background text-[8px]">
                  {fallbackLabel}
                </AvatarFallback>
              </Avatar>
            ) : null}
            {graphRow.type === "stash" ? (
              <span
                aria-hidden
                className="pointer-events-none absolute z-20 inline-flex items-center justify-center rounded-[3px] border bg-background shadow-sm"
                style={{
                  borderColor: graphRow.color,
                  color: graphRow.color,
                  height: nodeSize,
                  left: nodeVisualX,
                  top: nodeVisualY,
                  width: nodeSize,
                }}
              >
                <StackSimpleIcon className="size-2.5" />
              </span>
            ) : null}
            {getNodeContextMenu ? (
              <ContextMenu
                onOpenChange={(open) => {
                  onNodeMenuOpenChange?.(target.id, open);
                }}
              >
                <ContextMenuTrigger>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          aria-label={`Open actions for ${
                            target.label ?? target.commitHash ?? target.id
                          }`}
                          className="pointer-events-auto absolute z-30 cursor-context-menu rounded-full bg-transparent"
                          onClick={() => {
                            onNodeSelect?.(target);
                          }}
                          onMouseEnter={() => {
                            onNodeHoverChange?.(target.id);
                          }}
                          onMouseLeave={() => {
                            onNodeHoverChange?.(null);
                          }}
                          style={{
                            height: GIT_GRAPH_NODE_RADIUS * 4,
                            left: nodeX - graphColumnStartX,
                            top: nodeY - graphCellTop,
                            width: GIT_GRAPH_NODE_RADIUS * 4,
                          }}
                          type="button"
                        />
                      }
                    />
                    <TooltipContent
                      className="max-w-sm whitespace-pre-wrap text-left"
                      side="right"
                    >
                      {nodeTooltipLabel}
                    </TooltipContent>
                  </Tooltip>
                </ContextMenuTrigger>
                {getNodeContextMenu(target)}
              </ContextMenu>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
