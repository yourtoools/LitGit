import type {
  WorkerRequestEnvelope,
  WorkerResponseEnvelope,
} from "@/lib/workers/create-worker-client";

interface WorkerHandlerContext<TInput, TOutput> {
  onmessage:
    | ((event: MessageEvent<WorkerRequestEnvelope<TInput>>) => void)
    | null;
  postMessage: (payload: WorkerResponseEnvelope<TOutput>) => void;
}

export function registerWorkerHandler<TInput, TOutput>(
  resolvePayload: (payload: TInput) => TOutput,
  context: WorkerHandlerContext<TInput, TOutput> = self as WorkerHandlerContext<
    TInput,
    TOutput
  >
) {
  context.onmessage = (event: MessageEvent<WorkerRequestEnvelope<TInput>>) => {
    try {
      context.postMessage({
        id: event.data.id,
        payload: resolvePayload(event.data.payload),
      } satisfies WorkerResponseEnvelope<TOutput>);
    } catch (error) {
      context.postMessage({
        error:
          error instanceof Error
            ? error.message
            : "Worker handler failed to resolve payload",
        id: event.data.id,
      } satisfies WorkerResponseEnvelope<TOutput>);
    }
  };
}
