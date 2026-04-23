import {
  ContextMenu,
  ContextMenuTrigger,
} from "@litgit/ui/components/context-menu";
import { ReactFlow } from "@xyflow/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  type ComputeGitGraphOverlayLayoutInput,
  computeGitGraphOverlayLayout,
} from "@/components/views/git-graph-overlay-layout";
import { type GitTimelineRow } from "@/components/views/git-graph-layout";
import { GitNode } from "@/components/views/git-node";
import { createWorkerClient } from "@/lib/workers/create-worker-client";
import { runWorkerTask } from "@/lib/workers/run-worker-task";
import type {
  RepositoryCommit,
  RepositoryCommitGraphPayload,
} from "@/stores/repo/repo-store-types";

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
const EMPTY_COMPUTED_LAYOUT = {
  hitTargets: [],
  layout: {
    edges: [],
    nodes: [],
  },
} satisfies ReturnType<typeof computeGitGraphOverlayLayout>;

interface GitGraphOverlayProps {
  branchColumnWidth?: number;
  commits: RepositoryCommit[];
  graph: RepositoryCommitGraphPayload;
  graphColumnWidth: number;
  onNodeMenuOpenChange?: (rowId: string, open: boolean) => void;
  onNodeSelect?: (row: GitTimelineRow) => void;
  renderNodeContextMenu?: (row: GitTimelineRow) => ReactNode;
  rowHeight: number;
  rows: GitTimelineRow[];
  selectedRowId: string | null;
  topOffset?: number;
}

export function GitGraphOverlay({
  branchColumnWidth,
  commits,
  graph,
  graphColumnWidth,
  onNodeMenuOpenChange,
  onNodeSelect,
  renderNodeContextMenu,
  rowHeight,
  rows,
  selectedRowId,
  topOffset = 0,
}: GitGraphOverlayProps) {
  const layoutInput = useMemo<ComputeGitGraphOverlayLayoutInput>(
    () => ({
      branchColumnWidth,
      commits,
      dottedStrokePattern: DOTTED_EDGE_PATTERN,
      graph,
      graphColumnWidth,
      rowHeight,
      rows,
      selectedRowId,
    }),
    [branchColumnWidth, commits, graph, graphColumnWidth, rowHeight, rows, selectedRowId]
  );
  const workerClientRef = useRef<ReturnType<
    typeof createWorkerClient<
      ComputeGitGraphOverlayLayoutInput,
      ReturnType<typeof computeGitGraphOverlayLayout>
    >
  > | null>(null);
  const [computedLayout, setComputedLayout] = useState<
    ReturnType<typeof computeGitGraphOverlayLayout>
  >(EMPTY_COMPUTED_LAYOUT);

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return;
    }

    try {
      const client = createWorkerClient<
        ComputeGitGraphOverlayLayoutInput,
        ReturnType<typeof computeGitGraphOverlayLayout>
      >(
        () =>
          new Worker(new URL("./git-graph-overlay.worker.ts", import.meta.url), {
            type: "module",
          }),
        { label: "git-graph-overlay" }
      );
      workerClientRef.current = client;

      return () => {
        workerClientRef.current = null;
        client.dispose();
      };
    } catch {
      workerClientRef.current = null;
      return;
    }
  }, []);

  useEffect(() => {
    const workerClient = workerClientRef.current;
    let cancelled = false;

    runWorkerTask(workerClient, layoutInput, computeGitGraphOverlayLayout)
      .then((result) => {
        if (!cancelled) {
          setComputedLayout(result);
        }
      }, () => undefined);

    return () => {
      cancelled = true;
    };
  }, [layoutInput]);

  const graphHeight = Math.max(rowHeight * rows.length, rowHeight);
  const rowById = useMemo(
    () => new Map(rows.map((row) => [row.id, row])),
    [rows]
  );

  return (
    <div
      className="pointer-events-none absolute right-0 left-0 z-20"
      style={{ height: graphHeight, top: topOffset }}
    >
      <ReactFlow
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        edges={computedLayout.layout.edges}
        elementsSelectable={false}
        fitView={false}
        maxZoom={1}
        minZoom={1}
        nodes={computedLayout.layout.nodes}
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
        ? computedLayout.hitTargets.map((target) => {
            const row = rowById.get(target.rowId);

            if (!row) {
              return null;
            }

            return (
              <ContextMenu
                key={target.id}
                onOpenChange={(open) => {
                  onNodeMenuOpenChange?.(row.id, open);
                }}
              >
                <ContextMenuTrigger>
                  <button
                    aria-label={target.ariaLabel}
                    className="pointer-events-auto absolute z-30 cursor-context-menu rounded-full bg-transparent"
                    onClick={() => {
                      onNodeSelect?.(row);
                    }}
                    style={{
                      height: target.size,
                      left: target.x,
                      top: target.y,
                      width: target.size,
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
