import {
  type BuildRepoInfoVisibleCountsModelInput,
  type BuildRepoInfoVisibleCountsModelOutput,
  buildRepoInfoVisibleCountsModel,
} from "@/components/views/repo-info-visible-counts-model";
import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";

registerWorkerHandler<
  BuildRepoInfoVisibleCountsModelInput,
  BuildRepoInfoVisibleCountsModelOutput
>((payload) => buildRepoInfoVisibleCountsModel(payload));
