export interface LocaleOption {
  code: string;
  displayName: string;
  keywords: string[];
}

export const SYSTEM_LOCALE_CODE = "system";

const WHITESPACE_SPLIT_PATTERN = /\s+/;

const SYSTEM_LOCALE_OPTION: LocaleOption = {
  code: SYSTEM_LOCALE_CODE,
  displayName: "System locale",
  keywords: ["default", "os", "auto", "system locale"],
};

const LOCALE_CANDIDATES = [
  "af-ZA",
  "am-ET",
  "ar-AE",
  "ar-EG",
  "ar-SA",
  "az-AZ",
  "be-BY",
  "bg-BG",
  "bn-BD",
  "bs-BA",
  "ca-ES",
  "cs-CZ",
  "cy-GB",
  "da-DK",
  "de-AT",
  "de-CH",
  "de-DE",
  "el-GR",
  "en-AU",
  "en-CA",
  "en-GB",
  "en-IE",
  "en-IN",
  "en-NZ",
  "en-SG",
  "en-US",
  "en-ZA",
  "es-AR",
  "es-CL",
  "es-CO",
  "es-ES",
  "es-MX",
  "es-PE",
  "es-US",
  "et-EE",
  "eu-ES",
  "fa-IR",
  "fi-FI",
  "fil-PH",
  "fr-BE",
  "fr-CA",
  "fr-CH",
  "fr-FR",
  "ga-IE",
  "gl-ES",
  "gu-IN",
  "he-IL",
  "hi-IN",
  "hr-HR",
  "hu-HU",
  "hy-AM",
  "id-ID",
  "is-IS",
  "it-CH",
  "it-IT",
  "ja-JP",
  "ka-GE",
  "kk-KZ",
  "km-KH",
  "kn-IN",
  "ko-KR",
  "ky-KG",
  "lo-LA",
  "lt-LT",
  "lv-LV",
  "mk-MK",
  "ml-IN",
  "mn-MN",
  "mr-IN",
  "ms-MY",
  "mt-MT",
  "my-MM",
  "nb-NO",
  "ne-NP",
  "nl-BE",
  "nl-NL",
  "pa-IN",
  "pl-PL",
  "pt-BR",
  "pt-PT",
  "ro-RO",
  "ru-RU",
  "si-LK",
  "sk-SK",
  "sl-SI",
  "sq-AL",
  "sr-RS",
  "sv-SE",
  "sw-KE",
  "ta-IN",
  "te-IN",
  "th-TH",
  "tr-TR",
  "uk-UA",
  "ur-PK",
  "uz-UZ",
  "vi-VN",
  "zh-CN",
  "zh-HK",
  "zh-TW",
] as const;

let localeDisplayNamesCache: Intl.DisplayNames | null = null;
let localeOptionByCodeCache: ReadonlyMap<string, LocaleOption> | null = null;
let localeOptionsCache: readonly LocaleOption[] | null = null;
let regionDisplayNamesCache: Intl.DisplayNames | null = null;

const getLocaleDisplayNames = (): Intl.DisplayNames => {
  localeDisplayNamesCache ??= new Intl.DisplayNames(["en"], {
    fallback: "code",
    type: "language",
  });

  return localeDisplayNamesCache;
};

const getRegionDisplayNames = (): Intl.DisplayNames => {
  regionDisplayNamesCache ??= new Intl.DisplayNames(["en"], {
    fallback: "code",
    type: "region",
  });

  return regionDisplayNamesCache;
};

const buildLocaleOption = (code: string): LocaleOption => {
  const [languageCode = code, regionCode] = code.split("-");
  const languageName = getLocaleDisplayNames().of(languageCode) ?? languageCode;
  const regionName = regionCode
    ? (getRegionDisplayNames().of(regionCode) ?? regionCode)
    : null;
  const displayName = regionName
    ? `${languageName} (${regionName})`
    : languageName;

  return {
    code,
    displayName,
    keywords: [
      code,
      languageCode,
      regionCode ?? "",
      languageName,
      regionName ?? "",
      displayName,
    ]
      .join(" ")
      .toLowerCase()
      .split(WHITESPACE_SPLIT_PATTERN)
      .filter(Boolean),
  };
};

export const getLocaleOptions = (): readonly LocaleOption[] => {
  if (localeOptionsCache) {
    return localeOptionsCache;
  }

  const options = [SYSTEM_LOCALE_OPTION, ...LOCALE_CANDIDATES.map(buildLocaleOption)];
  localeOptionsCache = options;
  localeOptionByCodeCache = new Map(
    options.map((option) => [option.code, option])
  );

  return localeOptionsCache;
};

export const getLocaleOption = (code: string): LocaleOption | null => {
  localeOptionByCodeCache ??= new Map(
    getLocaleOptions().map((option) => [option.code, option])
  );

  return localeOptionByCodeCache.get(code) ?? null;
};
