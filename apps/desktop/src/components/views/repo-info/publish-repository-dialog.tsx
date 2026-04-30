import { Button } from "@litgit/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@litgit/ui/components/dialog";
import { Input } from "@litgit/ui/components/input";
import { Label } from "@litgit/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@litgit/ui/components/select";
import { SpinnerIcon } from "@phosphor-icons/react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo } from "react";
import { ProviderOAuthTokenDialog } from "@/components/auth/provider-oauth-token-dialog";
import {
  resolveDefaultPublishProvider,
  resolveDefaultPublishTarget,
  resolvePublishRepositoryNameError,
} from "@/components/views/repo-info/publish-repository-dialog.helpers";
import { useReducerState } from "@/hooks/use-reducer-state";
import type { Provider, ProviderStatus } from "@/lib/tauri-integrations-client";
import {
  completeOAuthFlow,
  getProviderStatus,
  redeemOAuthHandoffToken,
  resolveOAuthHandoffTokenFromInput,
  startOAuthFlow,
} from "@/lib/tauri-integrations-client";
import {
  listPublishTargets,
  type PublishTarget,
} from "@/lib/tauri-publishing-client";
import type { PublishRepositoryOptions } from "@/stores/repo/repo-store-types";

interface PublishRepositoryDialogProps {
  errorMessage: null | string;
  initialRepoName: string;
  isSubmitting: boolean;
  onConfirm: (options: PublishRepositoryOptions) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const PROVIDERS: Provider[] = ["github", "gitlab", "bitbucket"];

const PROVIDER_LABELS: Record<Provider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Something went wrong. Please try again.";
}

