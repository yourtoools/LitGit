import { Button } from "@litgit/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@litgit/ui/components/combobox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@litgit/ui/components/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@litgit/ui/components/dropdown-menu";
import { Input } from "@litgit/ui/components/input";
import { InputGroup, InputGroupAddon } from "@litgit/ui/components/input-group";
import { Label } from "@litgit/ui/components/label";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@litgit/ui/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { cn } from "@litgit/ui/lib/utils";
import {
  ArrowBendRightUpIcon,
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CaretDownIcon,
  CaretRightIcon,
  CircleIcon,
  DotOutlineIcon,
  DotsThreeVerticalIcon,
  DownloadSimpleIcon,
  GitBranchIcon,
  GithubLogoIcon,
  PencilSimpleIcon,
  SpinnerGapIcon,
  StackSimpleIcon,
  TagIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useSearch } from "@tanstack/react-router";
import {
  type ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { IntegratedTerminalPanel } from "@/components/terminal/integrated-terminal-panel";
import type {
  PullActionMode,
  RepositoryCommit,
  RepositoryStash,
  RepositoryWorkingTreeItem,
} from "@/stores/repo/repo-store-types";
import { useRepoStore } from "@/stores/repo/use-repo-store";
import { useTerminalPanelStore } from "@/stores/ui/use-terminal-panel-store";

interface SidebarEntry {
  active?: boolean;
  name: string;
  pendingPushCount?: number;
  pendingSyncCount?: number;
  searchName: string;
  stashRef?: string;
  type: "branch" | "stash" | "tag";
}

interface SidebarGroupItem {
  count: number;
  entries: SidebarEntry[];
  key: string;
  name: string;
}

interface BranchComboboxOption {
  isRemote: boolean;
  name: string;
}

interface ChangeTreeNode {
  children: Map<string, ChangeTreeNode>;
  fullPath: string;
  item: RepositoryWorkingTreeItem | null;
  name: string;
}

type ChangesViewMode = "path" | "tree";

const GIT_STATUS_STYLE_BY_CODE: Record<
  string,
  { className: string; label: string; short: string }
> = {
  A: {
    className: "text-emerald-500 dark:text-emerald-400",
    label: "Added",
    short: "+",
  },
  C: {
    className: "text-sky-500 dark:text-sky-400",
    label: "Copied",
    short: "C",
  },
  D: {
    className: "text-rose-500 dark:text-rose-400",
    label: "Removed",
    short: "-",
  },
  M: {
    className: "text-amber-500 dark:text-amber-400",
    label: "Edited",
    short: "~",
  },
  R: {
    className: "text-indigo-500 dark:text-indigo-400",
    label: "Renamed",
    short: "R",
  },
  T: {
    className: "text-cyan-500 dark:text-cyan-400",
    label: "Type",
    short: "T",
  },
  U: {
    className: "text-orange-500 dark:text-orange-400",
    label: "Conflict",
    short: "!",
  },
  "?": {
    className: "text-emerald-500 dark:text-emerald-400",
    label: "Added",
    short: "+",
  },
};

function getStatusDescriptor(code: string) {
  return GIT_STATUS_STYLE_BY_CODE[code] ?? null;
}

const TREE_STATUS_SUMMARY_ORDER = ["M", "A", "D", "R", "C", "U", "T", "?"];

function createEmptyTreeNode(name: string, fullPath: string): ChangeTreeNode {
  return {
    children: new Map<string, ChangeTreeNode>(),
    fullPath,
    item: null,
    name,
  };
}

function buildChangeTree(items: RepositoryWorkingTreeItem[]): ChangeTreeNode[] {
  const root = createEmptyTreeNode("", "");

  for (const item of items) {
    const normalizedPath = item.path.replaceAll("\\", "/");
    const segments = normalizedPath
      .split("/")
      .filter((segment) => segment.length > 0);

    let cursor = root;
    let segmentPath = "";

    for (const segment of segments) {
      segmentPath =
        segmentPath.length > 0 ? `${segmentPath}/${segment}` : segment;
      const existing = cursor.children.get(segment);

      if (existing) {
        cursor = existing;
        continue;
      }

      const nextNode = createEmptyTreeNode(segment, segmentPath);
      cursor.children.set(segment, nextNode);
      cursor = nextNode;
    }

    cursor.item = item;
  }

  const toSortedArray = (node: ChangeTreeNode): ChangeTreeNode[] =>
    Array.from(node.children.values())
      .map((childNode) => ({
        ...childNode,
        children: new Map(
          toSortedArray(childNode).map((entry) => [entry.name, entry])
        ),
      }))
      .sort((left, right) => {
        const leftIsFolder = left.item === null;
        const rightIsFolder = right.item === null;

        if (leftIsFolder !== rightIsFolder) {
          return leftIsFolder ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      });

  return toSortedArray(root);
}

const STASH_WITH_BRANCH_PATTERN = /^(?:WIP\s+on|On)\s+(.+?)(?::\s*(.*))?$/i;
const WORKING_TREE_ROW_ID = "__working_tree__";

function formatStashLabel(stash: RepositoryStash): string {
  const rawMessage = stash.message.trim();

  if (rawMessage.length === 0) {
    return stash.ref;
  }

  const parsedMessage = STASH_WITH_BRANCH_PATTERN.exec(rawMessage);

  if (!parsedMessage) {
    return rawMessage;
  }

  const branchName = parsedMessage[1]?.trim();
  const stashMessage = parsedMessage[2]?.trim();

  if (!branchName) {
    return rawMessage;
  }

  if (stashMessage && stashMessage.length > 0) {
    return `${stashMessage} on: ${branchName}`;
  }

  return rawMessage;
}
export function RepoInfo() {
  const activeRepoId = useRepoStore((state) => state.activeRepoId);
  const openedRepos = useRepoStore((state) => state.openedRepos);
  const repoCommits = useRepoStore((state) => state.repoCommits);
  const repoBranches = useRepoStore((state) => state.repoBranches);
  const repoStashes = useRepoStore((state) => state.repoStashes);
  const repoWorkingTreeItems = useRepoStore(
    (state) => state.repoWorkingTreeItems
  );
  const isLoadingHistory = useRepoStore((state) => state.isLoadingHistory);
  const switchBranch = useRepoStore((state) => state.switchBranch);
  const applyStash = useRepoStore((state) => state.applyStash);
  const popStash = useRepoStore((state) => state.popStash);
  const dropStash = useRepoStore((state) => state.dropStash);
  const addIgnoreRule = useRepoStore((state) => state.addIgnoreRule);
  const stageAll = useRepoStore((state) => state.stageAll);
  const unstageAll = useRepoStore((state) => state.unstageAll);
  const stageFile = useRepoStore((state) => state.stageFile);
  const unstageFile = useRepoStore((state) => state.unstageFile);
  const discardPathChanges = useRepoStore((state) => state.discardPathChanges);
  const commitChanges = useRepoStore((state) => state.commitChanges);
  const pullBranch = useRepoStore((state) => state.pullBranch);
  const pushBranch = useRepoStore((state) => state.pushBranch);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<
    Record<string, boolean>
  >({});
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);
  const [isStagingAll, setIsStagingAll] = useState(false);
  const [isUnstagingAll, setIsUnstagingAll] = useState(false);
  const [isUpdatingFilePath, setIsUpdatingFilePath] = useState<string | null>(
    null
  );
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isApplyingStash, setIsApplyingStash] = useState(false);
  const [isPoppingStash, setIsPoppingStash] = useState(false);
  const [isDroppingStash, setIsDroppingStash] = useState(false);
  const [draftCommitSummary, setDraftCommitSummary] = useState("");
  const [draftCommitDescription, setDraftCommitDescription] = useState("");
  const [amendPreviousCommit, setAmendPreviousCommit] = useState(false);
  const [changesViewMode, setChangesViewMode] =
    useState<ChangesViewMode>("tree");
  const [isUnstagedSectionCollapsed, setIsUnstagedSectionCollapsed] =
    useState(false);
  const [isStagedSectionCollapsed, setIsStagedSectionCollapsed] =
    useState(false);
  const [expandedTreeNodePaths, setExpandedTreeNodePaths] = useState<
    Record<string, boolean>
  >({});
  const [workingTreeWipInput, setWorkingTreeWipInput] = useState("");
  const [pullActionMode, setPullActionMode] =
    useState<PullActionMode>("pull-ff-possible");
  const [openEntryMenuKey, setOpenEntryMenuKey] = useState<string | null>(null);
  const pullActionLabelByMode: Record<PullActionMode, string> = {
    "fetch-all": "Fetch All",
    "pull-ff-only": "Pull (fast-forward only)",
    "pull-ff-possible": "Pull (fast-forward if possible)",
    "pull-rebase": "Pull (rebase)",
  };
  const selectedPullActionLabel = pullActionLabelByMode[pullActionMode];
  const [sidebarFilterInputValue, setSidebarFilterInputValue] = useState("");
  const [sidebarFilterQuery, setSidebarFilterQuery] = useState("");
  const sidebarFilterInputRef = useRef<HTMLInputElement | null>(null);
  const sidebarFilterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [, startSidebarFilterTransition] = useTransition();
  const deferredSidebarFilterQuery = useDeferredValue(sidebarFilterQuery);
  const isTerminalPanelOpen = useTerminalPanelStore((state) => state.isOpen);
  const routeSearch = useSearch({ strict: false });
  const activeTabIdFromUrl =
    typeof routeSearch.tabId === "string" ? routeSearch.tabId : "tab:default";

  const activeRepo = openedRepos.find((repo) => repo.id === activeRepoId);
  const commits = useMemo<RepositoryCommit[]>(
    () => (activeRepoId ? (repoCommits[activeRepoId] ?? []) : []),
    [activeRepoId, repoCommits]
  );
  const branches = useMemo(
    () => (activeRepoId ? (repoBranches[activeRepoId] ?? []) : []),
    [activeRepoId, repoBranches]
  );
  const stashes = useMemo<RepositoryStash[]>(
    () => (activeRepoId ? (repoStashes[activeRepoId] ?? []) : []),
    [activeRepoId, repoStashes]
  );
  const workingTreeItems = useMemo<RepositoryWorkingTreeItem[]>(
    () => (activeRepoId ? (repoWorkingTreeItems[activeRepoId] ?? []) : []),
    [activeRepoId, repoWorkingTreeItems]
  );
  const unstagedItems = useMemo(
    () =>
      workingTreeItems.filter(
        (item) => item.unstagedStatus !== " " || item.isUntracked
      ),
    [workingTreeItems]
  );
  const stagedItems = useMemo(
    () =>
      workingTreeItems.filter(
        (item) =>
          !item.isUntracked &&
          item.stagedStatus !== " " &&
          item.stagedStatus !== "?"
      ),
    [workingTreeItems]
  );
  const hasUnstagedChanges = unstagedItems.length > 0;
  const hasStagedChanges = stagedItems.length > 0;
  const hasAnyWorkingTreeChanges = workingTreeItems.length > 0;
  const workingTreeIndicators = useMemo(() => {
    let addedCount = 0;
    let editedCount = 0;
    let removedCount = 0;

    for (const item of workingTreeItems) {
      const stagedStatus = item.stagedStatus;
      const unstagedStatus = item.unstagedStatus;

      if (
        item.isUntracked ||
        stagedStatus === "A" ||
        unstagedStatus === "A" ||
        stagedStatus === "?" ||
        unstagedStatus === "?"
      ) {
        addedCount += 1;
        continue;
      }

      if (stagedStatus === "D" || unstagedStatus === "D") {
        removedCount += 1;
        continue;
      }

      if (stagedStatus !== " " || unstagedStatus !== " ") {
        editedCount += 1;
      }
    }

    return {
      addedCount,
      editedCount,
      removedCount,
    };
  }, [workingTreeItems]);
  const canCommit = draftCommitSummary.trim().length > 0 && hasStagedChanges;
  const unstagedTree = useMemo(
    () => buildChangeTree(unstagedItems),
    [unstagedItems]
  );
  const stagedTree = useMemo(() => buildChangeTree(stagedItems), [stagedItems]);
  const currentBranch =
    branches.find((branch) => branch.isCurrent)?.name ?? "HEAD";
  const isWorkingTreeSelection = selectedCommitId === WORKING_TREE_ROW_ID;
  const selectedCommit = useMemo(
    () => commits.find((item) => item.hash === selectedCommitId) ?? null,
    [commits, selectedCommitId]
  );
  const branchComboboxOptions = useMemo<BranchComboboxOption[]>(
    () =>
      branches
        .filter((branch) => branch.refType !== "tag")
        .map((branch) => ({
          isRemote: branch.isRemote,
          name: branch.name,
        })),
    [branches]
  );
  const selectedBranchOption = useMemo(
    () =>
      branchComboboxOptions.find((branch) => branch.name === currentBranch) ??
      null,
    [branchComboboxOptions, currentBranch]
  );
  const sidebarGroups = useMemo<SidebarGroupItem[]>(() => {
    const localEntries: SidebarEntry[] = [];
    const remoteEntries: SidebarEntry[] = [];
    const stashEntries: SidebarEntry[] = stashes.map((stash) => {
      const label = formatStashLabel(stash);

      return {
        name: label,
        searchName: label.toLowerCase(),
        stashRef: stash.ref,
        type: "stash",
      };
    });
    const tagEntries: SidebarEntry[] = [];

    for (const branch of branches) {
      if (branch.refType === "tag") {
        tagEntries.push({
          active: branch.isCurrent,
          name: branch.name,
          searchName: branch.name.toLowerCase(),
          type: "tag",
        });
        continue;
      }

      const branchEntry: SidebarEntry = {
        active: branch.isCurrent,
        name: branch.name,
        pendingPushCount: branch.aheadCount > 0 ? branch.aheadCount : undefined,
        pendingSyncCount:
          branch.behindCount > 0 ? branch.behindCount : undefined,
        searchName: branch.name.toLowerCase(),
        type: "branch",
      };

      if (branch.isRemote) {
        remoteEntries.push(branchEntry);
        continue;
      }

      localEntries.push(branchEntry);
    }

    return [
      {
        count: localEntries.length,
        entries: localEntries,
        key: "local",
        name: "LOCAL",
      },
      {
        count: remoteEntries.length,
        entries: remoteEntries,
        key: "remote",
        name: "REMOTE",
      },
      {
        count: stashEntries.length,
        entries: stashEntries,
        key: "stashes",
        name: "STASHES",
      },
      {
        count: tagEntries.length,
        entries: tagEntries,
        key: "tags",
        name: "TAGS",
      },
    ];
  }, [branches, stashes]);
  const normalizedSidebarFilter = deferredSidebarFilterQuery
    .trim()
    .toLowerCase();
  const filteredSidebarGroups = useMemo<SidebarGroupItem[]>(() => {
    if (normalizedSidebarFilter.length === 0) {
      return sidebarGroups;
    }

    return sidebarGroups.map((group) => {
      const entries = group.entries.filter((entry) =>
        entry.searchName.includes(normalizedSidebarFilter)
      );

      return {
        ...group,
        count: entries.length,
        entries,
      };
    });
  }, [normalizedSidebarFilter, sidebarGroups]);
  const filteredSidebarEntryCount = useMemo(
    () =>
      filteredSidebarGroups.reduce((total, group) => total + group.count, 0),
    [filteredSidebarGroups]
  );
  const formatCommitDate = (value: string): string => {
    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsedDate);
  };
  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    if (typeof error === "string" && error.trim().length > 0) {
      return error;
    }

    if (error && typeof error === "object" && "message" in error) {
      const message = Reflect.get(error, "message");
      if (typeof message === "string" && message.trim().length > 0) {
        return message;
      }
    }

    return "Unknown error";
  };

  const getCheckoutFailureReason = (error: unknown): string => {
    const rawMessage = getErrorMessage(error);
    const normalized = rawMessage.toLowerCase();

    if (
      normalized.includes("local changes") &&
      normalized.includes("would be overwritten")
    ) {
      return "You have uncommitted changes that would be overwritten. Commit or stash them, then try again.";
    }

    if (
      normalized.includes("did not match any file") ||
      normalized.includes("pathspec")
    ) {
      return "The target branch could not be found. It may have been deleted or renamed.";
    }

    if (
      normalized.includes("resolve your current index first") ||
      normalized.includes("you need to resolve")
    ) {
      return "There are unresolved merge conflicts. Resolve them first, then switch branches.";
    }

    if (
      normalized.includes("rebase in progress") ||
      normalized.includes("merge in progress") ||
      normalized.includes("cherry-pick in progress")
    ) {
      return "A Git operation is still in progress. Finish or abort it before switching branches.";
    }

    if (normalized.includes("not a git repository")) {
      return "This folder is not recognized as a Git repository.";
    }

    return `Git could not switch branches: ${rawMessage}`;
  };

  useEffect(() => {
    if (selectedCommitId === WORKING_TREE_ROW_ID && hasAnyWorkingTreeChanges) {
      return;
    }

    if (commits.length === 0) {
      setSelectedCommitId(
        hasAnyWorkingTreeChanges ? WORKING_TREE_ROW_ID : null
      );
      return;
    }

    if (
      !(
        selectedCommitId &&
        commits.some((commit) => commit.hash === selectedCommitId)
      )
    ) {
      setSelectedCommitId(commits[0].hash);
    }
  }, [commits, hasAnyWorkingTreeChanges, selectedCommitId]);

  useEffect(() => {
    if (activeRepoId === null) {
      setDraftCommitSummary("");
      setDraftCommitDescription("");
      setAmendPreviousCommit(false);
      return;
    }

    setDraftCommitSummary("");
    setDraftCommitDescription("");
    setAmendPreviousCommit(false);
  }, [activeRepoId]);

  useEffect(() => {
    if (activeRepoId === null) {
      setWorkingTreeWipInput("");
      return;
    }
  }, [activeRepoId]);

  useEffect(() => {
    const handleFocusSidebarFilter = (event: KeyboardEvent) => {
      if (!(event.ctrlKey && event.altKey) || event.key.toLowerCase() !== "f") {
        return;
      }

      event.preventDefault();
      sidebarFilterInputRef.current?.focus();
      sidebarFilterInputRef.current?.select();
    };

    globalThis.addEventListener("keydown", handleFocusSidebarFilter);

    return () => {
      globalThis.removeEventListener("keydown", handleFocusSidebarFilter);
    };
  }, []);
  useEffect(
    () => () => {
      if (sidebarFilterDebounceRef.current !== null) {
        globalThis.clearTimeout(sidebarFilterDebounceRef.current);
      }
    },
    []
  );

  const scheduleSidebarFilterUpdate = (nextValue: string) => {
    if (sidebarFilterDebounceRef.current !== null) {
      globalThis.clearTimeout(sidebarFilterDebounceRef.current);
    }

    sidebarFilterDebounceRef.current = globalThis.setTimeout(() => {
      startSidebarFilterTransition(() => {
        setSidebarFilterQuery(nextValue);
      });
      sidebarFilterDebounceRef.current = null;
    }, 120);
  };

  const clearSidebarFilter = () => {
    if (sidebarFilterDebounceRef.current !== null) {
      globalThis.clearTimeout(sidebarFilterDebounceRef.current);
      sidebarFilterDebounceRef.current = null;
    }

    setSidebarFilterInputValue("");
    setSidebarFilterQuery("");
  };

  const preventLeftClickInMenus = (event: React.MouseEvent) => {
    if (event.button === 0) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const renderEntryIcon = (entry: SidebarEntry) => {
    if (entry.type === "stash") {
      return <StackSimpleIcon className="size-3.5 shrink-0" />;
    }

    if (entry.type === "tag") {
      return <TagIcon className="size-3.5 shrink-0" />;
    }

    return <GitBranchIcon className="size-3.5 shrink-0" />;
  };

  const renderHighlightedEntryName = (name: string) => {
    if (normalizedSidebarFilter.length === 0) {
      return name;
    }

    const normalizedName = name.toLowerCase();
    const firstMatchIndex = normalizedName.indexOf(normalizedSidebarFilter);

    if (firstMatchIndex < 0) {
      return name;
    }

    const highlightedParts: ReactNode[] = [];
    let searchFrom = 0;
    let key = 0;

    while (searchFrom < name.length) {
      const matchIndex = normalizedName.indexOf(
        normalizedSidebarFilter,
        searchFrom
      );

      if (matchIndex < 0) {
        const tail = name.slice(searchFrom);
        if (tail.length > 0) {
          highlightedParts.push(tail);
        }
        break;
      }

      const beforeMatch = name.slice(searchFrom, matchIndex);
      if (beforeMatch.length > 0) {
        highlightedParts.push(beforeMatch);
      }

      const matchedText = name.slice(
        matchIndex,
        matchIndex + normalizedSidebarFilter.length
      );
      highlightedParts.push(
        <span
          className="rounded-sm bg-primary/20 px-0.5 text-foreground"
          key={`${name}-${key}`}
        >
          {matchedText}
        </span>
      );
      key += 1;
      searchFrom = matchIndex + normalizedSidebarFilter.length;
    }

    return <>{highlightedParts}</>;
  };

  const handleCheckoutBranch = async (entry: SidebarEntry) => {
    if (
      entry.type === "stash" ||
      entry.active ||
      !activeRepoId ||
      isSwitchingBranch
    ) {
      return;
    }

    setIsSwitchingBranch(true);

    try {
      await switchBranch(activeRepoId, entry.name);
      toast.success("Checkout Successful", {
        description: `refs/heads/${entry.name}`,
      });
    } catch (error) {
      toast.error("Failed to switch branch", {
        description: getCheckoutFailureReason(error),
      });
    } finally {
      setIsSwitchingBranch(false);
    }
  };

  const handleApplyStash = async (entry: SidebarEntry) => {
    if (
      entry.type !== "stash" ||
      !entry.stashRef ||
      !activeRepoId ||
      isApplyingStash
    ) {
      return;
    }

    setIsApplyingStash(true);

    try {
      await applyStash(activeRepoId, entry.stashRef);
    } finally {
      setIsApplyingStash(false);
    }
  };

  const handlePopStash = async (entry: SidebarEntry) => {
    if (
      entry.type !== "stash" ||
      !entry.stashRef ||
      !activeRepoId ||
      isPoppingStash
    ) {
      return;
    }

    setIsPoppingStash(true);

    try {
      await popStash(activeRepoId, entry.stashRef);
    } finally {
      setIsPoppingStash(false);
    }
  };

  const handleDropStash = async (entry: SidebarEntry) => {
    if (
      entry.type !== "stash" ||
      !entry.stashRef ||
      !activeRepoId ||
      isDroppingStash
    ) {
      return;
    }

    setIsDroppingStash(true);

    try {
      await dropStash(activeRepoId, entry.stashRef);
    } finally {
      setIsDroppingStash(false);
    }
  };

  const handleToolbarBranchChange = async (
    nextValue: BranchComboboxOption | null
  ) => {
    if (
      !nextValue ||
      nextValue.name === currentBranch ||
      !activeRepoId ||
      isSwitchingBranch
    ) {
      return;
    }

    setIsSwitchingBranch(true);

    try {
      await switchBranch(activeRepoId, nextValue.name);
      toast.success("Checkout Successful", {
        description: `refs/heads/${nextValue.name}`,
      });
    } catch (error) {
      toast.error("Failed to switch branch", {
        description: getCheckoutFailureReason(error),
      });
    } finally {
      setIsSwitchingBranch(false);
    }
  };

  const handlePullAction = async (mode: PullActionMode) => {
    if (!activeRepoId || isPulling) {
      return;
    }
    setIsPulling(true);
    setPullActionMode(mode);
    try {
      const result = await pullBranch(activeRepoId, mode);
      if (result.headChanged) {
        toast.success("Pull completed", {
          description: pullActionLabelByMode[mode],
        });
      } else {
        toast.success("Already up to date", {
          description: pullActionLabelByMode[mode],
        });
      }
    } finally {
      setIsPulling(false);
    }
  };
  const handlePullWithSelectedMode = async () => {
    await handlePullAction(pullActionMode);
  };
  const handlePullActionForEntry = async (
    entry: SidebarEntry,
    mode: PullActionMode
  ) => {
    if (
      entry.type !== "branch" ||
      !activeRepoId ||
      isPulling ||
      isSwitchingBranch
    ) {
      return;
    }

    setIsPulling(true);
    setPullActionMode(mode);

    try {
      if (!entry.active) {
        setIsSwitchingBranch(true);

        try {
          await switchBranch(activeRepoId, entry.name);
        } catch (error) {
          toast.error("Failed to switch branch", {
            description: getCheckoutFailureReason(error),
          });
          return;
        } finally {
          setIsSwitchingBranch(false);
        }
      }

      const result = await pullBranch(activeRepoId, mode);
      if (result.headChanged) {
        toast.success("Pull completed", {
          description: `${entry.name} - ${pullActionLabelByMode[mode]}`,
        });
      } else {
        toast.success("Already up to date", {
          description: `${entry.name} - ${pullActionLabelByMode[mode]}`,
        });
      }
    } finally {
      setIsPulling(false);
    }
  };

  const handlePushAction = async () => {
    if (!activeRepoId || isPushing) {
      return;
    }

    setIsPushing(true);

    try {
      await pushBranch(activeRepoId);
    } finally {
      setIsPushing(false);
    }
  };
  const handlePushActionForEntry = async (entry: SidebarEntry) => {
    if (
      entry.type !== "branch" ||
      !activeRepoId ||
      isPushing ||
      isSwitchingBranch
    ) {
      return;
    }

    setIsPushing(true);

    try {
      if (!entry.active) {
        setIsSwitchingBranch(true);

        try {
          await switchBranch(activeRepoId, entry.name);
        } catch (error) {
          toast.error("Failed to switch branch", {
            description: getCheckoutFailureReason(error),
          });
          return;
        } finally {
          setIsSwitchingBranch(false);
        }
      }

      await pushBranch(activeRepoId);
    } finally {
      setIsPushing(false);
    }
  };

  const renderEntryDropdownMenuContent = (entry: SidebarEntry) => {
    if (entry.type === "tag") {
      return (
        <DropdownMenuContent
          align="end"
          className="w-80"
          onClick={preventLeftClickInMenus}
          onMouseDown={preventLeftClickInMenus}
          side="right"
          sideOffset={6}
        >
          <DropdownMenuItem>
            Fast-forward {entry.name} to {currentBranch}
          </DropdownMenuItem>
          <DropdownMenuItem>
            Merge {currentBranch} into {entry.name}
          </DropdownMenuItem>
          <DropdownMenuItem>
            Rebase {currentBranch} onto {entry.name}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            Checkout the commit at {entry.name}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Explain Branch Changes (Preview)</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Create branch here</DropdownMenuItem>
          <DropdownMenuItem>Cherry pick commit</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              Reset {currentBranch} to this commit
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Soft - keep all changes</DropdownMenuItem>
              <DropdownMenuItem>
                Mixed - keep working copy but reset index
              </DropdownMenuItem>
              <DropdownMenuItem>Hard - discard all changes</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem>Revert commit</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Delete {entry.name} locally</DropdownMenuItem>
          <DropdownMenuItem>Delete {entry.name} from origin</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Copy tag name</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            Copy link to this tag on remote: origin
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Hide</DropdownMenuItem>
          <DropdownMenuItem>Solo</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Annotate {entry.name}</DropdownMenuItem>
        </DropdownMenuContent>
      );
    }

    if (entry.type === "stash") {
      return (
        <DropdownMenuContent
          align="start"
          className="w-56"
          onClick={preventLeftClickInMenus}
          onMouseDown={preventLeftClickInMenus}
          side="right"
          sideOffset={6}
        >
          <DropdownMenuItem
            disabled={isApplyingStash}
            onClick={() => {
              handleApplyStash(entry).catch(() => undefined);
            }}
          >
            Apply Stash
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isPoppingStash}
            onClick={() => {
              handlePopStash(entry).catch(() => undefined);
            }}
          >
            Pop Stash
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isDroppingStash}
            onClick={() => {
              handleDropStash(entry).catch(() => undefined);
            }}
          >
            Delete Stash
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Edit stash message</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Share stash as Cloud Patch</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Hide</DropdownMenuItem>
        </DropdownMenuContent>
      );
    }

    return (
      <DropdownMenuContent
        align="end"
        className="w-80"
        onClick={preventLeftClickInMenus}
        onMouseDown={preventLeftClickInMenus}
        side="right"
        sideOffset={6}
      >
        <DropdownMenuItem
          disabled={isPulling || isSwitchingBranch}
          onClick={() => {
            handlePullActionForEntry(entry, "pull-ff-possible").catch(
              () => undefined
            );
          }}
        >
          Pull (fast-forward if possible)
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isPushing || isSwitchingBranch}
          onClick={() => {
            handlePushActionForEntry(entry).catch(() => undefined);
          }}
        >
          Push
        </DropdownMenuItem>
        <DropdownMenuItem>Set Upstream</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          Fast-forward {entry.name} to {currentBranch}
        </DropdownMenuItem>
        <DropdownMenuItem>
          Merge {currentBranch} into {entry.name}
        </DropdownMenuItem>
        <DropdownMenuItem>
          Rebase {currentBranch} onto {entry.name}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={entry.active || isSwitchingBranch}
          onClick={() => {
            handleCheckoutBranch(entry).catch(() => undefined);
          }}
        >
          Checkout {entry.name}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Create worktree from {entry.name}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Create branch here</DropdownMenuItem>
        <DropdownMenuItem>Cherry pick commit</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            Reset {currentBranch} to this commit
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Soft - keep all changes</DropdownMenuItem>
            <DropdownMenuItem>
              Mixed - keep working copy but reset index
            </DropdownMenuItem>
            <DropdownMenuItem>Hard - discard all changes</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem>Revert commit</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Explain Branch Changes (Preview)</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Rename {entry.name}</DropdownMenuItem>
        <DropdownMenuItem>Delete {entry.name}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Copy branch name</DropdownMenuItem>
        <DropdownMenuItem>Copy commit sha</DropdownMenuItem>
        <DropdownMenuItem>
          Copy link to branch: origin/{entry.name}
        </DropdownMenuItem>
        <DropdownMenuItem>
          Copy link to this commit on remote: origin
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Hide</DropdownMenuItem>
        <DropdownMenuItem>Pin to Left</DropdownMenuItem>
        <DropdownMenuItem>Solo</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          Compare commit against working directory
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Create tag here</DropdownMenuItem>
        <DropdownMenuItem>Create annotated tag here</DropdownMenuItem>
      </DropdownMenuContent>
    );
  };

  const renderEntryContextMenuContent = (entry: SidebarEntry) => {
    if (entry.type === "tag") {
      return (
        <ContextMenuContent
          className="w-80"
          onClick={preventLeftClickInMenus}
          onMouseDown={preventLeftClickInMenus}
        >
          <ContextMenuItem>
            Fast-forward {entry.name} to {currentBranch}
          </ContextMenuItem>
          <ContextMenuItem>
            Merge {currentBranch} into {entry.name}
          </ContextMenuItem>
          <ContextMenuItem>
            Rebase {currentBranch} onto {entry.name}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Checkout the commit at {entry.name}</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Explain Branch Changes (Preview)</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Create branch here</ContextMenuItem>
          <ContextMenuItem>Cherry pick commit</ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              Reset {currentBranch} to this commit
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem>Soft - keep all changes</ContextMenuItem>
              <ContextMenuItem>
                Mixed - keep working copy but reset index
              </ContextMenuItem>
              <ContextMenuItem>Hard - discard all changes</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem>Revert commit</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Delete {entry.name} locally</ContextMenuItem>
          <ContextMenuItem>Delete {entry.name} from origin</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Copy tag name</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>
            Copy link to this tag on remote: origin
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Hide</ContextMenuItem>
          <ContextMenuItem>Solo</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Annotate {entry.name}</ContextMenuItem>
        </ContextMenuContent>
      );
    }

    if (entry.type === "stash") {
      return (
        <ContextMenuContent
          className="w-56"
          onClick={preventLeftClickInMenus}
          onMouseDown={preventLeftClickInMenus}
        >
          <ContextMenuItem
            disabled={isApplyingStash}
            onClick={() => {
              handleApplyStash(entry).catch(() => undefined);
            }}
          >
            Apply Stash
          </ContextMenuItem>
          <ContextMenuItem
            disabled={isPoppingStash}
            onClick={() => {
              handlePopStash(entry).catch(() => undefined);
            }}
          >
            Pop Stash
          </ContextMenuItem>
          <ContextMenuItem
            disabled={isDroppingStash}
            onClick={() => {
              handleDropStash(entry).catch(() => undefined);
            }}
          >
            Delete Stash
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Edit stash message</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Share stash as Cloud Patch</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Hide</ContextMenuItem>
        </ContextMenuContent>
      );
    }

    return (
      <ContextMenuContent
        className="w-80"
        onClick={preventLeftClickInMenus}
        onMouseDown={preventLeftClickInMenus}
      >
        <ContextMenuItem
          disabled={isPulling || isSwitchingBranch}
          onClick={() => {
            handlePullActionForEntry(entry, "pull-ff-possible").catch(
              () => undefined
            );
          }}
        >
          Pull (fast-forward if possible)
        </ContextMenuItem>
        <ContextMenuItem
          disabled={isPushing || isSwitchingBranch}
          onClick={() => {
            handlePushActionForEntry(entry).catch(() => undefined);
          }}
        >
          Push
        </ContextMenuItem>
        <ContextMenuItem>Set Upstream</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>
          Fast-forward {entry.name} to {currentBranch}
        </ContextMenuItem>
        <ContextMenuItem>
          Merge {currentBranch} into {entry.name}
        </ContextMenuItem>
        <ContextMenuItem>
          Rebase {currentBranch} onto {entry.name}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={entry.active || isSwitchingBranch}
          onClick={() => {
            handleCheckoutBranch(entry).catch(() => undefined);
          }}
        >
          Checkout {entry.name}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>Create worktree from {entry.name}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>Create branch here</ContextMenuItem>
        <ContextMenuItem>Cherry pick commit</ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            Reset {currentBranch} to this commit
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem>Soft - keep all changes</ContextMenuItem>
            <ContextMenuItem>
              Mixed - keep working copy but reset index
            </ContextMenuItem>
            <ContextMenuItem>Hard - discard all changes</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem>Revert commit</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>Explain Branch Changes (Preview)</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>Rename {entry.name}</ContextMenuItem>
        <ContextMenuItem>Delete {entry.name}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>Copy branch name</ContextMenuItem>
        <ContextMenuItem>Copy commit sha</ContextMenuItem>
        <ContextMenuItem>
          Copy link to branch: origin/{entry.name}
        </ContextMenuItem>
        <ContextMenuItem>
          Copy link to this commit on remote: origin
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>Hide</ContextMenuItem>
        <ContextMenuItem>Pin to Left</ContextMenuItem>
        <ContextMenuItem>Solo</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>
          Compare commit against working directory
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>Create tag here</ContextMenuItem>
        <ContextMenuItem>Create annotated tag here</ContextMenuItem>
      </ContextMenuContent>
    );
  };
  const toggleTreeNode = (nodePath: string) => {
    setExpandedTreeNodePaths((current) => ({
      ...current,
      [nodePath]: !current[nodePath],
    }));
  };

  const getStatusCodes = (
    item: RepositoryWorkingTreeItem,
    section: "staged" | "unstaged"
  ) => {
    if (section === "staged") {
      if (item.stagedStatus === " " || item.stagedStatus === "?") {
        return [] as string[];
      }

      return [item.stagedStatus];
    }

    if (item.isUntracked) {
      return ["?"];
    }

    if (item.unstagedStatus === " ") {
      return [] as string[];
    }

    return [item.unstagedStatus];
  };

  const renderStatusBadges = (
    item: RepositoryWorkingTreeItem,
    section: "staged" | "unstaged"
  ) => {
    const statusCodes = getStatusCodes(item, section);

    if (statusCodes.length === 0) {
      return null;
    }

    return statusCodes.map((code) => {
      const descriptor = getStatusDescriptor(code);

      if (!descriptor) {
        return null;
      }

      return (
        <span
          className={cn(
            "inline-flex items-center justify-center",
            descriptor.className
          )}
          key={`${item.path}-${section}-${descriptor.label}`}
        >
          {code === "M" ? (
            <PencilSimpleIcon className="size-3" />
          ) : (
            <span className="font-semibold text-xs leading-none">
              {descriptor.short}
            </span>
          )}
        </span>
      );
    });
  };

  const collectTreeStatusCounts = (
    node: ChangeTreeNode,
    section: "staged" | "unstaged"
  ) => {
    const counts = new Map<string, number>();

    const visitNode = (current: ChangeTreeNode) => {
      if (current.item) {
        const statusCodes = getStatusCodes(current.item, section);

        for (const code of statusCodes) {
          counts.set(code, (counts.get(code) ?? 0) + 1);
        }

        return;
      }

      for (const child of current.children.values()) {
        visitNode(child);
      }
    };

    visitNode(node);

    return counts;
  };

  const handleUnstageAll = async () => {
    if (!activeRepoId || isUnstagingAll || !hasStagedChanges) {
      return;
    }

    setIsUnstagingAll(true);

    try {
      await unstageAll(activeRepoId);
    } finally {
      setIsUnstagingAll(false);
    }
  };

  const handleFileStageToggle = async (
    filePath: string,
    mode: "stage" | "unstage"
  ) => {
    if (!activeRepoId || isUpdatingFilePath !== null) {
      return;
    }

    setIsUpdatingFilePath(filePath);

    try {
      if (mode === "stage") {
        await stageFile(activeRepoId, filePath);
      } else {
        await unstageFile(activeRepoId, filePath);
      }
    } finally {
      setIsUpdatingFilePath(null);
    }
  };

  const handleDiscardPathChanges = async (filePath: string) => {
    if (!activeRepoId || isUpdatingFilePath !== null) {
      return;
    }

    setIsUpdatingFilePath(filePath);

    try {
      await discardPathChanges(activeRepoId, filePath);
    } finally {
      setIsUpdatingFilePath(null);
    }
  };
  const handleAddIgnoreRule = async (pattern: string) => {
    if (!activeRepoId || isUpdatingFilePath !== null) {
      return;
    }

    setIsUpdatingFilePath(pattern);

    try {
      await addIgnoreRule(activeRepoId, pattern);
    } finally {
      setIsUpdatingFilePath(null);
    }
  };
  const renderChangeContextMenuContent = (
    targetPath: string,
    section: "staged" | "unstaged",
    options?: { isFolder?: boolean; folderName?: string }
  ) => {
    const isFolder = options?.isFolder ?? false;
    const fileName = targetPath.split("/").at(-1) ?? targetPath;
    const lastDotIndex = fileName.lastIndexOf(".");
    const fileExtension =
      lastDotIndex > 0 ? fileName.slice(lastDotIndex + 1) : null;
    const primaryActionLabel =
      section === "unstaged" ? "Stage folder" : "Unstage folder";
    const discardLabel = isFolder
      ? "Discard all changes in folder"
      : "Discard changes";
    const pathSegments = targetPath
      .split("/")
      .filter((segment) => segment.length > 0);
    const ignoreTarget = isFolder
      ? `${options?.folderName ?? targetPath.split("/").at(-1) ?? targetPath}/`
      : targetPath;
    const parentFolderName = pathSegments.at(-2) ?? null;
    const stashLabel = isFolder ? "Stash folder" : "Stash file";
    const patchLabel = isFolder
      ? "Create Patch from changes in directory"
      : "Create patch from file changes";

    if (!isFolder) {
      return (
        <ContextMenuContent
          className="w-72"
          onClick={preventLeftClickInMenus}
          onMouseDown={preventLeftClickInMenus}
        >
          <ContextMenuItem
            disabled={isUpdatingFilePath !== null}
            onClick={() => {
              handleFileStageToggle(
                targetPath,
                section === "unstaged" ? "stage" : "unstage"
              ).catch(() => undefined);
            }}
          >
            {section === "unstaged" ? "Stage" : "Unstage"}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={isUpdatingFilePath !== null}
            onClick={() => {
              handleDiscardPathChanges(targetPath).catch(() => undefined);
            }}
          >
            {discardLabel}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Ignore</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem
                disabled={isUpdatingFilePath !== null}
                onClick={() => {
                  handleAddIgnoreRule(fileName).catch(() => undefined);
                }}
              >{`Ignore '${fileName}'`}</ContextMenuItem>
              {fileExtension ? (
                <ContextMenuItem
                  disabled={isUpdatingFilePath !== null}
                  onClick={() => {
                    handleAddIgnoreRule(`*.${fileExtension}`).catch(
                      () => undefined
                    );
                  }}
                >
                  {`All files with the extension '.${fileExtension}'`}
                </ContextMenuItem>
              ) : null}
              {parentFolderName ? (
                <ContextMenuItem
                  disabled={isUpdatingFilePath !== null}
                  onClick={() => {
                    handleAddIgnoreRule(`${parentFolderName}/`).catch(
                      () => undefined
                    );
                  }}
                >
                  {`All files in '${parentFolderName}/'`}
                </ContextMenuItem>
              ) : null}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem>{stashLabel}</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>File History</ContextMenuItem>
          <ContextMenuItem>File Blame</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Open in external diff tool</ContextMenuItem>
          <ContextMenuItem>Open in external editor</ContextMenuItem>
          <ContextMenuItem>Open file in default program</ContextMenuItem>
          <ContextMenuItem>Show in folder</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Copy file path</ContextMenuItem>
          <ContextMenuItem>{patchLabel}</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>Edit file</ContextMenuItem>
          <ContextMenuItem>Delete file</ContextMenuItem>
        </ContextMenuContent>
      );
    }

    return (
      <ContextMenuContent
        className="w-72"
        onClick={preventLeftClickInMenus}
        onMouseDown={preventLeftClickInMenus}
      >
        <ContextMenuItem
          disabled={isUpdatingFilePath !== null}
          onClick={() => {
            handleFileStageToggle(
              targetPath,
              section === "unstaged" ? "stage" : "unstage"
            ).catch(() => undefined);
          }}
        >
          {primaryActionLabel}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={isUpdatingFilePath !== null}
          onClick={() => {
            handleDiscardPathChanges(targetPath).catch(() => undefined);
          }}
        >
          {discardLabel}
        </ContextMenuItem>
        <ContextMenuItem>{`Ignore all files in '${ignoreTarget}'`}</ContextMenuItem>
        <ContextMenuItem>{stashLabel}</ContextMenuItem>
        <ContextMenuItem>{patchLabel}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>Open folder</ContextMenuItem>
        <ContextMenuItem>Create a file in this folder</ContextMenuItem>
      </ContextMenuContent>
    );
  };
  const renderChangeTreeNodes = (
    nodes: ChangeTreeNode[],
    section: "staged" | "unstaged",
    depth = 0
  ): ReactNode => {
    return nodes.map((node) => {
      const hasChildren = node.children.size > 0;
      const isExpanded = expandedTreeNodePaths[node.fullPath] ?? depth < 1;
      const collapsedStatusCounts =
        hasChildren && !isExpanded
          ? collectTreeStatusCounts(node, section)
          : null;

      if (node.item) {
        const actionMode = section === "unstaged" ? "stage" : "unstage";
        const actionLabel = section === "unstaged" ? "Stage" : "Unstage";
        const isBusy = isUpdatingFilePath === node.item.path;

        return (
          <ContextMenu key={`${section}-${node.fullPath}`}>
            <ContextMenuTrigger>
              <div
                className="group flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/20"
                style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
              >
                <div className="inline-flex min-w-3 items-center justify-center">
                  {renderStatusBadges(node.item, section)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{node.name}</p>
                </div>
                <Button
                  className={cn(
                    "h-6 px-2 text-[0.65rem] transition-opacity",
                    isBusy
                      ? "opacity-100"
                      : "pointer-events-none opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                  )}
                  disabled={isBusy}
                  onClick={() => {
                    handleFileStageToggle(
                      node.item?.path ?? "",
                      actionMode
                    ).catch(() => undefined);
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {isBusy ? "..." : actionLabel}
                </Button>
              </div>
            </ContextMenuTrigger>
            {renderChangeContextMenuContent(node.item?.path ?? "", section)}
          </ContextMenu>
        );
      }

      return (
        <div key={`${section}-${node.fullPath}`}>
          <ContextMenu>
            <ContextMenuTrigger>
              <button
                className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-muted-foreground text-xs hover:bg-accent/20 hover:text-foreground"
                onClick={() => toggleTreeNode(node.fullPath)}
                style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
                type="button"
              >
                {isExpanded ? (
                  <CaretDownIcon className="size-3" />
                ) : (
                  <CaretRightIcon className="size-3" />
                )}
                <span className="truncate">{node.name}</span>
                {collapsedStatusCounts ? (
                  <span className="ml-1 inline-flex items-center gap-2">
                    {TREE_STATUS_SUMMARY_ORDER.map((code) => {
                      const count = collapsedStatusCounts.get(code) ?? 0;

                      if (count <= 0) {
                        return null;
                      }

                      const descriptor = getStatusDescriptor(code);

                      if (!descriptor) {
                        return null;
                      }

                      return (
                        <span
                          className="inline-flex items-center gap-1"
                          key={`${node.fullPath}-${code}`}
                        >
                          <span
                            className={cn(
                              "inline-flex items-center justify-center",
                              descriptor.className
                            )}
                          >
                            {code === "M" ? (
                              <PencilSimpleIcon className="size-3" />
                            ) : (
                              <span className="font-semibold text-xs leading-none">
                                {descriptor.short}
                              </span>
                            )}
                          </span>
                          <span className="font-medium text-muted-foreground text-xs leading-none">
                            {count}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                ) : null}
              </button>
            </ContextMenuTrigger>
            {renderChangeContextMenuContent(node.fullPath, section, {
              folderName: node.name,
              isFolder: true,
            })}
          </ContextMenu>
          {hasChildren && isExpanded ? (
            <div>
              {renderChangeTreeNodes(
                Array.from(node.children.values()),
                section,
                depth + 1
              )}
            </div>
          ) : null}
        </div>
      );
    });
  };

  const renderFlatChangeRows = (
    items: RepositoryWorkingTreeItem[],
    section: "staged" | "unstaged"
  ) => {
    return items.map((item) => {
      const isBusy = isUpdatingFilePath === item.path;
      const nextAction = section === "unstaged" ? "stage" : "unstage";
      const nextLabel = section === "unstaged" ? "Stage" : "Unstage";

      return (
        <ContextMenu key={`${section}-${item.path}`}>
          <ContextMenuTrigger>
            <div className="group flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/20">
              <div className="inline-flex min-w-3 items-center justify-center">
                {renderStatusBadges(item, section)}
              </div>
              <p className="min-w-0 flex-1 truncate">{item.path}</p>
              <Button
                className={cn(
                  "h-6 px-2 text-[0.65rem] transition-opacity",
                  isBusy
                    ? "opacity-100"
                    : "pointer-events-none opacity-0 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
                )}
                disabled={isBusy}
                onClick={() => {
                  handleFileStageToggle(item.path, nextAction).catch(
                    () => undefined
                  );
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                {isBusy ? "..." : nextLabel}
              </Button>
            </div>
          </ContextMenuTrigger>
          {renderChangeContextMenuContent(item.path, section)}
        </ContextMenu>
      );
    });
  };

  const renderChangesSectionContent = (
    items: RepositoryWorkingTreeItem[],
    tree: ChangeTreeNode[],
    section: "staged" | "unstaged"
  ) => {
    if (items.length === 0) {
      return (
        <p className="px-2 py-1.5 text-muted-foreground text-xs">
          {section === "unstaged" ? "No unstaged files." : "No staged files."}
        </p>
      );
    }

    if (changesViewMode === "tree") {
      return renderChangeTreeNodes(tree, section);
    }

    return renderFlatChangeRows(items, section);
  };

  const handleWorkingTreeRowClick = () => {
    if (!hasAnyWorkingTreeChanges) {
      return;
    }

    const isSameRow = selectedCommitId === WORKING_TREE_ROW_ID;

    if (isSameRow && isRightSidebarOpen) {
      setIsRightSidebarOpen(false);
      return;
    }

    setSelectedCommitId(WORKING_TREE_ROW_ID);
    setIsRightSidebarOpen(true);
  };

  const handleWorkingTreeInputClick = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  const handleWorkingTreeInputKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
  };

  const handleStageAll = async () => {
    if (!activeRepoId || isStagingAll || !hasUnstagedChanges) {
      return;
    }

    setIsStagingAll(true);

    try {
      await stageAll(activeRepoId);
    } finally {
      setIsStagingAll(false);
    }
  };

  const handleCommit = async () => {
    if (!activeRepoId || isCommitting || !canCommit) {
      return;
    }

    setIsCommitting(true);

    try {
      await commitChanges(
        activeRepoId,
        draftCommitSummary.trim(),
        draftCommitDescription.trim(),
        !amendPreviousCommit
      );
      setDraftCommitSummary("");
      setDraftCommitDescription("");
      setAmendPreviousCommit(false);
    } finally {
      setIsCommitting(false);
    }
  };

  if (!activeRepo) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <p className="text-muted-foreground">No repository selected</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar className="w-64">
          <SidebarHeader>
            <p className="text-[0.65rem] text-muted-foreground uppercase tracking-[0.16em]">
              Repository
            </p>
            <div className="mt-2 flex items-center gap-2">
              <GithubLogoIcon className="size-4 text-muted-foreground" />
              <p className="truncate font-semibold text-sm">
                {activeRepo.name}
              </p>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span>Viewing {filteredSidebarEntryCount}</span>
              </div>
              <InputGroup>
                <Input
                  className="h-8 border-0 bg-transparent pr-0 shadow-none focus-visible:ring-0"
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setSidebarFilterInputValue(nextValue);
                    scheduleSidebarFilterUpdate(nextValue);
                  }}
                  placeholder="Filter (Ctrl + Alt + f)"
                  ref={sidebarFilterInputRef}
                  value={sidebarFilterInputValue}
                />
                {sidebarFilterInputValue.length > 0 ? (
                  <InputGroupAddon>
                    <Button
                      aria-label="Clear filter"
                      className="rounded-l-none border-0 border-input border-l"
                      onClick={clearSidebarFilter}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <XIcon className="size-3.5" />
                    </Button>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
            </div>
          </SidebarHeader>

          <SidebarContent>
            {filteredSidebarGroups.map((group) => (
              <SidebarGroup key={group.key}>
                <SidebarGroupLabel className="px-0 py-0">
                  <button
                    className="flex w-full items-center justify-between px-2 py-1"
                    onClick={() =>
                      setCollapsedGroupKeys((current) => ({
                        ...current,
                        [group.key]: !current[group.key],
                      }))
                    }
                    type="button"
                  >
                    <span className="inline-flex items-center gap-1.5 text-[0.68rem] text-muted-foreground uppercase tracking-[0.13em]">
                      {collapsedGroupKeys[group.key] ? (
                        <CaretRightIcon className="size-3" />
                      ) : (
                        <CaretDownIcon className="size-3" />
                      )}
                      {group.name}
                    </span>
                    <span className="font-medium text-[0.68rem] text-muted-foreground">
                      {group.count}
                    </span>
                  </button>
                </SidebarGroupLabel>

                {!collapsedGroupKeys[group.key] && (
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.entries.map((entry) => (
                        <SidebarMenuItem
                          key={`${group.key}-${entry.stashRef ?? entry.name}`}
                        >
                          <ContextMenu
                            onOpenChange={(open) => {
                              const entryMenuKey = `${group.key}-${entry.stashRef ?? entry.name}`;
                              setOpenEntryMenuKey((current) => {
                                if (open) {
                                  return entryMenuKey;
                                }

                                if (current === entryMenuKey) {
                                  return null;
                                }

                                return current;
                              });
                            }}
                          >
                            <ContextMenuTrigger>
                              <SidebarMenuButton
                                aria-label={entry.name}
                                className={cn(
                                  "group",
                                  entry.active ||
                                    openEntryMenuKey ===
                                      `${group.key}-${entry.stashRef ?? entry.name}`
                                    ? "bg-accent text-accent-foreground"
                                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                )}
                                disabled={
                                  entry.type !== "stash" && isSwitchingBranch
                                }
                                onClick={() => {
                                  handleCheckoutBranch(entry).catch(
                                    () => undefined
                                  );
                                }}
                              >
                                {renderEntryIcon(entry)}
                                <Tooltip>
                                  <TooltipTrigger
                                    render={
                                      <span className="min-w-0 flex-1 truncate" />
                                    }
                                  >
                                    {renderHighlightedEntryName(entry.name)}
                                  </TooltipTrigger>
                                  <TooltipContent
                                    align="end"
                                    side="right"
                                    sideOffset={6}
                                  >
                                    {entry.name}
                                  </TooltipContent>
                                </Tooltip>
                                {entry.type === "branch" &&
                                typeof entry.pendingSyncCount === "number" &&
                                entry.pendingSyncCount > 0 ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 text-[0.7rem] opacity-90">
                                    <ArrowDownIcon className="size-3" />
                                    {entry.pendingSyncCount}
                                  </span>
                                ) : null}
                                {entry.type === "branch" &&
                                typeof entry.pendingPushCount === "number" &&
                                entry.pendingPushCount > 0 ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 text-[0.7rem] opacity-90">
                                    <ArrowUpIcon className="size-3" />
                                    {entry.pendingPushCount}
                                  </span>
                                ) : null}
                                <DropdownMenu
                                  onOpenChange={(open) => {
                                    const entryMenuKey = `${group.key}-${entry.stashRef ?? entry.name}`;
                                    setOpenEntryMenuKey((current) => {
                                      if (open) {
                                        return entryMenuKey;
                                      }

                                      if (current === entryMenuKey) {
                                        return null;
                                      }

                                      return current;
                                    });
                                  }}
                                >
                                  <DropdownMenuTrigger
                                    render={
                                      <button
                                        aria-label={`More options for ${entry.name}`}
                                        className={cn(
                                          "ml-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-accent/80 focus-visible:opacity-100 group-hover:opacity-100",
                                          openEntryMenuKey ===
                                            `${group.key}-${entry.stashRef ?? entry.name}` &&
                                            "opacity-100",
                                          entry.active &&
                                            "hover:bg-accent-foreground/10"
                                        )}
                                        onClick={(event) =>
                                          event.stopPropagation()
                                        }
                                        type="button"
                                      />
                                    }
                                  >
                                    <DotsThreeVerticalIcon className="size-3.5" />
                                  </DropdownMenuTrigger>
                                  {renderEntryDropdownMenuContent(entry)}
                                </DropdownMenu>
                              </SidebarMenuButton>
                            </ContextMenuTrigger>
                            {renderEntryContextMenuContent(entry)}
                          </ContextMenu>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                )}
              </SidebarGroup>
            ))}
          </SidebarContent>
        </Sidebar>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="grid w-full grid-cols-[minmax(0,14rem)_minmax(0,1fr)] items-center gap-2 border-border/60 border-b bg-background px-3 py-1.5 text-foreground">
            <div className="flex min-w-0 items-center justify-start gap-1">
              <Combobox
                autoHighlight
                disabled={
                  isSwitchingBranch || branchComboboxOptions.length === 0
                }
                items={branchComboboxOptions}
                itemToStringLabel={(item: BranchComboboxOption) => item.name}
                onValueChange={(nextValue: BranchComboboxOption | null) => {
                  handleToolbarBranchChange(nextValue).catch(() => undefined);
                }}
                value={selectedBranchOption}
              >
                <ComboboxInput
                  className="w-56"
                  placeholder="Find branch..."
                  showClear={false}
                />
                <ComboboxContent>
                  <ComboboxEmpty>No branch found.</ComboboxEmpty>
                  <ComboboxList>
                    {(option: BranchComboboxOption) => (
                      <ComboboxItem key={option.name} value={option}>
                        <div className="flex min-w-0 flex-1 items-center gap-2 pr-6">
                          <GitBranchIcon className="size-3.5 text-muted-foreground" />
                          <span className="truncate">{option.name}</span>
                          {option.isRemote ? (
                            <span className="ml-auto text-muted-foreground text-xs">
                              remote
                            </span>
                          ) : null}
                        </div>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <div className="w-full min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max items-center justify-end gap-1">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Undo"
                        size="default"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    <ArrowCounterClockwiseIcon className="size-4 text-muted-foreground" />
                    <span className="hidden whitespace-nowrap lg:inline">
                      Undo
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="lg:hidden" side="bottom">
                    Undo
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Redo"
                        size="default"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    <ArrowClockwiseIcon className="size-4 text-muted-foreground" />
                    <span className="hidden whitespace-nowrap lg:inline">
                      Redo
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="lg:hidden" side="bottom">
                    Redo
                  </TooltipContent>
                </Tooltip>
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <InputGroup className="h-8 w-auto border-border/60 bg-transparent">
                          <Button
                            aria-label={`Run ${selectedPullActionLabel}`}
                            className="h-7 rounded-r-none border-0 px-2"
                            disabled={isPulling}
                            onClick={handlePullWithSelectedMode}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            {isPulling ? (
                              <SpinnerGapIcon className="size-4 animate-spin text-muted-foreground" />
                            ) : (
                              <DownloadSimpleIcon className="size-4 text-muted-foreground" />
                            )}
                            <span className="hidden whitespace-nowrap lg:inline">
                              Pull
                            </span>
                          </Button>
                          <InputGroupAddon align="inline-end" className="pr-0">
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  aria-label="Select pull mode"
                                  className="h-7 rounded-l-none border-0 border-border/60 border-l px-1.5"
                                  disabled={isPulling}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                />
                              }
                            >
                              <CaretDownIcon className="size-3 text-muted-foreground" />
                            </DropdownMenuTrigger>
                          </InputGroupAddon>
                        </InputGroup>
                      }
                    />
                    <TooltipContent className="lg:hidden" side="bottom">
                      {selectedPullActionLabel}
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent
                    align="center"
                    className="w-72"
                    side="bottom"
                    sideOffset={6}
                  >
                    <DropdownMenuItem
                      className={cn(
                        "gap-2",
                        pullActionMode === "fetch-all" &&
                          "bg-emerald-600/25 focus:bg-emerald-600/30"
                      )}
                      disabled={isPulling}
                      onClick={() => setPullActionMode("fetch-all")}
                    >
                      Fetch All
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn(
                        "gap-2",
                        pullActionMode === "pull-ff-possible" &&
                          "bg-emerald-600/25 focus:bg-emerald-600/30"
                      )}
                      disabled={isPulling}
                      onClick={() => setPullActionMode("pull-ff-possible")}
                    >
                      Pull (fast-forward if possible)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn(
                        "gap-2",
                        pullActionMode === "pull-ff-only" &&
                          "bg-emerald-600/25 focus:bg-emerald-600/30"
                      )}
                      disabled={isPulling}
                      onClick={() => setPullActionMode("pull-ff-only")}
                    >
                      Pull (fast-forward only)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={cn(
                        "gap-2",
                        pullActionMode === "pull-rebase" &&
                          "bg-emerald-600/25 focus:bg-emerald-600/30"
                      )}
                      disabled={isPulling}
                      onClick={() => setPullActionMode("pull-rebase")}
                    >
                      Pull (rebase)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Push"
                        disabled={isPushing}
                        onClick={() => {
                          handlePushAction().catch(() => undefined);
                        }}
                        size="default"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    {isPushing ? (
                      <SpinnerGapIcon className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <UploadSimpleIcon className="size-4 text-muted-foreground" />
                    )}
                    <span className="hidden whitespace-nowrap lg:inline">
                      Push
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="lg:hidden" side="bottom">
                    Push
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Branch"
                        size="default"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    <GitBranchIcon className="size-4 text-muted-foreground" />
                    <span className="hidden whitespace-nowrap lg:inline">
                      Branch
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="lg:hidden" side="bottom">
                    Branch
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Stash"
                        size="default"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    <StackSimpleIcon className="size-4 text-muted-foreground" />
                    <span className="hidden whitespace-nowrap lg:inline">
                      Stash
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="lg:hidden" side="bottom">
                    Stash
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Pop"
                        size="default"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    <ArrowBendRightUpIcon className="size-4 text-muted-foreground" />
                    <span className="hidden whitespace-nowrap lg:inline">
                      Pop
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="lg:hidden" side="bottom">
                    Pop
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            <section className="relative flex min-w-0 flex-1 flex-col">
              <div className="grid grid-cols-[180px_60px_minmax(0,1fr)] border-border/60 border-b px-3 py-2 text-[0.68rem] text-muted-foreground uppercase tracking-[0.14em]">
                <span>Branch / Tag</span>
                <span className="text-center">Graph</span>
                <span>Commit Message</span>
              </div>
              <div
                className={cn(
                  "min-h-0 flex-1 overflow-y-auto",
                  isTerminalPanelOpen && "pb-52"
                )}
              >
                {hasAnyWorkingTreeChanges ? (
                  <button
                    className={cn(
                      "group grid w-full cursor-pointer grid-cols-[180px_60px_minmax(0,1fr)] items-center border-border/35 border-b px-3 py-2 text-left transition-colors",
                      selectedCommitId === WORKING_TREE_ROW_ID
                        ? "bg-accent/30"
                        : "hover:bg-accent/20"
                    )}
                    onClick={handleWorkingTreeRowClick}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleWorkingTreeRowClick();
                      }
                    }}
                    type="button"
                  >
                    <div className="min-w-0" />
                    <div className="flex items-center justify-center">
                      <CircleIcon className="size-3 text-muted-foreground" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Input
                          className="h-7 w-full max-w-52"
                          onChange={(event) => {
                            setWorkingTreeWipInput(event.target.value);
                          }}
                          onClick={handleWorkingTreeInputClick}
                          onFocus={() => {
                            if (selectedCommitId !== WORKING_TREE_ROW_ID) {
                              setSelectedCommitId(WORKING_TREE_ROW_ID);
                            }

                            if (!isRightSidebarOpen) {
                              setIsRightSidebarOpen(true);
                            }
                          }}
                          onKeyDown={handleWorkingTreeInputKeyDown}
                          placeholder="// WIP"
                          value={workingTreeWipInput}
                        />
                        <span className="inline-flex items-center gap-1 text-[0.78rem] text-amber-300">
                          <span aria-hidden>~</span>
                          {workingTreeIndicators.editedCount}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[0.78rem] text-emerald-300">
                          <span aria-hidden>+</span>
                          {workingTreeIndicators.addedCount}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[0.78rem] text-rose-300">
                          <span aria-hidden>-</span>
                          {workingTreeIndicators.removedCount}
                        </span>
                      </div>
                    </div>
                  </button>
                ) : null}

                {commits.map((item, index) => (
                  <button
                    className={cn(
                      "group grid h-12 w-full grid-cols-[180px_60px_minmax(0,1fr)] items-center border-border/35 border-b px-3 text-left transition-colors",
                      selectedCommitId === item.hash
                        ? "bg-accent/30"
                        : "hover:bg-accent/20"
                    )}
                    key={item.hash}
                    onClick={() => {
                      const isSameCommit = selectedCommitId === item.hash;

                      if (isSameCommit && isRightSidebarOpen) {
                        setIsRightSidebarOpen(false);
                        return;
                      }

                      setSelectedCommitId(item.hash);
                      setIsRightSidebarOpen(true);
                    }}
                    type="button"
                  >
                    <div className="min-w-0 truncate">
                      {item.refs.length > 0 ? (
                        <div className="flex min-w-0 items-center gap-1">
                          {item.refs.slice(0, 2).map((ref) => (
                            <span
                              className="truncate rounded border border-border/75 bg-muted/40 px-1.5 py-0.5 text-[0.65rem]"
                              key={ref}
                            >
                              {ref}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/70 text-xs">
                          <span className="sr-only">No refs</span>
                        </span>
                      )}
                    </div>
                    <div className="relative flex h-full items-center justify-center">
                      <span className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 border-border/60 border-l" />
                      {index === 0 ? (
                        <span className="absolute top-0 left-1/2 h-1/2 -translate-x-1/2 bg-background px-px" />
                      ) : null}
                      {index === commits.length - 1 ? (
                        <span className="absolute bottom-0 left-1/2 h-1/2 -translate-x-1/2 bg-background px-px" />
                      ) : null}
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="min-w-0 flex-1 truncate pr-2 text-sm">
                        {item.message}
                      </p>
                      <span className="hidden text-muted-foreground text-xs group-hover:inline md:inline">
                        {item.author}
                      </span>
                    </div>
                  </button>
                ))}
                {commits.length === 0 && !isLoadingHistory ? (
                  <div className="px-3 py-4 text-muted-foreground text-sm">
                    No commits found.
                  </div>
                ) : null}
                {isLoadingHistory ? (
                  <div className="px-3 py-4 text-muted-foreground text-sm">
                    Loading commits...
                  </div>
                ) : null}
              </div>
              <IntegratedTerminalPanel
                contextKey={`${activeTabIdFromUrl}:${activeRepoId ?? "repo:none"}`}
                cwd={activeRepo?.path ?? ""}
              />
            </section>

            <aside
              className={cn(
                "flex h-full w-80 shrink-0 flex-col overflow-hidden border-border/70 border-l bg-muted/20",
                !isRightSidebarOpen && "hidden"
              )}
            >
              {!isWorkingTreeSelection && selectedCommit ? (
                <>
                  <header className="border-border/70 border-b px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">Commit details</p>
                      <span className="rounded border border-border/70 bg-background/70 px-2 py-0.5 font-mono text-[0.65rem] text-muted-foreground">
                        {selectedCommit.shortHash}
                      </span>
                    </div>
                  </header>

                  <div className="space-y-4 px-4 py-4 text-sm">
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-xs">Message</p>
                      <p className="font-medium">{selectedCommit.message}</p>
                    </div>

                    <div className="space-y-2 rounded-md border border-border/70 bg-background/70 p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Author</span>
                        <span className="truncate">
                          {selectedCommit.author}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Committed</span>
                        <span>{formatCommitDate(selectedCommit.date)}</span>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-muted-foreground">Refs</span>
                        <div className="flex flex-wrap justify-end gap-1">
                          {(selectedCommit.refs.length > 0
                            ? selectedCommit.refs
                            : ["-"]
                          ).map((ref) => (
                            <span
                              className="rounded border border-border/70 bg-background px-1.5 py-0.5 text-[0.65rem]"
                              key={ref}
                            >
                              {ref}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <header className="shrink-0 space-y-3 border-border/70 border-b px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        aria-label="Discard all changes"
                        className="h-8 w-8 border border-border/70 bg-background/60 p-0 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <XIcon className="size-4" />
                      </Button>
                      <p className="truncate text-sm">
                        <span className="font-medium">
                          {workingTreeItems.length} file changes
                        </span>{" "}
                        on{" "}
                        <span className="rounded bg-accent px-2 py-0.5 font-medium text-accent-foreground">
                          {currentBranch}
                        </span>
                      </p>
                      <Button
                        aria-label="Sidebar actions"
                        className="h-8 w-8 border border-border/70 bg-background/60 p-0 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <DotsThreeVerticalIcon className="size-4" />
                      </Button>
                    </div>

                    <div className="flex items-center justify-center">
                      <div className="inline-flex rounded-sm border border-border/80 bg-background/70 p-0.5">
                        <button
                          className={cn(
                            "rounded px-3 py-1 font-medium text-xs transition-colors",
                            changesViewMode === "path"
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          onClick={() => setChangesViewMode("path")}
                          type="button"
                        >
                          Path
                        </button>
                        <button
                          className={cn(
                            "rounded px-3 py-1 font-medium text-xs transition-colors",
                            changesViewMode === "tree"
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          onClick={() => setChangesViewMode("tree")}
                          type="button"
                        >
                          Tree
                        </button>
                      </div>
                    </div>
                  </header>

                  <div className="min-h-0 flex-1 overflow-hidden px-3 py-3">
                    <div className="flex h-full min-h-0 flex-col rounded-md border border-border/70 bg-background/50">
                      <section
                        className={cn(
                          "flex min-h-0 flex-col",
                          isUnstagedSectionCollapsed ? "shrink-0" : "flex-1"
                        )}
                      >
                        <div className="flex items-center gap-2 border-border/70 border-b px-2 py-2">
                          <button
                            className="inline-flex items-center gap-1 text-left font-medium text-sm"
                            onClick={() =>
                              setIsUnstagedSectionCollapsed(
                                (current) => !current
                              )
                            }
                            type="button"
                          >
                            {isUnstagedSectionCollapsed ? (
                              <CaretRightIcon className="size-3" />
                            ) : (
                              <CaretDownIcon className="size-3" />
                            )}
                            Unstaged Files ({unstagedItems.length})
                          </button>
                          <Button
                            className="ml-auto h-7 border border-border/70 bg-background/60 px-2 text-[0.72rem] text-foreground hover:bg-accent/40"
                            disabled={!hasUnstagedChanges || isStagingAll}
                            onClick={() => {
                              handleStageAll().catch(() => undefined);
                            }}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            {isStagingAll ? "Staging..." : "Stage All Changes"}
                          </Button>
                        </div>

                        {isUnstagedSectionCollapsed ? null : (
                          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
                            {renderChangesSectionContent(
                              unstagedItems,
                              unstagedTree,
                              "unstaged"
                            )}
                          </div>
                        )}
                      </section>

                      <section
                        className={cn(
                          "flex min-h-0 flex-col border-border/70 border-t",
                          isStagedSectionCollapsed
                            ? "mt-auto shrink-0"
                            : "flex-1"
                        )}
                      >
                        <div className="flex items-center gap-2 border-border/70 border-b px-2 py-2">
                          <button
                            className="inline-flex items-center gap-1 text-left font-medium text-sm"
                            onClick={() =>
                              setIsStagedSectionCollapsed((current) => !current)
                            }
                            type="button"
                          >
                            {isStagedSectionCollapsed ? (
                              <CaretRightIcon className="size-3" />
                            ) : (
                              <CaretDownIcon className="size-3" />
                            )}
                            Staged Files ({stagedItems.length})
                          </button>
                          <Button
                            className="ml-auto h-7 border border-border/70 bg-background/60 px-2 text-[0.72rem] text-foreground hover:bg-accent/40"
                            disabled={!hasStagedChanges || isUnstagingAll}
                            onClick={() => {
                              handleUnstageAll().catch(() => undefined);
                            }}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            {isUnstagingAll
                              ? "Unstaging..."
                              : "Unstage All Changes"}
                          </Button>
                        </div>

                        {isStagedSectionCollapsed ? null : (
                          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
                            {renderChangesSectionContent(
                              stagedItems,
                              stagedTree,
                              "staged"
                            )}
                          </div>
                        )}
                      </section>
                    </div>
                  </div>

                  <form className="shrink-0 border-border/70 border-t px-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="commit-summary">Title</Label>
                      <Input
                        id="commit-summary"
                        onChange={(event) =>
                          setDraftCommitSummary(event.target.value)
                        }
                        placeholder="Describe your changes"
                        value={draftCommitSummary}
                      />
                    </div>
                    <div className="mt-3 space-y-2">
                      <Label htmlFor="commit-description">Description</Label>
                      <textarea
                        className="min-h-24 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                        id="commit-description"
                        onChange={(event) =>
                          setDraftCommitDescription(event.target.value)
                        }
                        placeholder="Optional details..."
                        value={draftCommitDescription}
                      />
                    </div>
                    <label className="mt-3 inline-flex items-center gap-2 text-xs">
                      <input
                        checked={amendPreviousCommit}
                        className="rounded border-input"
                        onChange={(event) =>
                          setAmendPreviousCommit(event.target.checked)
                        }
                        type="checkbox"
                      />
                      Amend previous commit
                    </label>
                    <Button
                      className="mt-4 w-full"
                      disabled={isCommitting || !canCommit}
                      onClick={handleCommit}
                      type="button"
                    >
                      <DotOutlineIcon className="size-4" />
                      Commit staged changes
                    </Button>
                  </form>
                </>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
