import { Button } from "@litgit/ui/components/button";
import { Input } from "@litgit/ui/components/input";
import { Label } from "@litgit/ui/components/label";
import { useCallback, useEffect, useState } from "react";
import {
  SectionActionRow,
  SettingsField,
  SettingsHelpText,
} from "@/components/views/settings/settings-shared-ui";
import {
  clearGitHubToken,
  getGitHubTokenStatus,
  getGitIdentityStatus,
  saveGitHubToken,
  saveGitIdentity,
} from "@/lib/tauri-settings-client";
import { useRepoStore } from "@/stores/repo/use-repo-store";

function GitSection({ query }: { query: string }) {
  const activeRepoId = useRepoStore((state) => state.activeRepoId);
  const activeRepo = useRepoStore((state) =>
    state.openedRepos.find((repo) => repo.id === activeRepoId)
  );
  const activeRepoIdentity = useRepoStore((state) =>
    activeRepoId ? (state.repoGitIdentities[activeRepoId] ?? null) : null
  );
  const setRepoGitIdentity = useRepoStore((state) => state.setRepoGitIdentity);
  const [identityStatus, setIdentityStatus] = useState<null | {
    effective: {
      email: string | null;
      isComplete: boolean;
      name: string | null;
    };
    effectiveScope: "global" | "local" | null;
    global: { email: string | null; isComplete: boolean; name: string | null };
    local: {
      email: string | null;
      isComplete: boolean;
      name: string | null;
    } | null;
    repoPath: string | null;
  }>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState<{
    email: string;
    name: string;
  } | null>(null);
  const [lastLoadedRepoPath, setLastLoadedRepoPath] = useState<string | null>(
    null
  );

  const areIdentityStatusesEqual = useCallback(
    (
      left: {
        effective: {
          email: string | null;
          isComplete: boolean;
          name: string | null;
        };
        effectiveScope: "global" | "local" | null;
        global: {
          email: string | null;
          isComplete: boolean;
          name: string | null;
        };
        local: {
          email: string | null;
          isComplete: boolean;
          name: string | null;
        } | null;
        repoPath: string | null;
      } | null,
      right: {
        effective: {
          email: string | null;
          isComplete: boolean;
          name: string | null;
        };
        effectiveScope: "global" | "local" | null;
        global: {
          email: string | null;
          isComplete: boolean;
          name: string | null;
        };
        local: {
          email: string | null;
          isComplete: boolean;
          name: string | null;
        } | null;
        repoPath: string | null;
      } | null
    ) => {
      return JSON.stringify(left) === JSON.stringify(right);
    },
    []
  );

  const formatIdentity = useCallback(
    (
      value: { email: string | null; name: string | null } | null | undefined
    ) => {
      if (!(value?.name || value?.email)) {
        return "Not configured";
      }

      if (value.name && value.email) {
        return `${value.name} <${value.email}>`;
      }

      return value.name ?? value.email ?? "Not configured";
    },
    []
  );

  const refreshIdentity = useCallback(async () => {
    setIsRefreshing(true);

    try {
      const nextStatus = await getGitIdentityStatus(activeRepo?.path ?? null);
      setIdentityStatus(nextStatus);
      setLastLoadedRepoPath(activeRepo?.path ?? null);

      if (activeRepoId) {
        setRepoGitIdentity(activeRepoId, nextStatus);
      }

      setStatusMessage(null);
    } catch (error: unknown) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to read Git profile"
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [activeRepo?.path, activeRepoId, setRepoGitIdentity]);

  useEffect(() => {
    refreshIdentity().catch(() => undefined);
  }, [refreshIdentity]);

  useEffect(() => {
    if (!(activeRepo && activeRepoIdentity)) {
      return;
    }

    setIdentityStatus((currentStatus) => {
      if (areIdentityStatusesEqual(currentStatus, activeRepoIdentity)) {
        return currentStatus;
      }

      return activeRepoIdentity;
    });

    if (
      lastLoadedRepoPath === activeRepo.path &&
      identityStatus !== null &&
      !areIdentityStatusesEqual(identityStatus, activeRepoIdentity)
    ) {
      setStatusMessage("Profile changed outside LitGit; values refreshed.");
    }
  }, [
    activeRepo,
    activeRepoIdentity,
    areIdentityStatusesEqual,
    identityStatus,
    lastLoadedRepoPath,
  ]);

  useEffect(() => {
    const preferredIdentity =
      identityStatus?.global ?? identityStatus?.effective;

    setName(preferredIdentity?.name ?? "");
    setEmail(preferredIdentity?.email ?? "");
  }, [identityStatus]);

  let effectiveIdentityHelpText =
    "No global profile is configured. Click Change to set one.";

  if (identityStatus?.effectiveScope === "local") {
    effectiveIdentityHelpText =
      "A repository-specific profile is active. Changes made here apply to your global default.";
  } else if (identityStatus?.effectiveScope === "global") {
    effectiveIdentityHelpText =
      "Your global profile is active across all repositories.";
  }

  return (
    <div className="grid gap-4">
      <SettingsField
        description="This defines who you are when authoring commits. Your name and email are read directly from your global Git config."
        label="Commit profile"
        query={query}
      >
        <div className="grid gap-3">
          <div className="grid gap-2 border border-border/60 bg-muted/18 p-4">
            {isEditing ? (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label className="text-xs" htmlFor="git-settings-name">
                    Commit author name
                  </Label>
                  <Input
                    className="h-7 text-xs"
                    id="git-settings-name"
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Jane Developer"
                    value={name}
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs" htmlFor="git-settings-email">
                    Commit author email
                  </Label>
                  <Input
                    className="h-7 text-xs"
                    id="git-settings-email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="jane@example.com"
                    type="email"
                    value={email}
                  />
                </div>
                <SectionActionRow>
                  <Button
                    disabled={isSaving}
                    onClick={() => {
                      setIsSaving(true);
                      saveGitIdentity({
                        gitIdentity: { email, name, scope: "global" },
                        repoPath: null,
                      })
                        .then((nextStatus) => {
                          setIdentityStatus(nextStatus);
                          setLastLoadedRepoPath(activeRepo?.path ?? null);

                          if (activeRepoId) {
                            setRepoGitIdentity(activeRepoId, nextStatus);
                          }

                          setStatusMessage("Saved global profile.");
                          setIsEditing(false);
                          setEditSnapshot(null);
                        })
                        .catch((error: unknown) => {
                          setStatusMessage(
                            error instanceof Error
                              ? error.message
                              : "Failed to save Git profile"
                          );
                        })
                        .finally(() => {
                          setIsSaving(false);
                        });
                    }}
                    size="sm"
                    type="button"
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    disabled={isSaving}
                    onClick={() => {
                      if (editSnapshot) {
                        setName(editSnapshot.name);
                        setEmail(editSnapshot.email);
                      }

                      setIsEditing(false);
                      setEditSnapshot(null);
                      setStatusMessage(null);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </SectionActionRow>
              </div>
            ) : (
              <div className="grid gap-4">
                <div>
                  <p className="font-medium text-sm">Identity in use</p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {formatIdentity(identityStatus?.effective)}
                  </p>
                  <SettingsHelpText>
                    {effectiveIdentityHelpText}
                  </SettingsHelpText>
                </div>
                {identityStatus?.effectiveScope === "local" ? (
                  <div className="grid gap-1 text-muted-foreground text-xs">
                    <span>
                      Global: {formatIdentity(identityStatus?.global)}
                    </span>
                    {activeRepo ? (
                      <span>
                        Repository override:{" "}
                        {formatIdentity(identityStatus?.local)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <SectionActionRow>
                  <Button
                    disabled={isRefreshing}
                    onClick={() => {
                      refreshIdentity().catch(() => undefined);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {isRefreshing ? "Refreshing..." : "Refresh profile"}
                  </Button>
                  <Button
                    onClick={() => {
                      setEditSnapshot({ email, name });
                      setIsEditing(true);
                      setStatusMessage(null);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Change
                  </Button>
                </SectionActionRow>
              </div>
            )}
          </div>
          <SettingsHelpText>
            Your email is attached to your commits and may be visible on public
            repositories. LitGit uses your underlying Git config to store this
            profile.
          </SettingsHelpText>
          {statusMessage ? (
            <SettingsHelpText>{statusMessage}</SettingsHelpText>
          ) : null}
        </div>
      </SettingsField>
      <SettingsField
        description="Use a fine-grained GitHub Personal Access Token to resolve commit author avatars and private email matches."
        label="GitHub token"
        query={query}
      >
        <GitHubTokenFields />
      </SettingsField>
    </div>
  );
}

function GitHubTokenFields() {
  const [tokenInput, setTokenInput] = useState("");
  const [tokenStatus, setTokenStatus] = useState<null | {
    hasStoredValue: boolean;
    storageMode: "secure" | "session";
  }>(null);
  const [tokenMessage, setTokenMessage] = useState<string | null>(null);
  const hasStoredToken = tokenStatus?.hasStoredValue ?? false;

  useEffect(() => {
    setTokenMessage(null);

    getGitHubTokenStatus()
      .then(setTokenStatus)
      .catch(() => {
        setTokenStatus(null);
      });
  }, []);

  return (
    <div className="grid gap-3">
      <SettingsHelpText>
        Use a fine-grained GitHub Personal Access Token with read-only access to
        your account email addresses for private email matching. Create one at{" "}
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href="https://github.com/settings/tokens"
          rel="noopener noreferrer"
          target="_blank"
        >
          github.com/settings/tokens
        </a>
        .
      </SettingsHelpText>
      <Input
        className="h-7 text-xs"
        disabled={hasStoredToken}
        onChange={(event) => {
          setTokenInput(event.target.value);
          setTokenMessage(null);
        }}
        placeholder="github_pat_..."
        type="password"
        value={hasStoredToken ? "********************" : tokenInput}
      />
      <div className="flex items-center gap-3">
        <Button
          disabled={hasStoredToken || tokenInput.trim().length === 0}
          onClick={() => {
            saveGitHubToken(tokenInput)
              .then((status) => {
                setTokenStatus(status);
                setTokenInput("");
                setTokenMessage(`Token saved (${status.storageMode}).`);
              })
              .catch((error: unknown) => {
                setTokenMessage(
                  error instanceof Error
                    ? error.message
                    : "Failed to save token"
                );
              });
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Save token
        </Button>
        <span className="text-muted-foreground text-xs">
          {tokenStatus?.hasStoredValue
            ? `Stored (${tokenStatus.storageMode})`
            : "No token saved"}
        </span>
      </div>
      {hasStoredToken ? (
        <SectionActionRow>
          <SettingsHelpText>
            Clear the saved token to replace it with a different one.
          </SettingsHelpText>
          <Button
            onClick={() => {
              clearGitHubToken()
                .then(() => {
                  setTokenStatus({
                    hasStoredValue: false,
                    storageMode: "session",
                  });
                  setTokenMessage("Token cleared.");
                })
                .catch((error: unknown) => {
                  setTokenMessage(
                    error instanceof Error
                      ? error.message
                      : "Failed to clear token"
                  );
                });
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Clear token
          </Button>
        </SectionActionRow>
      ) : null}
      {tokenMessage ? (
        <SettingsHelpText>{tokenMessage}</SettingsHelpText>
      ) : null}
    </div>
  );
}

export { GitSection };
