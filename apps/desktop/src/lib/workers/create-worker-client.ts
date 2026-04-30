export interface WorkerRequestEnvelope<TInput> {
  id: number;
  payload: TInput;
}

export interface WorkerResponseEnvelope<TOutput> {
  id: number;
  payload: TOutput;
}

interface WorkerTimingStats {
  count: number;
  lastMs: number;
  maxMs: number;
  totalMs: number;
}

type WorkerProfilingGlobal = typeof globalThis & {
  __LITGIT_PROFILE_WORKERS__?: boolean;
  __LITGIT_WORKER_METRICS__?: Record<string, WorkerTimingStats>;
};

interface CreateWorkerClientOptions {
  label?: string;
}

function recordWorkerTiming(label: string, durationMs: number) {
  const profilingGlobal = globalThis as WorkerProfilingGlobal;

  if (profilingGlobal.__LITGIT_PROFILE_WORKERS__ !== true) {
    return;
  }

  const metrics = profilingGlobal.__LITGIT_WORKER_METRICS__ ?? {};
  const current = metrics[label] ?? {
    count: 0,
    lastMs: 0,
    maxMs: 0,
    totalMs: 0,
  };

  metrics[label] = {
    count: current.count + 1,
    lastMs: durationMs,
    maxMs: Math.max(current.maxMs, durationMs),
    totalMs: current.totalMs + durationMs,
  };

  profilingGlobal.__LITGIT_WORKER_METRICS__ = metrics;
}

export function createWorkerClient<TInput, TOutput>(
  factory: () => Worker,
  options?: CreateWorkerClientOptions
) {
  let nextRequestId = 0;
  const worker = factory();
  const pendingById = new Map<
    number,
    {
      reject: (error: Error) => void;
      resolve: (payload: TOutput) => void;
      startedAt: number;
    }
  >();
  const timingLabel = options?.label?.trim();

  worker.onmessage = (event: MessageEvent<WorkerResponseEnvelope<TOutput>>) => {
    const pending = pendingById.get(event.data.id);

    if (!pending) {
      return;
    }

    pendingById.delete(event.data.id);
    if (timingLabel) {
      recordWorkerTiming(timingLabel, performance.now() - pending.startedAt);
    }
    pending.resolve(event.data.payload);
  };

  worker.onerror = (event) => {
    const error = new Error(event.message || "Worker execution failed");

    for (const pending of pendingById.values()) {
      pending.reject(error);
    }

    pendingById.clear();
  };

  return {
    dispose: () => {
      for (const pending of pendingById.values()) {
        pending.reject(new Error("Worker client disposed"));
      }

      pendingById.clear();
      worker.terminate();
    },
    run: (payload: TInput) =>
      new Promise<TOutput>((resolve, reject) => {
        const id = nextRequestId;
        nextRequestId += 1;
        pendingById.set(id, { reject, resolve, startedAt: performance.now() });
        worker.postMessage({
          id,
          payload,
        } satisfies WorkerRequestEnvelope<TInput>);
      }),
  };
}
