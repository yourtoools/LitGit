import {
  type MarkdownBlock,
  parseMarkdownBlocks,
} from "@/components/views/repo-info/diff-workspace-markdown-preview-parser";
import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";

interface MarkdownPreviewWorkerInput {
  markdown: string;
}

interface MarkdownPreviewWorkerOutput {
  blocks: MarkdownBlock[];
}

registerWorkerHandler<MarkdownPreviewWorkerInput, MarkdownPreviewWorkerOutput>(
  (payload) => ({
    blocks: parseMarkdownBlocks(payload.markdown),
  })
);
