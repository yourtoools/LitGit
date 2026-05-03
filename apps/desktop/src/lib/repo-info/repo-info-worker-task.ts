import type {
  RepoInfoWorkerRequest,
  RepoInfoWorkerResponse,
  RepoInfoWorkerTaskMap,
} from "@/lib/repo-info/repo-info-worker-contract";
import { runWorkerTask } from "@/lib/workers/run-worker-task";

type RepoInfoWorkerTaskType = keyof RepoInfoWorkerTaskMap;

interface RepoInfoWorkerClient {
  run: (payload: RepoInfoWorkerRequest) => Promise<RepoInfoWorkerResponse>;
  runLatest?: (
    key: string,
    payload: RepoInfoWorkerRequest
  ) => Promise<RepoInfoWorkerResponse>;
}

interface RunRepoInfoWorkerTaskOptions<TType extends RepoInfoWorkerTaskType> {
  client: RepoInfoWorkerClient | null;
  computeSync: (
    payload: RepoInfoWorkerTaskMap[TType]["input"]
  ) => RepoInfoWorkerTaskMap[TType]["output"];
  latestKey?: string;
  payload: RepoInfoWorkerTaskMap[TType]["input"];
  type: TType;
}

export async function runRepoInfoWorkerTask<
  TType extends RepoInfoWorkerTaskType,
>({
  client,
  computeSync,
  latestKey,
  payload,
  type,
}: RunRepoInfoWorkerTaskOptions<TType>): Promise<
  RepoInfoWorkerTaskMap[TType]["output"]
> {
  const response = await runWorkerTask(
    client,
    { payload, type } as RepoInfoWorkerRequest,
    () =>
      ({
        payload: computeSync(payload),
        type,
      }) as RepoInfoWorkerResponse,
    latestKey ? { latestKey } : undefined
  );

  if (response.type !== type) {
    throw new Error(`Unexpected repo-info worker response: ${response.type}`);
  }

  return response.payload as RepoInfoWorkerTaskMap[TType]["output"];
}
