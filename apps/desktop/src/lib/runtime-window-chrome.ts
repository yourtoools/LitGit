type RuntimeWindowChromeMode = "custom" | "native" | "overlay-native-controls";

const WINDOW_CHROME_DATA_ATTRIBUTE = "windowChrome";

const normalizeWindowChromeMode = (
  value: string | null | undefined
): RuntimeWindowChromeMode => {
  switch (value?.trim().toLowerCase()) {
    case "custom":
      return "custom";
    case "overlay-native-controls":
      return "overlay-native-controls";
    default:
      return "native";
  }
};

export const getRuntimeWindowChromeMode = (): RuntimeWindowChromeMode => {
  if (typeof document !== "undefined") {
    const documentWindowChrome =
      document.documentElement.dataset[WINDOW_CHROME_DATA_ATTRIBUTE];

    if (typeof documentWindowChrome === "string") {
      return normalizeWindowChromeMode(documentWindowChrome);
    }
  }

  if (typeof window === "undefined") {
    return "custom";
  }

  const litgitWindow = Reflect.get(window, "__LITGIT__") as
    | { windowChrome?: string }
    | undefined;

  return normalizeWindowChromeMode(litgitWindow?.windowChrome ?? "custom");
};

export const shouldUseWindowTitlebar = () => {
  const windowChromeMode = getRuntimeWindowChromeMode();

  return (
    windowChromeMode === "custom" ||
    windowChromeMode === "overlay-native-controls"
  );
};
