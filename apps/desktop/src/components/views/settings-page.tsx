import { useWindowEvent } from "@mantine/hooks";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiSection } from "@/components/views/settings/sections/ai-section";
import { EditorSection } from "@/components/views/settings/sections/editor-section";
import { GeneralSection } from "@/components/views/settings/sections/general-section";
import { GitSection } from "@/components/views/settings/sections/git-section";
import { NetworkSection } from "@/components/views/settings/sections/network-section";
import { SigningSection } from "@/components/views/settings/sections/signing-section";
import { SshSection } from "@/components/views/settings/sections/ssh-section";
import { TerminalSection } from "@/components/views/settings/sections/terminal-section";
import { UiSection } from "@/components/views/settings/sections/ui-section";
import {
  matchesQuery,
  readSystemFontFamilies,
  runWhenBrowserIsIdle,
} from "@/components/views/settings/settings-font-picker";
import { SettingsLayout } from "@/components/views/settings/settings-layout";
import {
  clampWidth,
  getInitialSidebarWidth,
  getSettingsLayoutWidth,
  getSidebarResizeBounds,
  SETTINGS_SECTIONS,
  SETTINGS_SIDEBAR_WIDTH_STORAGE_KEY,
  type SidebarResizeState,
} from "@/components/views/settings/settings-store";
import {
  SETTINGS_SECTION_LABELS,
  type SettingsSectionId,
} from "@/stores/preferences/preferences-store-types";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";

function renderSection(
  sectionId: SettingsSectionId,
  query: string
): React.ReactNode {
  switch (sectionId) {
    case "general":
      return <GeneralSection query={query} />;
    case "git":
      return <GitSection query={query} />;
    case "ssh":
      return <SshSection query={query} />;
    case "ui":
      return <UiSection query={query} />;
    case "signing":
      return <SigningSection query={query} />;
    case "editor":
      return <EditorSection query={query} />;
    case "terminal":
      return <TerminalSection query={query} />;
    case "network":
      return <NetworkSection query={query} />;
    case "ai":
      return <AiSection query={query} />;
    default:
      return null;
  }
}

