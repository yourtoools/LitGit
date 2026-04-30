import { Button } from "@litgit/ui/components/button";
import { Input } from "@litgit/ui/components/input";
import { Label } from "@litgit/ui/components/label";
import { useCallback, useEffect } from "react";
import {
  SectionActionRow,
  SettingsField,
  SettingsHelpText,
} from "@/components/views/settings/settings-shared-ui";
import { useReducerState } from "@/hooks/use-reducer-state";
import {
  getGitIdentityStatus,
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

  const [identityStatus, updateIdentityStatus] = useReducerState<null | {
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
  const [name, updateName] = useReducerState("");
  const [email, updateEmail] = useReducerState("");
  const [statusMessage, updateStatusMessage] = useReducerState<string | null>(
    null
  );
  const [isSaving, updateIsSaving] = useReducerState(false);
  const [isRefreshing, updateIsRefreshing] = useReducerState(false);
  const [isEditing, updateIsEditing] = useReducerState(false);
  const [editSnapshot, updateEditSnapshot] = useReducerState<{
    email: string;
    name: string;
  } | null>(null);
  const [lastLoadedRepoPath, updateLastLoadedRepoPath] = useReducerState<
    string | null
  >(null);

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
    ) => JSON.stringify(left) === JSON.stringify(right),
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
    updateIsRefreshing(true);

    try {
      const nextStatus = await getGitIdentityStatus(activeRepo?.path ?? null);
      updateIdentityStatus(nextStatus);
      updateLastLoadedRepoPath(activeRepo?.path ?? null);

      if (activeRepoId) {
        setRepoGitIdentity(activeRepoId, nextStatus);
      }

      updateStatusMessage(null);
    } catch (error: unknown) {
      updateStatusMessage(
        error instanceof Error ? error.message : "Failed to read Git profile"
      );
    } finally {
      updateIsRefreshing(false);
    }
  }, [
    activeRepo?.path,
    activeRepoId,
    setRepoGitIdentity,
    updateStatusMessage,
    updateIsRefreshing,
    updateLastLoadedRepoPath,
    updateIdentityStatus,
  ]);

  useEffect(() => {
    refreshIdentity().catch(() => undefined);
  }, [refreshIdentity]);

  useEffect(() => {
    if (!(activeRepo && activeRepoIdentity)) {
      return;
    }

    updateIdentityStatus((currentStatus) => {
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
      updateStatusMessage("Profile changed outside LitGit; values refreshed.");
    }
  }, [
    activeRepo,
    activeRepoIdentity,
    areIdentityStatusesEqual,
    identityStatus,
    lastLoadedRepoPath,
    updateStatusMessage,
    updateIdentityStatus,
  ]);

  useEffect(() => {
    const preferredIdentity =
      identityStatus?.global ?? identityStatus?.effective;

    updateName(preferredIdentity?.name ?? "");
    updateEmail(preferredIdentity?.email ?? "");
  }, [identityStatus, updateName, updateEmail]);

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
                    onChange={(event) => updateName(event.target.value)}
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
                    onChange={(event) => updateEmail(event.target.value)}
                    placeholder="jane@example.com"
                    type="email"
                    value={email}
                  />
                </div>
                <SectionActionRow>
                  <Button
                    disabled={isSaving}
                    onClick={() => {
                      updateIsSaving(true);
                      saveGitIdentity({
                        gitIdentity: { email, name, scope: "global" },
                        repoPath: null,
                      })
                        .then((nextStatus) => {
                          updateIdentityStatus(nextStatus);
                          updateLastLoadedRepoPath(activeRepo?.path ?? null);

                          if (activeRepoId) {
                            setRepoGitIdentity(activeRepoId, nextStatus);
                          }

                          updateStatusMessage("Saved global profile.");
                          updateIsEditing(false);
                          updateEditSnapshot(null);
                        })
                        .catch((error: unknown) => {
                          updateStatusMessage(
                            error instanceof Error
                              ? error.message
                              : "Failed to save Git profile"
                          );
                        })
                        .finally(() => {
                          updateIsSaving(false);
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
                        updateName(editSnapshot.name);
                        updateEmail(editSnapshot.email);
                      }

                      updateIsEditing(false);
                      updateEditSnapshot(null);
                      updateStatusMessage(null);
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
                      updateEditSnapshot({ email, name });
                      updateIsEditing(true);
                      updateStatusMessage(null);
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
    </div>
  );
}

export { GitSection };
