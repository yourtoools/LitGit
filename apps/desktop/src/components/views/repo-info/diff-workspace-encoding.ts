export interface DiffWorkspaceEncodingOption {
  groupLabel: string;
  label: string;
  requestEncoding: string | null;
  value: string;
}

export const DIFF_WORKSPACE_GUESS_ENCODING_VALUE = "guess";
export const DIFF_WORKSPACE_BINARY_ENCODING_VALUE = "binary";

export const DEFAULT_DIFF_WORKSPACE_ENCODING = "utf-8";

export const DIFF_WORKSPACE_ENCODING_OPTIONS: DiffWorkspaceEncodingOption[] = [
  {
    groupLabel: "Pinned",
    label: "Guess Encoding",
    requestEncoding: null,
    value: DIFF_WORKSPACE_GUESS_ENCODING_VALUE,
  },
  {
    groupLabel: "Pinned",
    label: "Binary",
    requestEncoding: null,
    value: DIFF_WORKSPACE_BINARY_ENCODING_VALUE,
  },
  {
    groupLabel: "UTF",
    label: "UTF-8",
    requestEncoding: "utf-8",
    value: "utf-8",
  },
  {
    groupLabel: "UTF",
    label: "UTF-16 LE",
    requestEncoding: "utf-16le",
    value: "utf-16le",
  },
  {
    groupLabel: "UTF",
    label: "UTF-16 BE",
    requestEncoding: "utf-16be",
    value: "utf-16be",
  },
  {
    groupLabel: "Windows",
    label: "Windows-874",
    requestEncoding: "windows-874",
    value: "windows-874",
  },
  {
    groupLabel: "Windows",
    label: "Windows-1250",
    requestEncoding: "windows-1250",
    value: "windows-1250",
  },
  {
    groupLabel: "Windows",
    label: "Windows-1251",
    requestEncoding: "windows-1251",
    value: "windows-1251",
  },
  {
    groupLabel: "Windows",
    label: "Windows-1252",
    requestEncoding: "windows-1252",
    value: "windows-1252",
  },
  {
    groupLabel: "Windows",
    label: "Windows-1253",
    requestEncoding: "windows-1253",
    value: "windows-1253",
  },
  {
    groupLabel: "Windows",
    label: "Windows-1254",
    requestEncoding: "windows-1254",
    value: "windows-1254",
  },
  {
    groupLabel: "Windows",
    label: "Windows-1255",
    requestEncoding: "windows-1255",
    value: "windows-1255",
  },
  {
    groupLabel: "Windows",
    label: "Windows-1256",
    requestEncoding: "windows-1256",
    value: "windows-1256",
  },
  {
    groupLabel: "Windows",
    label: "Windows-1257",
    requestEncoding: "windows-1257",
    value: "windows-1257",
  },
  {
    groupLabel: "Windows",
    label: "Windows-1258",
    requestEncoding: "windows-1258",
    value: "windows-1258",
  },
  {
    groupLabel: "ISO",
    label: "ISO-8859-1",
    requestEncoding: "iso-8859-1",
    value: "iso-8859-1",
  },
  {
    groupLabel: "ISO",
    label: "ISO-8859-2",
    requestEncoding: "iso-8859-2",
    value: "iso-8859-2",
  },
  {
    groupLabel: "ISO",
    label: "ISO-8859-3",
    requestEncoding: "iso-8859-3",
    value: "iso-8859-3",
  },
  {
    groupLabel: "ISO",
    label: "ISO-8859-4",
    requestEncoding: "iso-8859-4",
    value: "iso-8859-4",
  },
  {
    groupLabel: "ISO",
    label: "ISO-8859-5",
    requestEncoding: "iso-8859-5",
    value: "iso-8859-5",
  },
  {
    groupLabel: "ISO",
    label: "ISO-8859-6",
    requestEncoding: "iso-8859-6",
    value: "iso-8859-6",
  },
  {
    groupLabel: "ISO",
    label: "ISO-8859-7",
    requestEncoding: "iso-8859-7",
    value: "iso-8859-7",
  },
  {
    groupLabel: "ISO",
    label: "ISO-8859-8",
    requestEncoding: "iso-8859-8",
    value: "iso-8859-8",
  },
  {
    groupLabel: "ISO",
    label: "ISO-8859-9",
    requestEncoding: "iso-8859-9",
    value: "iso-8859-9",
  },
  {
    groupLabel: "ISO",
    label: "ISO-8859-10",
    requestEncoding: "iso-8859-10",
    value: "iso-8859-10",
  },
  {
    groupLabel: "ISO",
    label: "ISO-8859-11",
    requestEncoding: "iso-8859-11",
    value: "iso-8859-11",
  },
  {
    groupLabel: "ISO",
    label: "ISO-8859-13",
    requestEncoding: "iso-8859-13",
    value: "iso-8859-13",
  },
  {
    groupLabel: "ISO",
    label: "ISO-8859-14",
    requestEncoding: "iso-8859-14",
    value: "iso-8859-14",
  },
  {
    groupLabel: "ISO",
    label: "ISO-8859-15",
    requestEncoding: "iso-8859-15",
    value: "iso-8859-15",
  },
  {
    groupLabel: "ISO",
    label: "ISO-8859-16",
    requestEncoding: "iso-8859-16",
    value: "iso-8859-16",
  },
  {
    groupLabel: "Mac",
    label: "mac-roman",
    requestEncoding: "x-mac-roman",
    value: "x-mac-roman",
  },
  {
    groupLabel: "CP",
    label: "CP866",
    requestEncoding: "cp866",
    value: "cp866",
  },
  {
    groupLabel: "KOI",
    label: "KOI8-R",
    requestEncoding: "koi8-r",
    value: "koi8-r",
  },
  {
    groupLabel: "KOI",
    label: "KOI8-U",
    requestEncoding: "koi8-u",
    value: "koi8-u",
  },
  {
    groupLabel: "KOI",
    label: "KOI8-RU",
    requestEncoding: "koi8-ru",
    value: "koi8-ru",
  },
  {
    groupLabel: "GB",
    label: "GB2312",
    requestEncoding: "gb2312",
    value: "gb2312",
  },
  {
    groupLabel: "GB",
    label: "GBK",
    requestEncoding: "gbk",
    value: "gbk",
  },
  {
    groupLabel: "GB",
    label: "GB18030",
    requestEncoding: "gb18030",
    value: "gb18030",
  },
  {
    groupLabel: "BIG",
    label: "BIG5",
    requestEncoding: "big5",
    value: "big5",
  },
  {
    groupLabel: "BIG",
    label: "BIG5-HKSCS",
    requestEncoding: "big5-hkscs",
    value: "big5-hkscs",
  },
  {
    groupLabel: "SHIFT",
    label: "SHIFT_JIS",
    requestEncoding: "shift_jis",
    value: "shift_jis",
  },
  {
    groupLabel: "SHIFT",
    label: "Windows-31J",
    requestEncoding: "windows-31j",
    value: "windows-31j",
  },
  {
    groupLabel: "EUC",
    label: "EUC-JP",
    requestEncoding: "euc-jp",
    value: "euc-jp",
  },
  {
    groupLabel: "EUC",
    label: "EUC-KR",
    requestEncoding: "euc-kr",
    value: "euc-kr",
  },
];

