import type { RuntimePlatform } from "@/lib/runtime-platform";
import { getTauriInvoke } from "@/lib/tauri-repo-client";
import type {
  GitIdentityStatus,
  GitIdentityWriteInput,
} from "@/stores/repo/repo-store-types";

interface RedactedCredentialEntry {
  host: string;
  id: string;
  port: number | null;
  protocol: string;
  username: string;
}

interface SecretStatus {
  hasStoredValue: boolean;
  storageMode: "secure" | "session";
}

interface AutoFetchScheduleRequest {
  intervalMinutes: number;
  preferences: Record<string, unknown>;
  repoPath: string;
}

interface PickedFilePath {
  path: string;
}

interface SettingsBackendCapabilities {
  runtimePlatform: RuntimePlatform;
  secureStorageAvailable: boolean;
  sessionSecretsSupported: boolean;
}

const parseRuntimePlatform = (value: unknown): RuntimePlatform => {
  switch (value) {
    case "android":
    case "ios":
    case "linux":
    case "macos":
    case "windows":
      return value;
    default:
      return "unknown";
  }
};

interface ProxyTestResult {
  message: string;
  ok: boolean;
}

interface SigningKeyInfo {
  id: string;
  label: string;
  type: "gpg" | "ssh";
}

interface SystemFontFamily {
  family: string;
}

const parseRecord = (value: unknown, errorMessage: string) => {
  if (typeof value !== "object" || value === null) {
    throw new Error(errorMessage);
  }

  return value as Record<string, unknown>;
};

const parseGitIdentityValue = (value: unknown) => {
  const parsed = parseRecord(value, "Invalid Git identity payload");

  if (
    !(typeof parsed.email === "string" || parsed.email === null) ||
    typeof parsed.isComplete !== "boolean" ||
    !(typeof parsed.name === "string" || parsed.name === null)
  ) {
    throw new Error("Invalid Git identity payload");
  }

  return {
    email: parsed.email,
    isComplete: parsed.isComplete,
    name: parsed.name,
  };
};

const parseGitIdentityStatus = (value: unknown): GitIdentityStatus => {
  const parsed = parseRecord(value, "Invalid Git identity status payload");

  if (
    !(
      (parsed.effectiveScope === "global" ||
        parsed.effectiveScope === "local" ||
        parsed.effectiveScope === null) &&
      (typeof parsed.repoPath === "string" || parsed.repoPath === null)
    )
  ) {
    throw new Error("Invalid Git identity status payload");
  }

  return {
    effective: parseGitIdentityValue(parsed.effective),
    effectiveScope: parsed.effectiveScope,
    global: parseGitIdentityValue(parsed.global),
    local: parsed.local === null ? null : parseGitIdentityValue(parsed.local),
    repoPath: parsed.repoPath,
  };
};

export const getSettingsBackendCapabilities =
  async (): Promise<SettingsBackendCapabilities> => {
    const invoke = getTauriInvoke();

    if (!invoke) {
      return {
        runtimePlatform: "unknown",
        secureStorageAvailable: false,
        sessionSecretsSupported: false,
      };
    }

    const result = parseRecord(
      await invoke("get_settings_backend_capabilities"),
      "Invalid settings capability payload"
    );

    if (
      typeof result.runtimePlatform !== "string" ||
      typeof result.secureStorageAvailable !== "boolean" ||
      typeof result.sessionSecretsSupported !== "boolean"
    ) {
      throw new Error("Invalid settings capability payload");
    }

    return {
      runtimePlatform: parseRuntimePlatform(result.runtimePlatform),
      secureStorageAvailable: result.secureStorageAvailable,
      sessionSecretsSupported: result.sessionSecretsSupported,
    };
  };

export const listStoredHttpCredentialEntries = async (): Promise<
  RedactedCredentialEntry[]
> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return [];
  }

  const result = await invoke("list_http_credential_entries");

  if (!Array.isArray(result)) {
    throw new Error("Invalid stored credential payload");
  }

  return result.map((entry) => {
    const parsed = parseRecord(entry, "Invalid stored credential payload");

    if (
      typeof parsed.host !== "string" ||
      typeof parsed.id !== "string" ||
      typeof parsed.protocol !== "string" ||
      typeof parsed.username !== "string" ||
      !(typeof parsed.port === "number" || parsed.port === null)
    ) {
      throw new Error("Invalid stored credential payload");
    }

    return {
      host: parsed.host,
      id: parsed.id,
      port: parsed.port,
      protocol: parsed.protocol,
      username: parsed.username,
    } satisfies RedactedCredentialEntry;
  });
};

export const getGitIdentityStatus = async (
  repoPath?: string | null
): Promise<GitIdentityStatus> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Git identity works in Tauri desktop app only");
  }

  const result = await invoke("get_git_identity", {
    repoPath: repoPath ?? null,
  });

  return parseGitIdentityStatus(result);
};

export const saveGitIdentity = async (input: {
  gitIdentity: GitIdentityWriteInput;
  repoPath?: string | null;
}): Promise<GitIdentityStatus> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Git identity works in Tauri desktop app only");
  }

  const result = await invoke("set_git_identity", {
    gitIdentity: input.gitIdentity,
    repoPath: input.repoPath ?? null,
  });

  return parseGitIdentityStatus(result);
};

export const clearStoredHttpCredentialEntry = async (
  entryId: string
): Promise<void> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Credential management works in Tauri desktop app only");
  }

  await invoke("clear_http_credential_entry", { entryId });
};

export const saveAiProviderSecret = async (
  provider: string,
  secret: string
): Promise<SecretStatus> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("AI secret storage works in Tauri desktop app only");
  }

  const result = parseRecord(
    await invoke("save_ai_provider_secret", { provider, secret }),
    "Invalid AI secret status payload"
  );

  if (
    typeof result.hasStoredValue !== "boolean" ||
    (result.storageMode !== "secure" && result.storageMode !== "session")
  ) {
    throw new Error("Invalid AI secret status payload");
  }

  return {
    hasStoredValue: result.hasStoredValue,
    storageMode: result.storageMode,
  };
};

export const getAiProviderSecretStatus = async (
  provider: string
): Promise<SecretStatus> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return {
      hasStoredValue: false,
      storageMode: "session",
    };
  }

  const result = parseRecord(
    await invoke("get_ai_provider_secret_status", { provider }),
    "Invalid AI secret status payload"
  );

  if (
    typeof result.hasStoredValue !== "boolean" ||
    (result.storageMode !== "secure" && result.storageMode !== "session")
  ) {
    throw new Error("Invalid AI secret status payload");
  }

  return {
    hasStoredValue: result.hasStoredValue,
    storageMode: result.storageMode,
  };
};

export const clearAiProviderSecret = async (
  provider: string
): Promise<void> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("AI secret storage works in Tauri desktop app only");
  }

  await invoke("clear_ai_provider_secret", { provider });
};

export const saveGitHubToken = async (token: string): Promise<SecretStatus> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("GitHub token storage works in Tauri desktop app only");
  }

  const result = parseSecretStatus(
    await invoke("save_github_token", { token }),
    "Invalid GitHub token status payload"
  );

  return result;
};

export const getGitHubTokenStatus = async (): Promise<SecretStatus> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return {
      hasStoredValue: false,
      storageMode: "session",
    };
  }

  const result = parseSecretStatus(
    await invoke("get_github_token_status"),
    "Invalid GitHub token status payload"
  );

  return result;
};

export const clearGitHubToken = async (): Promise<void> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("GitHub token storage works in Tauri desktop app only");
  }

  await invoke("clear_github_token");
};

const parseSecretStatus = (
  result: unknown,
  errorMessage: string
): SecretStatus => {
  const parsed = parseRecord(result, errorMessage);

  if (
    typeof parsed.hasStoredValue !== "boolean" ||
    (parsed.storageMode !== "secure" && parsed.storageMode !== "session")
  ) {
    throw new Error(errorMessage);
  }

  return {
    hasStoredValue: parsed.hasStoredValue,
    storageMode: parsed.storageMode,
  };
};

