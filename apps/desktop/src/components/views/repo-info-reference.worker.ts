import {
  type BuildRepoInfoReferenceModelInput,
  buildRepoInfoReferenceModel,
  type RepoInfoReferenceModel,
} from "@/components/views/repo-info-reference-model";
import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";

registerWorkerHandler<BuildRepoInfoReferenceModelInput, RepoInfoReferenceModel>(
  (payload) => buildRepoInfoReferenceModel(payload)
);
