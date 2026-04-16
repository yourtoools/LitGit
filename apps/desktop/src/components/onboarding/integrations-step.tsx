import { Button } from "@litgit/ui/components/button";
import { KeyIcon } from "@phosphor-icons/react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  OAuthButton,
  OAuthButtonSkeleton,
} from "@/components/auth/oauth-button";
import { ProviderOAuthTokenDialog } from "@/components/auth/provider-oauth-token-dialog";
import type { Provider, ProviderStatus } from "@/lib/tauri-integrations-client";
import {
  completeOAuthFlow,
  disconnectProvider,
  getProviderStatus,
  redeemOAuthHandoffToken,
  resolveOAuthHandoffTokenFromInput,
  startOAuthFlow,
} from "@/lib/tauri-integrations-client";

interface IntegrationsStepProps {
  onBack: () => void;
  onComplete: () => void;
  onSkip: () => void;
}

const PROVIDERS: Provider[] = ["github", "gitlab", "bitbucket"];

export function IntegrationsStep({
  onBack,
  onComplete,
  onSkip,
}: IntegrationsStepProps) {
  const [pendingOAuthFlow, setPendingOAuthFlow] = useState<{
    provider: Provider;
    state: string;
  } | null>(null);
  const [isOAuthDialogOpen, setIsOAuthDialogOpen] = useState(false);
  const [isOAuthSubmitting, setIsOAuthSubmitting] = useState(false);
  const [providerStatuses, setProviderStatuses] = useState<Record<
    Provider,
    ProviderStatus
  > | null>(null);

  const loadStatuses = useCallback(async () => {
    try {
      const statuses = await getProviderStatus();
      setProviderStatuses(statuses);
    } catch (error) {
      toast.error(`Failed to load provider statuses: ${error}`);
    }
  }, []);

  const handleOAuthCallback = useCallback(
    async (code: string, state: string) => {
      if (pendingOAuthFlow?.state !== state) {
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
        setProviderStatuses((previousStatuses) =>
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
      } catch (error) {
        toast.error(`Failed to connect: ${error}`);
      } finally {
        setIsOAuthSubmitting(false);
        setPendingOAuthFlow(null);
        setIsOAuthDialogOpen(false);
      }
    },
    [pendingOAuthFlow]
  );

  useEffect(() => {
    loadStatuses();

    const unlisten = listen("oauth-callback", (event) => {
      const { code, state } = event.payload as { code: string; state: string };
      handleOAuthCallback(code, state).catch((error) => {
        toast.error(`Failed to connect: ${error}`);
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleOAuthCallback, loadStatuses]);

  const handleConnect = async (provider: Provider) => {
    try {
      const { url, state } = await startOAuthFlow(provider);
      setPendingOAuthFlow({ provider, state });
      setIsOAuthDialogOpen(true);
      await openUrl(url);
    } catch (error) {
      toast.error(`Failed to start connection: ${error}`);
      setPendingOAuthFlow(null);
      setIsOAuthDialogOpen(false);
    }
  };

  const handleCompleteOAuthFromPaste = async (
    provider: Provider,
    token: string
  ) => {
    setIsOAuthSubmitting(true);

    // Defer heavy work to allow UI to paint loading state
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      const resolvedToken = resolveOAuthHandoffTokenFromInput(token);
      const { code, state } = await redeemOAuthHandoffToken(resolvedToken);
      const userInfo = await completeOAuthFlow(code, state);

      toast.success(`Connected to ${provider} as ${userInfo.username}`);
      setProviderStatuses((previousStatuses) =>
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
    } finally {
      setIsOAuthSubmitting(false);
    }
  };

  const handleDisconnect = async (provider: Provider) => {
    try {
      await disconnectProvider(provider);
      toast.success(`Disconnected from ${provider}`);

      // Update local state immediately to reflect disconnection
      setProviderStatuses((previousStatuses) =>
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
    }
  };

  const handleSaveAndContinue = () => {
    onComplete();
  };

  const hasConnectedProviders = PROVIDERS.some(
    (provider) => providerStatuses?.[provider]?.connected
  );

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <div className="grid gap-3 border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <KeyIcon className="size-4 text-primary" weight="duotone" />
          </div>
          <div className="grid gap-0.5">
            <h2 className="font-semibold text-foreground text-sm">
              Integrations
            </h2>
            <p className="text-muted-foreground text-xs">
              Connect your accounts to access your repositories. You can skip
              this and add them later in Settings.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-sm">Git Provider Accounts</h3>
          <div className="grid gap-2">
            {providerStatuses === null
              ? PROVIDERS.map((provider) => (
                  <OAuthButtonSkeleton key={provider} />
                ))
              : PROVIDERS.map((provider) => (
                  <OAuthButton
                    connectDisabled={pendingOAuthFlow?.provider === provider}
                    key={provider}
                    onConnect={() => handleConnect(provider)}
                    onDisconnect={() => handleDisconnect(provider)}
                    provider={provider}
                    status={providerStatuses[provider]}
                  />
                ))}
          </div>
          <p className="text-muted-foreground text-xs">
            After clicking connect, LitGit should reopen automatically after
            browser approval. Paste the verification token only if LitGit does
            not open.
          </p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button onClick={onBack} size="sm" variant="ghost">
            Back
          </Button>
          <div className="flex items-center gap-2">
            {!hasConnectedProviders && (
              <Button onClick={onSkip} size="sm" variant="ghost">
                Configure Later
              </Button>
            )}
            <Button
              disabled={!hasConnectedProviders}
              onClick={handleSaveAndContinue}
              size="sm"
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
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
