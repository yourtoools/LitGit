export const PROVIDER_STATUS_FOCUS_STALE_MS = 5_000;

export type ProviderStatusRefreshReason =
  | "mount"
  | "oauth-callback"
  | "pathname-change"
  | "provider-status-changed"
  | "window-focus";

export function shouldRefreshProviderStatuses(input: {
  currentPathname: string;
  hasLoadedOnce: boolean;
  lastRefreshAt: number | null;
  now: number;
  previousPathname: string | null;
  reason: ProviderStatusRefreshReason;
}): boolean {
  const {
    currentPathname,
    hasLoadedOnce,
    lastRefreshAt,
    now,
    previousPathname,
    reason,
  } = input;

  switch (reason) {
    case "mount":
    case "oauth-callback":
    case "provider-status-changed": {
      return true;
    }
    case "pathname-change": {
      return (
        hasLoadedOnce &&
        currentPathname === "/settings" &&
        previousPathname !== "/settings"
      );
    }
    case "window-focus": {
      if (!hasLoadedOnce || lastRefreshAt === null) {
        return true;
      }

      return now - lastRefreshAt >= PROVIDER_STATUS_FOCUS_STALE_MS;
    }
  }
}
