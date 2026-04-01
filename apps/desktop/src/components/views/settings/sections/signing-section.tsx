import { Button } from "@litgit/ui/components/button";
import { Checkbox } from "@litgit/ui/components/checkbox";
import { Input } from "@litgit/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@litgit/ui/components/select";
import { useEffect, useMemo, useState } from "react";
import {
  DefaultSelectValue,
  SettingsField,
  SettingsHelpText,
} from "@/components/views/settings/settings-shared-ui";
import {
  NO_SIGNING_KEY_VALUE,
  SIGNING_FORMAT_OPTIONS,
} from "@/components/views/settings/settings-store";
import { listSigningKeys, pickSettingsFile } from "@/lib/tauri-settings-client";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";

function SigningSection({ query }: { query: string }) {
  const gpgProgramPath = usePreferencesStore(
    (state) => state.signing.gpgProgramPath
  );
  const signingFormat = usePreferencesStore(
    (state) => state.signing.signingFormat
  );
  const signingKey =
    usePreferencesStore((state) => state.signing.signingKey) ?? "";
  const signCommitsByDefault = usePreferencesStore(
    (state) => state.signing.signCommitsByDefault
  );
  const setSigningPreferences = usePreferencesStore(
    (state) => state.setSigningPreferences
  );
  const [availableSigningKeys, setAvailableSigningKeys] = useState<
    Array<{ id: string; label: string; type: "gpg" | "ssh" }>
  >([]);
  const [signingStatusMessage, setSigningStatusMessage] = useState<
    string | null
  >(null);

  const filteredSigningKeys = useMemo(
    () =>
      availableSigningKeys.filter((entry) =>
        signingFormat === "gpg" ? entry.type === "gpg" : entry.type === "ssh"
      ),
    [availableSigningKeys, signingFormat]
  );

  useEffect(() => {
    listSigningKeys()
      .then((keys) => {
        setAvailableSigningKeys(keys);
      })
      .catch((error: unknown) => {
        setSigningStatusMessage(
          error instanceof Error ? error.message : "Failed to load signing keys"
        );
      });
  }, []);

  useEffect(() => {
    if (
      signingKey.length > 0 &&
      !filteredSigningKeys.some((entry) => entry.id === signingKey)
    ) {
      setSigningPreferences({ signingKey: "" });
    }
  }, [filteredSigningKeys, setSigningPreferences, signingKey]);

  return (
    <div className="grid gap-4">
      <SettingsField
        description="Apply Git commit signing automatically on supported commit flows."
        label="Sign commits by default"
        query={query}
      >
        <label className="inline-flex items-center gap-3">
          <Checkbox
            checked={signCommitsByDefault}
            onCheckedChange={(checked) => {
              setSigningPreferences({
                signCommitsByDefault: Boolean(checked),
              });
            }}
          />
          <span className="text-sm">Use signing defaults for new commits</span>
        </label>
      </SettingsField>
      <SettingsField
        description="Choose whether commit signing should use OPENPGP or SSH-backed keys. Incompatible selected keys are cleared automatically."
        label="Signing format"
        query={query}
      >
        <Select
          items={SIGNING_FORMAT_OPTIONS}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setSigningPreferences({ signingFormat: value as "gpg" | "ssh" });
            }
          }}
          value={signingFormat}
        >
          <SelectTrigger className="focus-visible:desktop-focus w-full focus-visible:ring-0! focus-visible:ring-offset-0!">
            <DefaultSelectValue placeholder="OPENPGP" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="gpg">OPENPGP</SelectItem>
              <SelectItem value="ssh">SSH</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </SettingsField>
      <SettingsField
        description="Optional explicit path to the GPG executable used when GPG signing is selected."
        label="GPG program path"
        query={query}
      >
        <div className="flex gap-2">
          <Input placeholder="/usr/bin/gpg" readOnly value={gpgProgramPath} />
          <Button
            onClick={() => {
              pickSettingsFile()
                .then((path) => {
                  if (path) {
                    setSigningPreferences({ gpgProgramPath: path });
                  }
                })
                .catch((error: unknown) => {
                  setSigningStatusMessage(
                    error instanceof Error
                      ? error.message
                      : "Failed to pick GPG program"
                  );
                });
            }}
            type="button"
            variant="outline"
          >
            Browse
          </Button>
        </div>
      </SettingsField>
      <SettingsField
        description="Available signing keys discovered from local GPG secret keys and SSH public keys."
        label="Signing key"
        query={query}
      >
        <div className="grid gap-3">
          <Select
            items={{
              [NO_SIGNING_KEY_VALUE]: "<None>",
              ...(Object.fromEntries(
                filteredSigningKeys.map((entry) => [
                  entry.id,
                  `${entry.label} (${entry.type.toUpperCase()})`,
                ])
              ) as Record<string, string>),
            }}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setSigningPreferences({
                  signingKey: value === NO_SIGNING_KEY_VALUE ? "" : value,
                });
              }
            }}
            value={signingKey.length > 0 ? signingKey : NO_SIGNING_KEY_VALUE}
          >
            <SelectTrigger className="focus-visible:desktop-focus w-full focus-visible:ring-0! focus-visible:ring-offset-0!">
              <SelectValue className="min-w-24" placeholder="<None>" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NO_SIGNING_KEY_VALUE}>
                  &lt;None&gt;
                </SelectItem>
                {filteredSigningKeys.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.label} ({entry.type.toUpperCase()})
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {filteredSigningKeys.length === 0 ? (
            <SettingsHelpText>
              No compatible signing keys were discovered for the selected format
              yet.
            </SettingsHelpText>
          ) : null}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                listSigningKeys()
                  .then((keys) => {
                    setAvailableSigningKeys(keys);
                    setSigningStatusMessage("Signing keys refreshed.");
                  })
                  .catch((error: unknown) => {
                    setSigningStatusMessage(
                      error instanceof Error
                        ? error.message
                        : "Failed to refresh signing keys"
                    );
                  });
              }}
              type="button"
              variant="outline"
            >
              Refresh keys
            </Button>
            {signingStatusMessage ? (
              <span className="text-muted-foreground text-sm">
                {signingStatusMessage}
              </span>
            ) : null}
          </div>
        </div>
      </SettingsField>
    </div>
  );
}

export { SigningSection };
