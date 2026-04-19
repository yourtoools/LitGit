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
import { Switch } from "@litgit/ui/components/switch";
import { KeyIcon, SpinnerIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import type {
  Provider,
  ProviderSshStatus,
  ProviderStatus,
} from "@/lib/tauri-integrations-client";

interface ProviderCardProps {
  onGenerateKey: (title: string) => void;
  onRemoveKey: () => void;
  onSetCustomKey: (privateKeyPath: string, publicKeyPath: string) => void;
  onUseSystemAgentChange: (use: boolean) => void;
  provider: Provider;
  sshStatus: ProviderSshStatus;
  status: ProviderStatus;
}

export function ProviderCard({
  provider,
  status,
  sshStatus,
  onGenerateKey,
  onRemoveKey,
  onSetCustomKey,
  onUseSystemAgentChange,
}: ProviderCardProps) {
  const [showRemoveKeyDialog, setShowRemoveKeyDialog] = useState(false);
  const [keyTitle, setKeyTitle] = useState(`litgit_${provider}`);
  const [isGenerating, setIsGenerating] = useState(false);
  const [privateKeyPath, setPrivateKeyPath] = useState("");
  const [publicKeyPath, setPublicKeyPath] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await onGenerateKey(keyTitle);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSetCustomKey = () => {
    setKeyError(null);
    if (!privateKeyPath.trim()) {
      setKeyError("Please select a private key file");
      return;
    }
    if (!publicKeyPath.trim()) {
      setKeyError("Please select a public key file");
      return;
    }
    onSetCustomKey(privateKeyPath, publicKeyPath);
  };

  const handlePrivateKeySelected = (path: string) => {
    setPrivateKeyPath(path);
    setKeyError(null);
    // Auto-suggest public key path if not set
    if (!publicKeyPath.trim()) {
      const suggestedPublicPath = `${path}.pub`;
      setPublicKeyPath(suggestedPublicPath);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString || dateString === "Invalid Date") {
      return "Unknown";
    }

    try {
      const date = new Date(dateString);
      // Check if date is valid
      if (Number.isNaN(date.getTime())) {
        console.warn("Invalid date string received:", dateString);
        return "Unknown";
      }

      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      console.warn("Error parsing date:", dateString);
      return "Unknown";
    }
  };

  const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);

  return (
    <div className="rounded-lg border border-border/60 bg-background/70 p-3">
      {/* Provider Info */}
      <div className="mb-3 flex items-start gap-3">
        {status.avatarUrl ? (
          <img
            alt={status.username ?? ""}
            className="size-8 rounded-full"
            height={32}
            src={status.avatarUrl}
            width={32}
          />
        ) : (
          <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
            <span className="font-semibold text-sm">
              {provider.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm">
              {status.displayName || status.username}
            </h3>
            <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 font-medium text-green-600 text-xs">
              Connected
            </span>
          </div>
          <p className="text-muted-foreground text-xs">@{status.username}</p>
        </div>
      </div>

      {/* SSH Configuration */}
      <div className="border-border/60 border-t pt-3">
        <h4 className="mb-2 font-medium text-xs">SSH Key Configuration</h4>

        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs" htmlFor={`system-agent-${provider}`}>
            Use system SSH agent
          </label>
          <Switch
            checked={sshStatus.useSystemAgent}
            id={`system-agent-${provider}`}
            onCheckedChange={onUseSystemAgentChange}
          />
        </div>

        {sshStatus.useSystemAgent && (
          <p className="text-muted-foreground text-xs">
            Using your system SSH Local Agent for {providerName} authentication.
          </p>
        )}

        {!sshStatus.useSystemAgent && sshStatus.customKey && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="mb-2 flex items-center gap-2">
              <KeyIcon className="size-3 text-muted-foreground" />
              <span className="font-medium text-xs">
                {sshStatus.customKey.title}
              </span>
            </div>
            <p className="mb-1 font-mono text-muted-foreground text-xs">
              {sshStatus.customKey.fingerprint}
            </p>
            <p className="text-muted-foreground text-xs">
              Added: {formatDate(sshStatus.customKey.addedAt)}
            </p>
            <Button
              className="mt-2 h-7 text-xs"
              onClick={() => setShowRemoveKeyDialog(true)}
              size="sm"
              variant="destructive"
            >
              <TrashIcon className="mr-1 size-3" />
              Remove and Delete
            </Button>
          </div>
        )}

        {!(sshStatus.useSystemAgent || sshStatus.customKey) && (
          <div className="space-y-3">
            {/* Generate New Key Section */}
            <div className="space-y-2">
              <div>
                <label
                  className="mb-1 block text-xs"
                  htmlFor={`key-title-${provider}`}
                >
                  Key Title
                </label>
                <Input
                  className="h-7 text-xs"
                  id={`key-title-${provider}`}
                  onChange={(e) => setKeyTitle(e.target.value)}
                  placeholder={`litgit_${provider}`}
                  value={keyTitle}
                />
              </div>
              <Button
                className="h-7 w-full text-xs"
                disabled={isGenerating || !keyTitle.trim()}
                onClick={handleGenerate}
                size="sm"
              >
                {isGenerating ? (
                  <>
                    <SpinnerIcon className="mr-2 size-3 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <KeyIcon className="mr-2 size-3" />
                    Generate SSH key and add to {providerName}
                  </>
                )}
              </Button>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-border/60 border-t" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background/70 px-2 text-muted-foreground text-xs">
                  or use existing key
                </span>
              </div>
            </div>

            {/* Use Existing Key Section */}
            <div className="space-y-2">
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor={`private-key-${provider}`}>
                  Private key path
                </Label>
                <div className="flex gap-1.5">
                  <Input
                    className="h-7 text-xs"
                    id={`private-key-${provider}`}
                    onChange={(e) => setPrivateKeyPath(e.target.value)}
                    placeholder="Select private key file"
                    value={privateKeyPath}
                  />
                  <Button
                    onClick={() => {
                      import("@/lib/tauri-settings-client").then(
                        ({ pickSettingsFile }) => {
                          pickSettingsFile()
                            .then((path) => {
                              if (path) {
                                handlePrivateKeySelected(path);
                              }
                            })
                            .catch((error: unknown) => {
                              setKeyError(
                                error instanceof Error
                                  ? error.message
                                  : "Failed to pick file"
                              );
                            });
                        }
                      );
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Browse
                  </Button>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor={`public-key-${provider}`}>
                  Public key path
                </Label>
                <div className="flex gap-1.5">
                  <Input
                    className="h-7 text-xs"
                    id={`public-key-${provider}`}
                    onChange={(e) => setPublicKeyPath(e.target.value)}
                    placeholder="Select public key file"
                    value={publicKeyPath}
                  />
                  <Button
                    onClick={() => {
                      import("@/lib/tauri-settings-client").then(
                        ({ pickSettingsFile }) => {
                          pickSettingsFile()
                            .then((path) => {
                              if (path) {
                                setPublicKeyPath(path);
                                setKeyError(null);
                              }
                            })
                            .catch((error: unknown) => {
                              setKeyError(
                                error instanceof Error
                                  ? error.message
                                  : "Failed to pick file"
                              );
                            });
                        }
                      );
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Browse
                  </Button>
                </div>
              </div>

              {keyError ? (
                <p className="text-destructive text-xs">{keyError}</p>
              ) : null}

              <Button
                className="h-7 w-full text-xs"
                disabled={
                  privateKeyPath.trim().length === 0 ||
                  publicKeyPath.trim().length === 0
                }
                onClick={handleSetCustomKey}
                size="sm"
                variant="outline"
              >
                Use existing SSH key
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog onOpenChange={setShowRemoveKeyDialog} open={showRemoveKeyDialog}>
        <DialogContent className="gap-3 p-3 text-xs sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Remove SSH Key?</DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to remove and delete this SSH key? This will
              remove it from your {providerName} account and delete the local
              key files.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="-mx-3 -mb-3 gap-2 p-3">
            <Button
              className="text-xs"
              onClick={() => setShowRemoveKeyDialog(false)}
              size="sm"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="text-xs"
              onClick={() => {
                onRemoveKey();
                setShowRemoveKeyDialog(false);
              }}
              size="sm"
              variant="destructive"
            >
              Remove and Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
