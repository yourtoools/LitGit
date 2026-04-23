export interface AiCommitGenerationUiState {
  preview: string;
  statusMessage: string | null;
}

export interface AiCommitGenerationProgressPayload {
  message: string;
  stage: string;
}

export function getNextAiCommitGenerationState(
  current: AiCommitGenerationUiState,
  payload: AiCommitGenerationProgressPayload
): AiCommitGenerationUiState {
  if (payload.stage === "completed") {
    return {
      preview: "",
      statusMessage: null,
    };
  }

  if (payload.stage === "failed") {
    return {
      preview: "",
      statusMessage: payload.message,
    };
  }

  return {
    preview: current.preview,
    statusMessage: payload.message,
  };
}

export function finalizeAiCommitGenerationState(
  current: AiCommitGenerationUiState,
  succeeded: boolean
): AiCommitGenerationUiState {
  if (!succeeded) {
    return current;
  }

  return {
    preview: "",
    statusMessage: null,
  };
}
