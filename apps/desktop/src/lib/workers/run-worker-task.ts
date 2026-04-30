type MaybePromise<T> = Promise<T> | T;

interface WorkerTaskRunner<TInput, TOutput> {
  run: (payload: TInput) => Promise<TOutput>;
}

export async function runWorkerTask<TInput, TOutput>(
  workerClient: WorkerTaskRunner<TInput, TOutput> | null,
  payload: TInput,
  computeSync: (payload: TInput) => MaybePromise<TOutput>
): Promise<TOutput> {
  if (!workerClient) {
    return await computeSync(payload);
  }

  try {
    return await workerClient.run(payload);
  } catch {
    return await computeSync(payload);
  }
}
