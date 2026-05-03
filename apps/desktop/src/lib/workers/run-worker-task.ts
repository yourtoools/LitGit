import {
  isWorkerFallbackError,
  WorkerStaleRequestError,
} from "@/lib/workers/create-worker-client";

type MaybePromise<T> = Promise<T> | T;

interface WorkerTaskRunner<TInput, TOutput> {
  run: (payload: TInput) => Promise<TOutput>;
  runLatest?: (key: string, payload: TInput) => Promise<TOutput>;
}

interface RunWorkerTaskOptions {
  latestKey?: string;
}

export async function runWorkerTask<TInput, TOutput>(
  workerClient: WorkerTaskRunner<TInput, TOutput> | null,
  payload: TInput,
  computeSync: (payload: TInput) => MaybePromise<TOutput>,
  options?: RunWorkerTaskOptions
): Promise<TOutput> {
  if (!workerClient) {
    return await computeSync(payload);
  }

  try {
    if (options?.latestKey && workerClient.runLatest) {
      return await workerClient.runLatest(options.latestKey, payload);
    }

    return await workerClient.run(payload);
  } catch (error) {
    if (error instanceof WorkerStaleRequestError) {
      throw error;
    }

    if (isWorkerFallbackError(error)) {
      return await computeSync(payload);
    }

    throw error;
  }
}
