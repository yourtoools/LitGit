import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  OAuthButton,
  OAuthButtonSkeleton,
} from "@/components/auth/oauth-button";
import { ProviderCard } from "@/components/auth/provider-card";
import { ProviderOAuthTokenDialog } from "@/components/auth/provider-oauth-token-dialog";
import { SettingsField } from "@/components/views/settings/settings-shared-ui";
import {
  completeOAuthFlow,
  disconnectProvider,
  generateProviderSshKey,
  getProviderSshStatus,
  getProviderStatus,
  type Provider,
  type ProviderSshStatus,
  type ProviderStatus,
  redeemOAuthHandoffToken,
  removeProviderSshKey,
  resolveOAuthHandoffTokenFromInput,
  setProviderCustomSshKey,
  setProviderSshUseSystemAgent,
  startOAuthFlow,
} from "@/lib/tauri-integrations-client";

interface IntegrationsSectionProps {
  query: string;
}

const PROVIDERS: Provider[] = ["github", "gitlab", "bitbucket"];

export function IntegrationsSection({ query }: IntegrationsSectionProps) {
  const [statuses, setStatuses] = useState<Record<
    Provider,
    ProviderStatus
  > | null>(null);
  const [sshStatuses, setSshStatuses] = useState<Record<
    Provider,
    ProviderSshStatus
  > | null>(null);
  const [_loading, setLoading] = useState<Record<Provider, boolean>>({
    github: false,
    gitlab: false,
    bitbucket: false,
  });
  const [pendingOAuthFlow, setPendingOAuthFlow] = useState<{
    provider: Provider;
    state: string;
  } | null>(null);
  const [isOAuthDialogOpen, setIsOAuthDialogOpen] = useState(false);
  const [isOAuthSubmitting, setIsOAuthSubmitting] = useState(false);

  const loadStatuses = useCallback(async () => {
    try {
      const providerStatuses = await getProviderStatus();
      setStatuses(providerStatuses);

      // Fetch SSH statuses in parallel for connected providers only
      const sshFetchPromises = PROVIDERS.filter(
        (provider) => providerStatuses[provider]?.connected
      ).map(async (provider) => {
        try {
          const sshStatus = await getProviderSshStatus(provider);
          return [provider, sshStatus] as const;
        } catch (error) {
          console.error(`Failed to load SSH status for ${provider}:`, error);
          // Return default status on error
          return [provider, { useSystemAgent: true }] as const;
        }
      });

      const sshResults = await Promise.all(sshFetchPromises);
      const sshStats = Object.fromEntries(sshResults) as Record<
        Provider,
        ProviderSshStatus
      >;
      setSshStatuses(sshStats);
    } catch (error) {
      console.error("Failed to load provider statuses:", error);
      // Set empty states on error to stop showing skeletons
      setStatuses({
        github: {
          connected: false,
          username: null,
          displayName: null,
          avatarUrl: null,
        },
        gitlab: {
          connected: false,
          username: null,
          displayName: null,
          avatarUrl: null,
        },
        bitbucket: {
          connected: false,
          username: null,
          displayName: null,
          avatarUrl: null,
        },
      });
      setSshStatuses({
        github: { useSystemAgent: true },
        gitlab: { useSystemAgent: true },
        bitbucket: { useSystemAgent: true },
      });
    }
  }, []);

  const handleOAuthCallback = useCallback(
    async (code: string, state: string) => {
      if (!pendingOAuthFlow || pendingOAuthFlow.state !== state) {
        return;
      }

      setIsOAuthSubmitting(true);

      // Defer heavy work to allow UI to paint loading state
      await new Promise((resolve) => setTimeout(resolve, 50));

      try {
        const userInfo = await completeOAuthFlow(code, state);
        toast.success(
          `Connected to ${pendingOAuthFlow.provider} as ${userInfo.username}`
        );
        setStatuses((previousStatuses) =>
          previousStatuses
            ? {
                ...previousStatuses,
                [pendingOAuthFlow.provider]: {
                  avatarUrl: userInfo.avatarUrl,
                  connected: true,
                  displayName: userInfo.displayName,
                  username: userInfo.username,
                },
              }
            : previousStatuses
        );
        setPendingOAuthFlow(null);
        setIsOAuthDialogOpen(false);
        await loadStatuses();
      } catch (error) {
        toast.error(
          `Failed to complete ${pendingOAuthFlow.provider} connection: ${error}`
        );
      } finally {
        setIsOAuthSubmitting(false);
      }
    },
    [pendingOAuthFlow, loadStatuses]
  );

  useEffect(() => {
    loadStatuses();

    const unlisten = listen("oauth-callback", (event) => {
      const { code, state } = event.payload as { code: string; state: string };
      handleOAuthCallback(code, state);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadStatuses, handleOAuthCallback]);

  const handleConnect = async (provider: Provider) => {
    try {
      const { url, state } = await startOAuthFlow(provider);
      setPendingOAuthFlow({ provider, state });
      setIsOAuthDialogOpen(true);
      await openUrl(url);
    } catch (error) {
      toast.error(`Failed to start ${provider} connection: ${error}`);
      setPendingOAuthFlow(null);
      setIsOAuthDialogOpen(false);
    }
  };

  const handleCompleteOAuthFromPaste = async (
    provider: Provider,
    token: string
  ) => {
    setIsOAuthSubmitting(true);

    // Defer heavy work to next tick to allow UI to paint loading state
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      const resolvedToken = resolveOAuthHandoffTokenFromInput(token);
      const { code, state } = await redeemOAuthHandoffToken(resolvedToken);
      const userInfo = await completeOAuthFlow(code, state);

      toast.success(`Connected to ${provider} as ${userInfo.username}`);
      setStatuses((previousStatuses) =>
        previousStatuses
          ? {
              ...previousStatuses,
              [provider]: {
                avatarUrl: userInfo.avatarUrl,
                connected: true,
                displayName: userInfo.displayName,
                username: userInfo.username,
              },
            }
          : previousStatuses
      );
      setPendingOAuthFlow(null);
      setIsOAuthDialogOpen(false);
      await loadStatuses();
    } finally {
      setIsOAuthSubmitting(false);
    }
  };

  const handleDisconnect = async (provider: Provider) => {
    setLoading((prev) => ({ ...prev, [provider]: true }));
    try {
      await disconnectProvider(provider);
      toast.success(`Disconnected from ${provider}`);

      // Update local state immediately to reflect disconnection
      setStatuses((previousStatuses) =>
        previousStatuses
          ? {
              ...previousStatuses,
              [provider]: {
                avatarUrl: null,
                connected: false,
                displayName: null,
                username: null,
              },
            }
          : previousStatuses
      );

      await loadStatuses();
    } catch (error) {
      toast.error(`Failed to disconnect from ${provider}: ${error}`);
    } finally {
      setLoading((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const handleGenerateKey = async (provider: Provider, title: string) => {
    setLoading((prev) => ({ ...prev, [provider]: true }));
    try {
      await generateProviderSshKey(provider, title);
      toast.success("SSH key generated and added to your account");
      await loadStatuses();
    } catch (error) {
      toast.error(`Failed to generate SSH key: ${error}`);
    } finally {
      setLoading((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const handleRemoveKey = async (provider: Provider) => {
    setLoading((prev) => ({ ...prev, [provider]: true }));
    try {
      await removeProviderSshKey(provider);
      toast.success("SSH key removed");
      await loadStatuses();
    } catch (error) {
      toast.error(`Failed to remove SSH key: ${error}`);
    } finally {
      setLoading((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const handleUseSystemAgentChange = async (
    provider: Provider,
    use: boolean
  ) => {
    try {
      await setProviderSshUseSystemAgent(provider, use);
      await loadStatuses();
    } catch (error) {
      toast.error(`Failed to update SSH settings: ${error}`);
    }
  };

  const handleSetCustomKey = async (
    provider: Provider,
    privateKeyPath: string
  ) => {
    setLoading((prev) => ({ ...prev, [provider]: true }));
    try {
      await setProviderCustomSshKey(provider, privateKeyPath);
      toast.success("SSH key configured successfully");
      await loadStatuses();
    } catch (error) {
      toast.error(`Failed to set SSH key: ${error}`);
    } finally {
      setLoading((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const hasConnectedProviders = PROVIDERS.some((p) => statuses?.[p]?.connected);

  return (
    <div className="grid gap-4">
      <SettingsField
        description="Connect your GitHub, GitLab, or Bitbucket accounts to access your repositories."
        label="Git Provider Accounts"
        query={query}
      >
        <div className="grid gap-2">
          {statuses === null
            ? PROVIDERS.map((provider) => (
                <OAuthButtonSkeleton key={provider} />
              ))
            : PROVIDERS.map((provider) => (
                <OAuthButton
                  key={provider}
                  onConnect={() => handleConnect(provider)}
                  onDisconnect={() => handleDisconnect(provider)}
                  provider={provider}
                  status={statuses[provider]}
                />
              ))}
        </div>
        <p className="mt-2 text-muted-foreground text-xs">
          After clicking connect, LitGit should reopen automatically after
          browser approval. Paste the verification token only if LitGit does not
          open.
        </p>
      </SettingsField>

      {hasConnectedProviders && (
        <SettingsField
          description="Configure SSH keys for each connected provider. You can use your system SSH agent or provider-specific keys."
          label="Provider SSH Keys"
          query={query}
        >
          <div className="grid gap-3">
            {PROVIDERS.filter((p) => statuses?.[p]?.connected).map(
              (provider) => (
                <ProviderCard
                  key={provider}
                  onGenerateKey={(title) => handleGenerateKey(provider, title)}
                  onRemoveKey={() => handleRemoveKey(provider)}
                  onSetCustomKey={(privateKeyPath) =>
                    handleSetCustomKey(provider, privateKeyPath)
                  }
                  onUseSystemAgentChange={(use) =>
                    handleUseSystemAgentChange(provider, use)
                  }
                  provider={provider}
                  sshStatus={
                    sshStatuses?.[provider] ?? { useSystemAgent: true }
                  }
                  status={
                    statuses?.[provider] ?? {
                      connected: false,
                      username: null,
                      displayName: null,
                      avatarUrl: null,
                    }
                  }
                />
              )
            )}
          </div>
        </SettingsField>
      )}
      <ProviderOAuthTokenDialog
        isSubmitting={isOAuthSubmitting}
        onOpenChange={(open) => {
          setIsOAuthDialogOpen(open);
          if (!open) {
            setPendingOAuthFlow(null);
            setIsOAuthSubmitting(false);
          }
        }}
        onSubmit={handleCompleteOAuthFromPaste}
        open={isOAuthDialogOpen}
        pendingState={pendingOAuthFlow?.state ?? null}
        provider={pendingOAuthFlow?.provider ?? null}
      />
    </div>
  );
}
