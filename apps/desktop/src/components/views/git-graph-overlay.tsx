import {
  ContextMenu,
  ContextMenuTrigger,
} from "@litgit/ui/components/context-menu";
import { ReactFlow } from "@xyflow/react";
import { type ReactNode, useMemo } from "react";
import {
  buildGitGraphLayout,
  type GitTimelineRow,
  resolveGitTimelineNodeSize,
} from "@/components/views/git-graph-layout";
import { GitNode } from "@/components/views/git-node";
import type { RepositoryCommit } from "@/stores/repo/repo-store-types";

import "@xyflow/react/dist/style.css";

const nodeTypes = {
  gitNode: GitNode,
};

const DEFAULT_EDGE_OPTIONS = {
  style: {
    strokeDasharray: "4 3",
  },
} as const;
const DOTTED_EDGE_PATTERN = "1 5";

interface GitGraphOverlayProps {
  branchColumnWidth?: number;
  commits: RepositoryCommit[];
  graphColumnWidth: number;
  onNodeMenuOpenChange?: (rowId: string, open: boolean) => void;
  onNodeSelect?: (row: GitTimelineRow) => void;
  renderNodeContextMenu?: (row: GitTimelineRow) => ReactNode;
  rowHeight: number;
  rows: GitTimelineRow[];
  selectedRowId: string | null;
}

export function GitGraphOverlay({
  branchColumnWidth,
  commits,
  graphColumnWidth,
  onNodeMenuOpenChange,
  onNodeSelect,
  renderNodeContextMenu,
  rowHeight,
  rows,
  selectedRowId,
}: GitGraphOverlayProps) {
  const dashedStrokePattern = DEFAULT_EDGE_OPTIONS.style.strokeDasharray;

  const layout = useMemo(
    () =>
      buildGitGraphLayout(
        rows,
        commits,
        selectedRowId,
        rowHeight,
        branchColumnWidth,
        graphColumnWidth,
        dashedStrokePattern,
        DOTTED_EDGE_PATTERN
      ),
    [
      commits,
      branchColumnWidth,
      dashedStrokePattern,
      graphColumnWidth,
      rowHeight,
      rows,
      selectedRowId,
    ]
  );
  const graphHeight = Math.max(rowHeight * rows.length, rowHeight);
  const rowById = useMemo(
    () => new Map(rows.map((row) => [row.id, row])),
    [rows]
  );

  return (
    <div
      className="pointer-events-none absolute top-0 right-0 left-0 z-20"
      style={{ height: graphHeight }}
    >
      <ReactFlow
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        edges={layout.edges}
        elementsSelectable={false}
        fitView={false}
        maxZoom={1}
        minZoom={1}
        nodes={layout.nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        nodeTypes={nodeTypes}
        panOnDrag={false}
        panOnScroll={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        selectionOnDrag={false}
        zoomOnDoubleClick={false}
        zoomOnPinch={false}
        zoomOnScroll={false}
      />
      {renderNodeContextMenu
        ? layout.nodes.map((node) => {
            const rowId = node.id.replace("graph-node:", "");
            const row = rowById.get(rowId);

            if (!row) {
              return null;
            }

            const nodeSize = resolveGitTimelineNodeSize(row.type);

            return (
              <ContextMenu
                key={node.id}
                onOpenChange={(open) => {
                  onNodeMenuOpenChange?.(row.id, open);
                }}
              >
                <ContextMenuTrigger>
                  <button
                    aria-label={`Open actions for ${row.label ?? row.commitHash ?? row.id}`}
                    className="pointer-events-auto absolute z-30 cursor-context-menu rounded-full bg-transparent"
                    onClick={() => {
                      onNodeSelect?.(row);
                    }}
                    style={{
                      height: nodeSize,
                      left: node.position.x,
                      top: node.position.y,
                      width: nodeSize,
                    }}
                    type="button"
                  />
                </ContextMenuTrigger>
                {renderNodeContextMenu(row)}
              </ContextMenu>
            );
          })
        : null}
    </div>
  );
}
