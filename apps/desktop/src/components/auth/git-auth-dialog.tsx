import { Button } from "@litgit/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@litgit/ui/components/dialog";
import { KeyIcon, SpinnerIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  OAuthButton,
  OAuthButtonSkeleton,
} from "@/components/auth/oauth-button";
import { ProviderOAuthTokenDialog } from "@/components/auth/provider-oauth-token-dialog";
import {
  type GitAuthPromptPayload,
  resolveOAuthProviderForPrompt,
} from "@/lib/tauri-auth-client";
import {
  completeOAuthFlow,
  disconnectProvider,
  getProviderStatus,
  type Provider,
  type ProviderStatus,
  redeemOAuthHandoffToken,
  resolveOAuthHandoffTokenFromInput,
  startOAuthFlow,
} from "@/lib/tauri-integrations-client";

type OAuthFlowState =
  | { type: "idle" }
  | { type: "connecting"; provider: Provider }
  | { type: "awaiting_callback"; provider: Provider; state: string }
  | { type: "error"; error: string; provider?: Provider };

interface GitAuthDialogProps {
  onCancel: () => Promise<void>;
  onContinue: () => Promise<void>;
  open: boolean;
  prompt: GitAuthPromptPayload;
}

function unsupportedMessageForPrompt(prompt: GitAuthPromptPayload): string {
  if (prompt.kind === "ssh-passphrase" || prompt.kind === "ssh-password") {
    return "LitGit currently supports OAuth authentication for github.com, gitlab.com, and bitbucket.org over HTTPS only. SSH password and passphrase prompts are not supported in this product flow.";
  }

  return "LitGit currently supports OAuth authentication for github.com, gitlab.com, and bitbucket.org over HTTPS only. This host or authentication flow is not supported yet.";
}

