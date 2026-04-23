import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";
import {
  buildRepoInfoSidebarGroups,
  type BuildRepoInfoSidebarGroupsInput,
  type BuildRepoInfoSidebarGroupsResult,
} from "@/components/views/repo-info-sidebar-model";

registerWorkerHandler<
  BuildRepoInfoSidebarGroupsInput,
  BuildRepoInfoSidebarGroupsResult
>((payload) => buildRepoInfoSidebarGroups(payload));

export {};