const LEGACY_WORKSPACE_ENCODING_MAP: Record<string, string> = {
  "euc-kr": "euc-kr",
  gbk: "gbk",
  "iso-8859-1": "iso-8859-1",
  shift_jis: "shift_jis",
  "utf-16be": "utf-16be",
  "utf-16le": "utf-16le",
  "utf-8": "utf-8",
  "windows-1252": "windows-1252",
};

const WORKSPACE_ENCODING_BY_VALUE = new Map(
  DIFF_WORKSPACE_ENCODING_OPTIONS.map((option) => [option.value, option])
);

export function resolveDiffWorkspaceEncodingValue(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (WORKSPACE_ENCODING_BY_VALUE.has(normalized)) {
    return normalized;
  }

  return (
    LEGACY_WORKSPACE_ENCODING_MAP[normalized] ?? DEFAULT_DIFF_WORKSPACE_ENCODING
  );
}

export function resolveDiffWorkspaceRequestedEncoding(
  value: string
): string | null {
  const resolvedValue = resolveDiffWorkspaceEncodingValue(value);

  return (
    WORKSPACE_ENCODING_BY_VALUE.get(resolvedValue)?.requestEncoding ?? null
  );
}

export function isDiffWorkspaceTextEncodingUnsupported(value: string): boolean {
  return (
    resolveDiffWorkspaceEncodingValue(value) ===
    DIFF_WORKSPACE_BINARY_ENCODING_VALUE
  );
}