export function GitAuthDialog({
  open,
  onCancel,
  onContinue,
  prompt,
}: GitAuthDialogProps) {
  const [statuses, setStatuses] = useState<Record<
    Provider,
    ProviderStatus
  > | null>(null);
  const [flowState, setFlowState] = useState<OAuthFlowState>({ type: "idle" });
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);

  const oauthProvider = resolveOAuthProviderForPrompt(prompt);
  const isSupportedPrompt = oauthProvider !== null;
  const canContinue =
    oauthProvider !== null && statuses?.[oauthProvider]?.connected === true;

  const loadStatuses = useCallback(async () => {
    if (!oauthProvider) {
      setStatuses(null);
      return;
    }

    try {
      const nextStatuses = await getProviderStatus();
      setStatuses(nextStatuses);
    } catch (error) {
      console.error("Failed to load provider statuses:", error);
    }
  }, [oauthProvider]);

  const handleOAuthCallback = useCallback(
    async (code: string, state: string) => {
      if (flowState.type !== "awaiting_callback" || flowState.state !== state) {
        return;
      }

      const { provider } = flowState;
      setFlowState({ type: "connecting", provider });

      await new Promise((resolve) => setTimeout(resolve, 50));

      try {
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
        setFlowState({ type: "idle" });
        // Automatically continue after successful connection
        onContinue().catch(() => {
          // Ignore error
        });
      } catch (error) {
        toast.error(`Failed to connect: ${error}`);
        setFlowState({
          type: "error",
          error: String(error),
          provider,
        });
      }
    },
    [flowState, onContinue]
  );

  const loadStatusesWhenOpen = useCallback(() => {
    if (open) {
      loadStatuses();
    }
  }, [open, loadStatuses]);

  useEffect(loadStatusesWhenOpen, [loadStatusesWhenOpen]);

  useEffect(() => {
    const unlisten = listen("oauth-callback", (event) => {
      const { code, state } = event.payload as { code: string; state: string };
      handleOAuthCallback(code, state);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleOAuthCallback]);

  const handleConnect = async (provider: Provider) => {
    try {
      setFlowState({ type: "connecting", provider });
      await new Promise((resolve) => setTimeout(resolve, 50));

      const { url, state } = await startOAuthFlow(provider);
      setFlowState({ type: "awaiting_callback", provider, state });
      await openUrl(url);
    } catch (error) {
      toast.error(`Failed to start connection: ${error}`);
      setFlowState({
        type: "error",
        error: String(error),
        provider,
      });
    }
  };

  const handleCompleteOAuthFromPaste = async (
    provider: Provider,
    token: string
  ) => {
    setFlowState({ type: "connecting", provider });
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
      setFlowState({ type: "idle" });
      setIsManualEntryOpen(false);
      // Automatically continue after successful connection
      onContinue().catch(() => {
        // Ignore error
      });
    } catch (error) {
      toast.error(`Failed to connect: ${error}`);
      setFlowState({
        type: "error",
        error: String(error),
        provider,
      });
    }
  };

  const handleDisconnect = async (provider: Provider) => {
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
    }
  };

  const providerLabel = oauthProvider
    ? `${oauthProvider.charAt(0).toUpperCase() + oauthProvider.slice(1)}`
    : null;

  return (
    <Dialog
      onOpenChange={(isOpen) => {
        if (
          !isOpen &&
          (flowState.type === "idle" || flowState.type === "error")
        ) {
          onCancel().catch(() => {
            // Ignore error
          });
        }
      }}
      open={open}
    >
      <DialogContent
        className="gap-3 p-3 text-xs sm:max-w-md"
        showCloseButton={false}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <KeyIcon
                aria-hidden="true"
                className="size-4 text-primary"
                weight="duotone"
              />
            </div>
            <div className="grid gap-0.5">
              <DialogTitle className="text-sm">
                {isSupportedPrompt
                  ? `${providerLabel} Authentication Required`
                  : "Unsupported Authentication"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {isSupportedPrompt
                  ? `Connect ${providerLabel} to continue this ${prompt.operation} operation.`
                  : unsupportedMessageForPrompt(prompt)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
          <p className="font-medium text-foreground text-xs">
            {prompt.operation.toUpperCase()} prompt
          </p>
          <p className="wrap-break-word mt-1 font-mono text-muted-foreground text-xs">
            {prompt.prompt}
          </p>
          {prompt.host ? (
            <p className="mt-2 text-muted-foreground text-xs">
              Host:{" "}
              <span className="font-medium text-foreground">{prompt.host}</span>
            </p>
          ) : null}
        </div>

        {isSupportedPrompt ? (
          <div className="grid gap-2">
            {statuses === null || !oauthProvider ? (
              <OAuthButtonSkeleton />
            ) : (
              <OAuthButton
                connectButtonClassName="w-full justify-start gap-2"
                connectButtonLabel={
                  flowState.type === "error" &&
                  flowState.provider === oauthProvider
                    ? "Try again"
                    : `Connect ${providerLabel}`
                }
                connectDisabled={
                  flowState.type === "connecting" ||
                  (flowState.type === "awaiting_callback" &&
                    flowState.provider === oauthProvider)
                }
                connectIconClassName={
                  flowState.type === "connecting" &&
                  flowState.provider === oauthProvider
                    ? "animate-spin"
                    : undefined
                }
                disconnectedSuffix={
                  flowState.type === "awaiting_callback" &&
                  flowState.provider === oauthProvider ? (
                    <Button
                      className="text-xs"
                      onClick={() => setIsManualEntryOpen(true)}
                      size="sm"
                      variant="outline"
                    >
                      Paste token
                    </Button>
                  ) : undefined
                }
                onConnect={() => handleConnect(oauthProvider)}
                onDisconnect={() => handleDisconnect(oauthProvider)}
                provider={oauthProvider}
                status={statuses[oauthProvider]}
              />
            )}
            <p className="text-muted-foreground text-xs">
              LitGit uses your connected OAuth account for supported HTTPS Git
              operations. No manual username or password entry in this flow.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
            <div className="flex items-start gap-2">
              <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <p className="text-amber-700 text-xs dark:text-amber-300">
                {unsupportedMessageForPrompt(prompt)}
              </p>
            </div>
          </div>
        )}

        {flowState.type === "awaiting_callback" ? (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="mb-1 flex items-center gap-2 text-foreground text-xs">
              <SpinnerIcon className="size-3 animate-spin" />
              <span className="font-medium">
                Finish authorization in your browser
              </span>
            </div>
            <p className="text-muted-foreground text-xs">
              Waiting for browser handoff. LitGit should reopen automatically.
              If it does not, paste verification token manually.
            </p>
          </div>
        ) : null}

        {flowState.type === "error" ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
            <p className="text-destructive text-xs">{flowState.error}</p>
            <Button
              className="mt-2 h-7 text-xs"
              onClick={() => setFlowState({ type: "idle" })}
              size="sm"
              variant="outline"
            >
              Try again
            </Button>
          </div>
        ) : null}

        <DialogFooter className="-mx-3 -mb-3 p-3 sm:justify-between">
          <Button
            className="min-w-18 text-xs"
            disabled={flowState.type === "connecting"}
            onClick={() => {
              onCancel().catch(() => {
                // Ignore error
              });
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Close
          </Button>
          <Button
            className="min-w-28 text-xs"
            disabled={!canContinue || flowState.type === "connecting"}
            onClick={() => {
              onContinue().catch(() => {
                // Ignore error
              });
            }}
            size="sm"
            type="button"
          >
            {flowState.type === "connecting" ? (
              <>
                <SpinnerIcon className="mr-2 size-3 animate-spin" />
                Connecting...
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </DialogFooter>

        <ProviderOAuthTokenDialog
          flowState={
            flowState.type === "awaiting_callback" ? "awaiting" : "manual"
          }
          isSubmitting={flowState.type === "connecting"}
          onCancel={() => {
            if (flowState.type === "awaiting_callback") {
              setIsManualEntryOpen(false);
            } else {
              setFlowState({ type: "idle" });
            }
          }}
          onOpenChange={(nextOpen) => {
            setIsManualEntryOpen(nextOpen);
            if (!nextOpen && flowState.type !== "awaiting_callback") {
              setFlowState({ type: "idle" });
            }
          }}
          onSubmit={handleCompleteOAuthFromPaste}
          open={isManualEntryOpen}
          pendingState={
            flowState.type === "awaiting_callback" ? flowState.state : null
          }
          provider={
            flowState.type === "awaiting_callback" ||
            flowState.type === "connecting" ||
            (flowState.type === "error" && flowState.provider)
              ? (flowState.provider ?? null)
              : oauthProvider
          }
        />
      </DialogContent>
    </Dialog>
  );
}
