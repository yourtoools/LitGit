import {
  type BuildRepoInfoVisibleGraphModelInput,
  type BuildRepoInfoVisibleGraphModelOutput,
  buildRepoInfoVisibleGraphModel,
} from "@/components/views/repo-info-visible-graph-model";
import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";

registerWorkerHandler<
  BuildRepoInfoVisibleGraphModelInput,
  BuildRepoInfoVisibleGraphModelOutput
>((payload) => buildRepoInfoVisibleGraphModel(payload));
