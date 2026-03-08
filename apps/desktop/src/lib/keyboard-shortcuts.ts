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

export const isShortcutHelpShortcut = (event: ShortcutEvent) => {
  return isPrimaryShortcut(event, "/");
};

export const isReopenClosedTabShortcut = (event: ShortcutEvent) => {
  const normalizedKey = event.key.toLowerCase();

  return (
    !event.altKey &&
    event.shiftKey &&
    (event.metaKey || event.ctrlKey) &&
    normalizedKey === "t"
  );
};

export const getOpenRepositoryShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + O`;
};

export const getNewTabShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + T`;
};

export const getReopenClosedTabShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + Shift + T`;
};

export const getKeyboardShortcutsShortcutLabel = () => {
  return `${getPrimaryModifierLabel()} + /`;
};
