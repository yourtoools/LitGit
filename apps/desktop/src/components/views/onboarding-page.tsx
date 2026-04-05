import { Button } from "@litgit/ui/components/button";
import { Input } from "@litgit/ui/components/input";
import { Label } from "@litgit/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@litgit/ui/components/select";
import {
  CheckCircleIcon,
  GitBranchIcon,
  KeyIcon,
  SparkleIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import {
  AI_ENDPOINT_PLACEHOLDERS,
  AI_PROVIDER_OPTIONS,
} from "@/components/views/settings/settings-store";
import {
  clearAiProviderSecret,
  clearGitHubToken,
  getAiProviderSecretStatus,
  getGitHubTokenStatus,
  getGitIdentityStatus,
  listAiModels,
  saveAiProviderSecret,
  saveGitHubToken,
  saveGitIdentity,
} from "@/lib/tauri-settings-client";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type OnboardingStep = "identity" | "github" | "ai" | "complete";

interface StepConfig {
  description: string;
  id: OnboardingStep;
  label: string;
  number: number;
}

const STEPS: StepConfig[] = [
  {
    description: "Set your Git author identity",
    id: "identity",
    label: "Identity",
    number: 1,
  },
  {
    description: "Connect your GitHub account",
    id: "github",
    label: "GitHub",
    number: 2,
  },
  {
    description: "Configure AI for commit generation",
    id: "ai",
    label: "AI",
    number: 3,
  },
  {
    description: "Ready to start",
    id: "complete",
    label: "Complete",
    number: 4,
  },
];

function Stepper({ currentStep }: { currentStep: OnboardingStep }) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="w-full">
      {/* Progress bar background */}
      <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          aria-hidden="true"
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{
            width: `${((currentIndex + 1) / STEPS.length) * 100}%`,
          }}
        />
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isPending = index > currentIndex;

          return (
            <div
              className="flex flex-1 flex-col items-center gap-1.5"
              key={step.id}
            >
              <div
                aria-current={isCurrent ? "step" : undefined}
                className={`flex size-7 items-center justify-center rounded-full border-2 font-semibold text-xs transition-all duration-300 ${isCompleted ? "border-primary bg-primary text-primary-foreground" : ""}
                  ${isCurrent ? "border-primary bg-background text-primary ring-2 ring-primary/20" : ""}
                  ${isPending ? "border-border bg-muted text-muted-foreground" : ""}
                `}
              >
                {isCompleted ? (
                  <CheckCircleIcon
                    aria-hidden="true"
                    className="size-3.5"
                    weight="fill"
                  />
                ) : (
                  step.number
                )}
              </div>
              <div className="text-center">
                <p
                  className={`font-medium text-xs ${isCurrent ? "text-foreground" : "text-muted-foreground"}
                  `}
                >
                  {step.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
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

function CompletionView({
  identity,
  onClose,
}: {
  identity: { email: string; name: string };
  onClose: () => void;
}) {
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

function GitHubTokenStep({
  onBack,
  onComplete,
  onSkip,
  token,
  onTokenChange,
  secretStatus,
  onSecretCleared,
}: {
  onBack: () => void;
  onComplete: () => void;
  onSkip: () => void;
  token: string;
  onTokenChange: (value: string) => void;
  secretStatus: {
    hasStoredValue: boolean;
    storageMode: "secure" | "session";
  } | null;
  onSecretCleared: () => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const hasStoredToken = secretStatus?.hasStoredValue ?? false;

  const handleSave = async () => {
    const trimmedToken = token.trim();

    if (trimmedToken.length === 0) {
      onSkip();
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      await saveGitHubToken(trimmedToken);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save token");
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsClearing(true);
    setError(null);
    setMessage(null);

    try {
      await clearGitHubToken();
      onTokenChange("");
      onSecretCleared();
      setMessage("Token cleared. You can now enter a new one.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear token");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="mx-auto w-full space-y-4">
      <div className="grid gap-3 border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <KeyIcon
              aria-hidden="true"
              className="size-4 text-primary"
              weight="duotone"
            />
          </div>
          <div className="grid gap-0.5">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-foreground text-sm leading-none tracking-tight">
                Add GitHub Token (Optional)
              </h2>
              {hasStoredToken && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
                  Configured
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Link your GitHub account for avatar matching
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex h-7 items-center justify-between">
            <Label
              className="font-medium text-xs leading-none"
              htmlFor="github-token"
            >
              Personal Access Token
            </Label>
            {hasStoredToken ? (
              <div className="flex items-center gap-2">
                <Button
                  disabled={isClearing}
                  onClick={handleClear}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {isClearing ? "Clearing..." : "Clear to change"}
                </Button>
              </div>
            ) : (
              <span className="text-muted-foreground text-xs">
                No token saved
              </span>
            )}
          </div>
          <Input
            disabled={isSaving || hasStoredToken}
            id="github-token"
            onChange={(event) => {
              onTokenChange(event.target.value);
              setError(null);
              setMessage(null);
            }}
            placeholder="github_pat_..."
            type="password"
            value={hasStoredToken ? "********************" : token}
          />
        </div>

        <section className="rounded-lg border border-border/50 bg-muted/40 p-3">
          <p className="text-muted-foreground text-xs leading-relaxed">
            This token is optional. You can add it later in{" "}
            <span className="font-medium text-foreground">
              Settings &rarr; GitHub
            </span>{" "}
            to link your GitHub account:
          </p>
          <ul className="mt-2 grid gap-1.5 text-muted-foreground text-xs leading-relaxed">
            <li className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-primary/60" />
              Show avatar images on your commits
            </li>
            <li className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-primary/60" />
              Match private email addresses for avatar display
            </li>
          </ul>
          <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
            Use a fine-grained GitHub Personal Access Token with read-only
            access to your account email addresses.{" "}
            <a
              className="text-primary underline underline-offset-2 hover:text-primary/80"
              href="https://github.com/settings/tokens"
              rel="noopener noreferrer"
              target="_blank"
            >
              Create one at github.com/settings/tokens
            </a>
            .
          </p>
        </section>

        {message ? (
          <section className="rounded-lg border border-primary/30 bg-primary/10 p-3">
            <p className="text-primary text-xs leading-relaxed">{message}</p>
          </section>
        ) : null}

        {error ? (
          <section className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <WarningCircleIcon
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-destructive"
            />
            <p className="text-destructive text-xs leading-relaxed">{error}</p>
          </section>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            disabled={isSaving || isClearing}
            onClick={onBack}
            type="button"
            variant="ghost"
          >
            Back
          </Button>
          <div className="flex gap-2">
            <Button
              disabled={isSaving || isClearing}
              onClick={onSkip}
              type="button"
              variant="outline"
            >
              Skip
            </Button>
            <Button
              className="min-w-28"
              disabled={isSaving || isClearing}
              onClick={hasStoredToken ? onComplete : handleSave}
              type="button"
            >
              {isSaving ? "Saving..." : "Save & Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AiStep({
  onBack,
  onComplete,
  onSkip,
  apiKey,
  onApiKeyChange,
  secretStatus,
  onSecretCleared,
}: {
  onBack: () => void;
  onComplete: () => void;
  onSkip: () => void;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  secretStatus: {
    hasStoredValue: boolean;
    storageMode: "secure" | "session";
  } | null;
  onSecretCleared: () => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsMessage, setModelsMessage] = useState<string | null>(null);

  // Preferences store state
  const provider = usePreferencesStore((state) => state.ai.provider);
  const setAiProvider = usePreferencesStore((state) => state.setAiProvider);
  const customEndpoint = usePreferencesStore(
    (state) => state.ai.customEndpoint
  );
  const setAiCustomEndpoint = usePreferencesStore(
    (state) => state.setAiCustomEndpoint
  );
  const model = usePreferencesStore((state) => state.ai.model);
  const setAiModel = usePreferencesStore((state) => state.setAiModel);
  const availableModels = usePreferencesStore(
    (state) => state.ai.availableModels
  );
  const setAiAvailableModels = usePreferencesStore(
    (state) => state.setAiAvailableModels
  );

  const hasStoredSecret = secretStatus?.hasStoredValue ?? false;
  const showCustomUrl = provider === "custom" || provider === "ollama";
  const hasApiKey = apiKey.trim().length > 0;

  const handleSave = async () => {
    const trimmedKey = apiKey.trim();

    if (trimmedKey.length === 0) {
      onSkip();
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      await saveAiProviderSecret(provider, trimmedKey);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsClearing(true);
    setError(null);
    setMessage(null);

    try {
      await clearAiProviderSecret(provider);
      onApiKeyChange("");
      onSecretCleared();
      setMessage("API key cleared. You can now enter a new one.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear API key");
    } finally {
      setIsClearing(false);
    }
  };

  const handleRefreshModels = async () => {
    setIsLoadingModels(true);
    setModelsMessage(null);

    try {
      const models = await listAiModels({
        customEndpoint,
        provider,
      });
      setAiAvailableModels(models);

      if (models.length === 0) {
        setAiModel("");
        setModelsMessage("No models were returned by the AI endpoint.");
      } else {
        const hasSelected = models.some((m) => m.id === model);
        const nextModel = hasSelected ? model : (models[0]?.id ?? "");
        setAiModel(nextModel);
        setModelsMessage(`Loaded ${models.length} model(s).`);
      }
    } catch (err) {
      setAiAvailableModels([]);
      setAiModel("");
      setModelsMessage(
        err instanceof Error ? err.message : "Failed to load AI models"
      );
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleProviderChange = (
    value: "openai" | "anthropic" | "azure" | "google" | "ollama" | "custom"
  ) => {
    setAiProvider(value);
  };

  return (
    <div className="mx-auto w-full space-y-4">
      <div className="grid gap-3 border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <SparkleIcon
              aria-hidden="true"
              className="size-4 text-primary"
              weight="duotone"
            />
          </div>
          <div className="grid gap-0.5">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-foreground text-sm leading-none tracking-tight">
                Configure AI (Optional)
              </h2>
              {hasStoredSecret && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
                  <CheckCircleIcon className="size-3" weight="fill" />
                  Configured
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Enable AI-powered commit message generation
            </p>
          </div>
        </div>

        {/* Provider + Base URL (2-column grid when custom/ollama) */}
        <div
          className={`grid gap-3 ${showCustomUrl ? "grid-cols-2" : "grid-cols-1"}`}
        >
          <div className="grid gap-2">
            <Label
              className="font-medium text-xs leading-none"
              htmlFor="ai-provider"
            >
              Provider
            </Label>
            <Select
              items={AI_PROVIDER_OPTIONS}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  handleProviderChange(
                    value as
                      | "openai"
                      | "anthropic"
                      | "azure"
                      | "google"
                      | "ollama"
                      | "custom"
                  );
                }
              }}
              value={provider}
            >
              <SelectTrigger className="h-8 w-full" id="ai-provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="azure">Azure</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="ollama">Ollama</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {showCustomUrl && (
            <div className="grid gap-2">
              <Label
                className="font-medium text-xs leading-none"
                htmlFor="ai-endpoint"
              >
                Base URL
              </Label>
              <Input
                disabled={isSaving}
                id="ai-endpoint"
                onChange={(event) => setAiCustomEndpoint(event.target.value)}
                placeholder={AI_ENDPOINT_PLACEHOLDERS[provider]}
                value={customEndpoint}
              />
            </div>
          )}
        </div>

        {/* API Key */}
        <div className="grid gap-2">
          <div className="flex h-7 items-center justify-between">
            <Label
              className="font-medium text-xs leading-none"
              htmlFor="ai-api-key"
            >
              API Key
            </Label>
            {hasStoredSecret ? (
              <div className="flex items-center gap-2">
                <Button
                  disabled={isClearing}
                  onClick={handleClear}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {isClearing ? "Clearing..." : "Clear to change"}
                </Button>
              </div>
            ) : (
              <span className="text-muted-foreground text-xs">
                No API key saved
              </span>
            )}
          </div>
          <Input
            disabled={isSaving || isClearing || hasStoredSecret}
            id="ai-api-key"
            onChange={(event) => {
              onApiKeyChange(event.target.value);
              setError(null);
              setMessage(null);
            }}
            placeholder="sk-..."
            type="password"
            value={hasStoredSecret ? "********************" : apiKey}
          />
        </div>

        {/* Model Selection */}
        <div className="grid gap-2">
          <div className="flex h-7 items-center justify-between">
            <Label className="font-medium text-xs leading-none">
              Model Selection
            </Label>
            <span className="text-muted-foreground text-xs">
              {model.trim().length > 0
                ? `Selected: ${model}`
                : "No model selected"}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              className="shrink-0"
              disabled={!(hasApiKey || hasStoredSecret) || isLoadingModels}
              onClick={handleRefreshModels}
              size="sm"
              type="button"
              variant="outline"
            >
              {isLoadingModels ? "Loading..." : "Refresh models"}
            </Button>
            <Select
              disabled={availableModels.length === 0}
              items={Object.fromEntries(
                availableModels.map((entry) => [entry.id, entry.label])
              )}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setAiModel(value);
                }
              }}
              value={model}
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder="Refresh models first" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {availableModels.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {modelsMessage ? (
            <p className="text-muted-foreground text-xs">{modelsMessage}</p>
          ) : null}
        </div>

        <section className="rounded-lg border border-border/50 bg-muted/40 p-2.5">
          <p className="text-muted-foreground text-xs leading-relaxed">
            Optional. Configure later in{" "}
            <span className="font-medium text-foreground">
              Settings &rarr; AI
            </span>{" "}
            with more options.
          </p>
          <ul className="mt-1.5 grid gap-1 text-muted-foreground text-xs leading-relaxed">
            <li className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-primary/60" />
              Generate commit messages from staged changes
            </li>
            <li className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-primary/60" />
              Multiple providers: OpenAI, Anthropic, Azure, and more
            </li>
          </ul>
          <p className="mt-1.5 text-muted-foreground text-xs leading-relaxed">
            API key stored securely in desktop backend.
          </p>
        </section>

        {message ? (
          <section className="rounded-lg border border-primary/30 bg-primary/10 p-3">
            <p className="text-primary text-xs leading-relaxed">{message}</p>
          </section>
        ) : null}

        {error ? (
          <section className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <WarningCircleIcon
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-destructive"
            />
            <p className="text-destructive text-xs leading-relaxed">{error}</p>
          </section>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            disabled={isSaving || isClearing}
            onClick={onBack}
            type="button"
            variant="ghost"
          >
            Back
          </Button>
          <div className="flex gap-2">
            <Button
              disabled={isSaving || isClearing}
              onClick={onSkip}
              type="button"
              variant="outline"
            >
              Skip
            </Button>
            <Button
              className="min-w-28"
              disabled={isSaving || isClearing}
              onClick={hasStoredSecret ? onComplete : handleSave}
              type="button"
            >
              {isSaving ? "Saving..." : "Save & Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IdentityStep({
  email,
  errors,
  formError,
  isLoading,
  isSaving,
  name,
  onEmailChange,
  onNameChange,
  onSubmit,
}: {
  email: string;
  errors: { email?: string; name?: string };
  formError: string | null;
  isLoading: boolean;
  isSaving: boolean;
  name: string;
  onEmailChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
}) {
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

export function OnboardingPage() {
  const setHasCompletedOnboarding = usePreferencesStore(
    (state) => state.setHasCompletedOnboarding
  );
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("identity");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");

  // Secret status tracking (for disabled inputs and clear buttons)
  const [gitHubTokenStatus, setGitHubTokenStatus] = useState<null | {
    hasStoredValue: boolean;
    storageMode: "secure" | "session";
  }>(null);
  const [aiSecretStatus, setAiSecretStatus] = useState<null | {
    hasStoredValue: boolean;
    storageMode: "secure" | "session";
  }>(null);

  // Load existing AI settings from preferences store (for dev preview)
  const existingAiProvider = usePreferencesStore((state) => state.ai.provider);

  // Dev mode: pre-fill check secret status
  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    // Check if secrets already exist
    getGitHubTokenStatus()
      .then((status) => {
        setGitHubTokenStatus(status);
      })
      .catch(() => {
        // Silently ignore errors - this is just for dev preview
      });

    // Check AI secret status for the configured provider
    if (existingAiProvider) {
      getAiProviderSecretStatus(existingAiProvider)
        .then((status) => {
          setAiSecretStatus(status);
        })
        .catch(() => {
          // Silently ignore errors
        });
    }
  }, [existingAiProvider]);

  const [errors, setErrors] = useState<{ email?: string; name?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        if (!mounted) {
          return;
        }

        setFormError(
          error instanceof Error ? error.message : "Failed to load Git identity"
        );
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Check AI secret status when provider changes (in dev mode)
  const currentAiProvider = usePreferencesStore((state) => state.ai.provider);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    getAiProviderSecretStatus(currentAiProvider)
      .then((status) => {
        setAiSecretStatus(status);
      })
      .catch(() => {
        // Silently ignore errors
      });
  }, [currentAiProvider]);

  const handleClose = useCallback(() => {
    setHasCompletedOnboarding(true);
    navigate({ to: "/", replace: true }).catch(() => undefined);
  }, [navigate, setHasCompletedOnboarding]);

  const handleIdentitySubmit = async () => {
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
      setCurrentStep("github");
    } catch (error: unknown) {
      setFormError(
        error instanceof Error ? error.message : "Failed to save Git identity"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleGitHubComplete = useCallback(() => {
    setCurrentStep("ai");
  }, []);

  const handleGitHubSkip = useCallback(() => {
    setCurrentStep("ai");
  }, []);

  const handleBackToIdentity = useCallback(() => {
    setCurrentStep("identity");
  }, []);

  const handleAiComplete = useCallback(() => {
    setCurrentStep("complete");
  }, []);

  const handleAiSkip = useCallback(() => {
    setCurrentStep("complete");
  }, []);

  const handleBackToGitHub = useCallback(() => {
    setCurrentStep("github");
  }, []);

  return (
    <div className="fade-in zoom-in-95 relative flex min-h-full w-full animate-in flex-col overflow-hidden bg-background text-foreground duration-500">
      <PageContainer className="relative flex w-full max-w-5xl flex-1 flex-col justify-center">
        {/* Main content - split layout */}
        <div className="flex h-full w-full flex-col gap-8 lg:flex-row lg:gap-12">
          {/* Left side - Branding */}
          <div className="flex flex-1 flex-col items-center justify-center gap-6 lg:items-start lg:text-left">
            <img
              alt="LitGit logo"
              className="h-16 w-auto lg:h-20"
              height="80"
              src="/src/assets/litgit-logo.png"
              width="80"
            />
            <div className="space-y-3">
              <h1 className="scroll-m-20 text-center font-bold font-mono text-2xl text-foreground leading-none tracking-tight lg:text-left lg:text-3xl">
                Welcome to LitGit
              </h1>
              <p className="mx-auto max-w-xs text-pretty text-center text-muted-foreground text-sm leading-relaxed lg:mx-0 lg:text-left">
                Set up your Git identity, connect GitHub for avatars, and
                configure AI for smart commit messages.
              </p>
            </div>
            {/* Dev mode close button */}
            {import.meta.env.DEV ? (
              <Button
                aria-label="Close onboarding page"
                className="h-6 gap-1.5 border border-amber-500/35 bg-amber-500/15 px-2 font-semibold text-foreground/95 text-xs uppercase tracking-[0.06em] hover:border-amber-500/55 hover:bg-amber-500/25 hover:text-foreground"
                onClick={() => {
                  navigate({ to: "/", replace: true }).catch(() => undefined);
                }}
                variant="ghost"
              >
                <XIcon className="size-3 text-amber-600 dark:text-amber-400" />
                Close
              </Button>
            ) : null}
          </div>

          {/* Right side - Stepper and Forms */}
          <div className="flex w-full flex-col justify-center gap-6 lg:w-[480px] lg:shrink-0">
            {/* Stepper */}
            <Stepper currentStep={currentStep} />

            {/* Content */}
            <div className="w-full">
              {currentStep === "identity" && (
                <IdentityStep
                  email={email}
                  errors={errors}
                  formError={formError}
                  isLoading={isLoading}
                  isSaving={isSaving}
                  name={name}
                  onEmailChange={setEmail}
                  onNameChange={setName}
                  onSubmit={handleIdentitySubmit}
                />
              )}

              {currentStep === "github" && (
                <GitHubTokenStep
                  onBack={handleBackToIdentity}
                  onComplete={handleGitHubComplete}
                  onSecretCleared={() =>
                    setGitHubTokenStatus({
                      hasStoredValue: false,
                      storageMode: "session",
                    })
                  }
                  onSkip={handleGitHubSkip}
                  onTokenChange={setGithubToken}
                  secretStatus={gitHubTokenStatus}
                  token={githubToken}
                />
              )}

              {currentStep === "ai" && (
                <AiStep
                  apiKey={aiApiKey}
                  onApiKeyChange={setAiApiKey}
                  onBack={handleBackToGitHub}
                  onComplete={handleAiComplete}
                  onSecretCleared={() =>
                    setAiSecretStatus({
                      hasStoredValue: false,
                      storageMode: "session",
                    })
                  }
                  onSkip={handleAiSkip}
                  secretStatus={aiSecretStatus}
                />
              )}

              {currentStep === "complete" && savedIdentity && (
                <CompletionView
                  identity={savedIdentity}
                  onClose={handleClose}
                />
              )}
            </div>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
