import { isMacPlatform, isWindowsPlatform } from "@/lib/runtime-platform";

interface ShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

export const getPrimaryModifierLabel = () => {
  return isMacPlatform() ? "Cmd" : "Ctrl";
};

export const getPrimaryModifierAriaKey = () => {
  return isMacPlatform() ? "Meta" : "Control";
};

export const getPrimaryShortcutLabel = (key: string) => {
  return `${getPrimaryModifierLabel()} + ${key.toUpperCase()}`;
};

export const getPrimaryShortcutAria = (key: string) => {
  return `${getPrimaryModifierAriaKey()}+${key.toUpperCase()}`;
};

export const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']")
  );
};

export const isPrimaryShortcut = (event: ShortcutEvent, key: string) => {
  const normalizedKey = key.toLowerCase();

  return (
    !(event.altKey || event.shiftKey) &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === normalizedKey
  );
};

export const isPrimaryAltShortcut = (event: ShortcutEvent, key: string) => {
  const normalizedKey = key.toLowerCase();

  return (
    !event.shiftKey &&
    event.altKey &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === normalizedKey
  );
};

export const isPrimaryShiftShortcut = (event: ShortcutEvent, key: string) => {
  const normalizedKey = key.toLowerCase();

  return (
    !event.altKey &&
    event.shiftKey &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === normalizedKey
  );
};

export const isShortcutHelpShortcut = (event: ShortcutEvent) => {
  return isPrimaryShortcut(event, "/");
};

export const isReopenClosedTabShortcut = (event: ShortcutEvent) => {
  return isPrimaryShiftShortcut(event, "t");
};

export const isCloseTabShortcut = (event: ShortcutEvent) => {
  return isPrimaryShortcut(event, "w");
};

export const isSearchTabsShortcut = (event: ShortcutEvent) => {
  return isPrimaryShortcut(event, "p");
};

export const isCommandPaletteShortcut = (event: ShortcutEvent) => {
  return isPrimaryShiftShortcut(event, "p");
};

export const isZoomInShortcut = (event: ShortcutEvent) => {
  const normalizedKey = event.key.toLowerCase();

  return (
    !event.altKey &&
    (event.metaKey || event.ctrlKey) &&
    (normalizedKey === "+" || normalizedKey === "=")
  );
};

export const isZoomOutShortcut = (event: ShortcutEvent) => {
  return (
    !(event.altKey || event.shiftKey) &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === "-"
  );
};

export const isResetZoomShortcut = (event: ShortcutEvent) => {
  return (
    !(event.altKey || event.shiftKey) &&
    (event.metaKey || event.ctrlKey) &&
    event.key === "0"
  );
};

export const isToggleTerminalShortcut = (event: ShortcutEvent) => {
  return (
    !(event.altKey || event.metaKey || event.shiftKey) &&
    event.ctrlKey &&
    (event.key === "`" || event.key === "~")
  );
};

export const isRepositoryRoutePath = (pathname: string) => {
  return pathname.startsWith("/repo/");
};

export const isOpenRepositoryChordStartShortcut = (event: ShortcutEvent) => {
  return isPrimaryShortcut(event, "k");
};

export const isOpenRepositoryChordEndShortcut = (event: ShortcutEvent) => {
  return !event.altKey && event.key.toLowerCase() === "o";
};

export const isNextTabShortcut = (event: ShortcutEvent) => {
  const isMac = isMacPlatform();
  const isWindows = isWindowsPlatform();

  if (isWindows) {
    return (
      !(event.altKey || event.shiftKey) && event.ctrlKey && event.key === "Tab"
    );
  }

  if (isMac) {
    return (
      !(event.altKey || event.shiftKey) &&
      event.metaKey &&
      event.key === "PageUp"
    );
  }

  return (
    !(event.altKey || event.shiftKey) && event.ctrlKey && event.key === "PageUp"
  );
};

export const isPreviousTabShortcut = (event: ShortcutEvent) => {
  const isMac = isMacPlatform();
  const isWindows = isWindowsPlatform();

  if (isWindows) {
    return (
      !event.altKey && event.shiftKey && event.ctrlKey && event.key === "Tab"
    );
  }

  if (isMac) {
    return (
      !event.altKey &&
      event.shiftKey &&
      event.metaKey &&
      event.key === "PageDown"
    );
  }

  return (
    !event.altKey && event.shiftKey && event.ctrlKey && event.key === "PageDown"
  );
};

export const getOpenRepositoryShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + O`;
};

export const getChangeRepositoryShortcutKeys = () => {
  return [getPrimaryModifierLabel(), "K", "O"];
};

export const getNewTabShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + T`;
};

export const getCloseTabShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + W`;
};

export const getSearchTabsShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + P`;
};

export const getCommandPaletteShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + Shift + P`;
};

export const getZoomInShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + +`;
};

export const getZoomOutShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + -`;
};

export const getResetZoomShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + 0`;
};

export const getToggleTerminalShortcutLabel = () => {
  return "Ctrl + `";
};

export const getSidebarFilterShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + Alt + F`;
};

export const getReopenClosedTabShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + Shift + T`;
};

export const getNextTabShortcutLabel = () => {
  if (isWindowsPlatform()) {
    return "Ctrl + Tab";
  }

  const modifier = getPrimaryModifierLabel();
  return `${modifier} + PageUp`;
};

export const getPreviousTabShortcutLabel = () => {
  if (isWindowsPlatform()) {
    return "Ctrl + Shift + Tab";
  }

  const modifier = getPrimaryModifierLabel();
  return `${modifier} + Shift + PageDown`;
};

export const getKeyboardShortcutsShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + /`;
};
