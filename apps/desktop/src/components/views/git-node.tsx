import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@litgit/ui/components/avatar";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import {
  type GitTimelineRowType,
  resolveGitTimelineNodeSize,
} from "@/components/views/git-graph-layout";

interface GitNodeData {
  author: string;
  authorAvatarUrl: string | null;
  color: string;
  dashedStrokePattern?: string;
  isCompact: boolean;
  isSelected: boolean;
  type: GitTimelineRowType;
}

const WHITESPACE_SPLIT_PATTERN = /\s+/;

export function GitNode({ data }: NodeProps) {
  const nodeData = data as unknown as GitNodeData;
  const size = resolveGitTimelineNodeSize(nodeData.type);
  const isWipNode = nodeData.type === "wip";
  const dashPattern = isWipNode ? nodeData.dashedStrokePattern : undefined;
  const initials = nodeData.author
    .split(WHITESPACE_SPLIT_PATTERN)
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="relative flex items-center justify-center rounded-full"
      style={{
        boxShadow: `0 0 0 1px ${nodeData.color}55`,
        backgroundColor: "#ffffff",
        height: size,
        width: size,
      }}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10"
        height={size}
        width={size}
      >
        <title>Timeline node border</title>
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={(size - 2) / 2}
          stroke={nodeData.color}
          strokeDasharray={dashPattern}
          strokeWidth={2}
        />
      </svg>
      <Handle
        className="!border-none !bg-transparent"
        position={Position.Top}
        style={{ height: 1, left: "50%", top: -0.5, width: 1 }}
        type="target"
      />
      <Handle
        className="!border-none !bg-transparent"
        position={Position.Bottom}
        style={{ bottom: -0.5, height: 1, left: "50%", width: 1 }}
        type="source"
      />
      <Avatar style={{ height: size - 4, width: size - 4, zIndex: 30 }}>
        <AvatarImage
          alt={nodeData.author}
          height={size - 4}
          src={nodeData.authorAvatarUrl ?? ""}
          width={size - 4}
        />
        <AvatarFallback
          className="rounded-full"
          style={{
            fontSize: size * 0.35,
            fontWeight: 600,
          }}
        >
          {initials || "?"}
        </AvatarFallback>
      </Avatar>
    </div>
  );
}
