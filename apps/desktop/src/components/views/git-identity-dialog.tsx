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
import { useEffect, useState } from "react";
import type {
  GitIdentityStatus,
  GitIdentityWriteInput,
} from "@/stores/repo/repo-store-types";

interface GitIdentityDialogProps {
  description: string;
  identityStatus: GitIdentityStatus | null;
  onConfirm: (input: GitIdentityWriteInput) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  submitLabel: string;
  title: string;
}

interface GitIdentityFormState {
  email: string;
  name: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getInitialFormState = (
  identityStatus: GitIdentityStatus | null
): GitIdentityFormState => {
  const globalIdentity = identityStatus?.global;
  const preferredIdentity = globalIdentity ?? identityStatus?.effective;

  return {
    email: preferredIdentity?.email ?? "",
    name: preferredIdentity?.name ?? "",
  };
};

const formatIdentityValue = (name: string | null, email: string | null) => {
  if (!(name || email)) {
    return "Not configured";
  }

  if (name && email) {
    return `${name} <${email}>`;
  }

  return name ?? email ?? "Not configured";
};

export function GitIdentityDialog({
  description,
  identityStatus,
  onConfirm,
  onOpenChange,
  open,
  submitLabel,
  title,
}: GitIdentityDialogProps) {
  const [formState, setFormState] = useState<GitIdentityFormState>(() =>
    getInitialFormState(identityStatus)
  );
  const [errors, setErrors] = useState<{ email?: string; name?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setFormState(getInitialFormState(identityStatus));
    setErrors({});
    setFormError(null);
  }, [identityStatus, open]);

  const handleSubmit = async () => {
    const trimmedName = formState.name.trim();
    const trimmedEmail = formState.email.trim();
    const nextErrors: { email?: string; name?: string } = {};

    if (trimmedName.length === 0) {
      nextErrors.name = "Enter the Git author name to use for commits.";
    }

    if (trimmedEmail.length === 0) {
      nextErrors.email = "Enter the Git author email to use for commits.";
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }

    setErrors(nextErrors);
    setFormError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSaving(true);

    try {
      await onConfirm({
        email: trimmedEmail,
        name: trimmedName,
        scope: "global",
      });
    } catch (error: unknown) {
      setFormError(
        error instanceof Error ? error.message : "Failed to save Git identity"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const detectedIdentity = identityStatus?.effective ?? null;
  const detectedScope = identityStatus?.effectiveScope ?? null;
  let detectedIdentityDescription = "No global Git identity is configured yet.";

  if (detectedScope === "local") {
    detectedIdentityDescription =
      "A repository-specific identity is currently in use. Setting your global identity here will apply to all other repositories.";
  } else if (detectedScope === "global") {
    detectedIdentityDescription =
      "Your global Git identity is active and will be used for all repositories.";
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!isSaving) {
          onOpenChange(nextOpen);
        }
      }}
      open={open}
    >
      <DialogContent className="max-w-[min(96vw,32rem)] gap-0 overflow-hidden p-0">
        <DialogHeader className="gap-1.5 border-border/50 border-b px-4 py-3">
          <DialogTitle className="text-sm">{title}</DialogTitle>
          <DialogDescription className="max-w-[48ch] text-xs leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-4 py-4">
          <section className="border border-border/60 bg-muted/18 p-3">
            <p className="font-medium text-foreground text-xs">
              Current Git identity
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              {formatIdentityValue(
                detectedIdentity?.name ?? null,
                detectedIdentity?.email ?? null
              )}
            </p>
            <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
              {detectedIdentityDescription}
            </p>
          </section>

          <div className="grid gap-1.5">
            <Label className="text-xs" htmlFor="git-identity-name">
              Commit author name
            </Label>
            <Input
              aria-describedby={
                errors.name ? "git-identity-name-error" : undefined
              }
              aria-invalid={Boolean(errors.name)}
              id="git-identity-name"
              onChange={(event) => {
                setFormState((current) => ({
                  ...current,
                  name: event.target.value,
                }));
                setErrors((current) => ({ ...current, name: undefined }));
                setFormError(null);
              }}
              className="h-7 text-xs"
              placeholder="Jane Developer"
              value={formState.name}
            />
            {errors.name ? (
              <p
                className="text-destructive text-xs"
                id="git-identity-name-error"
              >
                {errors.name}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs" htmlFor="git-identity-email">
              Commit author email
            </Label>
            <Input
              aria-describedby={
                errors.email ? "git-identity-email-error" : undefined
              }
              aria-invalid={Boolean(errors.email)}
              id="git-identity-email"
              onChange={(event) => {
                setFormState((current) => ({
                  ...current,
                  email: event.target.value,
                }));
                setErrors((current) => ({ ...current, email: undefined }));
                setFormError(null);
              }}
              className="h-7 text-xs"
              placeholder="jane@example.com"
              type="email"
              value={formState.email}
            />
            {errors.email ? (
              <p
                className="text-destructive text-xs"
                id="git-identity-email-error"
              >
                {errors.email}
              </p>
            ) : null}
          </div>

          <p className="text-muted-foreground text-xs leading-relaxed">
            This identity will be saved to your global Git configuration and
            used across all repositories unless a repository-specific override
            is configured separately.
          </p>

          <section className="border border-amber-500/25 bg-amber-500/8 p-3 text-muted-foreground text-xs leading-relaxed">
            Your Git author email becomes part of commit metadata and may be
            visible in public repositories.
          </section>

          {formError ? (
            <section className="border border-destructive/30 bg-destructive/8 p-3">
              <p className="text-destructive text-xs leading-relaxed">
                {formError}
              </p>
            </section>
          ) : null}
        </div>

        <DialogFooter className="m-0 border-border/60 bg-muted/22 px-4 py-3 sm:justify-between">
          <Button
            className="text-xs"
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
            size="sm"
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="text-xs"
            disabled={isSaving}
            onClick={() => {
              handleSubmit().catch(() => undefined);
            }}
            size="sm"
            type="button"
          >
            {isSaving ? "Saving..." : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
