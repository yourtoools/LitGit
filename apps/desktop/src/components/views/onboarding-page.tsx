import { Button } from "@litgit/ui/components/button";
import { Input } from "@litgit/ui/components/input";
import { Label } from "@litgit/ui/components/label";
import { cn } from "@litgit/ui/lib/utils";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  DownloadSimpleIcon,
  FolderSimpleIcon,
  GitBranchIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { RepositoryCloneDialog } from "@/components/views/repository-clone-dialog";
import { useLauncherActions } from "@/hooks/use-launcher-actions";
import {
  getGitIdentityStatus,
  saveGitIdentity,
} from "@/lib/tauri-settings-client";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import type { GitIdentityStatus } from "@/stores/repo/repo-store-types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type OnboardingPhase = "form" | "loading" | "saved";

const formatIdentityValue = (name: string | null, email: string | null) => {
  if (!(name || email)) {
    return "Not configured";
  }

  if (name && email) {
    return `${name} <${email}>`;
  }

  return name ?? email ?? "Not configured";
};

function IdentityLoadingSkeleton() {
  return (
    <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/18 p-5">
      <div className="flex animate-pulse flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="size-4 rounded-full bg-muted-foreground/15" />
          <div className="h-4 w-36 rounded bg-muted-foreground/15" />
        </div>
        <div className="h-4 w-56 rounded bg-muted-foreground/12" />
        <div className="mt-1 grid gap-2">
          <div className="h-3.5 w-40 rounded bg-muted-foreground/10" />
          <div className="h-3.5 w-44 rounded bg-muted-foreground/10" />
        </div>
      </div>
    </div>
  );
}

