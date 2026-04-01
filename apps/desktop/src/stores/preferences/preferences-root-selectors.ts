import { useMemo } from "react";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import type { RepoCommandPreferences } from "@/stores/repo/repo-store-types";

export const useRootToasterPosition = () =>
  usePreferencesStore((state) => state.ui.toasterPosition);

export const useRootThemePreference = () =>
  usePreferencesStore((state) => state.ui.theme);

export const useRootAutoFetchIntervalMinutes = () =>
  usePreferencesStore((state) => state.general.autoFetchIntervalMinutes);

export const useRootOnboardingPreferences = () => {
  const hasCompletedOnboarding = usePreferencesStore(
    (state) => state.settings.hasCompletedOnboarding
  );
  const lastNonSettingsRoute = usePreferencesStore(
    (state) => state.settings.lastNonSettingsRoute
  );
  const setLastNonSettingsRoute = usePreferencesStore(
    (state) => state.setLastNonSettingsRoute
  );

  return useMemo(
    () => ({
      hasCompletedOnboarding,
      lastNonSettingsRoute,
      setLastNonSettingsRoute,
    }),
    [hasCompletedOnboarding, lastNonSettingsRoute, setLastNonSettingsRoute]
  );
};

export const useRootSchedulerPreferences = (): RepoCommandPreferences => {
  const network = usePreferencesStore((state) => state.network);
  const signing = usePreferencesStore((state) => state.signing);
  const ssh = usePreferencesStore((state) => state.ssh);

  return useMemo(
    () => ({
      enableProxy: network.enableProxy,
      gpgProgramPath: signing.gpgProgramPath,
      proxyAuthEnabled: network.proxyAuthEnabled,
      proxyHost: network.proxyHost,
      proxyPort: network.proxyPort,
      proxyType: network.proxyType,
      proxyUsername: network.proxyUsername,
      signCommitsByDefault: signing.signCommitsByDefault,
      signingFormat: signing.signingFormat,
      signingKey: signing.signingKey,
      sslVerification: network.sslVerification,
      useGitCredentialManager: network.useGitCredentialManager,
      useLocalSshAgent: ssh.useLocalAgent,
    }),
    [network, signing, ssh]
  );
};
