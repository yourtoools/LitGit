import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";
import {
  computeGitGraphOverlayLayout,
  type ComputeGitGraphOverlayLayoutInput,
  type ComputeGitGraphOverlayLayoutResult,
} from "@/components/views/git-graph-overlay-layout";

registerWorkerHandler<
  ComputeGitGraphOverlayLayoutInput,
  ComputeGitGraphOverlayLayoutResult
>((payload) => computeGitGraphOverlayLayout(payload));

export {};