function IdentitySummary({
  identityStatus,
}: {
  identityStatus: GitIdentityStatus;
}) {
  const effective = identityStatus.effective;
  const global = identityStatus.global;
  const effectiveScope = identityStatus.effectiveScope;

  let scopeDescription =
    "No global Git identity is configured yet. Fill in the fields below to set one.";

  if (effectiveScope === "global") {
    scopeDescription =
      "A global Git identity was detected. You can keep or update it below.";
  } else if (effectiveScope === "local") {
    scopeDescription =
      "A repository-local identity was found, but your global identity is not set. Configure your global identity below.";
  }

  return (
    <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/18 p-5">
      <div className="flex items-center gap-2">
        <GitBranchIcon
          aria-hidden="true"
          className={cn(
            "size-4",
            effective.isComplete ? "text-primary" : "text-muted-foreground/70"
          )}
        />
        <p className="font-medium text-foreground text-sm leading-none tracking-tight">
          Detected Git identity
        </p>
      </div>
      <p className="text-muted-foreground text-sm leading-7">
        {formatIdentityValue(effective.name ?? null, effective.email ?? null)}
      </p>
      <div className="grid gap-1 text-muted-foreground/85 text-xs leading-6">
        <span>
          Global:{" "}
          {formatIdentityValue(global.name ?? null, global.email ?? null)}
        </span>
        {effectiveScope !== null && (
          <span className="capitalize">
            Source: {effectiveScope} Git config
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-xs leading-6">
        {scopeDescription}
      </p>
    </div>
  );
}

function SavedConfirmation({
  identity,
  onBack,
  onCloneRepository,
  onOpenRepository,
}: {
  identity: { email: string; name: string };
  onBack: () => void;
  onCloneRepository: () => void;
  onOpenRepository: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="grid gap-5 rounded-xl border border-primary/30 bg-primary/5 p-6 text-center">
        <div className="flex justify-center">
          <CheckCircleIcon
            aria-hidden="true"
            className="size-10 text-primary"
            weight="fill"
          />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-foreground text-sm tracking-tight">
            Global Git identity saved
          </p>
          <p className="text-muted-foreground text-sm leading-7">
            {formatIdentityValue(identity.name, identity.email)}
          </p>
        </div>
        <p className="text-muted-foreground text-sm leading-7">
          All future commits will use this identity. You can configure
          repository-specific overrides later in Settings if needed.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            className="min-w-40 gap-2"
            onClick={onOpenRepository}
            type="button"
          >
            <FolderSimpleIcon aria-hidden="true" className="size-4" />
            Open repository
          </Button>
          <Button
            className="min-w-40 gap-2"
            onClick={onCloneRepository}
            type="button"
            variant="outline"
          >
            <DownloadSimpleIcon aria-hidden="true" className="size-4" />
            Clone repository
          </Button>
        </div>
        <Button
          className="mx-auto gap-2"
          onClick={onBack}
          type="button"
          variant="ghost"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          Back to identity
        </Button>
      </div>
    </div>
  );
}

export function OnboardingPage() {
  const setHasCompletedOnboarding = usePreferencesStore(
    (state) => state.setHasCompletedOnboarding
  );
  const {
    handleOpenRepository: launcherOpen,
    handleOpenCloneDialog,
    isCloneDialogOpen,
    setIsCloneDialogOpen,
  } = useLauncherActions();
  const [identityStatus, setIdentityStatus] =
    useState<GitIdentityStatus | null>(null);
  const [phase, setPhase] = useState<OnboardingPhase>("loading");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ email?: string; name?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedIdentity, setSavedIdentity] = useState<{
    email: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    getGitIdentityStatus()
      .then((status) => {
        if (!mounted) {
          return;
        }

        setIdentityStatus(status);

        const preferred = status.global ?? status.effective;
        setName(preferred?.name ?? "");
        setEmail(preferred?.email ?? "");
        setPhase("form");
      })
      .catch((error: unknown) => {
        if (!mounted) {
          return;
        }

        setFormError(
          error instanceof Error ? error.message : "Failed to load Git identity"
        );
        setPhase("form");
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleOpenRepository = useCallback(() => {
    setHasCompletedOnboarding(true);
    launcherOpen().catch(() => undefined);
  }, [launcherOpen, setHasCompletedOnboarding]);

  const handleCloneRepository = useCallback(() => {
    setHasCompletedOnboarding(true);
    handleOpenCloneDialog();
  }, [handleOpenCloneDialog, setHasCompletedOnboarding]);

  const handleBackToForm = useCallback(() => {
    setPhase("form");
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const nextErrors: { email?: string; name?: string } = {};

    if (trimmedName.length === 0) {
      nextErrors.name = "Enter your Git author name.";
    }

    if (trimmedEmail.length === 0) {
      nextErrors.email = "Enter your Git author email.";
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
      const nextStatus = await saveGitIdentity({
        gitIdentity: {
          email: trimmedEmail,
          name: trimmedName,
          scope: "global",
        },
      });

      setIdentityStatus(nextStatus);
      setSavedIdentity({ email: trimmedEmail, name: trimmedName });
      setPhase("saved");
    } catch (error: unknown) {
      setFormError(
        error instanceof Error ? error.message : "Failed to save Git identity"
      );
      setIsSaving(false);
    }
  };

  const isFormDisabled = phase === "loading" || isSaving;

  return (
    <div className="fade-in zoom-in-95 relative flex min-h-full w-full animate-in flex-col overflow-hidden bg-background text-foreground duration-300">
      <PageContainer className="relative flex w-full max-w-2xl flex-1 flex-col justify-center gap-8">
        <header className="flex w-full flex-col gap-4 text-center">
          <div className="mx-auto inline-flex w-fit items-center gap-2 rounded-none border border-primary/25 bg-primary/10 px-3 py-1">
            <span className="font-mono text-primary/85 text-xs uppercase tracking-[0.16em]">
              {phase === "saved" ? "Setup Complete" : "Welcome to"}
            </span>
            <span className="font-mono text-foreground/85 text-xs uppercase tracking-[0.14em]">
              LitGit
            </span>
          </div>
          <h1 className="scroll-m-20 font-extrabold font-mono text-4xl text-foreground leading-none tracking-tight">
            {phase === "saved" ? "You're All Set" : "Configure Git Identity"}
          </h1>
          <p className="mx-auto max-w-lg text-muted-foreground text-sm leading-relaxed">
            {phase === "saved"
              ? "Your global Git identity is configured and ready for commits."
              : "Set your global Git identity. This name and email will appear on every commit you make across all repositories."}
          </p>
        </header>

        {phase === "saved" && savedIdentity ? (
          <SavedConfirmation
            identity={savedIdentity}
            onBack={handleBackToForm}
            onCloneRepository={handleCloneRepository}
            onOpenRepository={handleOpenRepository}
          />
        ) : (
          <form
            className="mx-auto w-full max-w-md space-y-6"
            onSubmit={(event) => {
              handleSubmit(event).catch(() => undefined);
            }}
          >
            {phase === "loading" && <IdentityLoadingSkeleton />}
            {phase === "form" && identityStatus && (
              <IdentitySummary identityStatus={identityStatus} />
            )}

            <div className="grid gap-4 rounded-xl border border-border/60 bg-background/70 p-6">
              <div className="grid gap-1.5">
                <Label
                  className="font-medium text-sm leading-none"
                  htmlFor="onboarding-name"
                >
                  Commit author name
                </Label>
                <Input
                  aria-describedby={
                    errors.name ? "onboarding-name-error" : undefined
                  }
                  aria-invalid={Boolean(errors.name)}
                  disabled={isFormDisabled}
                  id="onboarding-name"
                  onChange={(event) => {
                    setName(event.target.value);
                    setErrors((current) => ({
                      ...current,
                      name: undefined,
                    }));
                    setFormError(null);
                  }}
                  placeholder="Jane Developer"
                  value={name}
                />
                {errors.name ? (
                  <p
                    className="text-destructive text-xs leading-6"
                    id="onboarding-name-error"
                  >
                    {errors.name}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <Label
                  className="font-medium text-sm leading-none"
                  htmlFor="onboarding-email"
                >
                  Commit author email
                </Label>
                <Input
                  aria-describedby={
                    errors.email ? "onboarding-email-error" : undefined
                  }
                  aria-invalid={Boolean(errors.email)}
                  disabled={isFormDisabled}
                  id="onboarding-email"
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setErrors((current) => ({
                      ...current,
                      email: undefined,
                    }));
                    setFormError(null);
                  }}
                  placeholder="jane@example.com"
                  type="email"
                  value={email}
                />
                {errors.email ? (
                  <p
                    className="text-destructive text-xs leading-6"
                    id="onboarding-email-error"
                  >
                    {errors.email}
                  </p>
                ) : null}
              </div>
            </div>

            <section className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-3 text-muted-foreground text-xs leading-relaxed">
              <span className="font-medium text-amber-600 tracking-tight dark:text-amber-300">
                Privacy note:
              </span>{" "}
              Your Git author email becomes part of every commit's metadata and
              may be visible in public repositories. Consider using a private
              email if your Git host supports it.
            </section>

            {formError ? (
              <section className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/8 p-3">
                <WarningCircleIcon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                />
                <p className="text-destructive text-xs leading-relaxed">
                  {formError}
                </p>
              </section>
            ) : null}

            <div className="flex items-center justify-end">
              <Button
                className="min-w-36"
                disabled={isFormDisabled}
                type="submit"
              >
                {isSaving ? "Saving…" : "Save and continue"}
              </Button>
            </div>
          </form>
        )}
      </PageContainer>
      <RepositoryCloneDialog
        onOpenChange={setIsCloneDialogOpen}
        open={isCloneDialogOpen}
      />
    </div>
  );
}
