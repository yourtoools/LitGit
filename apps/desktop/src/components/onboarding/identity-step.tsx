import { Button } from "@litgit/ui/components/button";
import { Input } from "@litgit/ui/components/input";
import { Label } from "@litgit/ui/components/label";
import {
  CheckCircleIcon,
  GitBranchIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

interface IdentityStepProps {
  email: string;
  errors: { email?: string; name?: string };
  formError: string | null;
  isLoading: boolean;
  isSaving: boolean;
  name: string;
  onEmailChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
}

export function IdentityStep({
  email,
  errors,
  formError,
  isLoading,
  isSaving,
  name,
  onEmailChange,
  onNameChange,
  onSubmit,
}: IdentityStepProps) {
  const isDisabled = isLoading || isSaving;

  return (
    <form
      className="mx-auto w-full space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="grid gap-3 border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <GitBranchIcon
              aria-hidden="true"
              className="size-4 text-primary"
              weight="duotone"
            />
          </div>
          <div className="grid gap-0.5">
            <h2 className="font-semibold text-foreground text-sm leading-none tracking-tight">
              Set Git identity
            </h2>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {isLoading
                ? "Checking your current Git identity..."
                : "This global name and email will be used for your commits."}
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <Label
            className="font-medium text-xs leading-none"
            htmlFor="onboarding-name"
          >
            Commit author name
          </Label>
          <Input
            aria-describedby={errors.name ? "onboarding-name-error" : undefined}
            aria-invalid={Boolean(errors.name)}
            disabled={isDisabled}
            id="onboarding-name"
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Jane Developer"
            value={name}
          />
          {errors.name ? (
            <p
              className="text-destructive text-xs leading-5"
              id="onboarding-name-error"
            >
              {errors.name}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label
            className="font-medium text-xs leading-none"
            htmlFor="onboarding-email"
          >
            Commit author email
          </Label>
          <Input
            aria-describedby={
              errors.email ? "onboarding-email-error" : undefined
            }
            aria-invalid={Boolean(errors.email)}
            disabled={isDisabled}
            id="onboarding-email"
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="jane@example.com"
            type="email"
            value={email}
          />
          {errors.email ? (
            <p
              className="text-destructive text-xs leading-5"
              id="onboarding-email-error"
            >
              {errors.email}
            </p>
          ) : null}
        </div>

        <section className="rounded-lg border border-amber-500/20 bg-amber-500/8 p-3 text-muted-foreground text-xs leading-relaxed">
          <p>
            <span className="font-medium text-amber-600 tracking-tight dark:text-amber-400">
              Privacy note:
            </span>{" "}
            Your Git author email becomes part of each commit metadata and may
            be visible in public repositories.
          </p>
          <ul className="mt-2 grid gap-1.5">
            <li className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-amber-500/60" />
              This identity is saved to your global Git config.
            </li>
            <li className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-amber-500/60" />
              Use a private email address if your Git host supports it.
            </li>
          </ul>
        </section>

        {formError ? (
          <section className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <WarningCircleIcon
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-destructive"
            />
            <p className="text-destructive text-xs leading-relaxed">
              {formError}
            </p>
          </section>
        ) : null}

        <div className="flex items-center justify-end pt-1">
          <Button className="min-w-32" disabled={isDisabled} type="submit">
            {isSaving ? "Saving..." : "Save & Continue"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function formatIdentityValue(name: string | null, email: string | null) {
  if (!(name || email)) {
    return "Not configured";
  }

  if (name && email) {
    return `${name} <${email}>`;
  }

  return name ?? email ?? "Not configured";
}

interface CompletionViewProps {
  identity: { email: string; name: string };
  onClose: () => void;
}

export function CompletionView({ identity, onClose }: CompletionViewProps) {
  return (
    <div className="mx-auto w-full space-y-4">
      <div className="grid gap-3 border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex justify-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
            <CheckCircleIcon
              aria-hidden="true"
              className="size-7 text-primary"
              weight="fill"
            />
          </div>
        </div>
        <div className="space-y-1 text-center">
          <p className="font-semibold text-foreground text-sm tracking-tight">
            Global Git identity saved
          </p>
          <p className="font-mono text-muted-foreground text-xs leading-relaxed">
            {formatIdentityValue(identity.name, identity.email)}
          </p>
        </div>
        <p className="text-center text-muted-foreground text-xs leading-relaxed">
          All future commits will use this identity. You can configure
          repository-specific overrides later in Settings.
        </p>
        <Button className="w-full" onClick={onClose} type="button">
          Start using LitGit
        </Button>
      </div>
    </div>
  );
}
