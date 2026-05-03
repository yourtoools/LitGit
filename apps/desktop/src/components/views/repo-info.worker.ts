import {
  type RepoInfoWorkerRequest,
  type RepoInfoWorkerResponse,
  resolveRepoInfoWorkerRequest,
} from "@/components/views/repo-info-worker-contract";
import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";

registerWorkerHandler<RepoInfoWorkerRequest, RepoInfoWorkerResponse>(
  resolveRepoInfoWorkerRequest
);
