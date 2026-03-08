interface PrimaryShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

const MAC_PLATFORM_PATTERN = /Mac|iPhone|iPad|iPod/i;

const isMacPlatform = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  const platform = navigator.platform || navigator.userAgent;
  return MAC_PLATFORM_PATTERN.test(platform);
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

export const isPrimaryShortcut = (event: PrimaryShortcutEvent, key: string) => {
  const normalizedKey = key.toLowerCase();

  return (
    !(event.altKey || event.shiftKey) &&
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === normalizedKey
  );
};

interface SecondaryShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

export const isReopenClosedTabShortcut = (event: SecondaryShortcutEvent) => {
  const normalizedKey = event.key.toLowerCase();

  return (
    !event.altKey &&
    event.shiftKey &&
    (event.metaKey || event.ctrlKey) &&
    normalizedKey === "t"
  );
};

export const getReopenClosedTabShortcutLabel = () => {
  const modifier = isMacPlatform() ? "Cmd" : "Ctrl";
  return `${modifier} + Shift + T`;
};
