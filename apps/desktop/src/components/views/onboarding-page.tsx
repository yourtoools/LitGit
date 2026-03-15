import { Button } from "@litgit/ui/components/button";
import { Input } from "@litgit/ui/components/input";
import { Label } from "@litgit/ui/components/label";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  DownloadSimpleIcon,
  FolderSimpleIcon,
  GitBranchIcon,
  KeyIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { RepositoryCloneDialog } from "@/components/views/repository-clone-dialog";
import { useLauncherActions } from "@/hooks/use-launcher-actions";
import {
  getGitIdentityStatus,
  saveGitHubToken,
  saveGitIdentity,
} from "@/lib/tauri-settings-client";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type OnboardingPhase = "form" | "token" | "loading" | "saved";

const formatIdentityValue = (name: string | null, email: string | null) => {
  if (!(name || email)) {
    return "Not configured";
  }

  if (name && email) {
    return `${name} <${email}>`;
  }

  return name ?? email ?? "Not configured";
};

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
      <div className="grid gap-5 border border-primary/30 bg-primary/5 p-6 text-center">
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
          Back to PAT
        </Button>
      </div>
    </div>
  );
}

function TokenStep({
  token,
  onTokenChange,
  onBack,
  onSkip,
  onSuccess,
}: {
  token: string;
  onTokenChange: (value: string) => void;
  onBack: () => void;
  onSkip: () => void;
  onSuccess: (savedToken: string) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmedToken = token.trim();

    if (trimmedToken.length === 0) {
      onSkip();
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await saveGitHubToken(trimmedToken);
      onSuccess(trimmedToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save token");
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="grid gap-5 border border-border/60 bg-background/70 p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <KeyIcon
              aria-hidden="true"
              className="size-5 text-primary"
              weight="duotone"
            />
          </div>
          <div className="grid gap-1">
            <h2 className="font-semibold text-foreground text-sm leading-none tracking-tight">
              Add GitHub Token (Optional)
            </h2>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Link your GitHub account for avatar matching
            </p>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label
            className="font-medium text-sm leading-none"
            htmlFor="github-token"
          >
            Personal Access Token
          </Label>
          <Input
            disabled={isSaving}
            id="github-token"
            onChange={(event) => {
              onTokenChange(event.target.value);
              setError(null);
            }}
            placeholder="github_pat_..."
            type="password"
            value={token}
          />
        </div>

        <section className="border border-border/50 bg-muted/30 p-3">
          <p className="text-muted-foreground text-xs leading-relaxed">
            This token is optional. You can add it later in{" "}
            <span className="font-medium text-foreground">
              Settings → GitHub
            </span>{" "}
            to link your GitHub account:
          </p>
          <ul className="mt-2 grid gap-1 text-muted-foreground text-xs leading-relaxed">
            <li className="flex items-center gap-1.5">
              <span className="size-1 rounded-full bg-primary/60" />
              Show avatar images on your commits
            </li>
            <li className="flex items-center gap-1.5">
              <span className="size-1 rounded-full bg-primary/60" />
              Match private email addresses for avatar display
            </li>
          </ul>
          <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
            Use a fine-grained GitHub Personal Access Token with read-only
            access to your account email addresses.{" "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://github.com/settings/tokens"
              rel="noopener noreferrer"
              target="_blank"
            >
              Create one at github.com/settings/tokens
            </a>
            .
          </p>
        </section>

        {error ? (
          <section className="flex items-start gap-2 border border-destructive/30 bg-destructive/8 p-3">
            <WarningCircleIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-destructive"
            />
            <p className="text-destructive text-xs leading-relaxed">{error}</p>
          </section>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <Button
            className="gap-2"
            disabled={isSaving}
            onClick={onBack}
            type="button"
            variant="ghost"
          >
            <ArrowLeftIcon aria-hidden="true" className="size-4" />
            Back
          </Button>
          <div className="flex gap-2">
            <Button
              disabled={isSaving}
              onClick={onSkip}
              type="button"
              variant="outline"
            >
              Skip
            </Button>
            <Button
              className="min-w-20"
              disabled={isSaving}
              onClick={handleSave}
              type="button"
            >
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
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
  const [phase, setPhase] = useState<OnboardingPhase>("loading");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [githubTokenDraft, setGithubTokenDraft] = useState("");
  const [savedGithubToken, setSavedGithubToken] = useState("");
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
    setIsSaving(false);
  }, []);

  const handleBackToTokenFromSaved = useCallback(() => {
    setGithubTokenDraft(savedGithubToken);
    setPhase("token");
  }, [savedGithubToken]);

  const handleTokenSkip = useCallback(() => {
    setGithubTokenDraft(savedGithubToken);
    setPhase("saved");
  }, [savedGithubToken]);

  const handleTokenSuccess = useCallback((savedToken: string) => {
    setSavedGithubToken(savedToken);
    setGithubTokenDraft(savedToken);
    setPhase("saved");
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
      await saveGitIdentity({
        gitIdentity: {
          email: trimmedEmail,
          name: trimmedName,
          scope: "global",
        },
      });

      setSavedIdentity({ email: trimmedEmail, name: trimmedName });
      setPhase("token");
    } catch (error: unknown) {
      setFormError(
        error instanceof Error ? error.message : "Failed to save Git identity"
      );
      setIsSaving(false);
    }
  };

  const isFormDisabled = phase === "loading" || isSaving;
  const isTokenPhase = phase === "token";
  const isSavedPhase = phase === "saved";
  const isFormOrLoadingPhase = phase === "form" || phase === "loading";

  let headerBadge: string;
  let headerTitle: string;
  let headerDescription: string;

  if (isSavedPhase) {
    headerBadge = "Setup Complete";
    headerTitle = "You're All Set";
    headerDescription =
      "Your global Git identity is configured and ready for commits.";
  } else if (isTokenPhase) {
    headerBadge = "Optional Step";
    headerTitle = "Add GitHub Token";
    headerDescription =
      "Link your GitHub account to show avatar images on your commits.";
  } else {
    headerBadge = "Welcome to";
    headerTitle = "Configure Git Identity";
    headerDescription =
      "Set your global Git identity. This name and email will appear on every commit you make across all repositories.";
  }

  return (
    <div className="fade-in zoom-in-95 relative flex min-h-full w-full animate-in flex-col overflow-hidden bg-background text-foreground duration-300">
      <PageContainer className="relative flex w-full max-w-2xl flex-1 flex-col justify-center gap-8">
        <header className="flex w-full flex-col gap-4 text-center">
          <div className="mx-auto inline-flex w-fit items-center gap-2 border border-primary/25 bg-primary/10 px-3 py-1">
            <span className="font-mono text-primary/85 text-xs uppercase tracking-[0.16em]">
              {headerBadge}
            </span>
            <span className="font-mono text-foreground/85 text-xs uppercase tracking-[0.14em]">
              LitGit
            </span>
          </div>
          <h1 className="scroll-m-20 font-extrabold font-mono text-4xl text-foreground leading-none tracking-tight">
            {headerTitle}
          </h1>
          <p className="mx-auto max-w-lg text-muted-foreground text-sm leading-relaxed">
            {headerDescription}
          </p>
        </header>

        {isTokenPhase && (
          <TokenStep
            onBack={handleBackToForm}
            onSkip={handleTokenSkip}
            onSuccess={handleTokenSuccess}
            onTokenChange={setGithubTokenDraft}
            token={githubTokenDraft}
          />
        )}
        {isSavedPhase && savedIdentity && (
          <SavedConfirmation
            identity={savedIdentity}
            onBack={handleBackToTokenFromSaved}
            onCloneRepository={handleCloneRepository}
            onOpenRepository={handleOpenRepository}
          />
        )}
        {isFormOrLoadingPhase && (
          <form
            className="mx-auto w-full max-w-md space-y-6"
            onSubmit={(event) => {
              handleSubmit(event).catch(() => undefined);
            }}
          >
            <div className="grid gap-5 border border-border/60 bg-background/70 p-6">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <GitBranchIcon
                    aria-hidden="true"
                    className="size-5 text-primary"
                    weight="duotone"
                  />
                </div>
                <div className="grid gap-1">
                  <h2 className="font-semibold text-foreground text-sm leading-none tracking-tight">
                    Set Git identity
                  </h2>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {phase === "loading"
                      ? "Checking your current Git identity..."
                      : "This global name and email will be used for your commits."}
                  </p>
                </div>
              </div>

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

              <section className="border border-amber-500/25 bg-amber-500/8 p-3 text-muted-foreground text-xs leading-relaxed">
                <p>
                  <span className="font-medium text-amber-600 tracking-tight dark:text-amber-300">
                    Privacy note:
                  </span>{" "}
                  Your Git author email becomes part of each commit metadata and
                  may be visible in public repositories.
                </p>
                <ul className="mt-2 grid gap-1">
                  <li className="flex items-center gap-1.5">
                    <span className="size-1 rounded-full bg-amber-500/70" />
                    This identity is saved to your global Git config.
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="size-1 rounded-full bg-amber-500/70" />
                    Use a private email address if your Git host supports it.
                  </li>
                </ul>
              </section>

              {formError ? (
                <section className="flex items-start gap-2 border border-destructive/30 bg-destructive/8 p-3">
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
