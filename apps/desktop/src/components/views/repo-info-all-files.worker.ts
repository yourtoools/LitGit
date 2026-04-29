import {
  type BuildRepoInfoAllFilesModelInput,
  type BuildRepoInfoAllFilesModelOutput,
  buildRepoInfoAllFilesModel,
} from "@/components/views/repo-info-all-files-model";
import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";

registerWorkerHandler<
  BuildRepoInfoAllFilesModelInput,
  BuildRepoInfoAllFilesModelOutput
>((payload) => buildRepoInfoAllFilesModel(payload));
