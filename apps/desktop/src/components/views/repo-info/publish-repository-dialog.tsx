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
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProviderOAuthTokenDialog } from "@/components/auth/provider-oauth-token-dialog";
import {
  resolveDefaultPublishProvider,
  resolveDefaultPublishTarget,
  resolvePublishRepositoryNameError,
} from "@/components/views/repo-info/publish-repository-dialog.helpers";
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
  const [statuses, setStatuses] = useState<Record<
    Provider,
    ProviderStatus
  > | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [targets, setTargets] = useState<PublishTarget[]>([]);
  const [targetId, setTargetId] = useState("");
  const [repoName, setRepoName] = useState(initialRepoName);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(false);
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(
    null
  );
  const [pendingOAuthFlow, setPendingOAuthFlow] = useState<{
    provider: Provider;
    state: string;
  } | null>(null);
  const [isOAuthDialogOpen, setIsOAuthDialogOpen] = useState(false);
  const [isOAuthSubmitting, setIsOAuthSubmitting] = useState(false);

  const selectedProviderStatus = provider ? statuses?.[provider] : null;
  const isProviderConnected = selectedProviderStatus?.connected ?? false;
  const canConfirm = isSubmitting || !provider || !targetId;
  const resolvedErrorMessage = localErrorMessage ?? errorMessage;

  const handleOAuthSuccess = useCallback(
    async (oauthProvider: Provider, code: string, state: string) => {
      setIsOAuthSubmitting(true);
      try {
        await completeOAuthFlow(code, state);
        const nextStatuses = await getProviderStatus();
        setStatuses(nextStatuses);
        setProvider(oauthProvider);
        setLocalErrorMessage(null);
        setPendingOAuthFlow(null);
        setIsOAuthDialogOpen(false);
      } catch (error) {
        setLocalErrorMessage(getErrorMessage(error));
      } finally {
        setIsOAuthSubmitting(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    let ignore = false;
    setIsLoadingStatuses(true);
    setStatuses(null);
    setTargets([]);
    setTargetId("");
    setRepoName(initialRepoName);
    setVisibility("private");
    setLocalErrorMessage(null);

    const loadProviderStatus = async () => {
      try {
        const nextStatuses = await getProviderStatus();
        if (ignore) {
          return;
        }

        setStatuses(nextStatuses);
        setProvider(resolveDefaultPublishProvider(nextStatuses));
      } catch (error) {
        if (ignore) {
          return;
        }
        setStatuses(null);
        setProvider(null);
        setLocalErrorMessage(getErrorMessage(error));
      } finally {
        if (!ignore) {
          setIsLoadingStatuses(false);
        }
      }
    };

    loadProviderStatus();

    return () => {
      ignore = true;
    };
  }, [initialRepoName, open]);

  useEffect(() => {
    if (!(open && provider && statuses?.[provider]?.connected)) {
      setTargets([]);
      setTargetId("");
      setIsLoadingTargets(false);
      return;
    }

    let ignore = false;
    setIsLoadingTargets(true);
    setLocalErrorMessage(null);
    setTargets([]);
    setTargetId("");

    const loadPublishTargets = async () => {
      try {
        const nextTargets = await listPublishTargets(provider);
        if (ignore) {
          return;
        }

        setTargets(nextTargets);
        setTargetId(
          resolveDefaultPublishTarget(provider, nextTargets)?.id ?? ""
        );
      } catch (error) {
        if (ignore) {
          return;
        }

        setTargets([]);
        setTargetId("");
        setLocalErrorMessage(getErrorMessage(error));
      } finally {
        if (!ignore) {
          setIsLoadingTargets(false);
        }
      }
    };

    loadPublishTargets();

    return () => {
      ignore = true;
    };
  }, [open, provider, statuses]);

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
        setLocalErrorMessage(getErrorMessage(error));
      });
    });

    return () => {
      unlisten
        .then((cleanup) => cleanup())
        .catch((error) => {
          setLocalErrorMessage(getErrorMessage(error));
        });
    };
  }, [handleOAuthSuccess, open, pendingOAuthFlow]);

  const providerTargets = useMemo(
    () => targets.filter((target) => target.provider === provider),
    [provider, targets]
  );

  const handleStartOAuth = async (oauthProvider: Provider) => {
    setLocalErrorMessage(null);
    try {
      const { url, state } = await startOAuthFlow(oauthProvider);
      setPendingOAuthFlow({ provider: oauthProvider, state });
      setIsOAuthDialogOpen(true);
      await openUrl(url);
    } catch (error) {
      setPendingOAuthFlow(null);
      setIsOAuthDialogOpen(false);
      setLocalErrorMessage(getErrorMessage(error));
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
      setLocalErrorMessage("Choose a provider before publishing.");
      return;
    }

    if (!statuses?.[provider]?.connected) {
      setLocalErrorMessage("Connect the selected provider before publishing.");
      return;
    }

    const repoNameError = resolvePublishRepositoryNameError(repoName);
    if (repoNameError) {
      setLocalErrorMessage(repoNameError);
      return;
    }

    if (!targetId) {
      setLocalErrorMessage("Choose a destination before publishing.");
      return;
    }

    setLocalErrorMessage(null);
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
                      setProvider(providerOption);
                      setLocalErrorMessage(null);
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
                  setTargetId(value ?? "");
                  setLocalErrorMessage(null);
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
                  setRepoName(event.target.value);
                  setLocalErrorMessage(null);
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
                    setVisibility("private");
                    setLocalErrorMessage(null);
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
                    setVisibility("public");
                    setLocalErrorMessage(null);
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
          setIsOAuthDialogOpen(nextOpen);
          if (!(nextOpen || isOAuthSubmitting)) {
            setPendingOAuthFlow(null);
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
