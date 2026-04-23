import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";
import {
  type MarkdownBlock,
  parseMarkdownBlocks,
} from "@/components/views/repo-info/diff-workspace-markdown-preview-parser";

type MarkdownPreviewWorkerInput = {
  markdown: string;
};

type MarkdownPreviewWorkerOutput = {
  blocks: MarkdownBlock[];
};

registerWorkerHandler<MarkdownPreviewWorkerInput, MarkdownPreviewWorkerOutput>(
  (payload) => ({
    blocks: parseMarkdownBlocks(payload.markdown),
  })
);

export {};
