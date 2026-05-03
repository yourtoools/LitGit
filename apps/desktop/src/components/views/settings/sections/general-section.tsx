import { Input } from "@litgit/ui/components/input";
import { Switch } from "@litgit/ui/components/switch";
import {
  SettingsField,
  SettingsHelpText,
} from "@/components/views/settings/settings-section-ui";
import { AUTO_FETCH_INTERVAL_LIMITS } from "@/stores/preferences/preferences-store-types";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import { countUniqueRemoteNames } from "@/stores/repo/repo-store.helpers";
import { useRepoStore } from "@/stores/repo/use-repo-store";

function GeneralSection({ query }: { query: string }) {
  const rememberTabs = usePreferencesStore(
    (state) => state.general.rememberTabs
  );
  const autoFetchIntervalMinutes = usePreferencesStore(
    (state) => state.general.autoFetchIntervalMinutes
  );
  const defaultBranchName = usePreferencesStore(
    (state) => state.general.defaultBranchName
  );
  const setRememberTabs = usePreferencesStore((state) => state.setRememberTabs);
  const setAutoFetchIntervalMinutes = usePreferencesStore(
    (state) => state.setAutoFetchIntervalMinutes
  );
  const setDefaultBranchName = usePreferencesStore(
    (state) => state.setDefaultBranchName
  );
  const activeRepoId = useRepoStore((state) => state.activeRepoId);
  const repoRemoteNames = useRepoStore((state) => state.repoRemoteNames);
  const remoteNames = activeRepoId
    ? (repoRemoteNames[activeRepoId] ?? null)
    : null;
  const uniqueRemoteCount = remoteNames
    ? countUniqueRemoteNames(remoteNames)
    : null;
  const showAutoFetchWarning =
    uniqueRemoteCount !== null && uniqueRemoteCount > 5;

  return (
    <div className="grid gap-3">
      <SettingsField
        description="Keep open tabs between launches. Turning this off stops restoration and clears remembered tab layout."
        label="Remember tabs"
        query={query}
      >
        <label className="inline-flex items-center gap-1.5">
          <Switch
            checked={rememberTabs}
            onCheckedChange={(checked) => setRememberTabs(Boolean(checked))}
          />
          <span className="text-xs">
            {rememberTabs ? "Restore tabs on launch" : "Do not restore tabs"}
          </span>
        </label>
      </SettingsField>
      <SettingsField
        description="Prefills the branch name for newly created local repositories. Defaults to main."
        label="Default branch name"
        query={query}
      >
        <div className="grid gap-1.5">
          <Input
            className="h-7 text-xs"
            onChange={(event) => setDefaultBranchName(event.target.value)}
            placeholder="main"
            value={defaultBranchName}
          />
          <SettingsHelpText>
            Used only when creating a new local repository from LitGit.
          </SettingsHelpText>
        </div>
      </SettingsField>
      <SettingsField
        description="Schedules background fetches for the active repository tab. Default is 1 minute, and 0 disables it."
        label="Auto fetch interval"
        query={query}
      >
        <div className="grid gap-1.5">
          <Input
            className="h-7 text-xs"
            max={AUTO_FETCH_INTERVAL_LIMITS.max}
            min={AUTO_FETCH_INTERVAL_LIMITS.min}
            onChange={(event) => {
              setAutoFetchIntervalMinutes(Number(event.target.value) || 0);
            }}
            type="number"
            value={autoFetchIntervalMinutes}
          />
          <SettingsHelpText>
            LitGit defaults to 1 minute, similar to GitKraken. Use 0 to disable
            auto fetch. Allowed range: 0 to 60 minutes.
          </SettingsHelpText>
          {showAutoFetchWarning ? (
            <SettingsHelpText tone="warning">
              This repository has {uniqueRemoteCount} configured remotes.
              Frequent background fetches may be expensive.
            </SettingsHelpText>
          ) : null}
          <SettingsHelpText tone="warning">
            Each visible repository tab can schedule fetch work. Keeping many
            repo tabs open with short intervals may impact performance.
          </SettingsHelpText>
        </div>
      </SettingsField>
    </div>
  );
}

export { GeneralSection };
