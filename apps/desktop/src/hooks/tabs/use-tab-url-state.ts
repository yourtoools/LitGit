import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { useTabStore } from "@/stores/tabs/use-tab-store";

export function useTabUrlState() {
  const navigate = useNavigate();
  const firstTabId = useTabStore((state) => state.tabs[0]?.id ?? null);
  const activeTabId = useTabStore((state) => state.activeTabId);
  const setActiveTab = useTabStore((state) => state.setActiveTab);

  const search = useSearch({ strict: false });
  const urlTabId = search.tabId as string | undefined;
  const isUrlTabValid = useTabStore((state) => {
    if (!urlTabId) {
      return false;
    }

    return state.tabs.some((tab) => tab.id === urlTabId);
  });

  const isInitialMount = useRef(true);
  const isNavigatingRef = useRef(false);

  const navigateWithTab = useCallback(
    (tabId: string | undefined) => {
      if (!tabId) {
        isNavigatingRef.current = true;
        Promise.resolve()
          .then(() =>
            navigate({
              to: "/",
              search: { tabId: undefined },
              replace: true,
            })
          )
          .finally(() => {
            isNavigatingRef.current = false;
          })
          .catch(() => {
            return;
          });
        return;
      }

      const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
      const repoId = tab?.repoId;

      isNavigatingRef.current = true;

      Promise.resolve()
        .then(() => {
          if (repoId) {
            return navigate({
              to: "/repo/$repoId",
              params: { repoId },
              search: { tabId },
              replace: true,
            });
          }
          return navigate({
            to: "/",
            search: { tabId },
            replace: true,
          });
        })
        .finally(() => {
          isNavigatingRef.current = false;
        })
        .catch(() => {
          return;
        });
    },
    [navigate]
  );

  useEffect(() => {
    if (isNavigatingRef.current || !(urlTabId && isUrlTabValid)) {
      return;
    }

    if (activeTabId !== urlTabId) {
      setActiveTab(urlTabId);
    }
  }, [activeTabId, isUrlTabValid, setActiveTab, urlTabId]);

  useEffect(() => {
    if (isNavigatingRef.current) {
      return;
    }

    const fallbackTabId = activeTabId ?? firstTabId ?? undefined;

    if (isInitialMount.current) {
      isInitialMount.current = false;
    }

    if (urlTabId && !isUrlTabValid) {
      navigateWithTab(fallbackTabId);
      return;
    }

    if (!urlTabId && fallbackTabId) {
      navigateWithTab(fallbackTabId);
    }
  }, [activeTabId, firstTabId, isUrlTabValid, navigateWithTab, urlTabId]);

  const setActiveTabFromUrl = (tabId: string) => {
    if (activeTabId !== tabId) {
      setActiveTab(tabId);
    }

    navigateWithTab(tabId);
  };

  return {
    activeTabId: urlTabId || activeTabId,
    storeActiveTabId: activeTabId,
    urlTabId,
    setActiveTabFromUrl,
  };
}
