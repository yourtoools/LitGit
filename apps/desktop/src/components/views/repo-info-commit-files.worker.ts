import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";
import {
  buildRepoInfoCommitFilesModel,
  type BuildRepoInfoCommitFilesModelInput,
  type BuildRepoInfoCommitFilesModelOutput,
} from "@/components/views/repo-info-commit-files-model";

registerWorkerHandler<
  BuildRepoInfoCommitFilesModelInput,
  BuildRepoInfoCommitFilesModelOutput
>((payload) => buildRepoInfoCommitFilesModel(payload));

export {};
