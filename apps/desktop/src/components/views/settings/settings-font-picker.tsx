import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@litgit/ui/components/combobox";
import { Skeleton } from "@litgit/ui/components/skeleton";
import { Switch } from "@litgit/ui/components/switch";
import {
  SettingsField,
  SettingsHelpText,
} from "@/components/views/settings/settings-shared-ui";
import { listSystemFontFamilies } from "@/lib/tauri-settings-client";

const MONOSPACE_FONT_NAMES = new Set([
  "Cascadia Code, monospace",
  "Fira Code, monospace",
  "Geist Mono, monospace",
  "IBM Plex Mono, monospace",
  "JetBrains Mono Variable, JetBrains Mono, monospace",
]);

interface FontPickerOption {
  family: string;
  isMonospace: boolean;
  source: "curated" | "system";
}

interface SystemFontReadResult {
  options: FontPickerOption[];
  status: "available" | "unavailable";
}

const getVisibleFonts = (
  fonts: readonly FontPickerOption[],
  visibility: "all-fonts" | "monospace-only"
) => {
  if (visibility === "all-fonts") {
    return fonts;
  }

  return fonts.filter((font) => font.isMonospace);
};

const ensureSelectedOption = <T,>(
  options: readonly T[],
  selectedOption: T | null,
  isEqual: (option: T, selectedOption: T) => boolean
): readonly T[] => {
  if (
    !selectedOption ||
    options.some((option) => isEqual(option, selectedOption))
  ) {
    return options;
  }

  return [selectedOption, ...options];
};

const detectMonospaceFont = (fontName: string) => {
  const normalizedFontName = fontName.toLowerCase();

  return (
    normalizedFontName.includes("mono") ||
    normalizedFontName.includes("code") ||
    normalizedFontName.includes("console") ||
    normalizedFontName.includes("courier") ||
    MONOSPACE_FONT_NAMES.has(fontName)
  );
};

const BUNDLED_FONT_OPTIONS = [
  {
    family: "Geist Variable, Geist, sans-serif",
    isMonospace: false,
    source: "curated" as const,
  },
  {
    family: "JetBrains Mono Variable, JetBrains Mono, monospace",
    isMonospace: true,
    source: "curated" as const,
  },
] as const satisfies readonly FontPickerOption[];

let cachedSystemFontReadResult: SystemFontReadResult | null = null;
let systemFontReadInFlightPromise: Promise<SystemFontReadResult> | null = null;

const readSystemFontFamiliesUncached =
  async (): Promise<SystemFontReadResult> => {
    try {
      const tauriFontFamilies = await listSystemFontFamilies();

      if (tauriFontFamilies.length > 0) {
        return {
          options: tauriFontFamilies.map((family) => ({
            family,
            isMonospace: detectMonospaceFont(family),
            source: "system" as const,
          })),
          status: "available",
        };
      }
    } catch {
      // Fall back to browser APIs when native enumeration is unavailable.
    }

    if (!(typeof window !== "undefined" && "queryLocalFonts" in window)) {
      return {
        options: [],
        status: "unavailable",
      };
    }

    try {
      const queryLocalFonts = (
        window as Window & {
          queryLocalFonts?: () => Promise<Array<{ family: string }>>;
        }
      ).queryLocalFonts;

      if (!queryLocalFonts) {
        return {
          options: [],
          status: "unavailable",
        };
      }

      const fonts = await queryLocalFonts();

      const fontOptions = new Map<string, FontPickerOption>();

      for (const font of fonts) {
        if (typeof font.family !== "string") {
          continue;
        }

        const family = font.family.trim();

        if (family.length === 0) {
          continue;
        }

        fontOptions.set(family, {
          family,
          isMonospace: detectMonospaceFont(family),
          source: "system" as const,
        });
      }

      return {
        options: Array.from(fontOptions.values()),
        status: "available",
      };
    } catch {
      return {
        options: [],
        status: "unavailable",
      };
    }
  };

const readSystemFontFamilies = async (): Promise<SystemFontReadResult> => {
  if (cachedSystemFontReadResult) {
    return cachedSystemFontReadResult;
  }

  if (systemFontReadInFlightPromise) {
    return systemFontReadInFlightPromise;
  }

  systemFontReadInFlightPromise = readSystemFontFamiliesUncached();

  try {
    const result = await systemFontReadInFlightPromise;
    cachedSystemFontReadResult = result;

    return result;
  } finally {
    systemFontReadInFlightPromise = null;
  }
};

