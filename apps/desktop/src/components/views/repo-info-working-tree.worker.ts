import {
  type BuildRepoInfoWorkingTreeModelInput,
  type BuildRepoInfoWorkingTreeModelOutput,
  buildRepoInfoWorkingTreeModel,
} from "@/components/views/repo-info-working-tree-model";
import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";

registerWorkerHandler<
  BuildRepoInfoWorkingTreeModelInput,
  BuildRepoInfoWorkingTreeModelOutput
>((payload) => buildRepoInfoWorkingTreeModel(payload));
