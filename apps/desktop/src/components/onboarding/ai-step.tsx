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
  SparkleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
  AI_ENDPOINT_PLACEHOLDERS,
  AI_PROVIDER_OPTIONS,
} from "@/components/views/settings/settings-store";
import {
  clearAiProviderSecret,
  getAiProviderSecretStatus,
  listAiModels,
  saveAiProviderSecret,
} from "@/lib/tauri-settings-client";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";

interface AiStepProps {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  onBack: () => void;
  onComplete: () => void;
  onSecretCleared: () => void;
  onSkip: () => void;
  secretStatus: {
    hasStoredValue: boolean;
    storageMode: "secure" | "session";
  } | null;
}

export function AiStep({
  onBack,
  onComplete,
  onSkip,
  apiKey,
  onApiKeyChange,
  secretStatus: initialSecretStatus,
  onSecretCleared,
}: AiStepProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsMessage, setModelsMessage] = useState<string | null>(null);
  const [secretStatus, setSecretStatus] = useState(initialSecretStatus);

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

  // Check secret status on mount
  useEffect(() => {
    if (provider) {
      getAiProviderSecretStatus(provider)
        .then(
          (status: {
            hasStoredValue: boolean;
            storageMode: "secure" | "session";
          }) => {
            setSecretStatus(status);
          }
        )
        .catch(() => {
          // Silently ignore errors
        });
    }
  }, [provider]);

  const hasStoredSecret = secretStatus?.hasStoredValue ?? false;
  const showCustomUrl = provider === "custom" || provider === "ollama";
  const hasApiKey = apiKey.trim().length > 0;

  const handleSave = async () => {
    const trimmedKey = apiKey.trim();

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
      setSecretStatus({ hasStoredValue: false, storageMode: "session" });
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
                className="h-7 text-xs"
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
            className="h-7 text-xs"
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
            {(() => {
              // Check if current form state has all required fields filled
              // Note: hasStoredSecret counts as having API key (it's just stored securely)
              const currentFormIsValid =
                (hasApiKey || hasStoredSecret) &&
                (!showCustomUrl || customEndpoint.trim().length > 0) &&
                model.trim().length > 0;

              // Only show "Continue" alone if:
              // - Has stored secret (was previously configured)
              // - AND current form is still valid (user hasn't broken it)
              const showContinueOnly = hasStoredSecret && currentFormIsValid;

              if (showContinueOnly) {
                return (
                  <Button
                    disabled={isSaving || isClearing}
                    onClick={onComplete}
                    type="button"
                  >
                    Continue
                  </Button>
                );
              }

              // Otherwise show Configure Later | Save & Continue
              return (
                <>
                  <Button
                    disabled={isSaving || isClearing}
                    onClick={onSkip}
                    type="button"
                    variant="ghost"
                  >
                    Configure Later
                  </Button>
                  <Button
                    className="min-w-28"
                    disabled={
                      isSaving ||
                      isClearing ||
                      (!hasStoredSecret &&
                        (!hasApiKey ||
                          (showCustomUrl &&
                            customEndpoint.trim().length === 0) ||
                          model.trim().length === 0))
                    }
                    onClick={handleSave}
                    type="button"
                  >
                    {isSaving ? "Saving..." : "Save & Continue"}
                  </Button>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