const runWhenBrowserIsIdle = (callback: () => void): (() => void) => {
  if (typeof window === "undefined") {
    callback();

    return () => undefined;
  }

  const idleWindow = window as Window & {
    cancelIdleCallback?: (id: number) => void;
    requestIdleCallback?: (
      callback: (deadline: unknown) => void,
      options?: { timeout: number }
    ) => number;
  };

  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(
      () => {
        callback();
      },
      { timeout: 300 }
    );

    return () => {
      idleWindow.cancelIdleCallback?.(handle);
    };
  }

  const handle = window.setTimeout(() => {
    callback();
  }, 0);

  return () => {
    window.clearTimeout(handle);
  };
};

const describeFontSource = (option: FontPickerOption) => {
  if (option.source === "system") {
    return option.isMonospace
      ? "System font - detected monospace"
      : "System font";
  }

  return option.isMonospace
    ? "Bundled fallback - monospace"
    : "Bundled fallback";
};

const matchesQuery = (query: string, values: string[]) => {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return false;
  }

  return values.some((value) => value.toLowerCase().includes(normalizedQuery));
};

function FontPickerField({
  description,
  emptyMessage,
  helperText,
  isLoadingOptions,
  label,
  monospaceOnly,
  onMonospaceOnlyChange,
  onPickerInteract,
  onSearchChange,
  onValueChange,
  options,
  query,
  searchPlaceholder,
  searchValue,
  selectedOption,
  showLoadingSkeleton,
}: {
  description: string;
  emptyMessage: string;
  helperText: string;
  isLoadingOptions?: boolean;
  label: string;
  monospaceOnly: boolean;
  onMonospaceOnlyChange: (checked: boolean) => void;
  onPickerInteract?: () => void;
  onSearchChange: (value: string) => void;
  onValueChange: (value: string) => void;
  options: readonly FontPickerOption[];
  query: string;
  searchPlaceholder: string;
  searchValue: string;
  selectedOption: FontPickerOption | null;
  showLoadingSkeleton?: boolean;
}) {
  const inputValue =
    searchValue.length > 0 ? searchValue : (selectedOption?.family ?? "");

  return (
    <SettingsField description={description} label={label} query={query}>
      <div className="grid gap-1.5">
        {showLoadingSkeleton ? (
          <Skeleton className="h-7 w-full border border-input/60 bg-input/35" />
        ) : (
          <Combobox
            autoHighlight
            filter={null}
            inputValue={inputValue}
            items={options}
            itemToStringLabel={(option: FontPickerOption) => option.family}
            onInputValueChange={(nextInputValue) => {
              onPickerInteract?.();
              onSearchChange(nextInputValue);
            }}
            onValueChange={(nextValue: FontPickerOption | null) => {
              if (nextValue) {
                onValueChange(nextValue.family);
              }
            }}
            value={selectedOption}
          >
            <ComboboxInput
              className="h-7 w-full text-xs"
              onFocus={(event) => {
                onPickerInteract?.();
                event.currentTarget.select();
              }}
              placeholder={searchPlaceholder}
              showClear
            />
            <ComboboxContent>
              <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
              <ComboboxList className="[scrollbar-color:color-mix(in_oklab,var(--color-muted-foreground)_55%,transparent)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/45 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2">
                {(option: FontPickerOption) => (
                  <ComboboxItem key={option.family} value={option}>
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-6">
                      <div className="min-w-0">
                        <div className="truncate text-xs">{option.family}</div>
                        <div className="truncate text-muted-foreground text-xs">
                          {describeFontSource(option)}
                        </div>
                      </div>
                    </div>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        )}
        <label
          className="inline-flex items-center gap-2"
          htmlFor="font-picker-monospace-only"
        >
          <Switch
            checked={monospaceOnly}
            id="font-picker-monospace-only"
            onCheckedChange={(checked) =>
              onMonospaceOnlyChange(Boolean(checked))
            }
          />
          <span className="text-xs">Show monospace fonts only</span>
        </label>
        {isLoadingOptions ? (
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <span className="inline-flex size-2 animate-pulse rounded-full bg-primary/60" />
            <span>Loading installed fonts...</span>
          </div>
        ) : null}
        <SettingsHelpText>{helperText}</SettingsHelpText>
      </div>
    </SettingsField>
  );
}

export type { FontPickerOption, SystemFontReadResult };
export {
  BUNDLED_FONT_OPTIONS,
  ensureSelectedOption,
  FontPickerField,
  getVisibleFonts,
  matchesQuery,
  readSystemFontFamilies,
  runWhenBrowserIsIdle,
};
