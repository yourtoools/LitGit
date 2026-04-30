import { invoke } from "@tauri-apps/api/core";

export interface ProviderStatus {
  avatarUrl: string | null;
  connected: boolean;
  displayName: string | null;
  username: string | null;
}

export interface ProviderSshStatus {
  customKey?: {
    keyPath: string;
    title: string;
    fingerprint: string;
    addedAt: string;
  };
  useSystemAgent: boolean;
}

export type Provider = "github" | "gitlab" | "bitbucket";

export const PROVIDER_STATUS_CHANGED_EVENT = "litgit:provider-status-changed";

function emitProviderStatusChanged(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(PROVIDER_STATUS_CHANGED_EVENT));
}

export async function startOAuthFlow(
  provider: Provider
): Promise<{ url: string; state: string }> {
  const [url, state] = await invoke<[string, string]>("start_oauth_flow", {
    provider,
  });
  return { url, state };
}

export async function completeOAuthFlow(
  code: string,
  state: string
): Promise<{
  username: string;
  displayName: string;
  avatarUrl: string | null;
}> {
  const result = await invoke<{
    username: string;
    displayName: string;
    avatarUrl: string | null;
  }>("complete_oauth_flow", { code, state });
  emitProviderStatusChanged();
  return result;
}

export async function disconnectProvider(provider: Provider): Promise<void> {
  await invoke("disconnect_provider_cmd", { provider });
  emitProviderStatusChanged();
}

export async function getProviderStatus(): Promise<
  Record<Provider, ProviderStatus>
> {
  return await invoke("get_provider_status");
}

export async function generateProviderSshKey(
  provider: Provider,
  title?: string
): Promise<{
  path: string;
  name: string;
  fingerprint: string;
  keyType: string;
}> {
  return await invoke("generate_provider_ssh_key", {
    provider,
    title: title ?? null,
  });
}

export async function removeProviderSshKey(provider: Provider): Promise<void> {
  await invoke("remove_provider_ssh_key_cmd", { provider });
}

export async function getProviderSshStatus(
  provider: Provider
): Promise<ProviderSshStatus> {
  return await invoke("get_provider_ssh_status_cmd", { provider });
}

export async function setProviderSshUseSystemAgent(
  provider: Provider,
  useSystemAgent: boolean
): Promise<void> {
  await invoke("set_provider_ssh_use_system_agent", {
    provider,
    useSystemAgent,
  });
}

export async function setProviderCustomSshKey(
  provider: Provider,
  privateKeyPath: string
): Promise<{
  path: string;
  name: string;
  fingerprint: string;
  keyType: string;
}> {
  return await invoke("set_provider_custom_ssh_key_cmd", {
    provider,
    privateKeyPath,
  });
}

export function resolveOAuthHandoffTokenFromInput(value: string): string {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    throw new Error("Verification token is required.");
  }

  if (trimmedValue.includes("://")) {
    const token = new URL(trimmedValue).searchParams.get("token");
    if (token) {
      return token;
    }
    throw new Error("No token found in URL.");
  }

  if (trimmedValue.startsWith("?")) {
    const token = new URLSearchParams(trimmedValue.slice(1)).get("token");
    if (token) {
      return token;
    }
    throw new Error("No token found in query string.");
  }

  return trimmedValue;
}

export async function redeemOAuthHandoffToken(token: string): Promise<{
  code: string;
  state: string;
}> {
  return await invoke("redeem_oauth_handoff_token", { token });
}
