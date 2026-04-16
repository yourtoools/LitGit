import { invoke } from "@tauri-apps/api/core";
import type { Provider } from "@/lib/tauri-integrations-client";

export interface PublishTarget {
  avatarUrl?: string | null;
  displayName: string;
  fullPath: string;
  id: string;
  kind: "personal" | "organization" | "namespace" | "workspace";
  provider: Provider;
}

export async function listPublishTargets(
  provider: Provider
): Promise<PublishTarget[]> {
  return await invoke("list_publish_targets", { provider });
}
