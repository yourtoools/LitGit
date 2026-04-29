import { matchSorter } from "match-sorter";

export interface HeaderTabsSearchTabItem {
  groupId: string | null;
  id: string;
  repoId: string | null;
  tabId: string;
  title: string;
  type: "closed" | "open";
}

export interface HeaderTabsCommandPaletteItem {
  description: string;
  disabled: boolean;
  group: string;
  id: string;
  keywords: string[];
  label: string;
  shortcuts?: string[];
  type: "command";
}

export interface SearchHeaderTabsPaletteInput {
  closedItems: HeaderTabsSearchTabItem[];
  commands: HeaderTabsCommandPaletteItem[];
  normalizedCommandQuery: string;
  normalizedTabQuery: string;
  openItems: HeaderTabsSearchTabItem[];
}

export interface SearchHeaderTabsPaletteOutput {
  commandGroups: [string, HeaderTabsCommandPaletteItem[]][];
  filteredClosed: HeaderTabsSearchTabItem[];
  filteredCommands: HeaderTabsCommandPaletteItem[];
  filteredOpen: HeaderTabsSearchTabItem[];
}

function groupCommands(
  commands: HeaderTabsCommandPaletteItem[]
): [string, HeaderTabsCommandPaletteItem[]][] {
  const groupedCommands = new Map<string, HeaderTabsCommandPaletteItem[]>();

  for (const command of commands) {
    const currentGroup = groupedCommands.get(command.group) ?? [];
    currentGroup.push(command);
    groupedCommands.set(command.group, currentGroup);
  }

  return Array.from(groupedCommands.entries());
}

export function searchHeaderTabsPalette(
  input: SearchHeaderTabsPaletteInput
): SearchHeaderTabsPaletteOutput {
  const {
    closedItems,
    commands,
    normalizedCommandQuery,
    normalizedTabQuery,
    openItems,
  } = input;
  const filteredOpen =
    normalizedTabQuery.length === 0
      ? openItems
      : matchSorter(openItems, normalizedTabQuery, {
          keys: ["title"],
        });
  const filteredClosed =
    normalizedTabQuery.length === 0
      ? closedItems
      : matchSorter(closedItems, normalizedTabQuery, {
          keys: ["title"],
        });
  const filteredCommands =
    normalizedCommandQuery.length === 0
      ? commands
      : matchSorter(commands, normalizedCommandQuery, {
          keys: [
            "label",
            "description",
            "group",
            (command) => command.keywords,
            (command) => command.shortcuts ?? [],
            (command) =>
              command.shortcuts
                ? [
                    command.shortcuts.join(" "),
                    command.shortcuts.join("+"),
                    command.shortcuts.join(" + "),
                  ]
                : [],
          ],
        });

  return {
    commandGroups: groupCommands(filteredCommands),
    filteredClosed,
    filteredCommands,
    filteredOpen,
  };
}
