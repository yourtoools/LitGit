import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";
import {
  buildRepoInfoAllFilesModel,
  type BuildRepoInfoAllFilesModelInput,
  type BuildRepoInfoAllFilesModelOutput,
} from "@/components/views/repo-info-all-files-model";

registerWorkerHandler<
  BuildRepoInfoAllFilesModelInput,
  BuildRepoInfoAllFilesModelOutput
>((payload) => buildRepoInfoAllFilesModel(payload));

export {};
