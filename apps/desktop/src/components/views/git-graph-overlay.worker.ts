import {
  type ComputeGitGraphOverlayLayoutInput,
  type ComputeGitGraphOverlayLayoutResult,
  computeGitGraphOverlayLayout,
} from "@/components/views/git-graph-overlay-layout";
import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";

registerWorkerHandler<
  ComputeGitGraphOverlayLayoutInput,
  ComputeGitGraphOverlayLayoutResult
>((payload) => computeGitGraphOverlayLayout(payload));
