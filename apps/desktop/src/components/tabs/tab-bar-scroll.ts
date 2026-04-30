import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const TAB_STRIP_SCROLL_EDGE_THRESHOLD = 2;

interface UseTabBarScrollParams {
  activeTabId: string | null;
  groupCount: number;
  tabCount: number;
}

interface TabBarScrollState {
  addTabButtonWrapperRef: RefObject<HTMLDivElement | null>;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  queueKeyboardFocusTabId: (tabId: string | null) => void;
  scrollTabStrip: (direction: "left" | "right") => void;
  tabBarRef: RefObject<HTMLDivElement | null>;
}

export const useTabBarScroll = ({
  activeTabId,
  tabCount,
  groupCount,
}: UseTabBarScrollParams): TabBarScrollState => {
  const tabBarRef = useRef<HTMLDivElement>(null);
  const addTabButtonWrapperRef = useRef<HTMLDivElement>(null);
  const pendingKeyboardFocusTabIdRef = useRef<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateTabStripOverflow = useCallback(() => {
    const tabStrip = tabBarRef.current;

    if (!tabStrip) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    const maxScrollLeft = Math.max(
      0,
      tabStrip.scrollWidth - tabStrip.clientWidth
    );
    setCanScrollLeft(tabStrip.scrollLeft > TAB_STRIP_SCROLL_EDGE_THRESHOLD);
    setCanScrollRight(
      tabStrip.scrollLeft < maxScrollLeft - TAB_STRIP_SCROLL_EDGE_THRESHOLD
    );
  }, []);

  const focusTabButton = useCallback((tabId: string) => {
    const tabButton = tabBarRef.current?.querySelector<HTMLButtonElement>(
      `[data-tab-button="true"][data-tab-id="${tabId}"]`
    );

    tabButton?.focus({ preventScroll: true });
  }, []);

  const queueKeyboardFocusTabId = useCallback((tabId: string | null) => {
    pendingKeyboardFocusTabIdRef.current = tabId;
  }, []);

  const scrollTabStrip = useCallback((direction: "left" | "right") => {
    const tabStrip = tabBarRef.current;

    if (!tabStrip) {
      return;
    }

    const scrollDelta = Math.max(160, Math.round(tabStrip.clientWidth * 0.5));
    tabStrip.scrollBy({
      behavior: "smooth",
      left: direction === "left" ? -scrollDelta : scrollDelta,
    });
  }, []);

  useEffect(() => {
    if (!(tabBarRef.current && activeTabId)) {
      return;
    }

    const activeElement = tabBarRef.current.querySelector(
      `[data-tab-id="${activeTabId}"]`
    );

    activeElement?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeTabId]);

  useEffect(() => {
    if (pendingKeyboardFocusTabIdRef.current !== activeTabId || !activeTabId) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      focusTabButton(activeTabId);
      pendingKeyboardFocusTabIdRef.current = null;
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [activeTabId, focusTabButton]);

  useEffect(() => {
    const tabStrip = tabBarRef.current;

    if (!tabStrip) {
      return;
    }

    updateTabStripOverflow();
    const handleScroll = () => {
      updateTabStripOverflow();
    };
    tabStrip.addEventListener("scroll", handleScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      updateTabStripOverflow();
    });
    resizeObserver.observe(tabStrip);

    return () => {
      tabStrip.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
    };
  }, [updateTabStripOverflow]);

  useEffect(() => {
    const itemCount = tabCount + groupCount;
    const frameId = requestAnimationFrame(() => {
      if (itemCount >= 0) {
        updateTabStripOverflow();
      }
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [groupCount, tabCount, updateTabStripOverflow]);

  return {
    tabBarRef,
    addTabButtonWrapperRef,
    canScrollLeft,
    canScrollRight,
    queueKeyboardFocusTabId,
    scrollTabStrip,
  };
};
