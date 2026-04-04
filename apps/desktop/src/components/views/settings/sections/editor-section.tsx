import { Input } from "@litgit/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@litgit/ui/components/select";
import { Switch } from "@litgit/ui/components/switch";
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
import { EditorPreview } from "@/components/views/settings/settings-previews-codemirror";
import {
  DefaultSelectValue,
  SettingsField,
} from "@/components/views/settings/settings-shared-ui";
import {
  clampWidth,
  EOL_OPTIONS,
  getEditorPreviewResizeBounds,
  getInitialEditorPreviewSidebarWidth,
  getSettingsLayoutWidth,
  LINE_NUMBER_OPTIONS,
  type SidebarResizeState,
} from "@/components/views/settings/settings-store";
import {
  COMBOBOX_DEBOUNCE_DELAY_MS,
  normalizeComboboxQuery,
  useDebouncedValue,
} from "@/hooks/use-debounced-value";
import {
  clampEditorFontSize,
  clampEditorTabSize,
  DEFAULT_EDITOR_FONT_FAMILY,
} from "@/stores/preferences/preferences-store-types";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";

function EditorSection({ query }: { query: string }) {
  const editor = usePreferencesStore((state) => state.editor);
  const setEditorPreferences = usePreferencesStore(
    (state) => state.setEditorPreferences
  );
  const [previewSidebarWidth, setPreviewSidebarWidth] = useState(
    getInitialEditorPreviewSidebarWidth
  );
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const previewResizeStateRef = useRef<SidebarResizeState | null>(null);
  const previewResizeAnimationFrameRef = useRef<number | null>(null);
  const pendingPreviewSidebarWidthRef = useRef<number | null>(null);
  const previewBodyStyleSnapshotRef = useRef<{
    cursor: string;
    userSelect: string;
  } | null>(null);
  const [systemEditorFonts, setSystemEditorFonts] = useState<
    readonly FontPickerOption[]
  >([]);
  const [editorFontStatus, setEditorFontStatus] =
    useState<SystemFontReadResult["status"]>("available");
  const [isLoadingEditorFonts, setIsLoadingEditorFonts] = useState(false);
  const [hasLoadedEditorFonts, setHasLoadedEditorFonts] = useState(false);
  const [editorFontQuery, setEditorFontQuery] = useState("");
  const debouncedEditorFontQuery = useDebouncedValue(
    editorFontQuery,
    COMBOBOX_DEBOUNCE_DELAY_MS
  );
  const [editorFontSizeInput, setEditorFontSizeInput] = useState(() =>
    String(editor.fontSize)
  );
  const [editorTabSizeInput, setEditorTabSizeInput] = useState(() =>
    String(editor.tabSize)
  );
  const [editorPreviewMode, setEditorPreviewMode] = useState<
    "diff" | "regular"
  >("regular");
  const editorFonts = useMemo(
    () =>
      Array.from(
        new Map(
          [...systemEditorFonts, ...BUNDLED_FONT_OPTIONS].map((font) => [
            font.family,
            font,
          ])
        ).values()
      ),
    [systemEditorFonts]
  );
  const selectedEditorFontOption = useMemo(
    () => editorFonts.find((font) => font.family === editor.fontFamily) ?? null,
    [editor.fontFamily, editorFonts]
  );
  const visibleEditorFonts = useMemo(() => {
    const filteredFonts = getVisibleFonts(editorFonts, editor.fontVisibility);
    const normalizedQuery = normalizeComboboxQuery(debouncedEditorFontQuery);

    if (normalizedQuery.length === 0) {
      return ensureSelectedOption(
        filteredFonts,
        selectedEditorFontOption,
        (option, selectedOption) => option.family === selectedOption.family
      );
    }

    const queryFilteredFonts = filteredFonts.filter((font) =>
      font.family.toLowerCase().includes(normalizedQuery)
    );

    return ensureSelectedOption(
      queryFilteredFonts,
      selectedEditorFontOption,
      (option, selectedOption) => option.family === selectedOption.family
    );
  }, [
    debouncedEditorFontQuery,
    editor.fontVisibility,
    editorFonts,
    selectedEditorFontOption,
  ]);

  useEffect(() => {
    if (!editorFonts.some((font) => font.family === editor.fontFamily)) {
      setEditorPreferences({ fontFamily: DEFAULT_EDITOR_FONT_FAMILY });
    }
  }, [editor.fontFamily, editorFonts, setEditorPreferences]);

  useEffect(() => {
    setEditorFontSizeInput(String(editor.fontSize));
  }, [editor.fontSize]);

  useEffect(() => {
    setEditorTabSizeInput(String(editor.tabSize));
  }, [editor.tabSize]);

  const loadEditorFonts = useCallback(() => {
    if (hasLoadedEditorFonts || isLoadingEditorFonts) {
      return;
    }

    setIsLoadingEditorFonts(true);
    readSystemFontFamilies()
      .then((result) => {
        setSystemEditorFonts(result.options);
        setEditorFontStatus(result.status);
        setHasLoadedEditorFonts(true);
      })
      .catch(() => undefined)
      .finally(() => {
        setIsLoadingEditorFonts(false);
      });
  }, [hasLoadedEditorFonts, isLoadingEditorFonts]);

  useEffect(() => {
    if (hasLoadedEditorFonts || isLoadingEditorFonts) {
      return;
    }

    return runWhenBrowserIsIdle(() => {
      loadEditorFonts();
    });
  }, [hasLoadedEditorFonts, isLoadingEditorFonts, loadEditorFonts]);

  const getAvailableEditorWidth = useCallback(() => {
    return previewContainerRef.current?.clientWidth ?? getSettingsLayoutWidth();
  }, []);

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

  const _startPreviewResize = (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const { maxWidth, minWidth } = getEditorPreviewResizeBounds(
      getAvailableEditorWidth()
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
      getAvailableEditorWidth()
    );

    if (maxWidth <= 0) {
      setPreviewSidebarWidth(0);
      return;
    }

    setPreviewSidebarWidth((currentWidth) =>
      clampWidth(currentWidth + delta, minWidth, maxWidth)
    );
  };

  const _handlePreviewResizeHandleKeyDown = (
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
        getAvailableEditorWidth()
      );
      setPreviewSidebarWidth(minWidth);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      const { maxWidth } = getEditorPreviewResizeBounds(
        getAvailableEditorWidth()
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
        getAvailableEditorWidth()
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
    getAvailableEditorWidth,
    resetPreviewResizeState,
    schedulePreviewSidebarWidthUpdate,
  ]);

  useEffect(() => {
    const clampPreviewWidthToViewport = () => {
      const { maxWidth, minWidth } = getEditorPreviewResizeBounds(
        getAvailableEditorWidth()
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
  }, [getAvailableEditorWidth]);

  let editorFontHelperText =
    "Loading installed system fonts in the background. Bundled fallbacks are available immediately.";

  if (hasLoadedEditorFonts && editorFontStatus === "unavailable") {
    editorFontHelperText =
      "System font enumeration is unavailable here, so the picker is showing bundled fallbacks only.";
  } else if (hasLoadedEditorFonts) {
    editorFontHelperText =
      "Installed system fonts are shown first, with bundled fallbacks available when needed.";
  }

  return (
    <div
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch"
      ref={previewContainerRef}
    >
      <div className="grid gap-4">
        <FontPickerField
          description="Search installed editor fonts and bundled fallbacks, then optionally filter to monospace only."
          emptyMessage={
            editorFontStatus === "unavailable"
              ? "No installed fonts could be read on this platform. Bundled fallbacks are still available."
              : "No matching editor fonts found."
          }
          helperText={editorFontHelperText}
          isLoadingOptions={isLoadingEditorFonts}
          label="Editor font"
          monospaceOnly={editor.fontVisibility === "monospace-only"}
          onMonospaceOnlyChange={(checked) => {
            setEditorPreferences({
              fontVisibility: checked ? "monospace-only" : "all-fonts",
            });
          }}
          onPickerInteract={loadEditorFonts}
          onSearchChange={setEditorFontQuery}
          onValueChange={(value) => {
            setEditorPreferences({ fontFamily: value });
            setEditorFontQuery("");
          }}
          options={visibleEditorFonts}
          query={query}
          searchPlaceholder="Search editor fonts"
          searchValue={editorFontQuery}
          selectedOption={selectedEditorFontOption}
          showLoadingSkeleton={isLoadingEditorFonts && !hasLoadedEditorFonts}
        />
        <SettingsField
          description="Changes editor font size immediately for open diff views."
          label="Font size"
          query={query}
        >
          <Input
            max={32}
            min={10}
            onBlur={() => {
              if (editorFontSizeInput.trim().length === 0) {
                setEditorFontSizeInput(String(editor.fontSize));
                return;
              }

              const parsedValue = Number(editorFontSizeInput);

              if (!Number.isFinite(parsedValue)) {
                setEditorFontSizeInput(String(editor.fontSize));
                return;
              }

              const clampedValue = clampEditorFontSize(parsedValue);
              setEditorPreferences({ fontSize: clampedValue });
              setEditorFontSizeInput(String(clampedValue));
            }}
            onChange={(event) => {
              const nextValue = event.target.value;
              setEditorFontSizeInput(nextValue);

              if (nextValue.trim().length === 0) {
                return;
              }

              const parsedValue = Number(nextValue);

              if (!Number.isFinite(parsedValue)) {
                return;
              }

              if (parsedValue < 10 || parsedValue > 32) {
                return;
              }

              setEditorPreferences({ fontSize: parsedValue });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            step={1}
            type="number"
            value={editorFontSizeInput}
          />
        </SettingsField>
        <SettingsField
          description="Controls the visible indentation width in the diff editor."
          label="Tab size"
          query={query}
        >
          <Input
            max={8}
            min={1}
            onBlur={() => {
              if (editorTabSizeInput.trim().length === 0) {
                setEditorTabSizeInput(String(editor.tabSize));
                return;
              }

              const parsedValue = Number(editorTabSizeInput);

              if (!Number.isFinite(parsedValue)) {
                setEditorTabSizeInput(String(editor.tabSize));
                return;
              }

              const clampedValue = clampEditorTabSize(parsedValue);
              setEditorPreferences({ tabSize: clampedValue });
              setEditorTabSizeInput(String(clampedValue));
            }}
            onChange={(event) => {
              const nextValue = event.target.value;
              setEditorTabSizeInput(nextValue);

              if (nextValue.trim().length === 0) {
                return;
              }

              const parsedValue = Number(nextValue);

              if (!Number.isFinite(parsedValue)) {
                return;
              }

              if (parsedValue < 1 || parsedValue > 8) {
                return;
              }

              setEditorPreferences({ tabSize: parsedValue });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            step={1}
            type="number"
            value={editorTabSizeInput}
          />
        </SettingsField>
        <SettingsField
          description="Show or hide line numbers in diff views."
          label="Line numbers"
          query={query}
        >
          <Select
            items={LINE_NUMBER_OPTIONS}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setEditorPreferences({ lineNumbers: value as "on" | "off" });
              }
            }}
            value={editor.lineNumbers}
          >
            <SelectTrigger className="focus-visible:desktop-focus w-full focus-visible:ring-0! focus-visible:ring-offset-0!">
              <DefaultSelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="on">Visible</SelectItem>
                <SelectItem value="off">Hidden</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingsField>
        <SettingsField
          description="Wrap long lines in the existing read-only diff editor."
          label="Word wrap"
          query={query}
        >
          <label className="inline-flex items-center gap-3">
            <Switch
              checked={editor.wordWrap === "on"}
              onCheckedChange={(checked) => {
                setEditorPreferences({ wordWrap: checked ? "on" : "off" });
              }}
            />
            <span className="text-sm">
              {editor.wordWrap === "on"
                ? "Word wrap enabled"
                : "Word wrap disabled"}
            </span>
          </label>
        </SettingsField>
        <SettingsField
          description="Disable language detection and syntax coloring when you want a plain-text diff view."
          label="Syntax highlighting"
          query={query}
        >
          <label className="inline-flex items-center gap-3">
            <Switch
              checked={editor.syntaxHighlighting}
              onCheckedChange={(checked) => {
                setEditorPreferences({ syntaxHighlighting: Boolean(checked) });
              }}
            />
            <span className="text-sm">
              {editor.syntaxHighlighting
                ? "Use syntax-aware language colors"
                : "Always render diffs as plain text"}
            </span>
          </label>
        </SettingsField>
        <SettingsField
          description="Choose which line-ending mode to use when rendering diffs."
          label="Line ending mode"
          query={query}
        >
          <Select
            items={EOL_OPTIONS}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setEditorPreferences({
                  eol: value as "system" | "lf" | "crlf",
                });
              }
            }}
            value={editor.eol}
          >
            <SelectTrigger className="focus-visible:desktop-focus w-full focus-visible:ring-0! focus-visible:ring-offset-0!">
              <DefaultSelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="system">System default</SelectItem>
                <SelectItem value="lf">LF</SelectItem>
                <SelectItem value="crlf">CRLF</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingsField>
      </div>
      <div className="hidden xl:flex xl:items-stretch xl:self-stretch">
        <button
          aria-controls="editor-preview-sidebar"
          aria-label="Resize editor preview sidebar"
          className="desktop-resize-handle-vertical-focus h-full w-1.5 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-accent/30"
          onKeyDown={_handlePreviewResizeHandleKeyDown}
          onPointerDown={_startPreviewResize}
          type="button"
        />
        <div
          className="min-w-0 self-stretch"
          id="editor-preview-sidebar"
          style={{
            width: previewSidebarWidth > 0 ? `${previewSidebarWidth}px` : "0px",
          }}
        >
          <div className="h-full">
            <div className="h-full min-h-88">
              <EditorPreview
                eol={editor.eol}
                fontFamily={editor.fontFamily}
                fontSize={editor.fontSize}
                lineNumbers={editor.lineNumbers}
                mode={editorPreviewMode}
                onModeChange={setEditorPreviewMode}
                syntaxHighlighting={editor.syntaxHighlighting}
                tabSize={editor.tabSize}
                wordWrap={editor.wordWrap}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="xl:hidden">
        <div className="h-88">
          <EditorPreview
            eol={editor.eol}
            fontFamily={editor.fontFamily}
            fontSize={editor.fontSize}
            lineNumbers={editor.lineNumbers}
            mode={editorPreviewMode}
            onModeChange={setEditorPreviewMode}
            syntaxHighlighting={editor.syntaxHighlighting}
            tabSize={editor.tabSize}
            wordWrap={editor.wordWrap}
          />
        </div>
      </div>
    </div>
  );
}

export { EditorSection };
