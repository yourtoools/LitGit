export type RuntimePlatform =
  | "android"
  | "ios"
  | "linux"
  | "macos"
  | "unknown"
  | "windows";

export const RUNTIME_PLATFORM_DATA_ATTRIBUTE = "runtimePlatform";

const APPLE_PLATFORM_PATTERN = /mac|iphone|ipad|ipod|ios/i;
const WINDOWS_PLATFORM_PATTERN = /win/i;
const ANDROID_PLATFORM_PATTERN = /android/i;
const LINUX_PLATFORM_PATTERN = /linux|x11/i;

const normalizePlatform = (value: string): RuntimePlatform => {
  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue.length === 0) {
    return "unknown";
  }

  if (APPLE_PLATFORM_PATTERN.test(normalizedValue)) {
    return normalizedValue.includes("ios") || normalizedValue.includes("iphone")
      ? "ios"
      : "macos";
  }

  if (WINDOWS_PLATFORM_PATTERN.test(normalizedValue)) {
    return "windows";
  }

  if (ANDROID_PLATFORM_PATTERN.test(normalizedValue)) {
    return "android";
  }

  if (LINUX_PLATFORM_PATTERN.test(normalizedValue)) {
    return "linux";
  }

  return "unknown";
};

export const getRuntimePlatform = (): RuntimePlatform => {
  if (typeof document !== "undefined") {
    const documentPlatform =
      document.documentElement.dataset[RUNTIME_PLATFORM_DATA_ATTRIBUTE];

    if (typeof documentPlatform === "string") {
      const normalizedDocumentPlatform = normalizePlatform(documentPlatform);

      if (normalizedDocumentPlatform !== "unknown") {
        return normalizedDocumentPlatform;
      }
    }
  }

  if (typeof navigator === "undefined") {
    return "unknown";
  }

  const userAgentData = Reflect.get(navigator, "userAgentData") as
    | { platform?: string }
    | undefined;

  return normalizePlatform(userAgentData?.platform ?? navigator.userAgent);
};

export const isMacPlatform = () => {
  const platform = getRuntimePlatform();

  return platform === "macos" || platform === "ios";
};

export const isWindowsPlatform = () => {
  return getRuntimePlatform() === "windows";
};
