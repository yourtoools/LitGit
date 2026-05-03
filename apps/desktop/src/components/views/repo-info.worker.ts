import {
  type RepoInfoWorkerRequest,
  type RepoInfoWorkerResponse,
  resolveRepoInfoWorkerRequest,
} from "@/lib/repo-info/repo-info-worker-contract";
import { registerWorkerHandler } from "@/lib/workers/register-worker-handler";

registerWorkerHandler<RepoInfoWorkerRequest, RepoInfoWorkerResponse>(
  resolveRepoInfoWorkerRequest
);
