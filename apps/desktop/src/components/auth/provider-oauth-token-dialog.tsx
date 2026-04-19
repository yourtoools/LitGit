import { Button } from "@litgit/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@litgit/ui/components/dialog";
import { Textarea } from "@litgit/ui/components/textarea";
import { SpinnerIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
  type Provider,
  resolveOAuthHandoffTokenFromInput,
} from "@/lib/tauri-integrations-client";

const PROVIDER_TOKEN_COPY: Record<
  Provider,
  {
    name: string;
  }
> = {
  github: {
    name: "GitHub",
  },
  gitlab: {
    name: "GitLab",
  },
  bitbucket: {
    name: "Bitbucket",
  },
};

interface ProviderOAuthTokenDialogProps {
  flowState?: "awaiting" | "manual";
  isSubmitting?: boolean;
  onCancel?: () => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (provider: Provider, token: string) => Promise<void>;
  open: boolean;
  pendingState: string | null; // Kept for context but not passed to onSubmit
  provider: Provider | null;
}

export function ProviderOAuthTokenDialog({
  provider,
  open,
  onOpenChange,
  onSubmit,
  onCancel,
  isSubmitting = false,
  pendingState: _pendingState,
  flowState = "manual",
}: ProviderOAuthTokenDialogProps) {
  const [callbackValue, setCallbackValue] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCallbackValue("");
      setErrorMessage(null);
    }
  }, [open]);

  if (!provider) {
    return null;
  }

  const providerCopy = PROVIDER_TOKEN_COPY[provider];
  const dialogTitle =
    flowState === "awaiting"
      ? `Finish ${providerCopy.name} OAuth`
      : `Finish ${providerCopy.name} OAuth`;
  const dialogDescription =
    flowState === "awaiting"
      ? "LitGit should reopen automatically after browser approval. If it does not open, paste the verification token below."
      : "Paste the verification token here only if LitGit does not reopen automatically.";

  const handleSubmit = async () => {
    try {
      const token = resolveOAuthHandoffTokenFromInput(callbackValue);
      setErrorMessage(null);
      await onSubmit(provider, token);
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to complete OAuth connection."
      );
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="gap-3 p-3 text-xs sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">{dialogTitle}</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <label className="font-medium text-xs" htmlFor="provider-oauth-token">
            Verification token
          </label>
          <Textarea
            autoCapitalize="none"
            autoCorrect="off"
            className="min-h-24 px-2.5 py-1.5 font-mono text-xs"
            id="provider-oauth-token"
            onChange={(event) => {
              setCallbackValue(event.target.value);
              if (errorMessage) {
                setErrorMessage(null);
              }
            }}
            placeholder="Paste the verification token here"
            spellCheck={false}
            value={callbackValue}
          />
          {errorMessage ? (
            <p className="text-destructive text-xs">{errorMessage}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              LitGit exchanges the pasted token for the access token if the
              automatic browser handoff does not complete.
            </p>
          )}
        </div>

        <DialogFooter className="-mx-3 -mb-3 p-3 sm:justify-between">
          <Button
            className="min-w-18 text-xs"
            disabled={isSubmitting}
            onClick={() => {
              onCancel?.();
              onOpenChange(false);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            {flowState === "awaiting" ? "Paste token manually" : "Cancel"}
          </Button>
          <Button
            className="min-w-28 text-xs"
            disabled={!callbackValue || isSubmitting}
            onClick={handleSubmit}
            size="sm"
            type="submit"
          >
            {isSubmitting ? (
              <>
                <SpinnerIcon className="mr-1.5 size-3.5 animate-spin" />
                Connecting...
              </>
            ) : (
              "Connect"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
