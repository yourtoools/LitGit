import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";
import {
  buildRepoInfoTimelineRows,
  type BuildRepoInfoTimelineRowsInput,
} from "@/components/views/repo-info-timeline-model";
import type { GitTimelineRow } from "@/components/views/git-graph-layout";

registerWorkerHandler<BuildRepoInfoTimelineRowsInput, GitTimelineRow[]>(
  (payload) => buildRepoInfoTimelineRows(payload)
);

export {};
