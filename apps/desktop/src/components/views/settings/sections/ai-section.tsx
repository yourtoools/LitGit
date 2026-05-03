import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@litgit/ui/components/alert-dialog";
import { Button } from "@litgit/ui/components/button";
import { Input } from "@litgit/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@litgit/ui/components/select";
import { Textarea } from "@litgit/ui/components/textarea";
import { useCallback, useEffect } from "react";
import {
  DefaultSelectValue,
  SectionActionRow,
  SettingsField,
  SettingsHelpText,
} from "@/components/views/settings/settings-section-ui";
import { useReducerState } from "@/hooks/use-reducer-state";
import {
  clearAiProviderSecret,
  getAiProviderSecretStatus,
  getSettingsBackendCapabilities,
  listAiModels,
  saveAiProviderSecret,
} from "@/lib/tauri-settings-client";
import {
  DEFAULT_AI_COMMIT_INSTRUCTION,
  DEFAULT_PREFERENCES,
  getDefaultAiMaxOutputTokens,
} from "@/stores/preferences/preferences-store-types";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import {
  AI_ENDPOINT_PLACEHOLDERS,
  AI_PROVIDER_OPTIONS,
} from "@/stores/ui/settings-options";

function AiSection({ query }: { query: string }) {
  const commitInstruction = usePreferencesStore(
    (state) => state.ai.commitInstruction
  );
  const customEndpoint = usePreferencesStore(
    (state) => state.ai.customEndpoint
  );
  const maxInputTokens = usePreferencesStore(
    (state) => state.ai.maxInputTokens
  );
  const maxOutputTokens = usePreferencesStore(
    (state) => state.ai.maxOutputTokens
  );
  const model = usePreferencesStore((state) => state.ai.model);
  const provider = usePreferencesStore((state) => state.ai.provider);
  const setAiCommitInstruction = usePreferencesStore(
    (state) => state.setAiCommitInstruction
  );
  const setAiCustomEndpoint = usePreferencesStore(
    (state) => state.setAiCustomEndpoint
  );
  const setAiMaxInputTokens = usePreferencesStore(
    (state) => state.setAiMaxInputTokens
  );
  const setAiMaxOutputTokens = usePreferencesStore(
    (state) => state.setAiMaxOutputTokens
  );
  const setAiModel = usePreferencesStore((state) => state.setAiModel);
  const setAiProvider = usePreferencesStore((state) => state.setAiProvider);
  const availableModels = usePreferencesStore(
    (state) => state.ai.availableModels
  );
  const setAiAvailableModels = usePreferencesStore(
    (state) => state.setAiAvailableModels
  );
  const [aiSecretInput, updateAiSecretInput] = useReducerState("");
  const [isLoadingAiModels, updateIsLoadingAiModels] = useReducerState(false);
  const [aiModelsMessage, updateAiModelsMessage] = useReducerState<
    string | null
  >(null);
  const [aiSecretStatus, updateAiSecretStatus] = useReducerState<null | {
    hasStoredValue: boolean;
    storageMode: "secure" | "session";
  }>(null);
  const [aiSecretMessage, updateAiSecretMessage] = useReducerState<
    string | null
  >(null);
  const [capabilitiesMessage, updateCapabilitiesMessage] = useReducerState<
    string | null
  >(null);
  const [isClearingAiSecret, updateIsClearingAiSecret] = useReducerState(false);
  const [isResetDialogOpen, updateIsResetDialogOpen] = useReducerState(false);
  const hasStoredAiSecret = aiSecretStatus?.hasStoredValue ?? false;

  const hasConfiguredAiSettings =
    hasStoredAiSecret ||
    model.trim().length > 0 ||
    provider !== DEFAULT_PREFERENCES.ai.provider ||
    customEndpoint.trim().length > 0 ||
    commitInstruction !== DEFAULT_PREFERENCES.ai.commitInstruction ||
    maxInputTokens !== DEFAULT_PREFERENCES.ai.maxInputTokens ||
    maxOutputTokens !== DEFAULT_PREFERENCES.ai.maxOutputTokens;

  // Provider is locked when fully configured (API key + model + optional URL for custom/ollama)
  const showCustomUrl = provider === "custom" || provider === "ollama";
  const isProviderLocked =
    hasStoredAiSecret &&
    model.trim().length > 0 &&
    (!showCustomUrl || customEndpoint.trim().length > 0);

  const resetAiSettings = () => {
    clearAiProviderSecret(provider)
      .catch(() => undefined)
      .finally(() => {
        setAiProvider(DEFAULT_PREFERENCES.ai.provider);
        setAiCommitInstruction(DEFAULT_PREFERENCES.ai.commitInstruction);
        setAiCustomEndpoint(DEFAULT_PREFERENCES.ai.customEndpoint);
        setAiMaxInputTokens(DEFAULT_PREFERENCES.ai.maxInputTokens);
        setAiMaxOutputTokens(DEFAULT_PREFERENCES.ai.maxOutputTokens);
        setAiModel(DEFAULT_PREFERENCES.ai.model);
        setAiAvailableModels([]);
        updateAiModelsMessage(null);
        updateAiSecretInput("");
        updateAiSecretStatus({
          hasStoredValue: false,
          storageMode: "session",
        });
        updateAiSecretMessage("AI settings reset to defaults.");
      });
  };

  const refreshAiModels = useCallback(() => {
    updateIsLoadingAiModels(true);
    updateAiModelsMessage(null);

    listAiModels({
      customEndpoint,
      provider,
    })
      .then((models) => {
        setAiAvailableModels(models);

        if (models.length === 0) {
          setAiModel("");
          updateAiModelsMessage("No models were returned by the AI endpoint.");
          return;
        }

        const hasSelectedModel = models.some((entry) => entry.id === model);
        const nextModel = hasSelectedModel ? model : (models[0]?.id ?? "");

        setAiModel(nextModel);
        updateAiModelsMessage(`Loaded ${models.length} model(s).`);
      })
      .catch((error: unknown) => {
        setAiAvailableModels([]);
        setAiModel("");
        updateAiModelsMessage(
          error instanceof Error ? error.message : "Failed to load AI models"
        );
      })
      .finally(() => {
        updateIsLoadingAiModels(false);
      });
  }, [
    customEndpoint,
    model,
    provider,
    setAiModel,
    setAiAvailableModels,
    updateIsLoadingAiModels,
    updateAiModelsMessage,
  ]);

  useEffect(() => {
    updateAiSecretMessage(null);
    updateAiModelsMessage(null);

    getAiProviderSecretStatus(provider)
      .then(updateAiSecretStatus)
      .catch(() => {
        updateAiSecretStatus(null);
      });

    getSettingsBackendCapabilities()
      .then((capabilities) => {
        if (capabilities.secureStorageAvailable) {
          updateCapabilitiesMessage(null);
        } else {
          updateCapabilitiesMessage(
            "Secure storage unavailable; using session mode."
          );
        }
      })
      .catch(() => {
        updateCapabilitiesMessage("Desktop backend capabilities unavailable.");
      });
  }, [
    provider,
    updateAiSecretStatus,
    updateAiModelsMessage,
    updateCapabilitiesMessage,
    updateAiSecretMessage,
  ]);

  return (
    <div className="grid gap-1.5">
      <SettingsField
        description="Choose which provider future AI-assisted features should target."
        label="AI provider"
        query={query}
      >
        <Select
          items={AI_PROVIDER_OPTIONS}
          onValueChange={(value) => {
            if (typeof value === "string") {
              const nextProvider = value as
                | "openai"
                | "anthropic"
                | "azure"
                | "google"
                | "ollama"
                | "custom";

              setAiProvider(nextProvider);
              setAiMaxOutputTokens(getDefaultAiMaxOutputTokens(nextProvider));
            }
          }}
          value={provider}
        >
          <SelectTrigger
            className="focus-visible:desktop-focus h-7 w-full text-xs focus-visible:ring-0! focus-visible:ring-offset-0!"
            disabled={isProviderLocked}
            size="sm"
          >
            <DefaultSelectValue />
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
      </SettingsField>
      <SettingsField
        description="Use an OpenAI-compatible base URL. Custom endpoints must expose /models and /chat/completions."
        label="Base URL"
        query={query}
      >
        <Input
          className="h-7 text-xs"
          onChange={(event) => setAiCustomEndpoint(event.target.value)}
          placeholder={AI_ENDPOINT_PLACEHOLDERS[provider]}
          value={customEndpoint}
        />
      </SettingsField>
      <SettingsField
        description="Set the prompt budget used for commit generation. Lower values are faster; the staged diff is trimmed automatically."
        label="Max input tokens"
        query={query}
      >
        <Input
          className="h-7 text-xs"
          max={4096}
          min={256}
          onChange={(event) => {
            setAiMaxInputTokens(Number(event.target.value) || 256);
          }}
          type="number"
          value={maxInputTokens}
        />
      </SettingsField>
      <SettingsField
        description="Set the response budget used for commit generation. Lower values reduce latency and keep commit bodies concise."
        label="Max output tokens"
        query={query}
      >
        <Input
          className="h-7 text-xs"
          max={512}
          min={32}
          onChange={(event) => {
            setAiMaxOutputTokens(Number(event.target.value) || 32);
          }}
          type="number"
          value={maxOutputTokens}
        />
      </SettingsField>
      <SettingsField
        description="Secrets are saved in the desktop backend and only metadata comes back to the renderer."
        label="API key storage"
        query={query}
      >
        <div className="grid gap-1.5">
          <Input
            className="h-7 text-xs"
            disabled={hasStoredAiSecret || isClearingAiSecret}
            onChange={(event) => {
              updateAiSecretInput(event.target.value);
              updateAiSecretMessage(null);
            }}
            placeholder="sk-..."
            type="password"
            value={hasStoredAiSecret ? "********************" : aiSecretInput}
          />
          <div className="flex items-center gap-3">
            <Button
              disabled={
                aiSecretInput.trim().length === 0 ||
                hasStoredAiSecret ||
                isClearingAiSecret
              }
              onClick={() => {
                saveAiProviderSecret(provider, aiSecretInput)
                  .then((status) => {
                    updateAiSecretStatus(status);
                    updateAiSecretInput("");
                    updateAiSecretMessage(
                      `API key saved (${status.storageMode}).`
                    );
                  })
                  .catch((error: unknown) => {
                    updateAiSecretMessage(
                      error instanceof Error
                        ? error.message
                        : "Failed to save API key"
                    );
                  });
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Save API key
            </Button>
            <span className="text-muted-foreground text-xs">
              {aiSecretStatus?.hasStoredValue
                ? `Stored (${aiSecretStatus.storageMode})`
                : "No API key saved"}
            </span>
          </div>
          {hasStoredAiSecret ? (
            <SectionActionRow>
              <Button
                disabled={isClearingAiSecret}
                onClick={() => {
                  updateIsClearingAiSecret(true);
                  updateAiSecretMessage(null);

                  clearAiProviderSecret(provider)
                    .then(() => {
                      updateAiSecretStatus({
                        hasStoredValue: false,
                        storageMode: "session",
                      });
                      updateAiSecretInput("");
                      updateAiSecretMessage(
                        "API key cleared. You can now enter a new one."
                      );
                    })
                    .catch((error: unknown) => {
                      updateAiSecretMessage(
                        error instanceof Error
                          ? error.message
                          : "Failed to clear API key"
                      );
                    })
                    .finally(() => {
                      updateIsClearingAiSecret(false);
                    });
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                {isClearingAiSecret ? "Clearing..." : "Clear to change"}
              </Button>
            </SectionActionRow>
          ) : null}
          {aiSecretMessage ? (
            <SettingsHelpText>{aiSecretMessage}</SettingsHelpText>
          ) : null}
          {capabilitiesMessage ? (
            <div className="text-muted-foreground text-xs">
              {capabilitiesMessage}
            </div>
          ) : null}
        </div>
      </SettingsField>
      <SettingsField
        description="Discover models from the configured OpenAI-compatible endpoint. If this fails, the endpoint contract is not compatible."
        label="Model selection"
        query={query}
      >
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              disabled={!hasStoredAiSecret || isLoadingAiModels}
              onClick={refreshAiModels}
              size="sm"
              type="button"
              variant="outline"
            >
              {isLoadingAiModels ? "Refreshing..." : "Refresh models"}
            </Button>
            <span className="text-muted-foreground text-xs">
              {model.trim().length > 0
                ? `Selected: ${model}`
                : "No model selected"}
            </span>
          </div>
          <Select
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
            <SelectTrigger
              className="focus-visible:desktop-focus h-7 w-full text-xs focus-visible:ring-0! focus-visible:ring-offset-0!"
              size="sm"
            >
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
          {aiModelsMessage ? (
            <SettingsHelpText>{aiModelsMessage}</SettingsHelpText>
          ) : null}
        </div>
      </SettingsField>
      <SettingsField
        description="This default instruction seeds AI commit generation and stays editable from the commit composer."
        label="Default commit instruction"
        query={query}
      >
        <div className="grid gap-1.5">
          <Textarea
            className="focus-visible:desktop-focus min-h-28 focus-visible:ring-0! focus-visible:ring-offset-0!"
            onChange={(event) => setAiCommitInstruction(event.target.value)}
            placeholder="Describe how commit titles and bodies should be written"
            value={commitInstruction}
          />
          <SectionActionRow>
            <Button
              disabled={commitInstruction === DEFAULT_AI_COMMIT_INSTRUCTION}
              onClick={() =>
                setAiCommitInstruction(DEFAULT_AI_COMMIT_INSTRUCTION)
              }
              size="sm"
              type="button"
              variant="outline"
            >
              Reset Default
            </Button>
          </SectionActionRow>
        </div>
      </SettingsField>
      <SettingsField
        description="Clear all AI settings including API key, provider, model, and custom configurations. This action cannot be undone."
        label="Danger Zone"
        query={query}
      >
        <AlertDialog
          onOpenChange={updateIsResetDialogOpen}
          open={isResetDialogOpen}
        >
          <AlertDialogTrigger
            disabled={!hasConfiguredAiSettings}
            render={
              <Button size="sm" type="button" variant="destructive">
                Reset AI settings
              </Button>
            }
          />
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Reset AI Settings?</AlertDialogTitle>
              <AlertDialogDescription>
                This will clear your API key, provider, model, custom endpoint,
                and all AI configurations. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  resetAiSettings();
                  updateIsResetDialogOpen(false);
                }}
                size="sm"
                variant="destructive"
              >
                Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SettingsField>
    </div>
  );
}

export { AiSection };
