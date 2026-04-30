export interface WorkerRequestEnvelope<TInput> {
  id: number;
  payload: TInput;
}

export interface WorkerResponseEnvelope<TOutput> {
  error?: string;
  id: number;
  payload?: TOutput;
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
  requestTimeoutMs?: number;
}

const DEFAULT_WORKER_REQUEST_TIMEOUT_MS = 2500;

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
      timeoutId: ReturnType<typeof setTimeout>;
    }
  >();
  const timingLabel = options?.label?.trim();
  const requestTimeoutMs =
    options?.requestTimeoutMs ?? DEFAULT_WORKER_REQUEST_TIMEOUT_MS;

  worker.onmessage = (event: MessageEvent<WorkerResponseEnvelope<TOutput>>) => {
    const pending = pendingById.get(event.data.id);

    if (!pending) {
      return;
    }

    pendingById.delete(event.data.id);
    clearTimeout(pending.timeoutId);
    if (timingLabel) {
      recordWorkerTiming(timingLabel, performance.now() - pending.startedAt);
    }

    if (event.data.error) {
      pending.reject(new Error(event.data.error));
      return;
    }

    if (!("payload" in event.data)) {
      pending.reject(new Error("Worker response did not include a payload"));
      return;
    }

    pending.resolve(event.data.payload as TOutput);
  };

  const rejectPendingRequests = (error: Error) => {
    for (const pending of pendingById.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }

    pendingById.clear();
  };

  worker.onerror = (event) => {
    rejectPendingRequests(
      new Error(event.message || "Worker execution failed")
    );
  };

  worker.onmessageerror = () => {
    rejectPendingRequests(new Error("Worker response could not be cloned"));
  };

  return {
    dispose: () => {
      rejectPendingRequests(new Error("Worker client disposed"));
      worker.terminate();
    },
    run: (payload: TInput) =>
      new Promise<TOutput>((resolve, reject) => {
        const id = nextRequestId;
        nextRequestId += 1;
        const timeoutId = setTimeout(() => {
          const pending = pendingById.get(id);

          if (!pending) {
            return;
          }

          pendingById.delete(id);
          pending.reject(new Error("Worker request timed out"));
        }, requestTimeoutMs);

        pendingById.set(id, {
          reject,
          resolve,
          startedAt: performance.now(),
          timeoutId,
        });
        worker.postMessage({
          id,
          payload,
        } satisfies WorkerRequestEnvelope<TInput>);
      }),
  };
}
