import { Input } from "@litgit/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@litgit/ui/components/select";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BUNDLED_FONT_OPTIONS,
  ensureSelectedOption,
  FontPickerField,
  type FontPickerOption,
  getVisibleFonts,
  readSystemFontFamilies,
  runWhenBrowserIsIdle,
  type SystemFontReadResult,
} from "@/components/views/settings/settings-font-picker";
import { TerminalPreview } from "@/components/views/settings/settings-previews-codemirror";
import {
  DefaultSelectValue,
  SettingsField,
} from "@/components/views/settings/settings-shared-ui";
import {
  CURSOR_STYLE_OPTIONS,
  clampWidth,
  getEditorPreviewResizeBounds,
  getInitialTerminalPreviewSidebarWidth,
  getSettingsLayoutWidth,
  SETTINGS_TERMINAL_PREVIEW_WIDTH_STORAGE_KEY,
  type SidebarResizeState,
} from "@/components/views/settings/settings-store";
import {
  COMBOBOX_DEBOUNCE_DELAY_MS,
  normalizeComboboxQuery,
  useDebouncedValue,
} from "@/hooks/use-debounced-value";
import {
  clampTerminalFontSize,
  DEFAULT_TERMINAL_FONT_FAMILY,
} from "@/stores/preferences/preferences-store-types";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";

