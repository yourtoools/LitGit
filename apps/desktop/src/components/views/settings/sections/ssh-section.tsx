import { Button } from "@litgit/ui/components/button";
import { Input } from "@litgit/ui/components/input";
import { Label } from "@litgit/ui/components/label";
import { Switch } from "@litgit/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { CopyIcon, PlusIcon } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { toast } from "sonner";
import {
  SettingsField,
  SettingsHelpText,
} from "@/components/views/settings/settings-shared-ui";
import { generateLitgitKeyWithDialog } from "@/lib/tauri-auth-client";
import { pickSettingsFile } from "@/lib/tauri-settings-client";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";

const isMatchingSshKeyPair = (
  privateKeyPath: string | null | undefined,
  publicKeyPath: string | null | undefined
) => {
  const trimmedPrivateKeyPath = privateKeyPath?.trim() ?? "";
  const trimmedPublicKeyPath = publicKeyPath?.trim() ?? "";

  if (!(trimmedPrivateKeyPath && trimmedPublicKeyPath)) {
    return true;
  }

  return trimmedPublicKeyPath === `${trimmedPrivateKeyPath}.pub`;
};

function SshSection({ query }: { query: string }) {
  const privateKeyPath =
    usePreferencesStore((state) => state.ssh.privateKeyPath) ?? "";
  const publicKeyPath =
    usePreferencesStore((state) => state.ssh.publicKeyPath) ?? "";
  const setSshPaths = usePreferencesStore((state) => state.setSshPaths);
  const useLocalAgent = usePreferencesStore((state) => state.ssh.useLocalAgent);
  const setPreferencesState = usePreferencesStore.setState;
  const [sshStatusMessage, setSshStatusMessage] = useState<string | null>(null);
  const hasMismatchedSshPair = !isMatchingSshKeyPair(
    privateKeyPath,
    publicKeyPath
  );

  const handleCopyPublicKey = async () => {
    if (!publicKeyPath) {
      return;
    }

    try {
      const publicKey = await invoke<string>("copy_public_key", {
        keyPath: publicKeyPath,
      });
      await navigator.clipboard.writeText(publicKey);
      toast.success("copied to clipboard");
    } catch (err) {
      toast.error(`Failed to copy public key: ${err}`);
    }
  };

  return (
    <div className="grid gap-1.5">
      <SettingsField
        description="Allow supported Git operations to consult the local SSH agent when authenticating remotes."
        label="Use local SSH agent"
        query={query}
      >
        <label className="inline-flex items-center gap-1.5">
          <Switch
            checked={useLocalAgent}
            onCheckedChange={(checked) => {
              const newValue = Boolean(checked);
              setPreferencesState((state) => ({
                ssh: {
                  ...state.ssh,
                  useLocalAgent: newValue,
                },
              }));
            }}
          />
          <span className="text-xs">
            {useLocalAgent ? "Prefer local SSH agent" : "Do not use SSH agent"}
          </span>
        </label>
      </SettingsField>

      <SettingsField
        description="Manage SSH keys or select an existing key pair for Git authentication."
        label="SSH key selection"
        query={query}
      >
        <div className="grid gap-1.5">
          {/* Key Management Buttons */}
          <div className="flex items-center gap-1.5">
            <Button
              disabled={useLocalAgent}
              onClick={async () => {
                try {
                  const keyInfo = await generateLitgitKeyWithDialog();
                  setSshPaths({
                    privateKeyPath: keyInfo.path,
                    publicKeyPath: `${keyInfo.path}.pub`,
                  });
                  toast.success("Key generated successfully");
                } catch (error) {
                  toast.error(`Failed to generate key: ${error}`);
                }
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <PlusIcon className="mr-2 size-4" />
              Generate New Key
            </Button>
          </div>

          {/* Selected Key Display */}
          <div className="grid gap-1.5">
            <Label className="text-xs" htmlFor="ssh-private-key-path">
              Private key path
            </Label>
            <div className="flex gap-1.5">
              <Input
                className="h-7 text-xs"
                disabled={useLocalAgent}
                id="ssh-private-key-path"
                placeholder="Select private key file"
                readOnly={useLocalAgent}
                value={useLocalAgent ? "********************" : privateKeyPath}
              />
              <Button
                disabled={useLocalAgent}
                onClick={() => {
                  pickSettingsFile()
                    .then((path) => {
                      if (path) {
                        setSshPaths({ privateKeyPath: path });
                      }
                    })
                    .catch((error: unknown) => {
                      setSshStatusMessage(
                        error instanceof Error
                          ? error.message
                          : "Failed to pick file"
                      );
                    });
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
            <Label className="text-xs" htmlFor="ssh-public-key-path">
              Public key path
            </Label>
            <div className="flex gap-1.5">
              <Input
                className="h-7 text-xs"
                disabled={useLocalAgent}
                id="ssh-public-key-path"
                placeholder="Select public key file"
                readOnly={useLocalAgent}
                value={useLocalAgent ? "********************" : publicKeyPath}
              />
              <Button
                disabled={useLocalAgent}
                onClick={() => {
                  pickSettingsFile()
                    .then((path) => {
                      if (path) {
                        setSshPaths({ publicKeyPath: path });
                      }
                    })
                    .catch((error: unknown) => {
                      setSshStatusMessage(
                        error instanceof Error
                          ? error.message
                          : "Failed to pick file"
                      );
                    });
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Browse
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        className="h-7 w-7"
                        disabled={useLocalAgent || !publicKeyPath}
                        onClick={handleCopyPublicKey}
                        size="icon"
                        variant="ghost"
                      >
                        <CopyIcon className="size-4" />
                      </Button>
                    }
                  />
                  <TooltipContent>
                    <p>copy file content into clipboard</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {sshStatusMessage ? (
            <span className="text-muted-foreground text-xs">
              {sshStatusMessage}
            </span>
          ) : null}

          {hasMismatchedSshPair ? (
            <SettingsHelpText tone="warning">
              The public key must match the selected private key path and should
              normally be `{(privateKeyPath || "<private-key-path>").trim()}
              .pub`.
            </SettingsHelpText>
          ) : null}
        </div>
      </SettingsField>
    </div>
  );
}

export { SshSection };
