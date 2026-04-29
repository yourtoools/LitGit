import {
  type BuildRepoInfoCommitFilesModelInput,
  type BuildRepoInfoCommitFilesModelOutput,
  buildRepoInfoCommitFilesModel,
} from "@/components/views/repo-info-commit-files-model";
import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";

registerWorkerHandler<
  BuildRepoInfoCommitFilesModelInput,
  BuildRepoInfoCommitFilesModelOutput
>((payload) => buildRepoInfoCommitFilesModel(payload));
