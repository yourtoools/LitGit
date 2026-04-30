import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getGitIdentityStatus } from "@/lib/tauri-settings-client";
import { useRepoStore } from "@/stores/repo/use-repo-store";
import { useTabStore } from "@/stores/tabs/use-tab-store";

const TAURI_FOCUS_REFRESH_DEBOUNCE_MS = 300;
const TAURI_WINDOW_MOVE_SETTLE_MS = 150;
const ACTIVE_REPO_STALE_AFTER_MS = 15_000;

async function refreshActiveTab(
  setActiveRepo: ReturnType<typeof useRepoStore.getState>["setActiveRepo"],
  refreshOpenedRepositories: ReturnType<
    typeof useRepoStore.getState
  >["refreshOpenedRepositories"],
  setRepoGitIdentity: ReturnType<
    typeof useRepoStore.getState
  >["setRepoGitIdentity"],
  isRepoRefreshAlreadyRunning: boolean
) {
  await refreshOpenedRepositories();

  const tabState = useTabStore.getState();
  const activeTab = tabState.tabs.find(
    (tab) => tab.id === tabState.activeTabId
  );
  const activeTabRepoId = activeTab?.repoId ?? null;

  if (!activeTabRepoId) {
    await getGitIdentityStatus(null).catch(() => undefined);
    return;
  }

  const repoStillExists = useRepoStore
    .getState()
    .openedRepos.some((repo) => repo.id === activeTabRepoId);

  if (!repoStillExists) {
    return;
  }

  const repoStoreState = useRepoStore.getState();
  const lastLoadedAt =
    repoStoreState.repoLastLoadedAtById[activeTabRepoId] ?? 0;
  const isStale = Date.now() - lastLoadedAt >= ACTIVE_REPO_STALE_AFTER_MS;

  if (isStale && !isRepoRefreshAlreadyRunning) {
    await setActiveRepo(activeTabRepoId, {
      background: true,
      refreshMode: "light",
    });
  }

  const activeRepo = useRepoStore
    .getState()
    .openedRepos.find((repo) => repo.id === activeTabRepoId);

  if (!activeRepo) {
    return;
  }

  try {
    const identity = await getGitIdentityStatus(activeRepo.path);
    setRepoGitIdentity(activeTabRepoId, identity);
  } catch {
    setRepoGitIdentity(activeTabRepoId, null);
  }
}

