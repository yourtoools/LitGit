import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface GitAuthPromptPayload {
  allowRemember: boolean;
  host: string | null;
  kind: "https-username" | "https-password" | "ssh-password" | "ssh-passphrase";
  operation: "clone" | "fetch" | "pull" | "push";
  prompt: string;
  promptId: string;
  sessionId: string;
  username: string | null;
}

export interface SubmitGitAuthPromptResponseInput {
  cancelled: boolean;
  promptId: string;
  remember: boolean;
  secret?: string | null;
  sessionId: string;
  username?: string | null;
}

export async function listenGitAuthPrompt(
  onPrompt: (payload: GitAuthPromptPayload) => void
) {
  return await listen<GitAuthPromptPayload>("git-auth-prompt", (event) => {
    onPrompt(event.payload);
  });
}

export async function submitGitAuthPromptResponse(
  input: SubmitGitAuthPromptResponseInput
) {
  await invoke("submit_git_auth_prompt_response", { input });
}

type GitProvider = "github" | "gitlab" | "bitbucket" | "unknown";

function detectGitProvider(urlOrHost: string): GitProvider {
  const lower = urlOrHost.toLowerCase();

  if (lower.includes("github.com") || lower.includes("github")) {
    return "github";
  }
  if (lower.includes("gitlab.com") || lower.includes("gitlab")) {
    return "gitlab";
  }
  if (lower.includes("bitbucket.org") || lower.includes("bitbucket")) {
    return "bitbucket";
  }

  return "unknown";
}

export function resolveOAuthProviderForPrompt(
  prompt: GitAuthPromptPayload
): Exclude<GitProvider, "unknown"> | null {
  if (prompt.kind !== "https-password" && prompt.kind !== "https-username") {
    return null;
  }

  const provider = detectGitProvider(prompt.host ?? "");
  return provider === "unknown" ? null : provider;
}

// SSH Key Management Types
interface SshKeyInfo {
  comment: string | null;
  fingerprint: string;
  isEncrypted: boolean;
  keyType: string;
  name: string;
  path: string;
}

// SSH Key Management Functions
export async function generateLitgitKeyWithDialog(): Promise<SshKeyInfo> {
  return await invoke<SshKeyInfo>("generate_litgit_key_with_dialog");
}
