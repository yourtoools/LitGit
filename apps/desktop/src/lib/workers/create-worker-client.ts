export interface WorkerRequestEnvelope<TInput> {
  id: number;
  payload: TInput;
}

export interface WorkerErrorPayload {
  code?: string;
  message: string;
  name: string;
  stack?: string;
}

export interface WorkerResponseEnvelope<TOutput> {
  error?: WorkerErrorPayload;
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

interface PendingWorkerRequest<TOutput> {
  key: string | null;
  reject: (error: Error) => void;
  resolve: (payload: TOutput) => void;
  startedAt: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

class WorkerClientUnavailableError extends Error {
  constructor(message = "Worker client unavailable") {
    super(message);
    this.name = "WorkerClientUnavailableError";
  }
}

class WorkerRequestTimeoutError extends Error {
  constructor(message = "Worker request timed out") {
    super(message);
    this.name = "WorkerRequestTimeoutError";
  }
}

class WorkerCloneError extends Error {
  constructor(message = "Worker message could not be cloned") {
    super(message);
    this.name = "WorkerCloneError";
  }
}

class WorkerExecutionError extends Error {
  constructor(message = "Worker execution failed") {
    super(message);
    this.name = "WorkerExecutionError";
  }
}

export class WorkerStaleRequestError extends Error {
  constructor(message = "Worker request superseded") {
    super(message);
    this.name = "WorkerStaleRequestError";
  }
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

function createWorkerExecutionError(payload: WorkerErrorPayload) {
  const error = new WorkerExecutionError(payload.message);
  error.name = payload.name || error.name;
  if (payload.stack) {
    error.stack = payload.stack;
  }
  return error;
}

export function isWorkerFallbackError(error: unknown) {
  return (
    error instanceof WorkerClientUnavailableError ||
    error instanceof WorkerCloneError
  );
}

export function createWorkerClient<TInput, TOutput>(
  factory: () => Worker,
  options?: CreateWorkerClientOptions
) {
  let nextRequestId = 0;
  const worker = factory();
  const pendingById = new Map<number, PendingWorkerRequest<TOutput>>();
  const pendingIdByKey = new Map<string, number>();
  const timingLabel = options?.label?.trim();
  const requestTimeoutMs =
    options?.requestTimeoutMs ?? DEFAULT_WORKER_REQUEST_TIMEOUT_MS;

  const rejectPendingRequest = (id: number, error: Error) => {
    const pending = pendingById.get(id);

    if (!pending) {
      return;
    }

    pendingById.delete(id);
    if (pending.key) {
      pendingIdByKey.delete(pending.key);
    }
    clearTimeout(pending.timeoutId);
    pending.reject(error);
  };

  worker.onmessage = (event: MessageEvent<WorkerResponseEnvelope<TOutput>>) => {
    const pending = pendingById.get(event.data.id);

    if (!pending) {
      return;
    }

    pendingById.delete(event.data.id);
    if (pending.key) {
      pendingIdByKey.delete(pending.key);
    }
    clearTimeout(pending.timeoutId);
    if (timingLabel) {
      recordWorkerTiming(timingLabel, performance.now() - pending.startedAt);
    }

    if (event.data.error) {
      pending.reject(createWorkerExecutionError(event.data.error));
      return;
    }

    if (!("payload" in event.data)) {
      pending.reject(
        new WorkerExecutionError("Worker response did not include a payload")
      );
      return;
    }

    pending.resolve(event.data.payload as TOutput);
  };

  const rejectPendingRequests = (error: Error) => {
    for (const id of pendingById.keys()) {
      rejectPendingRequest(id, error);
    }
  };

  worker.onerror = (event) => {
    rejectPendingRequests(
      new WorkerExecutionError(event.message || "Worker execution failed")
    );
  };

  worker.onmessageerror = () => {
    rejectPendingRequests(
      new WorkerCloneError("Worker response could not be cloned")
    );
  };

  const runWithKey = (payload: TInput, key: string | null) =>
    new Promise<TOutput>((resolve, reject) => {
      if (key) {
        const pendingId = pendingIdByKey.get(key);
        if (pendingId !== undefined) {
          rejectPendingRequest(pendingId, new WorkerStaleRequestError());
        }
      }

      const id = nextRequestId;
      nextRequestId += 1;
      const timeoutId = setTimeout(() => {
        rejectPendingRequest(id, new WorkerRequestTimeoutError());
      }, requestTimeoutMs);

      pendingById.set(id, {
        key,
        reject,
        resolve,
        startedAt: performance.now(),
        timeoutId,
      });
      if (key) {
        pendingIdByKey.set(key, id);
      }

      try {
        worker.postMessage({
          id,
          payload,
        } satisfies WorkerRequestEnvelope<TInput>);
      } catch (error) {
        rejectPendingRequest(
          id,
          new WorkerCloneError(
            error instanceof Error
              ? error.message
              : "Worker request could not be cloned"
          )
        );
      }
    });

  return {
    dispose: () => {
      rejectPendingRequests(
        new WorkerClientUnavailableError("Worker client disposed")
      );
      worker.terminate();
    },
    run: (payload: TInput) => runWithKey(payload, null),
    runLatest: (key: string, payload: TInput) => runWithKey(payload, key),
  };
}