export function SettingsPage() {
  const navigate = useNavigate();
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(
    getInitialSidebarWidth
  );
  const sidebarResizeStateRef = useRef<SidebarResizeState | null>(null);
  const sidebarContainerRef = useRef<HTMLDivElement | null>(null);
  const contentPanelRef = useRef<HTMLDivElement | null>(null);
  const settingsSearchInputRef = useRef<HTMLInputElement | null>(null);
  const previousActiveSectionRef = useRef<SettingsSectionId | null>(null);
  const resizeAnimationFrameRef = useRef<number | null>(null);
  const pendingSidebarWidthRef = useRef<number | null>(null);
  const activeSection = usePreferencesStore(
    (state) => state.settings.activeSection
  );

  const lastNonSettingsRoute = usePreferencesStore(
    (state) => state.settings.lastNonSettingsRoute
  );
  const query = usePreferencesStore((state) => state.settings.searchQuery);
  const resetSettingsSearch = usePreferencesStore(
    (state) => state.resetSettingsSearch
  );
  const setSearchQuery = usePreferencesStore((state) => state.setSearchQuery);
  const setSection = usePreferencesStore((state) => state.setSection);
  const toolbarLabels = usePreferencesStore((state) => state.ui.toolbarLabels);
  const currentPathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  useWindowEvent("keydown", (event) => {
    if (!(event.ctrlKey && event.altKey) || event.key.toLowerCase() !== "f") {
      return;
    }

    event.preventDefault();
    settingsSearchInputRef.current?.focus();
    settingsSearchInputRef.current?.select();
  });

  const filteredSections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return SETTINGS_SECTIONS;
    }

    return SETTINGS_SECTIONS.filter((section) =>
      matchesQuery(normalizedQuery, [
        SETTINGS_SECTION_LABELS[section.id],
        section.description,
        ...section.keywords,
      ])
    );
  }, [query]);

  useEffect(() => {
    if (filteredSections.length === 0) {
      return;
    }

    const hasActiveSectionInFilter = filteredSections.some(
      (section) => section.id === activeSection
    );

    if (hasActiveSectionInFilter) {
      return;
    }

    const fallbackSection = filteredSections[0];
    if (fallbackSection) {
      setSection(fallbackSection.id);
    }
  }, [activeSection, filteredSections, setSection]);

  const activeDefinition =
    SETTINGS_SECTIONS.find((section) => section.id === activeSection) ??
    SETTINGS_SECTIONS[0];

  useEffect(() => {
    const previousActiveSection = previousActiveSectionRef.current;

    if (
      contentPanelRef.current &&
      (previousActiveSection === null ||
        previousActiveSection !== activeSection)
    ) {
      contentPanelRef.current.scrollTop = 0;
    }

    previousActiveSectionRef.current = activeSection;
  }, [activeSection]);

  useEffect(() => {
    return runWhenBrowserIsIdle(() => {
      readSystemFontFamilies().catch(() => undefined);
    });
  }, []);

  const handleExitPreferences = useCallback(() => {
    const nextPath =
      lastNonSettingsRoute &&
      lastNonSettingsRoute !== "/settings" &&
      lastNonSettingsRoute !== currentPathname
        ? lastNonSettingsRoute
        : "/";

    navigate({ to: nextPath as never }).catch(() => undefined);
  }, [currentPathname, lastNonSettingsRoute, navigate]);

  const getAvailableSettingsWidth = useCallback(() => {
    return sidebarContainerRef.current?.clientWidth ?? getSettingsLayoutWidth();
  }, []);

  const scheduleSidebarWidthUpdate = useCallback((nextWidth: number) => {
    pendingSidebarWidthRef.current = nextWidth;

    if (resizeAnimationFrameRef.current !== null) {
      return;
    }

    resizeAnimationFrameRef.current = window.requestAnimationFrame(() => {
      const width = pendingSidebarWidthRef.current;

      resizeAnimationFrameRef.current = null;
      pendingSidebarWidthRef.current = null;

      if (typeof width === "number") {
        setLeftSidebarWidth(width);
      }
    });
  }, []);

  const resetResizeState = useCallback(() => {
    sidebarResizeStateRef.current = null;

    if (resizeAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeAnimationFrameRef.current);
      resizeAnimationFrameRef.current = null;
    }

    pendingSidebarWidthRef.current = null;

    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  const startSidebarResize =
    (_target: "left") => (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const { maxWidth, minWidth } = getSidebarResizeBounds(
        getAvailableSettingsWidth()
      );

      if (maxWidth <= 0) {
        return;
      }

      sidebarResizeStateRef.current = {
        startWidth: clampWidth(leftSidebarWidth, minWidth, maxWidth),
        startX: event.clientX,
      };

      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      scheduleSidebarWidthUpdate(
        clampWidth(leftSidebarWidth, minWidth, maxWidth)
      );
    };

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      const resizeState = sidebarResizeStateRef.current;

      if (!resizeState) {
        return;
      }

      const delta = event.clientX - resizeState.startX;
      const { maxWidth, minWidth } = getSidebarResizeBounds(
        getAvailableSettingsWidth()
      );

      if (maxWidth <= 0) {
        scheduleSidebarWidthUpdate(0);
        return;
      }

      scheduleSidebarWidthUpdate(
        clampWidth(resizeState.startWidth + delta, minWidth, maxWidth)
      );
    };

    const handlePointerUp = () => {
      if (!sidebarResizeStateRef.current) {
        return;
      }

      resetResizeState();
    };

    const handleWindowBlur = () => {
      if (!sidebarResizeStateRef.current) {
        return;
      }

      resetResizeState();
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("blur", handleWindowBlur);
      resetResizeState();
    };
  }, [getAvailableSettingsWidth, resetResizeState, scheduleSidebarWidthUpdate]);

  useEffect(() => {
    const clampSidebarWidthToViewport = () => {
      const { maxWidth, minWidth } = getSidebarResizeBounds(
        getAvailableSettingsWidth()
      );

      setLeftSidebarWidth((currentWidth) => {
        if (maxWidth <= 0) {
          return 0;
        }

        return clampWidth(currentWidth, minWidth, maxWidth);
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      clampSidebarWidthToViewport();
    });

    if (sidebarContainerRef.current) {
      resizeObserver.observe(sidebarContainerRef.current);
    }

    clampSidebarWidthToViewport();
    window.addEventListener("resize", clampSidebarWidthToViewport);

    return () => {
      window.removeEventListener("resize", clampSidebarWidthToViewport);
      resizeObserver.disconnect();
    };
  }, [getAvailableSettingsWidth]);

  useEffect(() => {
    window.localStorage.setItem(
      SETTINGS_SIDEBAR_WIDTH_STORAGE_KEY,
      String(Math.round(leftSidebarWidth))
    );
  }, [leftSidebarWidth]);

  return (
    <SettingsLayout
      activeDefinition={activeDefinition}
      contentPanelRef={contentPanelRef}
      filteredSections={filteredSections}
      handleExitPreferences={handleExitPreferences}
      leftSidebarWidth={leftSidebarWidth}
      query={query}
      renderSection={renderSection}
      resetSettingsSearch={resetSettingsSearch}
      setSearchQuery={setSearchQuery}
      setSection={setSection}
      settingsSearchInputRef={settingsSearchInputRef}
      sidebarContainerRef={sidebarContainerRef}
      startSidebarResize={startSidebarResize}
      toolbarLabels={toolbarLabels}
    />
  );
}
