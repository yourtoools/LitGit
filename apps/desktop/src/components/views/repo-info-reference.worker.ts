import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";
import {
  buildRepoInfoReferenceModel,
  type BuildRepoInfoReferenceModelInput,
  type RepoInfoReferenceModel,
} from "@/components/views/repo-info-reference-model";

registerWorkerHandler<BuildRepoInfoReferenceModelInput, RepoInfoReferenceModel>(
  (payload) => buildRepoInfoReferenceModel(payload)
);

export {};
