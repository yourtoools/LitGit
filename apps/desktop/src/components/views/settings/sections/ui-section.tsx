import { Button } from "@litgit/ui/components/button";
import { Checkbox } from "@litgit/ui/components/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@litgit/ui/components/combobox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@litgit/ui/components/select";
import {
  GitBranchIcon,
  ShieldCheckIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ensureSelectedOption } from "@/components/views/settings/settings-font-picker";
import {
  NOTIFICATION_PREVIEW_TOAST_ID,
  PREVIEW_SAMPLE_DATE,
  type ThemePreference,
  ThemeSelector,
} from "@/components/views/settings/settings-previews-codemirror";
import {
  DefaultSelectValue,
  SettingsField,
  SettingsHelpText,
} from "@/components/views/settings/settings-shared-ui";
import {
  DATE_FORMAT_OPTIONS,
  TOASTER_OPTIONS,
} from "@/components/views/settings/settings-store";
import {
  COMBOBOX_DEBOUNCE_DELAY_MS,
  normalizeComboboxQuery,
  useDebouncedValue,
} from "@/hooks/use-debounced-value";
import {
  getLocaleOption,
  getLocaleOptions,
  type LocaleOption,
  SYSTEM_LOCALE_CODE,
} from "@/lib/settings/locale-options";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";

