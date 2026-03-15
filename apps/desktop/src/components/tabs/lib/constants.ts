// Group color palette — preset colors for tab groups
export const GROUP_COLORS = [
  "#ef4444", // red-500
  "#f59e0b", // amber-500
  "#22c55e", // green-500
  "#3b82f6", // blue-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#f97316", // orange-500
] as const;

// Maximum number of closed tabs to remember for reopen
export const MAX_CLOSED_TAB_HISTORY = 10;

// Maximum number of tabs to show in drag preview
export const MAX_DRAG_PREVIEW_TABS = 3;

// Default title for new/empty tabs
export const DEFAULT_TAB_TITLE = "New Tab";

// Default name for new tab groups
export const DEFAULT_GROUP_NAME = "Untitled Group";

// Pick the next available group color not currently in use
export function getNextGroupColor(
  existingGroups: Array<{ color: string }>
): string {
  const usedColors = new Set(existingGroups.map((g) => g.color));

  for (const color of GROUP_COLORS) {
    if (!usedColors.has(color)) {
      return color;
    }
  }

  // All colors in use — cycle back to first
  return GROUP_COLORS[0];
}
