import { Button } from "@litgit/ui/components/button";
import { Checkbox } from "@litgit/ui/components/checkbox";
import { Input } from "@litgit/ui/components/input";
import { Label } from "@litgit/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@litgit/ui/components/select";
import { Switch } from "@litgit/ui/components/switch";
import { useEffect } from "react";
import {
  DefaultSelectValue,
  SettingsField,
  SettingsHelpText,
} from "@/components/views/settings/settings-section-ui";
import { useReducerState } from "@/hooks/use-reducer-state";
import {
  clearProxyAuthSecret,
  clearStoredHttpCredentialEntry,
  getProxyAuthSecretStatus,
  listStoredHttpCredentialEntries,
  runProxyConnectionTest,
  saveProxyAuthSecret,
} from "@/lib/tauri-settings-client";
import { DEFAULT_PREFERENCES } from "@/stores/preferences/preferences-store-types";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import { PROXY_TYPE_OPTIONS } from "@/stores/ui/settings-options";

function NetworkSection({ query }: { query: string }) {
  const enableProxy = usePreferencesStore((state) => state.network.enableProxy);
  const proxyAuthEnabled = usePreferencesStore(
    (state) => state.network.proxyAuthEnabled
  );
  const proxyAuthSecretStored = usePreferencesStore(
    (state) => state.network.proxyAuthSecretStored
  );
  const proxyAuthSecretStorageMode = usePreferencesStore(
    (state) => state.network.proxyAuthSecretStorageMode
  );
  const proxyHost = usePreferencesStore((state) => state.network.proxyHost);
  const proxyPort = usePreferencesStore((state) => state.network.proxyPort);
  const proxyType = usePreferencesStore((state) => state.network.proxyType);
  const proxyUsername = usePreferencesStore(
    (state) => state.network.proxyUsername
  );
  const setNetworkProxy = usePreferencesStore((state) => state.setNetworkProxy);
  const updateNetworkProxyAuthSecretStatus = usePreferencesStore(
    (state) => state.setNetworkProxyAuthSecretStatus
  );
  const sslVerification = usePreferencesStore(
    (state) => state.network.sslVerification
  );
  const useGitCredentialManager = usePreferencesStore(
    (state) => state.network.useGitCredentialManager
  );
  const [credentialEntries, updateCredentialEntries] = useReducerState<
    Array<{
      host: string;
      id: string;
      port: number | null;
      protocol: string;
      username: string;
    }>
  >([]);
  const [proxyTestMessage, updateProxyTestMessage] = useReducerState<
    string | null
  >(null);
  const [proxyPasswordInput, updateProxyPasswordInput] = useReducerState("");
  const [proxyAuthMessage, updateProxyAuthMessage] = useReducerState<
    string | null
  >(null);
  const [isClearingProxyPassword, updateIsClearingProxyPassword] =
    useReducerState(false);
  const hasStoredProxyPassword = proxyAuthSecretStored;
  const [proxyTargetDraft, updateProxyTargetDraft] = useReducerState(() => ({
    host: proxyHost,
    port: String(proxyPort),
    type: proxyType,
  }));

  const normalizedProxyDraftHost = proxyTargetDraft.host.trim();
  const normalizedProxyDraftPort = proxyTargetDraft.port.trim();
  const parsedProxyDraftPort = Number(normalizedProxyDraftPort);
  const hasValidProxyDraftPort =
    normalizedProxyDraftPort.length > 0 &&
    Number.isInteger(parsedProxyDraftPort) &&
    parsedProxyDraftPort > 0;
  const canSaveProxyTarget =
    normalizedProxyDraftHost.length > 0 && hasValidProxyDraftPort;
  const canTestProxyTarget = canSaveProxyTarget;
  const hasSavedProxyTarget = proxyHost.trim().length > 0;
  const hasUnsavedProxyTargetChanges =
    proxyTargetDraft.host !== proxyHost ||
    proxyTargetDraft.port !== String(proxyPort) ||
    proxyTargetDraft.type !== proxyType;

  const handleSaveProxyTarget = () => {
    if (!canSaveProxyTarget) {
      updateProxyTestMessage(
        "Enter a proxy host and a valid positive port before saving."
      );
      return;
    }

    setNetworkProxy({
      proxyHost: normalizedProxyDraftHost,
      proxyPort: parsedProxyDraftPort,
      proxyType: proxyTargetDraft.type,
    });
    updateProxyTestMessage("Proxy target saved.");
  };

  const resetProxySettings = () => {
    const currentUsername = proxyUsername.trim();

    const finishReset = () => {
      setNetworkProxy({
        enableProxy: DEFAULT_PREFERENCES.network.enableProxy,
        proxyAuthEnabled: DEFAULT_PREFERENCES.network.proxyAuthEnabled,
        proxyHost: DEFAULT_PREFERENCES.network.proxyHost,
        proxyPort: DEFAULT_PREFERENCES.network.proxyPort,
        proxyType: DEFAULT_PREFERENCES.network.proxyType,
        proxyUsername: DEFAULT_PREFERENCES.network.proxyUsername,
        sslVerification: DEFAULT_PREFERENCES.network.sslVerification,
        useGitCredentialManager:
          DEFAULT_PREFERENCES.network.useGitCredentialManager,
      });
      updateNetworkProxyAuthSecretStatus({
        hasStoredValue: false,
        storageMode: null,
      });
      updateProxyTargetDraft({
        host: DEFAULT_PREFERENCES.network.proxyHost,
        port: String(DEFAULT_PREFERENCES.network.proxyPort),
        type: DEFAULT_PREFERENCES.network.proxyType,
      });
      updateProxyAuthMessage("Proxy settings reset to defaults.");
      updateProxyPasswordInput("");
      updateProxyTestMessage(null);
    };

    if (currentUsername.length === 0) {
      finishReset();
      return;
    }

    clearProxyAuthSecret(currentUsername)
      .then(finishReset)
      .catch(() => {
        finishReset();
      });
  };

  useEffect(() => {
    listStoredHttpCredentialEntries()
      .then(updateCredentialEntries)
      .catch(() => {
        updateCredentialEntries([]);
      });
  }, [updateCredentialEntries]);

  useEffect(() => {
    if (!(proxyAuthEnabled && proxyUsername.trim().length > 0)) {
      updateNetworkProxyAuthSecretStatus({
        hasStoredValue: false,
        storageMode: null,
      });
      return;
    }

    getProxyAuthSecretStatus(proxyUsername)
      .then((status) => {
        updateNetworkProxyAuthSecretStatus({
          hasStoredValue: status.hasStoredValue,
          storageMode: status.storageMode,
        });
      })
      .catch(() => {
        updateNetworkProxyAuthSecretStatus({
          hasStoredValue: false,
          storageMode: null,
        });
      });
  }, [proxyAuthEnabled, proxyUsername, updateNetworkProxyAuthSecretStatus]);

  useEffect(() => {
    updateProxyTargetDraft({
      host: proxyHost,
      port: String(proxyPort),
      type: proxyType,
    });
  }, [proxyHost, proxyPort, proxyType, updateProxyTargetDraft]);

  return (
    <div className="grid gap-2">
      <SettingsField
        description="Delegate HTTP credential storage to Git Credential Manager when available."
        label="Use Git Credential Manager"
        query={query}
      >
        <label
          className="inline-flex items-center gap-1.5"
          htmlFor="network-use-git-credential-manager"
        >
          <Switch
            checked={useGitCredentialManager}
            id="network-use-git-credential-manager"
            onCheckedChange={(checked) => {
              setNetworkProxy({ useGitCredentialManager: Boolean(checked) });
            }}
          />
          <span className="text-xs">Use system credential helper</span>
        </label>
      </SettingsField>
      <SettingsField
        description="Enable proxy-aware Git network operations when backend support is available."
        label="Use proxy"
        query={query}
      >
        <label
          className="inline-flex items-center gap-1.5"
          htmlFor="network-use-proxy"
        >
          <Switch
            checked={enableProxy}
            id="network-use-proxy"
            onCheckedChange={(checked) => {
              setNetworkProxy({ enableProxy: Boolean(checked) });
            }}
          />
          <span className="text-xs">
            {enableProxy ? "Proxy enabled" : "Proxy disabled"}
          </span>
        </label>
      </SettingsField>
      <SettingsField
        description="Reject invalid SSL certificates by default for supported remote operations."
        label="Verify SSL certificates"
        query={query}
      >
        <label
          className="inline-flex items-center gap-1.5"
          htmlFor="network-verify-ssl-certificates"
        >
          <Checkbox
            checked={sslVerification}
            id="network-verify-ssl-certificates"
            onCheckedChange={(checked) => {
              setNetworkProxy({ sslVerification: Boolean(checked) });
            }}
          />
          <span className="text-xs">Keep SSL verification enabled</span>
        </label>
      </SettingsField>
      <SettingsField
        description="Host, port, and proxy type feed the backend proxy-test command for desktop validation."
        label="Proxy target"
        query={query}
      >
        <div className="grid gap-2 border border-border/60 bg-muted/18 p-3 md:gap-2">
          <div className="grid gap-1.5 md:grid-cols-[minmax(0,1.5fr)_minmax(7rem,0.75fr)_minmax(8rem,0.8fr)]">
            <div className="grid gap-1.5">
              <Label htmlFor="proxy-target-host">Proxy host</Label>
              <Input
                className="h-7 text-xs"
                id="proxy-target-host"
                onChange={(event) => {
                  updateProxyTargetDraft((current) => ({
                    ...current,
                    host: event.target.value,
                  }));
                  updateProxyTestMessage(null);
                }}
                placeholder="proxy.local"
                value={proxyTargetDraft.host}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="proxy-target-port">Port</Label>
              <Input
                className="h-7 text-xs"
                id="proxy-target-port"
                min={1}
                onChange={(event) => {
                  updateProxyTargetDraft((current) => ({
                    ...current,
                    port: event.target.value,
                  }));
                  updateProxyTestMessage(null);
                }}
                placeholder="80"
                type="number"
                value={proxyTargetDraft.port}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="proxy-target-type">Type</Label>
              <Select
                items={PROXY_TYPE_OPTIONS}
                onValueChange={(value) => {
                  if (typeof value === "string") {
                    updateProxyTargetDraft((current) => ({
                      ...current,
                      type: value as "http" | "https" | "socks5",
                    }));
                    updateProxyTestMessage(null);
                  }
                }}
                value={proxyTargetDraft.type}
              >
                <SelectTrigger
                  className="focus-visible:desktop-focus h-7 w-full text-xs focus-visible:ring-0! focus-visible:ring-offset-0!"
                  id="proxy-target-type"
                  size="sm"
                >
                  <DefaultSelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="https">HTTPS</SelectItem>
                    <SelectItem value="socks5">SOCKS5</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Button
              disabled={!(canSaveProxyTarget && hasUnsavedProxyTargetChanges)}
              onClick={handleSaveProxyTarget}
              size="sm"
              type="button"
            >
              Save proxy target
            </Button>
            <Button
              disabled={!canTestProxyTarget}
              onClick={() => {
                if (!canTestProxyTarget) {
                  updateProxyTestMessage(
                    "Enter a proxy host and a valid positive port before testing."
                  );
                  return;
                }

                runProxyConnectionTest({
                  host: normalizedProxyDraftHost,
                  port: parsedProxyDraftPort,
                  proxyType: proxyTargetDraft.type,
                  username:
                    proxyAuthEnabled && proxyUsername.trim().length > 0
                      ? proxyUsername
                      : undefined,
                  password:
                    proxyAuthEnabled && proxyPasswordInput.trim().length > 0
                      ? proxyPasswordInput
                      : undefined,
                })
                  .then((result) => {
                    updateProxyTestMessage(result.message);
                  })
                  .catch((error: unknown) => {
                    updateProxyTestMessage(
                      error instanceof Error
                        ? error.message
                        : "Proxy test failed"
                    );
                  });
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Test proxy connection
            </Button>
            {hasSavedProxyTarget ? (
              <Button
                onClick={resetProxySettings}
                size="sm"
                type="button"
                variant="ghost"
              >
                Reset proxy settings
              </Button>
            ) : null}
          </div>
          {proxyTestMessage ? (
            <SettingsHelpText>{proxyTestMessage}</SettingsHelpText>
          ) : null}
          {!canSaveProxyTarget &&
          (normalizedProxyDraftHost.length > 0 ||
            normalizedProxyDraftPort.length > 0) ? (
            <SettingsHelpText tone="warning">
              Enter both a proxy host and a valid positive port before saving or
              testing.
            </SettingsHelpText>
          ) : null}
          <SettingsHelpText>
            Leave host empty to disable proxy routing even if the toggle stays
            on.
          </SettingsHelpText>
        </div>
      </SettingsField>
      <SettingsField
        description="Reveal proxy username and password only when your proxy requires authentication. Passwords stay in backend secure storage or session fallback."
        label="Proxy authentication"
        query={query}
      >
        <div className="grid gap-1.5">
          <label className="inline-flex items-center gap-1.5">
            <Checkbox
              checked={proxyAuthEnabled}
              onCheckedChange={(checked) => {
                const nextValue = Boolean(checked);
                setNetworkProxy({ proxyAuthEnabled: nextValue });
                updateProxyAuthMessage(null);

                if (!nextValue && proxyUsername.trim().length > 0) {
                  clearProxyAuthSecret(proxyUsername)
                    .then(() => {
                      updateNetworkProxyAuthSecretStatus({
                        hasStoredValue: false,
                        storageMode: null,
                      });
                      updateProxyPasswordInput("");
                    })
                    .catch(() => undefined);
                }
              }}
            />
            <span className="text-xs">
              {proxyAuthEnabled
                ? "Proxy authentication enabled"
                : "Proxy authentication disabled"}
            </span>
          </label>
          {proxyAuthEnabled ? (
            <>
              <div className="flex h-7 items-center justify-between">
                <span className="text-muted-foreground text-xs">
                  {hasStoredProxyPassword
                    ? `Stored (${proxyAuthSecretStorageMode ?? "session"})`
                    : "No proxy password saved"}
                </span>
                {hasStoredProxyPassword && (
                  <Button
                    disabled={isClearingProxyPassword}
                    onClick={() => {
                      updateIsClearingProxyPassword(true);
                      updateProxyAuthMessage(null);

                      clearProxyAuthSecret(proxyUsername)
                        .then(() => {
                          updateNetworkProxyAuthSecretStatus({
                            hasStoredValue: false,
                            storageMode: null,
                          });
                          updateProxyPasswordInput("");
                          updateProxyAuthMessage(
                            "Password cleared. You can now enter a new one."
                          );
                        })
                        .catch((error: unknown) => {
                          updateProxyAuthMessage(
                            error instanceof Error
                              ? error.message
                              : "Failed to clear proxy password"
                          );
                        })
                        .finally(() => {
                          updateIsClearingProxyPassword(false);
                        });
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {isClearingProxyPassword ? "Clearing..." : "Clear password"}
                  </Button>
                )}
              </div>
              <div className="grid gap-1.5 md:grid-cols-2">
                <Input
                  className="h-7 text-xs"
                  disabled={hasStoredProxyPassword || isClearingProxyPassword}
                  onChange={(event) => {
                    setNetworkProxy({ proxyUsername: event.target.value });
                    updateProxyAuthMessage(null);
                  }}
                  placeholder="proxy-user"
                  value={proxyUsername}
                />
                <Input
                  className="h-7 text-xs"
                  disabled={hasStoredProxyPassword || isClearingProxyPassword}
                  onChange={(event) => {
                    updateProxyPasswordInput(event.target.value);
                    updateProxyAuthMessage(null);
                  }}
                  placeholder="Enter proxy password"
                  type="password"
                  value={
                    hasStoredProxyPassword
                      ? "********************"
                      : proxyPasswordInput
                  }
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  disabled={
                    proxyUsername.trim().length === 0 ||
                    proxyPasswordInput.trim().length === 0 ||
                    hasStoredProxyPassword ||
                    isClearingProxyPassword
                  }
                  onClick={() => {
                    saveProxyAuthSecret(proxyUsername, proxyPasswordInput)
                      .then((status) => {
                        updateNetworkProxyAuthSecretStatus({
                          hasStoredValue: status.hasStoredValue,
                          storageMode: status.storageMode,
                        });
                        updateProxyPasswordInput("");
                        updateProxyAuthMessage(
                          `Proxy password saved (${status.storageMode}).`
                        );
                      })
                      .catch((error: unknown) => {
                        updateProxyAuthMessage(
                          error instanceof Error
                            ? error.message
                            : "Failed to save proxy password"
                        );
                      });
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Save credentials
                </Button>
              </div>
              {proxyAuthMessage ? (
                <SettingsHelpText>{proxyAuthMessage}</SettingsHelpText>
              ) : null}
            </>
          ) : null}
        </div>
      </SettingsField>
      <SettingsField
        description="Credential entries are listed through backend metadata only; secret values never return to the renderer."
        label="Stored HTTP credential entries"
        query={query}
      >
        <div className="grid gap-1.5">
          {credentialEntries.length === 0 ? (
            <div className="text-muted-foreground text-xs">
              No stored HTTP credentials yet.
            </div>
          ) : (
            credentialEntries.map((entry) => (
              <div
                className="flex items-center justify-between gap-2 border border-border/70 px-2 py-1.5"
                key={entry.id}
              >
                <div className="min-w-0">
                  <div className="font-medium text-xs">
                    {entry.protocol}://{entry.host}
                    {entry.port ? `:${entry.port}` : ""}
                  </div>
                  <div className="truncate text-muted-foreground text-xs">
                    {entry.username}
                  </div>
                </div>
                <Button
                  onClick={() => {
                    clearStoredHttpCredentialEntry(entry.id)
                      .then(() =>
                        listStoredHttpCredentialEntries().then(
                          updateCredentialEntries
                        )
                      )
                      .catch(() => undefined);
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Clear
                </Button>
              </div>
            ))
          )}
        </div>
      </SettingsField>
    </div>
  );
}

export { NetworkSection };