export function PublishRepositoryDialog({
  errorMessage,
  initialRepoName,
  isSubmitting,
  onConfirm,
  onOpenChange,
  open,
}: PublishRepositoryDialogProps) {
  const [statuses, updateStatuses] = useReducerState<Record<
    Provider,
    ProviderStatus
  > | null>(null);
  const [provider, updateProvider] = useReducerState<Provider | null>(null);
  const [targets, updateTargets] = useReducerState<PublishTarget[]>([]);
  const [targetId, updateTargetId] = useReducerState("");
  const [repoName, updateRepoName] = useReducerState(initialRepoName);
  const [visibility, updateVisibility] = useReducerState<"private" | "public">(
    "private"
  );
  const [isLoadingStatuses, updateIsLoadingStatuses] = useReducerState(false);
  const [isLoadingTargets, updateIsLoadingTargets] = useReducerState(false);
  const [localErrorMessage, updateLocalErrorMessage] = useReducerState<
    string | null
  >(null);
  const [pendingOAuthFlow, updatePendingOAuthFlow] = useReducerState<{
    provider: Provider;
    state: string;
  } | null>(null);
  const [isOAuthDialogOpen, updateIsOAuthDialogOpen] = useReducerState(false);
  const [isOAuthSubmitting, updateIsOAuthSubmitting] = useReducerState(false);

  const selectedProviderStatus = provider ? statuses?.[provider] : null;
  const isProviderConnected = selectedProviderStatus?.connected ?? false;
  const canConfirm = isSubmitting || !provider || !targetId;
  const resolvedErrorMessage = localErrorMessage ?? errorMessage;

  const handleOAuthSuccess = useCallback(
    async (oauthProvider: Provider, code: string, state: string) => {
      updateIsOAuthSubmitting(true);
      try {
        await completeOAuthFlow(code, state);
        const nextStatuses = await getProviderStatus();
        updateStatuses(nextStatuses);
        updateProvider(oauthProvider);
        updateLocalErrorMessage(null);
        updatePendingOAuthFlow(null);
        updateIsOAuthDialogOpen(false);
      } catch (error) {
        updateLocalErrorMessage(getErrorMessage(error));
      } finally {
        updateIsOAuthSubmitting(false);
      }
    },
    [
      updateProvider,
      updateIsOAuthSubmitting,
      updateStatuses,
      updateLocalErrorMessage,
      updatePendingOAuthFlow,
      updateIsOAuthDialogOpen,
    ]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    let ignore = false;
    updateIsLoadingStatuses(true);
    updateStatuses(null);
    updateTargets([]);
    updateTargetId("");
    updateRepoName(initialRepoName);
    updateVisibility("private");
    updateLocalErrorMessage(null);

    const loadProviderStatus = async () => {
      try {
        const nextStatuses = await getProviderStatus();
        if (ignore) {
          return;
        }

        updateStatuses(nextStatuses);
        updateProvider(resolveDefaultPublishProvider(nextStatuses));
      } catch (error) {
        if (ignore) {
          return;
        }
        updateStatuses(null);
        updateProvider(null);
        updateLocalErrorMessage(getErrorMessage(error));
      } finally {
        if (!ignore) {
          updateIsLoadingStatuses(false);
        }
      }
    };

    loadProviderStatus();

    return () => {
      ignore = true;
    };
  }, [
    initialRepoName,
    open,
    updateProvider,
    updateVisibility,
    updateTargetId,
    updateStatuses,
    updateRepoName,
    updateIsLoadingStatuses,
    updateTargets,
    updateLocalErrorMessage,
  ]);

  useEffect(() => {
    if (!(open && provider && statuses?.[provider]?.connected)) {
      updateTargets([]);
      updateTargetId("");
      updateIsLoadingTargets(false);
      return;
    }

    let ignore = false;
    updateIsLoadingTargets(true);
    updateLocalErrorMessage(null);
    updateTargets([]);
    updateTargetId("");

    const loadPublishTargets = async () => {
      try {
        const nextTargets = await listPublishTargets(provider);
        if (ignore) {
          return;
        }

        updateTargets(nextTargets);
        updateTargetId(
          resolveDefaultPublishTarget(provider, nextTargets)?.id ?? ""
        );
      } catch (error) {
        if (ignore) {
          return;
        }

        updateTargets([]);
        updateTargetId("");
        updateLocalErrorMessage(getErrorMessage(error));
      } finally {
        if (!ignore) {
          updateIsLoadingTargets(false);
        }
      }
    };

    loadPublishTargets();

    return () => {
      ignore = true;
    };
  }, [
    open,
    provider,
    statuses,
    updateTargetId,
    updateLocalErrorMessage,
    updateIsLoadingTargets,
    updateTargets,
  ]);

  useEffect(() => {
    if (!(open && pendingOAuthFlow)) {
      return;
    }

    const unlisten = listen("oauth-callback", (event) => {
      const payload = event.payload as { code: string; state: string };
      if (payload.state !== pendingOAuthFlow.state) {
        return;
      }

      handleOAuthSuccess(
        pendingOAuthFlow.provider,
        payload.code,
        payload.state
      ).catch((error) => {
        updateLocalErrorMessage(getErrorMessage(error));
      });
    });

    return () => {
      unlisten
        .then((cleanup) => cleanup())
        .catch((error) => {
          updateLocalErrorMessage(getErrorMessage(error));
        });
    };
  }, [handleOAuthSuccess, open, pendingOAuthFlow, updateLocalErrorMessage]);

  const providerTargets = useMemo(
    () => targets.filter((target) => target.provider === provider),
    [provider, targets]
  );

  const handleStartOAuth = async (oauthProvider: Provider) => {
    updateLocalErrorMessage(null);
    try {
      const { url, state } = await startOAuthFlow(oauthProvider);
      updatePendingOAuthFlow({ provider: oauthProvider, state });
      updateIsOAuthDialogOpen(true);
      await openUrl(url);
    } catch (error) {
      updatePendingOAuthFlow(null);
      updateIsOAuthDialogOpen(false);
      updateLocalErrorMessage(getErrorMessage(error));
    }
  };

  const handleCompleteOAuthFromPaste = async (
    oauthProvider: Provider,
    token: string
  ) => {
    const resolvedToken = resolveOAuthHandoffTokenFromInput(token);
    const { code, state } = await redeemOAuthHandoffToken(resolvedToken);
    await handleOAuthSuccess(oauthProvider, code, state);
  };

  const handleConfirm = async () => {
    if (!provider) {
      updateLocalErrorMessage("Choose a provider before publishing.");
      return;
    }

    if (!statuses?.[provider]?.connected) {
      updateLocalErrorMessage(
        "Connect the selected provider before publishing."
      );
      return;
    }

    const repoNameError = resolvePublishRepositoryNameError(repoName);
    if (repoNameError) {
      updateLocalErrorMessage(repoNameError);
      return;
    }

    if (!targetId) {
      updateLocalErrorMessage("Choose a destination before publishing.");
      return;
    }

    updateLocalErrorMessage(null);
    await onConfirm({
      provider,
      targetId,
      repoName: repoName.trim(),
      visibility,
    });
  };

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent
          className="gap-3 p-3 text-xs sm:max-w-md"
          showCloseButton={!isSubmitting}
        >
          <DialogHeader>
            <DialogTitle className="text-sm">
              Publish repository before push
            </DialogTitle>
            <DialogDescription className="text-xs">
              Choose where LitGit should create the remote repository before
              pushing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="font-medium text-xs">Provider</legend>
              <div className="grid grid-cols-3 gap-2">
                {PROVIDERS.map((providerOption) => (
                  <Button
                    aria-pressed={provider === providerOption}
                    className="justify-start text-xs"
                    disabled={isSubmitting || isLoadingStatuses}
                    key={providerOption}
                    onClick={() => {
                      updateProvider(providerOption);
                      updateLocalErrorMessage(null);
                    }}
                    size="sm"
                    type="button"
                    variant={
                      provider === providerOption ? "default" : "outline"
                    }
                  >
                    {PROVIDER_LABELS[providerOption]}
                  </Button>
                ))}
              </div>
              {provider && !statuses?.[provider]?.connected ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-dashed p-2">
                  <p className="text-muted-foreground text-xs">
                    Connect {PROVIDER_LABELS[provider]} to choose a destination.
                  </p>
                  <Button
                    className="text-xs"
                    disabled={isSubmitting || isOAuthSubmitting}
                    onClick={() => {
                      handleStartOAuth(provider);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {isOAuthSubmitting &&
                    pendingOAuthFlow?.provider === provider ? (
                      <>
                        <SpinnerIcon className="mr-2 size-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      "Connect"
                    )}
                  </Button>
                </div>
              ) : null}
            </fieldset>

            <div className="space-y-2">
              <Label
                className="text-xs"
                htmlFor="publish-repository-destination"
              >
                Destination
              </Label>
              <Select
                disabled={
                  isSubmitting ||
                  isLoadingTargets ||
                  !provider ||
                  !isProviderConnected ||
                  providerTargets.length === 0
                }
                onValueChange={(value) => {
                  updateTargetId(value ?? "");
                  updateLocalErrorMessage(null);
                }}
                value={targetId}
              >
                <SelectTrigger
                  className="focus-visible:desktop-focus w-full text-xs focus-visible:ring-0! focus-visible:ring-offset-0!"
                  id="publish-repository-destination"
                  size="sm"
                >
                  <SelectValue
                    placeholder={
                      isLoadingTargets
                        ? "Loading destinations..."
                        : "Choose destination"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {providerTargets.map((target) => (
                    <SelectItem key={target.id} value={target.id}>
                      {target.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs" htmlFor="publish-repository-name">
                Repository name
              </Label>
              <Input
                autoCapitalize="none"
                autoCorrect="off"
                className="focus-visible:desktop-focus h-7 text-xs focus-visible:ring-0! focus-visible:ring-offset-0!"
                disabled={isSubmitting}
                id="publish-repository-name"
                onChange={(event) => {
                  updateRepoName(event.target.value);
                  updateLocalErrorMessage(null);
                }}
                placeholder="my-repository"
                spellCheck={false}
                value={repoName}
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="font-medium text-xs">Visibility</legend>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  aria-pressed={visibility === "private"}
                  className="justify-start text-xs"
                  disabled={isSubmitting}
                  onClick={() => {
                    updateVisibility("private");
                    updateLocalErrorMessage(null);
                  }}
                  size="sm"
                  type="button"
                  variant={visibility === "private" ? "default" : "outline"}
                >
                  Private
                </Button>
                <Button
                  aria-pressed={visibility === "public"}
                  className="justify-start text-xs"
                  disabled={isSubmitting}
                  onClick={() => {
                    updateVisibility("public");
                    updateLocalErrorMessage(null);
                  }}
                  size="sm"
                  type="button"
                  variant={visibility === "public" ? "default" : "outline"}
                >
                  Public
                </Button>
              </div>
            </fieldset>

            {resolvedErrorMessage ? (
              <p className="text-destructive text-xs">{resolvedErrorMessage}</p>
            ) : null}
          </div>

          <DialogFooter className="-mx-3 -mb-3 p-3">
            <Button
              className="focus-visible:desktop-focus text-xs focus-visible:ring-0! focus-visible:ring-offset-0!"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="focus-visible:desktop-focus text-xs focus-visible:ring-0! focus-visible:ring-offset-0!"
              disabled={canConfirm}
              onClick={() => {
                handleConfirm().catch(() => undefined);
              }}
              size="sm"
              type="button"
            >
              {isSubmitting ? (
                <>
                  <SpinnerIcon className="mr-2 size-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                "Publish and Push"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProviderOAuthTokenDialog
        isSubmitting={isOAuthSubmitting}
        onOpenChange={(nextOpen) => {
          updateIsOAuthDialogOpen(nextOpen);
          if (!(nextOpen || isOAuthSubmitting)) {
            updatePendingOAuthFlow(null);
          }
        }}
        onSubmit={handleCompleteOAuthFromPaste}
        open={isOAuthDialogOpen}
        pendingState={pendingOAuthFlow?.state ?? null}
        provider={pendingOAuthFlow?.provider ?? provider}
      />
    </>
  );
}
