import type { GitTimelineRow } from "@/components/views/git-graph-layout";
import {
  type BuildRepoInfoTimelineRowsInput,
  buildRepoInfoTimelineRows,
} from "@/components/views/repo-info-timeline-model";
import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";

registerWorkerHandler<BuildRepoInfoTimelineRowsInput, GitTimelineRow[]>(
  (payload) => buildRepoInfoTimelineRows(payload)
);
