import { Button } from "@litgit/ui/components/button";
import { CheckCircleIcon, XIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { AiStep } from "@/components/onboarding/ai-step";
import {
  CompletionView,
  IdentityStep,
} from "@/components/onboarding/identity-step";
import { IntegrationsStep } from "@/components/onboarding/integrations-step";
import {
  getAiProviderSecretStatus,
  getGitIdentityStatus,
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
    description: "Connect your Git provider accounts",
    id: "github",
    label: "Integrations",
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

export function OnboardingPage() {
  const setHasCompletedOnboarding = usePreferencesStore(
    (state) => state.setHasCompletedOnboarding
  );
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("identity");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");

  // Secret status tracking (for disabled inputs and clear buttons)
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
              src="/litgit-logo.png"
              width="80"
            />
            <div className="space-y-3">
              <h1 className="scroll-m-20 text-center font-bold font-mono text-2xl text-foreground leading-none tracking-tight lg:text-left lg:text-3xl">
                Welcome to LitGit
              </h1>
              <p className="mx-auto max-w-xs text-pretty text-center text-muted-foreground text-sm leading-relaxed lg:mx-0 lg:text-left">
                Set up your Git identity, connect accounts via OAuth, and enable
                AI for smart commits.
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
          <div className="flex w-full flex-col justify-center gap-6 lg:w-120 lg:shrink-0">
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
                <IntegrationsStep
                  onBack={handleBackToIdentity}
                  onComplete={handleGitHubComplete}
                  onSkip={handleGitHubSkip}
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
