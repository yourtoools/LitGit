import type { Provider, ProviderStatus } from "@/lib/tauri-integrations-client";
import type { PublishTarget } from "@/lib/tauri-publishing-client";

export function resolveDefaultPublishProvider(
  statuses: Record<Provider, ProviderStatus> | null
): Provider | null {
  const providers: Provider[] = ["github", "gitlab", "bitbucket"];
  return providers.find((provider) => statuses?.[provider]?.connected) ?? null;
}

export function resolveDefaultPublishTarget(
  provider: Provider | null,
  targets: PublishTarget[]
): PublishTarget | null {
  if (!provider) {
    return null;
  }

  const providerTargets = targets.filter(
    (target) => target.provider === provider
  );
  return (
    providerTargets.find((target) => target.kind === "personal") ??
    providerTargets[0] ??
    null
  );
}

export function resolvePublishRepositoryNameError(
  value: string
): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "Repository name is required.";
  }
  return null;
}
