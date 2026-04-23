import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";
import {
  buildRepoInfoVisibleGraphModel,
  type BuildRepoInfoVisibleGraphModelInput,
  type BuildRepoInfoVisibleGraphModelOutput,
} from "@/components/views/repo-info-visible-graph-model";

registerWorkerHandler<
  BuildRepoInfoVisibleGraphModelInput,
  BuildRepoInfoVisibleGraphModelOutput
>((payload) => buildRepoInfoVisibleGraphModel(payload));

export {};
