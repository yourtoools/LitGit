import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";
import {
  buildRepoInfoVisibleCountsModel,
  type BuildRepoInfoVisibleCountsModelInput,
  type BuildRepoInfoVisibleCountsModelOutput,
} from "@/components/views/repo-info-visible-counts-model";

registerWorkerHandler<
  BuildRepoInfoVisibleCountsModelInput,
  BuildRepoInfoVisibleCountsModelOutput
>((payload) => buildRepoInfoVisibleCountsModel(payload));

export {};
