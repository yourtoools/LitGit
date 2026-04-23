import { Button } from "@litgit/ui/components/button";
import {
  Combobox,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@litgit/ui/components/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@litgit/ui/components/dialog";
import { Input } from "@litgit/ui/components/input";
import { Label } from "@litgit/ui/components/label";
import { useWindowEvent } from "@mantine/hooks";
import { FileIcon, GitBranchIcon, XIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { isTauri } from "@tauri-apps/api/core";
import { useTheme } from "next-themes";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { renderHeaderTabsCommandIcon } from "@/components/shell/header-tabs-search-icons";
import {
  type HeaderTabsCommandPaletteItem,
  type HeaderTabsSearchTabItem,
  searchHeaderTabsPalette,
} from "@/components/shell/header-tabs-search-search";
import { UngroupConfirmDialog } from "@/components/tabs/ungroup-confirm-dialog";
import { RepositoryCloneDialog } from "@/components/views/repository-clone-dialog";
import { RepositoryStartLocalDialog } from "@/components/views/repository-start-local-dialog";
import { useOpenRepositoryTabRouting } from "@/hooks/tabs/use-open-repository-tab-routing";
import { useTabUrlState } from "@/hooks/tabs/use-tab-url-state";
import { useUngroupConfirmation } from "@/hooks/tabs/use-ungroup-confirmation";
import {
  COMBOBOX_DEBOUNCE_DELAY_MS,
  normalizeComboboxQuery,
  useDebouncedValue,
} from "@/hooks/use-debounced-value";
import { useLauncherActions } from "@/hooks/use-launcher-actions";
import {
  getChangeRepositoryShortcutKeys,
  getCloseTabShortcutLabel,
  getNewTabShortcutLabel,
  getNextTabShortcutLabel,
  getOpenRepositoryShortcutLabel,
  getPreviousTabShortcutLabel,
  getReopenClosedTabShortcutLabel,
  getSearchTabsShortcutLabel,
  getToggleTerminalShortcutLabel,
  isCommandPaletteShortcut,
  isEditableTarget,
  isSearchTabsShortcut,
} from "@/lib/keyboard-shortcuts";
import {
  type ExternalLauncherApp,
  getLauncherApplications,
  openPathWithApplication,
} from "@/lib/tauri-settings-client";
import { createWorkerClient } from "@/lib/workers/create-worker-client";
import { runWorkerTask } from "@/lib/workers/run-worker-task";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import { useRootActiveRepoContext } from "@/stores/repo/repo-root-selectors";
import {
  useRepoRedoDepth,
  useRepoRedoLabel,
  useRepoStashes,
  useRepoUndoDepth,
  useRepoUndoLabel,
  useRepoWorkingTreeItems,
} from "@/stores/repo/repo-selectors";
import { useRepoStore } from "@/stores/repo/use-repo-store";
import { useTabStore } from "@/stores/tabs/use-tab-store";
import { useTabSearchStore } from "@/stores/ui/use-tab-search-store";
import { useTerminalPanelStore } from "@/stores/ui/use-terminal-panel-store";

type PaletteItem = HeaderTabsCommandPaletteItem | HeaderTabsSearchTabItem;

const SCROLLBAR_CLASSES =
  "[scrollbar-color:color-mix(in_oklab,var(--color-muted-foreground)_55%,transparent)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/45 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2";

const isCommandItem = (
  item: PaletteItem
): item is HeaderTabsCommandPaletteItem => {
  return item.type === "command";
};

const shortcutLabelToKeys = (label: string) => {
  return label.split("+").map((item) => item.trim());
};

const ShortcutKeys = ({ keys }: { keys: string[] }) => {
  return (
    <div className="ml-3 flex shrink-0 items-center gap-1 self-center">
      {keys.map((key) => (
        <kbd
          className="rounded border border-border/70 bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase tracking-[0.12em]"
          key={key}
        >
          {key}
        </kbd>
      ))}
    </div>
  );
};

export function HeaderTabsSearch() {
  const { resolvedTheme } = useTheme();
  const navigate = useNavigate();
  const tauriRuntime = isTauri();
  const isOpen = useTabSearchStore((state) => state.isOpen);
  const mode = useTabSearchStore((state) => state.mode);
  const openSearch = useTabSearchStore((state) => state.open);
  const toggleSearch = useTabSearchStore((state) => state.toggle);
  const setSearchMode = useTabSearchStore((state) => state.setMode);
  const closeSearch = useTabSearchStore((state) => state.close);
  const [query, setQuery] = useState("");
  const wasOpenRef = useRef(isOpen);
  const ignoredSelectedInputValueRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
    } else if (!wasOpenRef.current && mode === "commands") {
      setQuery((currentQuery) =>
        currentQuery.length === 0 ? ">" : currentQuery
      );
    }

    wasOpenRef.current = isOpen;
  }, [isOpen, mode]);

  const normalizedDebouncedQuery = useDebouncedValue(
    query,
    COMBOBOX_DEBOUNCE_DELAY_MS,
    normalizeComboboxQuery
  );
  const isCommandMode = query.startsWith(">");
  const normalizedCommandQuery = useMemo(() => {
    if (!normalizedDebouncedQuery.startsWith(">")) {
      return normalizedDebouncedQuery;
    }

    return normalizeComboboxQuery(normalizedDebouncedQuery.slice(1));
  }, [normalizedDebouncedQuery]);
  const tabs = useTabStore((state) => state.tabs);
  const groups = useTabStore((state) => state.groups);
  const closedTabHistory = useTabStore((state) => state.closedTabHistory);
  const activeTabId = useTabStore((state) => state.activeTabId);
  const closeTab = useTabStore((state) => state.closeTab);
  const removeTabFromGroup = useTabStore((state) => state.removeTabFromGroup);
  const moveTab = useTabStore((state) => state.moveTab);
  const reopenClosedTab = useTabStore((state) => state.reopenClosedTab);
  const ungroup = useTabStore((state) => state.ungroup);
  const { setActiveTabFromUrl } = useTabUrlState();
  const { routeRepository } = useOpenRepositoryTabRouting();
  const addTab = useTabStore((state) => state.addTab);
  const resetSettingsSearch = usePreferencesStore(
    (state) => state.resetSettingsSearch
  );
  const setSettingsSection = usePreferencesStore((state) => state.setSection);
  const pullBranch = useRepoStore((state) => state.pullBranch);
  const popStash = useRepoStore((state) => state.popStash);
  const pushBranch = useRepoStore((state) => state.pushBranch);
  const redoRepoAction = useRepoStore((state) => state.redoRepoAction);
  const undoRepoAction = useRepoStore((state) => state.undoRepoAction);
  const createStash = useRepoStore((state) => state.createStash);
  const createBranch = useRepoStore((state) => state.createBranch);
  const { activeRepo, activeRepoId } = useRootActiveRepoContext();
  const [launcherApplications, setLauncherApplications] = useState<
    ExternalLauncherApp[]
  >([]);
  const [branchName, setBranchName] = useState("");
  const [branchNameError, setBranchNameError] = useState<string | null>(null);
  const [isBranchDialogOpen, setIsBranchDialogOpen] = useState(false);
  const [isCreateLocalDialogOpen, setIsCreateLocalDialogOpen] = useState(false);
  const stashes = useRepoStashes(activeRepoId);
  const workingTreeItems = useRepoWorkingTreeItems(activeRepoId);
  const undoDepth = useRepoUndoDepth(activeRepoId);
  const redoDepth = useRepoRedoDepth(activeRepoId);
  const undoLabel = useRepoUndoLabel(activeRepoId);
  const redoLabel = useRepoRedoLabel(activeRepoId);
  const canCreateStash = workingTreeItems.length > 0;
  const canPopCurrentStash = stashes.length > 0;
  let stashDescription = "There are no working tree changes to stash.";

  if (activeRepoId === null) {
    stashDescription = "Open a repository first to stash current changes.";
  } else if (canCreateStash && activeRepo) {
    stashDescription = `Stash current changes in ${activeRepo.name}.`;
  }
  const isTerminalPanelOpen = useTerminalPanelStore((state) => state.isOpen);
  const toggleTerminalPanel = useTerminalPanelStore((state) => state.toggle);
  const {
    handleOpenCloneDialog,
    handleOpenRepository,
    isCloneDialogOpen,
    setIsCloneDialogOpen,
  } = useLauncherActions();

  useEffect(() => {
    if (!tauriRuntime) {
      return;
    }

    let isDisposed = false;

    const loadLauncherApplications = async () => {
      try {
        const nextApplications = await getLauncherApplications();

        if (!isDisposed) {
          setLauncherApplications(nextApplications);
        }
      } catch {
        if (!isDisposed) {
          setLauncherApplications([]);
        }
      }
    };

    loadLauncherApplications().catch(() => undefined);

    return () => {
      isDisposed = true;
    };
  }, [tauriRuntime]);

  useEffect(() => {
    if (!isBranchDialogOpen) {
      setBranchName("");
      setBranchNameError(null);
    }
  }, [isBranchDialogOpen]);

  const {
    dialogContent,
    pendingUngroupTabDetails,
    clearPendingUngroup,
    requestCloseTab,
    confirmUngroupLastTab,
  } = useUngroupConfirmation({
    tabs,
    groups,
    getGroupTabCount: (groupId) =>
      tabs.filter((tab) => tab.groupId === groupId).length,
    closeTab,
    removeTabFromGroup,
    moveTab,
    ungroup,
  });

  const latestStashRef =
    stashes.find((stash) => stash.ref === "stash@{0}")?.ref ?? stashes[0]?.ref;
  const activeTabIndex = tabs.findIndex((tab) => tab.id === activeTabId);
  const nextTab =
    activeTabIndex >= 0 && tabs.length > 1
      ? tabs[(activeTabIndex + 1) % tabs.length]
      : null;
  const previousTab =
    activeTabIndex >= 0 && tabs.length > 1
      ? tabs[(activeTabIndex - 1 + tabs.length) % tabs.length]
      : null;

  const settingsCommands = useMemo<HeaderTabsCommandPaletteItem[]>(() => {
    return [
      {
        description: "Open workspace settings.",
        disabled: false,
        group: "Settings",
        id: "open-settings",
        keywords: ["preferences", "settings", "workspace"],
        label: "Open Settings",
        type: "command",
      },
      {
        description: "Open the General settings section.",
        disabled: false,
        group: "Settings",
        id: "settings:general",
        keywords: ["general", "settings", "preferences"],
        label: "Settings: General",
        type: "command",
      },
      {
        description: "Open the Git settings section.",
        disabled: false,
        group: "Settings",
        id: "settings:git",
        keywords: ["git", "settings", "preferences"],
        label: "Settings: Git",
        type: "command",
      },
      {
        description: "Open the SSH settings section.",
        disabled: false,
        group: "Settings",
        id: "settings:ssh",
        keywords: ["ssh", "settings", "preferences"],
        label: "Settings: SSH",
        type: "command",
      },
      {
        description: "Open the UI settings section.",
        disabled: false,
        group: "Settings",
        id: "settings:ui",
        keywords: ["ui", "theme", "settings", "preferences"],
        label: "Settings: UI",
        type: "command",
      },
      {
        description: "Open the Editor settings section.",
        disabled: false,
        group: "Settings",
        id: "settings:editor",
        keywords: ["editor", "settings", "preferences"],
        label: "Settings: Editor",
        type: "command",
      },
      {
        description: "Open the Terminal settings section.",
        disabled: false,
        group: "Settings",
        id: "settings:terminal",
        keywords: ["terminal", "settings", "preferences"],
        label: "Settings: Terminal",
        type: "command",
      },
      {
        description: "Open the Network settings section.",
        disabled: false,
        group: "Settings",
        id: "settings:network",
        keywords: ["network", "proxy", "settings", "preferences"],
        label: "Settings: Network",
        type: "command",
      },
      {
        description: "Open the AI settings section.",
        disabled: false,
        group: "Settings",
        id: "settings:ai",
        keywords: ["ai", "model", "settings", "preferences"],
        label: "Settings: AI",
        type: "command",
      },
    ];
  }, []);

  const launcherCommands =
    launcherApplications.map<HeaderTabsCommandPaletteItem>((application) => ({
      description: activeRepo
        ? `Open ${activeRepo.name} with ${application.label}.`
        : `Open the active repository with ${application.label}.`,
      disabled: activeRepoId === null,
      group: "Open With",
      id: `open-with:${application.id}`,
      keywords: [
        "external",
        "launcher",
        "open",
        "path",
        "repository",
        application.label.toLowerCase(),
      ],
      label: `Open With: ${application.label}`,
      type: "command",
    }));

  const commands = useMemo<HeaderTabsCommandPaletteItem[]>(() => {
    return [
      {
        description: "Create a fresh empty tab.",
        disabled: false,
        group: "Tabs",
        id: "new-tab",
        keywords: ["new", "tab", "create", "workspace"],
        label: "New Tab",
        shortcuts: shortcutLabelToKeys(getNewTabShortcutLabel()),
        type: "command",
      },
      {
        description: activeTabId
          ? "Close the active tab."
          : "There is no active tab to close.",
        disabled: activeTabId === null,
        group: "Tabs",
        id: "close-tab",
        keywords: ["close", "remove", "tab", "active"],
        label: "Close Tab",
        shortcuts: shortcutLabelToKeys(getCloseTabShortcutLabel()),
        type: "command",
      },
      {
        description:
          closedTabHistory.length > 0
            ? "Restore the most recently closed tab."
            : "There are no recently closed tabs to reopen.",
        disabled: closedTabHistory.length === 0,
        group: "Tabs",
        id: "reopen-tab",
        keywords: ["closed", "history", "reopen", "restore", "tab"],
        label: "Reopen Closed Tab",
        shortcuts: shortcutLabelToKeys(getReopenClosedTabShortcutLabel()),
        type: "command",
      },
      {
        description: nextTab
          ? `Switch to ${nextTab.title}.`
          : "Open at least two tabs to switch to the next tab.",
        disabled: nextTab === null,
        group: "Tabs",
        id: "next-tab",
        keywords: ["cycle", "forward", "next", "switch", "tab"],
        label: "Next Tab",
        shortcuts: shortcutLabelToKeys(getNextTabShortcutLabel()),
        type: "command",
      },
      {
        description: previousTab
          ? `Switch to ${previousTab.title}.`
          : "Open at least two tabs to switch to the previous tab.",
        disabled: previousTab === null,
        group: "Tabs",
        id: "previous-tab",
        keywords: ["backward", "cycle", "previous", "switch", "tab"],
        label: "Previous Tab",
        shortcuts: shortcutLabelToKeys(getPreviousTabShortcutLabel()),
        type: "command",
      },
      {
        description: "Switch back to tab search mode.",
        disabled: false,
        group: "Tabs",
        id: "search-tabs",
        keywords: ["find", "search", "switch", "tab"],
        label: "Search Tabs",
        shortcuts: shortcutLabelToKeys(getSearchTabsShortcutLabel()),
        type: "command",
      },
      {
        description: isTerminalPanelOpen
          ? "Hide the integrated terminal panel."
          : "Show the integrated terminal panel.",
        disabled: false,
        group: "Workspace",
        id: "toggle-terminal",
        keywords: ["console", "footer", "shell", "terminal", "toggle"],
        label: isTerminalPanelOpen ? "Hide Terminal" : "Open Terminal",
        shortcuts: shortcutLabelToKeys(getToggleTerminalShortcutLabel()),
        type: "command",
      },
      {
        description: "Open the repository picker.",
        disabled: false,
        group: "Repository",
        id: "change-repository",
        keywords: ["change", "open", "picker", "repo", "repository", "switch"],
        label: "Change Repository",
        shortcuts: getChangeRepositoryShortcutKeys(),
        type: "command",
      },
      {
        description: "Pick a local repository and open it in the current tab.",
        disabled: false,
        group: "Repository",
        id: "open-repository",
        keywords: ["folder", "open", "repository", "repo"],
        label: "Open Repository",
        shortcuts: shortcutLabelToKeys(getOpenRepositoryShortcutLabel()),
        type: "command",
      },
      {
        description: "Create a new local repository.",
        disabled: false,
        group: "Repository",
        id: "create-local-repository",
        keywords: [
          "create",
          "git",
          "initialize",
          "local",
          "repository",
          "repo",
        ],
        label: "Create Local Repository",
        type: "command",
      },
      {
        description: activeRepo
          ? `Create and switch to a new branch in ${activeRepo.name}.`
          : "Open a repository first to create a branch.",
        disabled: activeRepoId === null,
        group: "Git",
        id: "create-branch",
        keywords: ["branch", "create", "git", "new", "switch"],
        label: "Create Branch",
        type: "command",
      },
      {
        description: "Clone a remote repository into a new local folder.",
        disabled: false,
        group: "Repository",
        id: "clone-repository",
        keywords: ["clone", "download", "git", "repository", "repo"],
        label: "Clone Repository",
        type: "command",
      },
      {
        description:
          undoDepth > 0
            ? `Undo the last repository action${undoLabel ? `: ${undoLabel}` : "."}`
            : "There is no repository action to undo.",
        disabled: activeRepoId === null || undoDepth === 0,
        group: "Git",
        id: "undo-repo-action",
        keywords: ["git", "history", "repo", "revert", "undo"],
        label: undoLabel ? `Undo ${undoLabel}` : "Undo",
        type: "command",
      },
      {
        description:
          redoDepth > 0
            ? `Redo the last repository action${redoLabel ? `: ${redoLabel}` : "."}`
            : "There is no repository action to redo.",
        disabled: activeRepoId === null || redoDepth === 0,
        group: "Git",
        id: "redo-repo-action",
        keywords: ["git", "history", "redo", "repo", "repeat"],
        label: redoLabel ? `Redo ${redoLabel}` : "Redo",
        type: "command",
      },
      {
        description: activeRepo
          ? `Pull ${activeRepo.name} with fast-forward if possible.`
          : "Open a repository first to pull remote changes.",
        disabled: activeRepoId === null,
        group: "Git",
        id: "pull",
        keywords: ["fetch", "git", "pull", "remote", "sync"],
        label: "Pull",
        type: "command",
      },
      {
        description: activeRepo
          ? `Fetch all remotes for ${activeRepo.name}.`
          : "Open a repository first to fetch all remotes.",
        disabled: activeRepoId === null,
        group: "Git",
        id: "pull-fetch-all",
        keywords: ["fetch", "git", "pull", "all", "remote"],
        label: "Fetch All",
        type: "command",
      },
      {
        description: activeRepo
          ? `Pull ${activeRepo.name} with fast-forward only.`
          : "Open a repository first to run fast-forward only pull.",
        disabled: activeRepoId === null,
        group: "Git",
        id: "pull-ff-only",
        keywords: ["pull", "git", "fast-forward", "ff-only"],
        label: "Pull (fast-forward only)",
        type: "command",
      },
      {
        description: activeRepo
          ? `Pull ${activeRepo.name} with rebase.`
          : "Open a repository first to run pull with rebase.",
        disabled: activeRepoId === null,
        group: "Git",
        id: "pull-rebase",
        keywords: ["pull", "git", "rebase"],
        label: "Pull (rebase)",
        type: "command",
      },
      {
        description: activeRepo
          ? `Push the current branch for ${activeRepo.name}.`
          : "Open a repository first to push the current branch.",
        disabled: activeRepoId === null,
        group: "Git",
        id: "push",
        keywords: ["branch", "git", "publish", "push", "remote"],
        label: "Push",
        type: "command",
      },
      {
        description: latestStashRef
          ? `Pop the latest stash (${latestStashRef}) into the active repository.`
          : "The active repository has no stash entries to pop.",
        disabled: activeRepoId === null || !canPopCurrentStash,
        group: "Git",
        id: "pop-stash",
        keywords: ["git", "pop", "stash", "unstash"],
        label: "Pop Stash",
        type: "command",
      },
      {
        description: stashDescription,
        disabled: activeRepoId === null || !canCreateStash,
        group: "Git",
        id: "stash-changes",
        keywords: ["git", "save", "stash", "changes", "wip"],
        label: "Stash Changes",
        type: "command",
      },
      {
        description: activeRepo
          ? `Copy the path for ${activeRepo.name}.`
          : "Open a repository first to copy its path.",
        disabled: activeRepo?.path === undefined,
        group: "Repository",
        id: "copy-repo-path",
        keywords: ["copy", "path", "repo", "repository"],
        label: "Copy Repository Path",
        type: "command",
      },
      ...launcherCommands,
      ...settingsCommands,
    ];
  }, [
    activeRepo,
    activeRepoId,
    activeTabId,
    closedTabHistory.length,
    isTerminalPanelOpen,
    launcherCommands,
    canCreateStash,
    canPopCurrentStash,
    latestStashRef,
    nextTab,
    previousTab,
    redoDepth,
    redoLabel,
    settingsCommands,
    stashDescription,
    undoDepth,
    undoLabel,
  ]);

  const parsedItems = useMemo(() => {
    const openItems: HeaderTabsSearchTabItem[] = tabs.map((tab) => ({
      groupId: tab.groupId,
      id: `open-${tab.id}`,
      repoId: tab.repoId,
      tabId: tab.id,
      title: tab.title,
      type: "open",
    }));

    const openRepoIds = new Set(
      openItems
        .filter((item) => item.repoId !== null)
        .map((item) => item.repoId)
    );
    const hasOpenNewTab = openItems.some((item) => item.repoId === null);

    const closedItems: HeaderTabsSearchTabItem[] = [];
    let hasClosedNewTab = false;
    const seenClosedRepoIds = new Set<string>();

    for (let i = 0; i < closedTabHistory.length; i++) {
      const historyItem = closedTabHistory[i];

      if (!historyItem) {
        continue;
      }

      if (historyItem.tab.repoId === null) {
        if (hasOpenNewTab || hasClosedNewTab) {
          continue;
        }

        hasClosedNewTab = true;
      } else {
        if (
          openRepoIds.has(historyItem.tab.repoId) ||
          seenClosedRepoIds.has(historyItem.tab.repoId)
        ) {
          continue;
        }

        seenClosedRepoIds.add(historyItem.tab.repoId);
      }

      closedItems.push({
        groupId: historyItem.tab.groupId,
        id: `closed-${historyItem.tab.id}-${i}`,
        repoId: historyItem.tab.repoId,
        tabId: historyItem.tab.id,
        title: historyItem.tab.title,
        type: "closed",
      });
    }

    return { closedItems, openItems };
  }, [closedTabHistory, tabs]);
  const searchWorkerClientRef = useRef<ReturnType<
    typeof createWorkerClient<
      Parameters<typeof searchHeaderTabsPalette>[0],
      ReturnType<typeof searchHeaderTabsPalette>
    >
  > | null>(null);
  const [searchResults, setSearchResults] = useState(() =>
    searchHeaderTabsPalette({
      closedItems: [],
      commands: [],
      normalizedCommandQuery: "",
      normalizedTabQuery: "",
      openItems: [],
    })
  );

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return;
    }

    try {
      const client = createWorkerClient<
        Parameters<typeof searchHeaderTabsPalette>[0],
        ReturnType<typeof searchHeaderTabsPalette>
      >(
        () =>
          new Worker(
            new URL("./header-tabs-search.worker.ts", import.meta.url),
            {
              type: "module",
            }
          ),
        { label: "header-tabs-search" }
      );
      searchWorkerClientRef.current = client;

      return () => {
        searchWorkerClientRef.current = null;
        client.dispose();
      };
    } catch {
      searchWorkerClientRef.current = null;
      return;
    }
  }, []);

  useEffect(() => {
    const nextInput = {
      closedItems: parsedItems.closedItems,
      commands,
      normalizedCommandQuery,
      normalizedTabQuery: normalizedDebouncedQuery,
      openItems: parsedItems.openItems,
    };
    const workerClient = searchWorkerClientRef.current;
    let cancelled = false;

    runWorkerTask(workerClient, nextInput, searchHeaderTabsPalette).then(
      (result) => {
        if (!cancelled) {
          setSearchResults(result);
        }
      },
      () => undefined
    );

    return () => {
      cancelled = true;
    };
  }, [commands, normalizedCommandQuery, normalizedDebouncedQuery, parsedItems]);

  const { commandGroups, filteredClosed, filteredCommands, filteredOpen } =
    searchResults;

  const hasResults = isCommandMode
    ? filteredCommands.length > 0
    : filteredOpen.length > 0 || filteredClosed.length > 0;

  useWindowEvent("keydown", (event) => {
    if (isOpen && event.key === "Escape") {
      event.preventDefault();
      closeSearch();
      return;
    }

    if (event.repeat || isEditableTarget(event.target)) {
      return;
    }

    if (isCommandPaletteShortcut(event)) {
      event.preventDefault();

      if (isOpen) {
        setSearchMode("commands");
        setQuery((currentQuery) =>
          currentQuery.startsWith(">") ? currentQuery : `>${currentQuery}`
        );
      } else {
        openSearch("commands");
      }

      return;
    }

    if (!isSearchTabsShortcut(event)) {
      return;
    }

    event.preventDefault();
    toggleSearch("tabs");
  });

  const runCommand = async (commandId: string) => {
    const openSettingsSection = async (
      section:
        | "ai"
        | "editor"
        | "general"
        | "git"
        | "network"
        | "ssh"
        | "terminal"
        | "ui"
    ) => {
      resetSettingsSearch();
      setSettingsSection(section);
      await navigate({ to: "/settings" });
    };

    switch (commandId) {
      case "new-tab": {
        const newId = addTab();
        setActiveTabFromUrl(newId);
        return;
      }
      case "close-tab": {
        if (!activeTabId) {
          return;
        }

        closeTab(activeTabId);
        return;
      }
      case "reopen-tab": {
        reopenClosedTab();
        return;
      }
      case "next-tab": {
        if (nextTab) {
          setActiveTabFromUrl(nextTab.id);
        }
        return;
      }
      case "previous-tab": {
        if (previousTab) {
          setActiveTabFromUrl(previousTab.id);
        }
        return;
      }
      case "search-tabs": {
        setQuery("");
        openSearch("tabs");
        return;
      }
      case "change-repository": {
        await handleOpenRepository();
        return;
      }
      case "clone-repository": {
        handleOpenCloneDialog();
        return;
      }
      case "create-local-repository": {
        setIsCreateLocalDialogOpen(true);
        return;
      }
      case "create-branch": {
        if (!((await ensureActiveRepoPage()) && activeRepoId)) {
          return;
        }

        setIsBranchDialogOpen(true);
        return;
      }
      case "open-repository": {
        await handleOpenRepository();
        return;
      }
      case "copy-repo-path": {
        if (!((await ensureActiveRepoPage()) && activeRepo?.path)) {
          return;
        }

        try {
          await navigator.clipboard.writeText(activeRepo.path);
          toast.success("Repository path copied");
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to copy repository path"
          );
        }
        return;
      }
      case "pull": {
        if (!((await ensureActiveRepoPage()) && activeRepoId)) {
          return;
        }

        await pullBranch(activeRepoId, "pull-ff-possible");
        return;
      }
      case "undo-repo-action": {
        if (!((await ensureActiveRepoPage()) && activeRepoId)) {
          return;
        }

        await undoRepoAction(activeRepoId);
        return;
      }
      case "redo-repo-action": {
        if (!((await ensureActiveRepoPage()) && activeRepoId)) {
          return;
        }

        await redoRepoAction(activeRepoId);
        return;
      }
      case "pull-fetch-all": {
        if (!((await ensureActiveRepoPage()) && activeRepoId)) {
          return;
        }

        await pullBranch(activeRepoId, "fetch-all");
        return;
      }
      case "pull-ff-only": {
        if (!((await ensureActiveRepoPage()) && activeRepoId)) {
          return;
        }

        await pullBranch(activeRepoId, "pull-ff-only");
        return;
      }
      case "pull-rebase": {
        if (!((await ensureActiveRepoPage()) && activeRepoId)) {
          return;
        }

        await pullBranch(activeRepoId, "pull-rebase");
        return;
      }
      case "push": {
        if (!((await ensureActiveRepoPage()) && activeRepoId)) {
          return;
        }

        await pushBranch(activeRepoId);
        return;
      }
      case "pop-stash": {
        if (
          !((await ensureActiveRepoPage()) && activeRepoId && latestStashRef)
        ) {
          return;
        }

        await popStash(activeRepoId, latestStashRef);
        return;
      }
      case "stash-changes": {
        if (!((await ensureActiveRepoPage()) && activeRepoId)) {
          return;
        }

        await createStash(activeRepoId, "", "");
        return;
      }
      case "toggle-terminal": {
        if (!(await ensureActiveRepoPage())) {
          return;
        }

        toggleTerminalPanel();
        return;
      }
      case "open-settings": {
        resetSettingsSearch();
        await navigate({ to: "/settings" });
        return;
      }
      case "settings:general": {
        await openSettingsSection("general");
        return;
      }
      case "settings:git": {
        await openSettingsSection("git");
        return;
      }
      case "settings:ssh": {
        await openSettingsSection("ssh");
        return;
      }
      case "settings:ui": {
        await openSettingsSection("ui");
        return;
      }
      case "settings:editor": {
        await openSettingsSection("editor");
        return;
      }
      case "settings:terminal": {
        await openSettingsSection("terminal");
        return;
      }
      case "settings:network": {
        await openSettingsSection("network");
        return;
      }
      case "settings:ai": {
        await openSettingsSection("ai");
        return;
      }
      default: {
        if (commandId.startsWith("open-with:")) {
          if (
            !(
              (await ensureActiveRepoPage()) &&
              activeRepo?.path &&
              tauriRuntime
            )
          ) {
            return;
          }

          const applicationId = commandId.slice("open-with:".length);
          await openPathWithApplication({
            application: applicationId as ExternalLauncherApp["id"],
            path: activeRepo.path,
          });
          return;
        }

        return;
      }
    }
  };

  const handleSelect = async (value: null | PaletteItem) => {
    if (!value) {
      return;
    }

    ignoredSelectedInputValueRef.current = isCommandItem(value)
      ? value.label
      : value.title;
    closeSearch();

    if (isCommandItem(value)) {
      await runCommand(value.id);
      return;
    }

    if (value.type === "open") {
      setActiveTabFromUrl(value.tabId);
      return;
    }

    if (value.repoId) {
      const existingOpen = tabs.find((tab) => tab.repoId === value.repoId);

      if (existingOpen) {
        setActiveTabFromUrl(existingOpen.id);
        return;
      }

      await routeRepository(value.repoId, value.title);
      return;
    }

    const newId = addTab();
    setActiveTabFromUrl(newId);
  };

  const handleCloseTab = (
    event: React.MouseEvent,
    item: HeaderTabsSearchTabItem
  ) => {
    event.stopPropagation();
    event.preventDefault();
    requestCloseTab(item.tabId);
  };

  const ensureActiveRepoPage = async () => {
    if (!(activeRepoId && activeRepo)) {
      return false;
    }

    await routeRepository(activeRepoId, activeRepo.name);
    return true;
  };

  const handleCreateBranch = async () => {
    if (!((await ensureActiveRepoPage()) && activeRepoId)) {
      return;
    }

    const trimmedBranchName = branchName.trim();

    if (trimmedBranchName.length === 0) {
      setBranchNameError("Enter a branch name.");
      return;
    }

    try {
      await createBranch(activeRepoId, trimmedBranchName);
      setIsBranchDialogOpen(false);
    } catch (error) {
      setBranchNameError(
        error instanceof Error ? error.message : "Failed to create branch"
      );
    }
  };

  return (
    <>
      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeSearch();
          }
        }}
        open={isOpen}
      >
        <DialogContent
          className="top-[10%] translate-y-0 gap-2 p-0 pb-2 sm:max-w-xl"
          showCloseButton={false}
        >
          <Combobox
            filter={null}
            inputValue={query}
            itemToStringLabel={(item: PaletteItem) =>
              isCommandItem(item) ? item.label : item.title
            }
            onInputValueChange={(nextInputValue) => {
              if (ignoredSelectedInputValueRef.current === nextInputValue) {
                ignoredSelectedInputValueRef.current = null;
                return;
              }

              ignoredSelectedInputValueRef.current = null;

              if (nextInputValue.startsWith(">")) {
                setSearchMode("commands");
                setQuery(nextInputValue);
                return;
              }

              setSearchMode("tabs");
              setQuery(nextInputValue);
            }}
            onValueChange={(value) => {
              handleSelect(value).catch(() => undefined);
            }}
          >
            <div className="border-b px-3 py-1.5">
              <ComboboxInput
                autoFocus
                className="flex h-7 w-full bg-transparent text-xs outline-hidden placeholder:text-muted-foreground"
                onKeyDown={(event) => {
                  if (event.key !== "Escape") {
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();
                  closeSearch();
                }}
                placeholder={
                  isCommandMode
                    ? "> Search commands by name, action, or shortcut"
                    : "Search tabs by title or shortcut, or start with > for commands"
                }
                showClear
                showTrigger={false}
              />
            </div>
            <ComboboxList
              className={`max-h-[min(40vh,320px)] overflow-x-hidden overflow-y-auto p-1 ${SCROLLBAR_CLASSES}`}
            >
              {!hasResults && (
                <div className="py-4 text-center text-muted-foreground text-xs">
                  {isCommandMode
                    ? "No matching commands found."
                    : "No matching tabs found."}
                </div>
              )}

              {isCommandMode ? (
                commandGroups.map(([group, items], index) => (
                  <div key={group}>
                    {index > 0 && <div className="-mx-1 my-0.5 h-px bg-border" />}
                    <ComboboxGroup>
                      <ComboboxLabel className="px-2 py-1 font-semibold text-[11px] text-muted-foreground">
                        {group}
                      </ComboboxLabel>
                      {items.map((item) => (
                        <ComboboxItem
                          className="relative flex w-full cursor-default select-none items-start gap-2 px-2 py-1.5 text-xs outline-hidden data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50"
                          disabled={item.disabled}
                          key={item.id}
                          value={item}
                        >
                          {renderHeaderTabsCommandIcon(item.id, resolvedTheme)}
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                              {item.label}
                            </div>
                            <div className="line-clamp-2 text-[11px] text-muted-foreground group-data-highlighted:text-accent-foreground/80">
                              {item.description}
                            </div>
                          </div>
                          {item.shortcuts ? (
                            <ShortcutKeys keys={item.shortcuts} />
                          ) : null}
                        </ComboboxItem>
                      ))}
                    </ComboboxGroup>
                  </div>
                ))
              ) : (
                <>
                  {filteredOpen.length > 0 && (
                    <ComboboxGroup>
                      <ComboboxLabel className="px-2 py-1 font-semibold text-[11px] text-muted-foreground">
                        Open Tabs
                      </ComboboxLabel>
                      {filteredOpen.map((item) => (
                        <ComboboxItem
                          className="group/tab-item relative flex w-full cursor-default select-none items-center px-2 py-1 text-xs outline-hidden data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50"
                          key={item.id}
                          value={item}
                        >
                          {item.repoId ? (
                            <GitBranchIcon className="mr-2 size-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <FileIcon className="mr-2 size-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <span className="flex-1 truncate">{item.title}</span>
                          <button
                            aria-label={`Close ${item.title}`}
                            className="focus-visible:desktop-focus-strong ml-auto flex size-5 shrink-0 items-center justify-center opacity-0 transition-opacity hover:bg-muted focus-visible:opacity-100 group-data-highlighted/tab-item:opacity-100"
                            onClick={(event) => handleCloseTab(event, item)}
                            type="button"
                          >
                            <XIcon className="size-3 text-muted-foreground" />
                          </button>
                        </ComboboxItem>
                      ))}
                    </ComboboxGroup>
                  )}

                  {filteredClosed.length > 0 && (
                    <>
                      {filteredOpen.length > 0 && (
                        <div className="-mx-1 my-0.5 h-px bg-border" />
                      )}
                      <ComboboxGroup>
                        <ComboboxLabel className="px-2 py-1 font-semibold text-[11px] text-muted-foreground">
                          Closed Recently
                        </ComboboxLabel>
                        {filteredClosed.map((item) => (
                          <ComboboxItem
                            className="relative flex w-full cursor-default select-none items-center px-2 py-1 text-xs outline-hidden data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50"
                            key={item.id}
                            value={item}
                          >
                            {item.repoId ? (
                              <GitBranchIcon className="mr-2 size-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <FileIcon className="mr-2 size-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="flex-1 truncate">{item.title}</span>
                            <div className="ml-auto size-5 shrink-0" />
                          </ComboboxItem>
                        ))}
                      </ComboboxGroup>
                    </>
                  )}
                </>
              )}
            </ComboboxList>
          </Combobox>
        </DialogContent>
      </Dialog>

      <RepositoryCloneDialog
        onOpenChange={setIsCloneDialogOpen}
        open={isCloneDialogOpen}
      />

      <RepositoryStartLocalDialog
        onOpenChange={setIsCreateLocalDialogOpen}
        open={isCreateLocalDialogOpen}
      />

      <Dialog onOpenChange={setIsBranchDialogOpen} open={isBranchDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Branch</DialogTitle>
            <DialogDescription>
              Create and switch to a new branch in the active repository.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="command-palette-branch-name">Branch name</Label>
            <Input
              autoFocus
              id="command-palette-branch-name"
              onChange={(event) => {
                setBranchName(event.target.value);
                if (branchNameError) {
                  setBranchNameError(null);
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") {
                  return;
                }

                event.preventDefault();
                handleCreateBranch().catch(() => undefined);
              }}
              placeholder="feature/my-branch"
              value={branchName}
            />
            {branchNameError ? (
              <p className="text-destructive text-xs">{branchNameError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setIsBranchDialogOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                handleCreateBranch().catch(() => undefined);
              }}
              type="button"
            >
              Create Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UngroupConfirmDialog
        actionText={dialogContent.actionText}
        description={dialogContent.description}
        onConfirm={confirmUngroupLastTab}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            clearPendingUngroup();
          }
        }}
        open={Boolean(pendingUngroupTabDetails)}
        title={dialogContent.title}
      />
    </>
  );
}
