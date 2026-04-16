import { useEffect, useState } from "react";
import {
  type GitAuthPromptPayload,
  listenGitAuthPrompt,
  type SubmitGitAuthPromptResponseInput,
  submitGitAuthPromptResponse,
} from "@/lib/tauri-auth-client";

export function useGitAuthPrompts() {
  const [prompt, setPrompt] = useState<GitAuthPromptPayload | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listenGitAuthPrompt((payload) => {
      setPrompt(payload);
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  const submit = async (input: SubmitGitAuthPromptResponseInput) => {
    await submitGitAuthPromptResponse(input);
    setPrompt(null);
  };

  return { prompt, submit };
}
