import { ReactFlow } from "@xyflow/react";
import { useMemo } from "react";
import {
  buildGitGraphLayout,
  type GitTimelineRow,
} from "@/components/views/git-graph-layout";
import { GitNode } from "@/components/views/git-node";
import type { RepositoryCommit } from "@/stores/repo/repo-store-types";

import "@xyflow/react/dist/style.css";

const nodeTypes = {
  gitNode: GitNode,
};

interface GitGraphOverlayProps {
  commits: RepositoryCommit[];
  graphColumnWidth: number;
  rowHeight: number;
  rows: GitTimelineRow[];
  selectedRowId: string | null;
}

export function GitGraphOverlay({
  commits,
  graphColumnWidth,
  rowHeight,
  rows,
  selectedRowId,
}: GitGraphOverlayProps) {
  const layout = useMemo(
    () =>
      buildGitGraphLayout(
        rows,
        commits,
        selectedRowId,
        rowHeight,
        graphColumnWidth
      ),
    [commits, graphColumnWidth, rowHeight, rows, selectedRowId]
  );
  const graphHeight = Math.max(rowHeight * rows.length, rowHeight);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 right-0 left-0 z-20"
      style={{ height: graphHeight }}
    >
      <ReactFlow
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
    </div>
  );
}