function UiSection({ query }: { query: string }) {
  const locale = usePreferencesStore((state) => state.ui.locale);
  const setLocale = usePreferencesStore((state) => state.setLocale);
  const theme = usePreferencesStore((state) => state.ui.theme);
  const setThemePreference = usePreferencesStore(
    (state) => state.setThemePreference
  );
  const toasterPosition = usePreferencesStore(
    (state) => state.ui.toasterPosition
  );
  const setToasterPosition = usePreferencesStore(
    (state) => state.setToasterPosition
  );
  const toolbarLabels = usePreferencesStore((state) => state.ui.toolbarLabels);
  const setToolbarLabels = usePreferencesStore(
    (state) => state.setToolbarLabels
  );
  const dateFormat = usePreferencesStore((state) => state.ui.dateFormat);
  const setDateFormat = usePreferencesStore((state) => state.setDateFormat);
  const [localeQuery, setLocaleQuery] = useState("");
  const localeOptions = getLocaleOptions();
  const selectedLocaleOption = getLocaleOption(locale) ?? localeOptions[0];
  const debouncedLocaleQuery = useDebouncedValue(
    localeQuery,
    COMBOBOX_DEBOUNCE_DELAY_MS
  );
  const visibleLocaleOptions = useMemo(() => {
    const normalizedQuery = normalizeComboboxQuery(debouncedLocaleQuery);

    if (normalizedQuery.length === 0) {
      return localeOptions;
    }

    const filteredOptions = localeOptions.filter((option) =>
      `${option.displayName} ${option.code}`
        .toLowerCase()
        .includes(normalizedQuery)
    );

    return ensureSelectedOption(
      filteredOptions,
      selectedLocaleOption,
      (option, selectedOption) => option.code === selectedOption.code
    );
  }, [debouncedLocaleQuery, localeOptions, selectedLocaleOption]);
  const effectiveLocale =
    selectedLocaleOption.code === SYSTEM_LOCALE_CODE ||
    selectedLocaleOption.code.trim().length === 0
      ? undefined
      : selectedLocaleOption.code;
  const formatDatePreview = (formatPreset: "compact" | "verbose"): string => {
    const formatOptions: Intl.DateTimeFormatOptions = {
      dateStyle: formatPreset === "verbose" ? "full" : "medium",
      timeStyle: formatPreset === "verbose" ? "medium" : "short",
    };

    return new Intl.DateTimeFormat(effectiveLocale, formatOptions).format(
      PREVIEW_SAMPLE_DATE
    );
  };
  const selectedDatePreview = formatDatePreview(dateFormat);
  const localeInputValue =
    localeQuery.length > 0 ? localeQuery : selectedLocaleOption.displayName;

  return (
    <div className="grid gap-2">
      <SettingsField
        description="Switch between system, light, and dark appearance. Applied immediately."
        label="Theme"
        query={query}
      >
        <ThemeSelector
          onValueChange={setThemePreference}
          value={theme as ThemePreference}
        />
      </SettingsField>
      <SettingsField
        description="Change where toast notifications appear in the desktop shell."
        label="Notification location"
        query={query}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <Select
            items={TOASTER_OPTIONS}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setToasterPosition(
                  value as
                    | "top-right"
                    | "top-center"
                    | "top-left"
                    | "bottom-right"
                    | "bottom-center"
                    | "bottom-left"
                );
              }
            }}
            value={toasterPosition}
          >
            <SelectTrigger
              className="focus-visible:desktop-focus h-7 w-full text-xs focus-visible:ring-0! focus-visible:ring-offset-0!"
              size="sm"
            >
              <DefaultSelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="top-right">Top right</SelectItem>
                <SelectItem value="top-center">Top center</SelectItem>
                <SelectItem value="top-left">Top left</SelectItem>
                <SelectItem value="bottom-right">Bottom right</SelectItem>
                <SelectItem value="bottom-center">Bottom center</SelectItem>
                <SelectItem value="bottom-left">Bottom left</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              toast("Notification position preview", {
                description:
                  "This toast appears at the currently selected location.",
                id: NOTIFICATION_PREVIEW_TOAST_ID,
              });
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Test notification
          </Button>
        </div>
      </SettingsField>
      <SettingsField
        description="Choose the locale used for date rendering with a curated searchable list. System locale follows your OS settings."
        label="Date/time locale"
        query={query}
      >
        <div className="grid gap-1.5">
          <Combobox
            autoHighlight
            filter={null}
            inputValue={localeInputValue}
            items={visibleLocaleOptions}
            itemToStringLabel={(option: LocaleOption) =>
              `${option.displayName} ${option.code}`
            }
            onInputValueChange={(nextInputValue) => {
              setLocaleQuery(nextInputValue);
            }}
            onValueChange={(nextValue: LocaleOption | null) => {
              setLocale(nextValue?.code ?? SYSTEM_LOCALE_CODE);
              setLocaleQuery("");
            }}
            value={selectedLocaleOption}
          >
            <ComboboxInput
              className="h-7 w-full text-xs"
              onFocus={(event) => {
                event.currentTarget.select();
              }}
              placeholder="Search locale"
              showClear
            />
            <ComboboxContent>
              <ComboboxEmpty>No matching locale found.</ComboboxEmpty>
              <ComboboxList className="[scrollbar-color:color-mix(in_oklab,var(--color-muted-foreground)_55%,transparent)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/45 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2">
                {(option: LocaleOption) => (
                  <ComboboxItem key={option.code} value={option}>
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-6">
                      <div className="min-w-0">
                        <div className="truncate text-xs">
                          {option.displayName}
                        </div>
                        <div className="truncate text-muted-foreground text-xs">
                          {option.code === SYSTEM_LOCALE_CODE
                            ? "Use your operating system locale"
                            : option.code}
                        </div>
                      </div>
                    </div>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <SettingsHelpText>
            {selectedLocaleOption.code === SYSTEM_LOCALE_CODE
              ? "Repository timestamps follow your system locale until you pick a specific locale."
              : `Repository timestamps now use ${selectedLocaleOption.displayName}.`}
          </SettingsHelpText>
          <SettingsHelpText>Preview: {selectedDatePreview}</SettingsHelpText>
        </div>
      </SettingsField>
      <SettingsField
        description="Controls whether repository dates use a compact or verbose format."
        label="Date format"
        query={query}
      >
        <div className="grid gap-1.5">
          <Select
            items={DATE_FORMAT_OPTIONS}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setDateFormat(value as "compact" | "verbose");
              }
            }}
            value={dateFormat}
          >
            <SelectTrigger
              className="focus-visible:desktop-focus h-7 w-full text-xs focus-visible:ring-0! focus-visible:ring-offset-0!"
              size="sm"
            >
              <DefaultSelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="verbose">Verbose</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <SettingsHelpText>Preview: {selectedDatePreview}</SettingsHelpText>
        </div>
      </SettingsField>
      <SettingsField
        description="Show or hide text labels alongside shell toolbar actions."
        label="Show toolbar labels"
        query={query}
      >
        <div className="grid gap-1.5">
          <label className="inline-flex items-center gap-1.5 text-xs">
            <Checkbox
              checked={toolbarLabels}
              onCheckedChange={(checked) => setToolbarLabels(Boolean(checked))}
            />
            <span className="text-xs">Display action labels in the header</span>
          </label>
          <div className="inline-flex items-center gap-1.5 border border-border/70 bg-muted/20 p-1.5">
            <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap border border-border/70 bg-background px-2 py-1 text-xs">
              <GitBranchIcon className="size-3.5" />
              {toolbarLabels ? <span>Branches</span> : null}
            </span>
            <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap border border-border/70 bg-background px-2 py-1 text-xs">
              <TerminalWindowIcon className="size-3.5" />
              {toolbarLabels ? <span>Terminal</span> : null}
            </span>
            <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap border border-border/70 bg-background px-2 py-1 text-xs">
              <ShieldCheckIcon className="size-3.5" />
              {toolbarLabels ? <span>Security</span> : null}
            </span>
          </div>
          <SettingsHelpText>
            Preview updates instantly based on your toolbar label preference.
          </SettingsHelpText>
        </div>
      </SettingsField>
    </div>
  );
}

export { UiSection };
