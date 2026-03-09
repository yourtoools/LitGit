interface ShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

const MAC_PLATFORM_PATTERN = /Mac|iPhone|iPad|iPod/i;

export const isMacPlatform = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  const platform = navigator.platform || navigator.userAgent;
  return MAC_PLATFORM_PATTERN.test(platform);
};

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

export const isOpenRepositoryChordStartShortcut = (event: ShortcutEvent) => {
  return isPrimaryShortcut(event, "k");
};

export const isOpenRepositoryChordEndShortcut = (event: ShortcutEvent) => {
  return !event.altKey && event.key.toLowerCase() === "o";
};

export const isNextTabShortcut = (event: ShortcutEvent) => {
  return (
    !(event.altKey || event.shiftKey) &&
    (event.metaKey || event.ctrlKey) &&
    event.key === "Tab"
  );
};

export const isPreviousTabShortcut = (event: ShortcutEvent) => {
  return (
    !event.altKey &&
    event.shiftKey &&
    (event.metaKey || event.ctrlKey) &&
    event.key === "Tab"
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

export const getZoomInShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + +`;
};

export const getZoomOutShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + -`;
};

export const getSidebarFilterShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + Alt + F`;
};

export const getReopenClosedTabShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + Shift + T`;
};

export const getNextTabShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + Tab`;
};

export const getPreviousTabShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + Shift + Tab`;
};
export const getKeyboardShortcutsShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + /`;
};