function TerminalSection({ query }: { query: string }) {
  const cursorStyle = usePreferencesStore(
    (state) => state.terminal.cursorStyle
  );
  const fontFamily = usePreferencesStore((state) => state.terminal.fontFamily);
  const fontSize = usePreferencesStore((state) => state.terminal.fontSize);
  const fontVisibility = usePreferencesStore(
    (state) => state.terminal.fontVisibility
  );
  const lineHeight = usePreferencesStore((state) => state.terminal.lineHeight);
  const setCursorStyle = usePreferencesStore(
    (state) => state.setTerminalCursorStyle
  );
  const setFontFamily = usePreferencesStore(
    (state) => state.setTerminalFontFamily
  );
  const setFontSize = usePreferencesStore((state) => state.setTerminalFontSize);
  const setFontVisibility = usePreferencesStore(
    (state) => state.setTerminalFontVisibility
  );
  const setLineHeight = usePreferencesStore(
    (state) => state.setTerminalLineHeight
  );
  const [systemTerminalFonts, setSystemTerminalFonts] = useState<
    readonly FontPickerOption[]
  >([]);
  const [terminalFontStatus, setTerminalFontStatus] =
    useState<SystemFontReadResult["status"]>("available");
  const [isLoadingTerminalFonts, setIsLoadingTerminalFonts] = useState(false);
  const [hasLoadedTerminalFonts, setHasLoadedTerminalFonts] = useState(false);
  const [terminalFontQuery, setTerminalFontQuery] = useState("");
  const debouncedTerminalFontQuery = useDebouncedValue(
    terminalFontQuery,
    COMBOBOX_DEBOUNCE_DELAY_MS
  );
  const [terminalFontSizeInput, setTerminalFontSizeInput] = useState(() =>
    String(fontSize)
  );
  const [previewSidebarWidth, setPreviewSidebarWidth] = useState(
    getInitialTerminalPreviewSidebarWidth
  );
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const previewResizeStateRef = useRef<SidebarResizeState | null>(null);
  const previewResizeAnimationFrameRef = useRef<number | null>(null);
  const pendingPreviewSidebarWidthRef = useRef<number | null>(null);
  const previewBodyStyleSnapshotRef = useRef<{
    cursor: string;
    userSelect: string;
  } | null>(null);
  const terminalFonts = useMemo(
    () =>
      Array.from(
        new Map(
          [...systemTerminalFonts, ...BUNDLED_FONT_OPTIONS].map((font) => [
            font.family,
            font,
          ])
        ).values()
      ),
    [systemTerminalFonts]
  );
  const selectedTerminalFontOption = useMemo(
    () => terminalFonts.find((font) => font.family === fontFamily) ?? null,
    [fontFamily, terminalFonts]
  );
  const visibleTerminalFonts = useMemo(() => {
    const filteredFonts = getVisibleFonts(terminalFonts, fontVisibility);
    const normalizedQuery = normalizeComboboxQuery(debouncedTerminalFontQuery);

    if (normalizedQuery.length === 0) {
      return ensureSelectedOption(
        filteredFonts,
        selectedTerminalFontOption,
        (option, selectedOption) => option.family === selectedOption.family
      );
    }

    const queryFilteredFonts = filteredFonts.filter((font) =>
      font.family.toLowerCase().includes(normalizedQuery)
    );

    return ensureSelectedOption(
      queryFilteredFonts,
      selectedTerminalFontOption,
      (option, selectedOption) => option.family === selectedOption.family
    );
  }, [
    debouncedTerminalFontQuery,
    fontVisibility,
    selectedTerminalFontOption,
    terminalFonts,
  ]);

  useEffect(() => {
    if (!terminalFonts.some((font) => font.family === fontFamily)) {
      setFontFamily(DEFAULT_TERMINAL_FONT_FAMILY);
    }
  }, [fontFamily, setFontFamily, terminalFonts]);

  useEffect(() => {
    setTerminalFontSizeInput(String(fontSize));
  }, [fontSize]);

  const loadTerminalFonts = useCallback(() => {
    if (hasLoadedTerminalFonts || isLoadingTerminalFonts) {
      return;
    }

    setIsLoadingTerminalFonts(true);
    readSystemFontFamilies()
      .then((result) => {
        setSystemTerminalFonts(result.options);
        setTerminalFontStatus(result.status);
        setHasLoadedTerminalFonts(true);
      })
      .catch(() => undefined)
      .finally(() => {
        setIsLoadingTerminalFonts(false);
      });
  }, [hasLoadedTerminalFonts, isLoadingTerminalFonts]);

  useEffect(() => {
    if (hasLoadedTerminalFonts || isLoadingTerminalFonts) {
      return;
    }

    return runWhenBrowserIsIdle(() => {
      loadTerminalFonts();
    });
  }, [hasLoadedTerminalFonts, isLoadingTerminalFonts, loadTerminalFonts]);

  const getAvailableTerminalWidth = useCallback(
    () => previewContainerRef.current?.clientWidth ?? getSettingsLayoutWidth(),
    []
  );

  const schedulePreviewSidebarWidthUpdate = useCallback((nextWidth: number) => {
    pendingPreviewSidebarWidthRef.current = nextWidth;

    if (previewResizeAnimationFrameRef.current !== null) {
      return;
    }

    previewResizeAnimationFrameRef.current = window.requestAnimationFrame(
      () => {
        const width = pendingPreviewSidebarWidthRef.current;

        previewResizeAnimationFrameRef.current = null;
        pendingPreviewSidebarWidthRef.current = null;

        if (typeof width === "number") {
          setPreviewSidebarWidth(width);
        }
      }
    );
  }, []);

  const resetPreviewResizeState = useCallback(() => {
    previewResizeStateRef.current = null;

    if (previewResizeAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(previewResizeAnimationFrameRef.current);
      previewResizeAnimationFrameRef.current = null;
    }

    pendingPreviewSidebarWidthRef.current = null;

    if (previewBodyStyleSnapshotRef.current) {
      document.body.style.userSelect =
        previewBodyStyleSnapshotRef.current.userSelect;
      document.body.style.cursor = previewBodyStyleSnapshotRef.current.cursor;
      previewBodyStyleSnapshotRef.current = null;
    }
  }, []);

  const startPreviewResize = (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const { maxWidth, minWidth } = getEditorPreviewResizeBounds(
      getAvailableTerminalWidth()
    );

    if (maxWidth <= 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    previewBodyStyleSnapshotRef.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };

    previewResizeStateRef.current = {
      pointerId: event.pointerId,
      startWidth: previewSidebarWidth,
      startX: event.clientX,
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    schedulePreviewSidebarWidthUpdate(
      clampWidth(previewSidebarWidth, minWidth, maxWidth)
    );
  };

  const adjustPreviewSidebarWidth = (delta: number) => {
    const { maxWidth, minWidth } = getEditorPreviewResizeBounds(
      getAvailableTerminalWidth()
    );

    if (maxWidth <= 0) {
      setPreviewSidebarWidth(0);
      return;
    }

    setPreviewSidebarWidth((currentWidth) =>
      clampWidth(currentWidth + delta, minWidth, maxWidth)
    );
  };

  const handlePreviewResizeHandleKeyDown = (
    event: React.KeyboardEvent<HTMLElement>
  ) => {
    const resizeStep = event.shiftKey ? 40 : 16;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      adjustPreviewSidebarWidth(resizeStep);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      adjustPreviewSidebarWidth(-resizeStep);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      const { minWidth } = getEditorPreviewResizeBounds(
        getAvailableTerminalWidth()
      );
      setPreviewSidebarWidth(minWidth);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      const { maxWidth } = getEditorPreviewResizeBounds(
        getAvailableTerminalWidth()
      );
      setPreviewSidebarWidth(maxWidth);
    }
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = previewResizeStateRef.current;

      if (!resizeState || event.pointerId !== resizeState.pointerId) {
        return;
      }

      const delta = event.clientX - resizeState.startX;
      const { maxWidth, minWidth } = getEditorPreviewResizeBounds(
        getAvailableTerminalWidth()
      );

      if (maxWidth <= 0) {
        schedulePreviewSidebarWidthUpdate(0);
        return;
      }

      schedulePreviewSidebarWidthUpdate(
        clampWidth(resizeState.startWidth - delta, minWidth, maxWidth)
      );
    };

    const handlePointerUp = () => {
      if (!previewResizeStateRef.current) {
        return;
      }

      resetPreviewResizeState();
    };

    const handleWindowBlur = () => {
      if (!previewResizeStateRef.current) {
        return;
      }

      resetPreviewResizeState();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handleWindowBlur);
      resetPreviewResizeState();
    };
  }, [
    getAvailableTerminalWidth,
    resetPreviewResizeState,
    schedulePreviewSidebarWidthUpdate,
  ]);

  useEffect(() => {
    const clampPreviewWidthToViewport = () => {
      const { maxWidth, minWidth } = getEditorPreviewResizeBounds(
        getAvailableTerminalWidth()
      );

      setPreviewSidebarWidth((currentWidth) => {
        if (maxWidth <= 0) {
          return 0;
        }

        return clampWidth(currentWidth, minWidth, maxWidth);
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      clampPreviewWidthToViewport();
    });

    if (previewContainerRef.current) {
      resizeObserver.observe(previewContainerRef.current);
    }

    clampPreviewWidthToViewport();
    window.addEventListener("resize", clampPreviewWidthToViewport);

    return () => {
      window.removeEventListener("resize", clampPreviewWidthToViewport);
      resizeObserver.disconnect();
    };
  }, [getAvailableTerminalWidth]);

  useEffect(() => {
    window.localStorage.setItem(
      SETTINGS_TERMINAL_PREVIEW_WIDTH_STORAGE_KEY,
      String(Math.round(previewSidebarWidth))
    );
  }, [previewSidebarWidth]);

  let terminalFontHelperText =
    "Loading installed system fonts in the background. Bundled fallbacks are available immediately.";

  if (hasLoadedTerminalFonts && terminalFontStatus === "unavailable") {
    terminalFontHelperText =
      "System font enumeration is unavailable here, so the picker is showing bundled fallbacks only.";
  } else if (hasLoadedTerminalFonts) {
    terminalFontHelperText =
      "Installed system fonts are shown first, with bundled fallbacks available when needed.";
  }

  return (
    <div
      className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch"
      ref={previewContainerRef}
    >
      <div className="grid gap-2">
        <FontPickerField
          description="Search installed terminal fonts and bundled fallbacks, then optionally filter to monospace only."
          emptyMessage={
            terminalFontStatus === "unavailable"
              ? "No installed fonts could be read on this platform. Bundled fallbacks are still available."
              : "No matching terminal fonts found."
          }
          helperText={terminalFontHelperText}
          isLoadingOptions={isLoadingTerminalFonts}
          label="Terminal font"
          monospaceOnly={fontVisibility === "monospace-only"}
          onMonospaceOnlyChange={(checked) => {
            setFontVisibility(checked ? "monospace-only" : "all-fonts");
          }}
          onPickerInteract={loadTerminalFonts}
          onSearchChange={setTerminalFontQuery}
          onValueChange={(value) => {
            setFontFamily(value);
            setTerminalFontQuery("");
          }}
          options={visibleTerminalFonts}
          query={query}
          searchPlaceholder="Search terminal fonts"
          searchValue={terminalFontQuery}
          selectedOption={selectedTerminalFontOption}
          showLoadingSkeleton={
            isLoadingTerminalFonts && !hasLoadedTerminalFonts
          }
        />
        <SettingsField
          description="Applied immediately to the mounted xterm instance."
          label="Font size"
          query={query}
        >
          <Input
            className="h-7 text-xs"
            max={32}
            min={8}
            onBlur={() => {
              if (terminalFontSizeInput.trim().length === 0) {
                setTerminalFontSizeInput(String(fontSize));
                return;
              }

              const parsedValue = Number(terminalFontSizeInput);

              if (!Number.isFinite(parsedValue)) {
                setTerminalFontSizeInput(String(fontSize));
                return;
              }

              const clampedValue = clampTerminalFontSize(parsedValue);
              setFontSize(clampedValue);
              setTerminalFontSizeInput(String(clampedValue));
            }}
            onChange={(event) => {
              const nextValue = event.target.value;
              setTerminalFontSizeInput(nextValue);

              if (nextValue.trim().length === 0) {
                return;
              }

              const parsedValue = Number(nextValue);

              if (!Number.isFinite(parsedValue)) {
                return;
              }

              if (parsedValue < 8 || parsedValue > 32) {
                return;
              }

              setFontSize(parsedValue);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            step={1}
            type="number"
            value={terminalFontSizeInput}
          />
        </SettingsField>
        <SettingsField
          description="Tune line spacing for the integrated terminal."
          label="Line height"
          query={query}
        >
          <Input
            className="h-7 text-xs"
            min={1}
            onChange={(event) =>
              setLineHeight(Math.max(1, Number(event.target.value) || 1))
            }
            step="0.1"
            type="number"
            value={lineHeight}
          />
        </SettingsField>
        <SettingsField
          description="Choose the cursor style used by xterm."
          label="Cursor style"
          query={query}
        >
          <Select
            items={CURSOR_STYLE_OPTIONS}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setCursorStyle(value as "block" | "underline" | "bar");
              }
            }}
            value={cursorStyle}
          >
            <SelectTrigger
              className="focus-visible:desktop-focus h-7 w-full text-xs focus-visible:ring-0! focus-visible:ring-offset-0!"
              size="sm"
            >
              <DefaultSelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="block">Block</SelectItem>
                <SelectItem value="underline">Underline</SelectItem>
                <SelectItem value="bar">Bar</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingsField>
      </div>
      <div className="hidden xl:flex xl:items-stretch xl:self-stretch">
        <button
          aria-controls="terminal-preview-sidebar"
          aria-label="Resize terminal preview sidebar"
          className="desktop-resize-handle-vertical-focus h-full w-1.5 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-accent/30"
          onKeyDown={handlePreviewResizeHandleKeyDown}
          onPointerDown={startPreviewResize}
          type="button"
        />
        <div
          className="min-w-0 self-stretch"
          id="terminal-preview-sidebar"
          style={{
            width: previewSidebarWidth > 0 ? `${previewSidebarWidth}px` : "0px",
          }}
        >
          <div className="h-full">
            <div className="h-full min-h-88">
              <TerminalPreview
                cursorStyle={cursorStyle}
                fontFamily={fontFamily}
                fontSize={fontSize}
                lineHeight={lineHeight}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="xl:hidden">
        <SettingsField
          description="Live in-app terminal instance using your selected terminal typography settings."
          label="In-App Terminal preview"
          query={query}
        >
          <div className="h-88">
            <TerminalPreview
              cursorStyle={cursorStyle}
              fontFamily={fontFamily}
              fontSize={fontSize}
              lineHeight={lineHeight}
            />
          </div>
        </SettingsField>
      </div>
    </div>
  );
}

export { TerminalSection };