export const saveProxyAuthSecret = async (
  username: string,
  secret: string
): Promise<SecretStatus> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Proxy secret storage works in Tauri desktop app only");
  }

  return parseSecretStatus(
    await invoke("save_proxy_auth_secret", { secret, username }),
    "Invalid proxy secret status payload"
  );
};

export const getProxyAuthSecretStatus = async (
  username: string
): Promise<SecretStatus> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return {
      hasStoredValue: false,
      storageMode: "session",
    };
  }

  return parseSecretStatus(
    await invoke("get_proxy_auth_secret_status", { username }),
    "Invalid proxy secret status payload"
  );
};

export const clearProxyAuthSecret = async (username: string): Promise<void> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Proxy secret storage works in Tauri desktop app only");
  }

  await invoke("clear_proxy_auth_secret", { username });
};

export const startAutoFetchScheduler = async (
  request: AutoFetchScheduleRequest
): Promise<void> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return;
  }

  await invoke("start_auto_fetch_scheduler", {
    intervalMinutes: request.intervalMinutes,
    preferences: request.preferences,
    repoPath: request.repoPath,
  });
};

export const stopAutoFetchScheduler = async (): Promise<void> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return;
  }

  await invoke("stop_auto_fetch_scheduler");
};

export const runProxyConnectionTest = async (input: {
  host: string;
  password?: string;
  port: number;
  proxyType: "http" | "https" | "socks5";
  username?: string;
}): Promise<ProxyTestResult> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Proxy testing works in Tauri desktop app only");
  }

  const result = parseRecord(
    await invoke("test_proxy_connection", input),
    "Invalid proxy test payload"
  );

  if (typeof result.message !== "string" || typeof result.ok !== "boolean") {
    throw new Error("Invalid proxy test payload");
  }

  return {
    message: result.message,
    ok: result.ok,
  };
};

export const pickSettingsFile = async (): Promise<string | null> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("File picking works in Tauri desktop app only");
  }

  const result = await invoke("pick_settings_file");

  if (result === null) {
    return null;
  }

  const parsed = parseRecord(result, "Invalid picked file payload");

  if (typeof parsed.path !== "string") {
    throw new Error("Invalid picked file payload");
  }

  return parsed.path;
};

export const generateSshKeypair = async (
  fileName: string
): Promise<PickedFilePath> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("SSH key generation works in Tauri desktop app only");
  }

  const result = parseRecord(
    await invoke("generate_ssh_keypair", { fileName }),
    "Invalid SSH key generation payload"
  );

  if (typeof result.path !== "string") {
    throw new Error("Invalid SSH key generation payload");
  }

  return {
    path: result.path,
  };
};

export const listSigningKeys = async (): Promise<SigningKeyInfo[]> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    throw new Error("Signing key discovery works in Tauri desktop app only");
  }

  const result = await invoke("list_signing_keys");

  if (!Array.isArray(result)) {
    throw new Error("Invalid signing key payload");
  }

  return result.map((entry) => {
    const parsed = parseRecord(entry, "Invalid signing key payload");

    if (
      typeof parsed.id !== "string" ||
      typeof parsed.label !== "string" ||
      (parsed.type !== "gpg" && parsed.type !== "ssh")
    ) {
      throw new Error("Invalid signing key payload");
    }

    return {
      id: parsed.id,
      label: parsed.label,
      type: parsed.type,
    } satisfies SigningKeyInfo;
  });
};

export const listSystemFontFamilies = async (): Promise<string[]> => {
  const invoke = getTauriInvoke();

  if (!invoke) {
    return [];
  }

  const result = await invoke("list_system_font_families");

  if (!Array.isArray(result)) {
    throw new Error("Invalid system font payload");
  }

  return result
    .map((entry) => {
      const parsed = parseRecord(entry, "Invalid system font payload");

      if (typeof parsed.family !== "string") {
        throw new Error("Invalid system font payload");
      }

      return {
        family: parsed.family,
      } satisfies SystemFontFamily;
    })
    .map((entry) => entry.family);
};
