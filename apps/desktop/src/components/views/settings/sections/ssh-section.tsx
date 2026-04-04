import { Button } from "@litgit/ui/components/button";
import { Input } from "@litgit/ui/components/input";
import { Label } from "@litgit/ui/components/label";
import { Switch } from "@litgit/ui/components/switch";
import { useState } from "react";
import {
  SettingsField,
  SettingsHelpText,
} from "@/components/views/settings/settings-shared-ui";
import {
  generateSshKeypair,
  pickSettingsFile,
} from "@/lib/tauri-settings-client";
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
              setPreferencesState((state) => ({
                ssh: {
                  ...state.ssh,
                  useLocalAgent: Boolean(checked),
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
        description="Store key paths as preferences while the actual private key contents remain outside the renderer."
        label="SSH key selection"
        query={query}
      >
        <div className="grid gap-1.5">
          <div className="grid gap-1.5">
            <Label className="text-xs" htmlFor="ssh-private-key-path">
              Private key path
            </Label>
            <div className="flex gap-1.5">
              <Input
                className="h-7 text-xs"
                id="ssh-private-key-path"
                placeholder="~/.ssh/id_ed25519"
                readOnly
                value={privateKeyPath}
              />
              <Button
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
                id="ssh-public-key-path"
                placeholder="~/.ssh/id_ed25519.pub"
                readOnly
                value={publicKeyPath}
              />
              <Button
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
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              onClick={() => {
                generateSshKeypair("litgit_ed25519")
                  .then((result) => {
                    setSshPaths({
                      privateKeyPath: result.path,
                      publicKeyPath: `${result.path}.pub`,
                    });
                    setSshStatusMessage("Generated a new SSH keypair.");
                  })
                  .catch((error: unknown) => {
                    setSshStatusMessage(
                      error instanceof Error
                        ? error.message
                        : "Failed to generate SSH keypair"
                    );
                  });
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Generate new keypair
            </Button>
            {sshStatusMessage ? (
              <span className="text-muted-foreground text-xs">
                {sshStatusMessage}
              </span>
            ) : null}
          </div>
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
