import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";
import {
  buildRepoInfoWorkingTreeModel,
  type BuildRepoInfoWorkingTreeModelInput,
  type BuildRepoInfoWorkingTreeModelOutput,
} from "@/components/views/repo-info-working-tree-model";

registerWorkerHandler<
  BuildRepoInfoWorkingTreeModelInput,
  BuildRepoInfoWorkingTreeModelOutput
>((payload) => buildRepoInfoWorkingTreeModel(payload));

export {};
