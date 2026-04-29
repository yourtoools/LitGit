import {
  type BuildRepoInfoSidebarGroupsInput,
  type BuildRepoInfoSidebarGroupsResult,
  buildRepoInfoSidebarGroups,
} from "@/components/views/repo-info-sidebar-model";
import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";

registerWorkerHandler<
  BuildRepoInfoSidebarGroupsInput,
  BuildRepoInfoSidebarGroupsResult
>((payload) => buildRepoInfoSidebarGroups(payload));
