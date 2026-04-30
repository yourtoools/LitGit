import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface AiGenerationMetrics {
  failureCount: number;
  fastPromptCount: number;
  fullPromptCount: number;
  schemaFallbackCount: number;
  successCount: number;
  totalDurationMs: number;
}

interface AiGenerationMetricsStoreState {
  metricsByProviderKind: Record<string, AiGenerationMetrics>;
  recordFailure: (providerKind: string) => void;
  recordSuccess: (input: {
    durationMs: number;
    promptMode: string;
    providerKind: string;
    schemaFallbackUsed: boolean;
  }) => void;
}

const createEmptyMetrics = (): AiGenerationMetrics => ({
  failureCount: 0,
  fastPromptCount: 0,
  fullPromptCount: 0,
  schemaFallbackCount: 0,
  successCount: 0,
  totalDurationMs: 0,
});

const normalizeProviderKind = (providerKind: string): string => {
  const trimmedProviderKind = providerKind.trim();

  if (trimmedProviderKind.length === 0) {
    return "unknown";
  }

  return trimmedProviderKind;
};

export const useAiGenerationMetricsStore =
  create<AiGenerationMetricsStoreState>()(
    persist(
      (set) => ({
        metricsByProviderKind: {},
        recordFailure: (providerKind) => {
          const normalizedProviderKind = normalizeProviderKind(providerKind);

          set((state) => {
            const currentMetrics =
              state.metricsByProviderKind[normalizedProviderKind] ??
              createEmptyMetrics();

            return {
              metricsByProviderKind: {
                ...state.metricsByProviderKind,
                [normalizedProviderKind]: {
                  ...currentMetrics,
                  failureCount: currentMetrics.failureCount + 1,
                },
              },
            };
          });
        },
        recordSuccess: ({
          durationMs,
          promptMode,
          providerKind,
          schemaFallbackUsed,
        }) => {
          const normalizedProviderKind = normalizeProviderKind(providerKind);

          set((state) => {
            const currentMetrics =
              state.metricsByProviderKind[normalizedProviderKind] ??
              createEmptyMetrics();

            return {
              metricsByProviderKind: {
                ...state.metricsByProviderKind,
                [normalizedProviderKind]: {
                  ...currentMetrics,
                  fastPromptCount:
                    currentMetrics.fastPromptCount +
                    (promptMode === "fast" ? 1 : 0),
                  fullPromptCount:
                    currentMetrics.fullPromptCount +
                    (promptMode === "full" ? 1 : 0),
                  schemaFallbackCount:
                    currentMetrics.schemaFallbackCount +
                    (schemaFallbackUsed ? 1 : 0),
                  successCount: currentMetrics.successCount + 1,
                  totalDurationMs:
                    currentMetrics.totalDurationMs + Math.max(0, durationMs),
                },
              },
            };
          });
        },
      }),
      {
        name: "litgit-ai-generation-metrics-store",
        storage: createJSONStorage(() => localStorage),
      }
    )
  );