export function useTabRepoSync() {
  const clearActiveRepo = useRepoStore((state) => state.clearActiveRepo);
  const openedRepos = useRepoStore((state) => state.openedRepos);
  const refreshOpenedRepositories = useRepoStore(
    (state) => state.refreshOpenedRepositories
  );
  const setRepoGitIdentity = useRepoStore((state) => state.setRepoGitIdentity);
  const setActiveRepo = useRepoStore((state) => state.setActiveRepo);
  const activeTabId = useTabStore((state) => state.activeTabId);
  const activeTabRepoId = useTabStore((state) => {
    const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
    return activeTab?.repoId ?? null;
  });
  const activeTabRepoLastLoadedAt = useRepoStore((state) =>
    activeTabRepoId ? (state.repoLastLoadedAtById[activeTabRepoId] ?? 0) : 0
  );
  const isActiveTabRepoBackgroundRefreshing = useRepoStore((state) =>
    activeTabRepoId
      ? (state.repoBackgroundRefreshById[activeTabRepoId] ?? false)
      : false
  );
  const prevOpenedRepos = useRef(openedRepos);
  const prevActiveTabState = useRef<{
    repoId: string | null;
    tabId: string | null;
  } | null>(null);
  const tauriFocusDebounceTimeoutRef = useRef<number | null>(null);
  const tauriMoveSettleTimeoutRef = useRef<number | null>(null);
  const tauriWindowFocusedRef = useRef<boolean | null>(null);
  const tauriWindowMovingRef = useRef(false);
  const pendingFocusRefreshAfterMoveRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);

  useEffect(() => {
    const previousState = prevActiveTabState.current;
    const didTabChange = previousState?.tabId !== activeTabId;
    const didRepoBindingChange = previousState?.repoId !== activeTabRepoId;

    prevActiveTabState.current = {
      repoId: activeTabRepoId,
      tabId: activeTabId,
    };

    if (!(didTabChange || didRepoBindingChange)) {
      return;
    }

    if (activeTabRepoId) {
      const activeRepoId = useRepoStore.getState().activeRepoId;

      if (didTabChange) {
        const hasLoadedRepoBefore = activeTabRepoLastLoadedAt > 0;
        setActiveRepo(activeTabRepoId, {
          background: true,
          refreshMode: hasLoadedRepoBefore ? "light" : "full",
        }).catch(() => undefined);
        return;
      }

      if (activeRepoId !== activeTabRepoId) {
        setActiveRepo(activeTabRepoId).catch(() => undefined);
      }

      return;
    }

    if (useRepoStore.getState().activeRepoId !== null) {
      clearActiveRepo();
    }

    refreshOpenedRepositories().catch(() => undefined);
  }, [
    activeTabId,
    activeTabRepoId,
    activeTabRepoLastLoadedAt,
    clearActiveRepo,
    refreshOpenedRepositories,
    setActiveRepo,
  ]);

  useEffect(() => {
    const previousRepoIds = new Set(
      prevOpenedRepos.current.map((repo) => repo.id)
    );
    const currentRepoIds = new Set(openedRepos.map((repo) => repo.id));
    const newRepos = openedRepos.filter(
      (repo) => !previousRepoIds.has(repo.id)
    );
    const removedRepoIds = prevOpenedRepos.current
      .filter((repo) => !currentRepoIds.has(repo.id))
      .map((repo) => repo.id);

    if (removedRepoIds.length > 0) {
      const removedRepoIdSet = new Set(removedRepoIds);
      const removedRepoNames = prevOpenedRepos.current
        .filter((repo) => removedRepoIdSet.has(repo.id))
        .map((repo) => repo.name);
      const currentTabState = useTabStore.getState();
      const tabsToClose = currentTabState.tabs.filter(
        (tab) => tab.repoId && removedRepoIdSet.has(tab.repoId)
      );

      if (tabsToClose.length > 0) {
        const closedCount = currentTabState.closeTabsForDeletedRepos(
          tabsToClose.map((tab) => tab.id)
        );

        if (closedCount > 0) {
          const repoLabel = removedRepoNames.join(", ");
          toast.error(
            `Repository "${repoLabel}" has been deleted. The tab has been closed.`
          );
        }
      }
    }

    for (const newRepo of newRepos) {
      const currentTabState = useTabStore.getState();
      const existingTabForRepo = currentTabState.tabs.find(
        (tab) => tab.repoId === newRepo.id
      );

      if (existingTabForRepo) {
        currentTabState.setActiveTab(existingTabForRepo.id);
        continue;
      }

      const activeTab = currentTabState.tabs.find(
        (tab) => tab.id === currentTabState.activeTabId
      );

      if (activeTab && activeTab.repoId === null) {
        currentTabState.linkTabToRepo(activeTab.id, newRepo.id, newRepo.name);
        continue;
      }

      const newTabId = currentTabState.addTab();

      if (newTabId) {
        currentTabState.linkTabToRepo(newTabId, newRepo.id, newRepo.name);
      }
    }

    prevOpenedRepos.current = openedRepos;
  }, [openedRepos]);

  useEffect(() => {
    let unlistenTauriFocus: (() => void) | null = null;
    let unlistenTauriMoved: (() => void) | null = null;

    const clearPendingFocusRefresh = () => {
      if (tauriFocusDebounceTimeoutRef.current === null) {
        return;
      }

      window.clearTimeout(tauriFocusDebounceTimeoutRef.current);
      tauriFocusDebounceTimeoutRef.current = null;
    };

    const clearWindowMoveSettle = () => {
      if (tauriMoveSettleTimeoutRef.current === null) {
        return;
      }

      window.clearTimeout(tauriMoveSettleTimeoutRef.current);
      tauriMoveSettleTimeoutRef.current = null;
    };

    const runRefreshActiveTab = async () => {
      if (refreshInFlightRef.current) {
        refreshQueuedRef.current = true;
        return;
      }

      refreshInFlightRef.current = true;

      try {
        await refreshActiveTab(
          setActiveRepo,
          refreshOpenedRepositories,
          setRepoGitIdentity,
          isActiveTabRepoBackgroundRefreshing
        );
      } finally {
        refreshInFlightRef.current = false;

        const shouldRunQueuedRefresh = refreshQueuedRef.current;
        refreshQueuedRef.current = false;

        if (shouldRunQueuedRefresh) {
          await runRefreshActiveTab();
        }
      }
    };

    const scheduleRefreshActiveTab = () => {
      if (tauriWindowMovingRef.current) {
        pendingFocusRefreshAfterMoveRef.current = true;
        clearPendingFocusRefresh();
        return;
      }

      clearPendingFocusRefresh();
      tauriFocusDebounceTimeoutRef.current = window.setTimeout(() => {
        tauriFocusDebounceTimeoutRef.current = null;
        runRefreshActiveTab().catch(() => undefined);
      }, TAURI_FOCUS_REFRESH_DEBOUNCE_MS);
    };

    const markWindowMoved = () => {
      tauriWindowMovingRef.current = true;
      clearPendingFocusRefresh();
      clearWindowMoveSettle();
      tauriMoveSettleTimeoutRef.current = window.setTimeout(() => {
        tauriMoveSettleTimeoutRef.current = null;
        tauriWindowMovingRef.current = false;

        if (
          pendingFocusRefreshAfterMoveRef.current &&
          tauriWindowFocusedRef.current === true
        ) {
          pendingFocusRefreshAfterMoveRef.current = false;
          scheduleRefreshActiveTab();
        }
      }, TAURI_WINDOW_MOVE_SETTLE_MS);
    };

    const setupTauriFocusListener = async () => {
      const { isTauri } = await import("@tauri-apps/api/core");

      if (!isTauri()) {
        return;
      }

      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();
      tauriWindowFocusedRef.current = await appWindow
        .isFocused()
        .catch(() => null);

      unlistenTauriFocus = await appWindow.onFocusChanged(({ payload }) => {
        if (!payload) {
          tauriWindowFocusedRef.current = false;
          pendingFocusRefreshAfterMoveRef.current = false;
          clearPendingFocusRefresh();
          return;
        }

        if (tauriWindowFocusedRef.current === true) {
          return;
        }

        tauriWindowFocusedRef.current = true;
        scheduleRefreshActiveTab();
      });

      unlistenTauriMoved = await appWindow.onMoved(() => {
        markWindowMoved();
      });
    };

    setupTauriFocusListener().catch(() => undefined);

    return () => {
      clearPendingFocusRefresh();
      clearWindowMoveSettle();
      unlistenTauriFocus?.();
      unlistenTauriMoved?.();
    };
  }, [
    isActiveTabRepoBackgroundRefreshing,
    refreshOpenedRepositories,
    setActiveRepo,
    setRepoGitIdentity,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    (globalThis as Record<string, unknown>).__tabStore = useTabStore;
    (globalThis as Record<string, unknown>).__repoStore = useRepoStore;
  }, []);
}
