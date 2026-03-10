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
  ClockCounterClockwiseIcon,
  DotOutlineIcon,
  DotsThreeVerticalIcon,
  DownloadSimpleIcon,
  GitBranchIcon,
  GithubLogoIcon,
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

const STASH_WITH_BRANCH_PATTERN = /^(?:WIP\s+on|On)\s+(.+?)(?::\s*(.*))?$/i;

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
  const repoWorkingTreeStatuses = useRepoStore(
    (state) => state.repoWorkingTreeStatuses
  );
  const isLoadingHistory = useRepoStore((state) => state.isLoadingHistory);
  const switchBranch = useRepoStore((state) => state.switchBranch);
  const applyStash = useRepoStore((state) => state.applyStash);
  const popStash = useRepoStore((state) => state.popStash);
  const dropStash = useRepoStore((state) => state.dropStash);
  const stageAll = useRepoStore((state) => state.stageAll);
  const commitChanges = useRepoStore((state) => state.commitChanges);
  const pullBranch = useRepoStore((state) => state.pullBranch);
  const pushBranch = useRepoStore((state) => state.pushBranch);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<
    Record<string, boolean>
  >({});
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  const [rightMode, setRightMode] = useState<"commit" | "details">("details");
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);
  const [isStagingAll, setIsStagingAll] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isApplyingStash, setIsApplyingStash] = useState(false);
  const [isPoppingStash, setIsPoppingStash] = useState(false);
  const [isDroppingStash, setIsDroppingStash] = useState(false);
  const [draftCommitSummary, setDraftCommitSummary] = useState("");
  const [draftCommitDescription, setDraftCommitDescription] = useState("");
  const [amendPreviousCommit, setAmendPreviousCommit] = useState(false);
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
  const workingTreeStatus = activeRepoId
    ? repoWorkingTreeStatuses[activeRepoId]
    : undefined;
  const hasUnstagedChanges = Boolean(
    workingTreeStatus &&
      (workingTreeStatus.unstagedCount > 0 ||
        workingTreeStatus.untrackedCount > 0)
  );
  const hasStagedChanges = Boolean(workingTreeStatus?.stagedCount);
  const canCommit = draftCommitSummary.trim().length > 0 && hasStagedChanges;
  const currentBranch =
    branches.find((branch) => branch.isCurrent)?.name ?? "HEAD";
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
  const selectedCommit = useMemo(
    () => commits.find((item) => item.hash === selectedCommitId) ?? null,
    [commits, selectedCommitId]
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
    if (commits.length === 0) {
      setSelectedCommitId(null);
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
  }, [commits, selectedCommitId]);

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

  const handlePrimaryCommitAction = () => {
    if (hasUnstagedChanges) {
      handleStageAll().catch(() => undefined);
      return;
    }

    handleCommit().catch(() => undefined);
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
                      setRightMode("details");
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
                          -
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
                "flex h-full w-80 shrink-0 flex-col border-border/70 border-l bg-muted/20",
                !isRightSidebarOpen && "hidden"
              )}
            >
              <header className="border-border/70 border-b px-4 py-3">
                <div className="inline-flex rounded-md border border-border/80 bg-background/70 p-0.5">
                  <button
                    className={cn(
                      "rounded px-2.5 py-1 font-medium text-xs transition-colors",
                      rightMode === "details"
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setRightMode("details")}
                    type="button"
                  >
                    Details
                  </button>
                  <button
                    className={cn(
                      "rounded px-2.5 py-1 font-medium text-xs transition-colors",
                      rightMode === "commit"
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setRightMode("commit")}
                    type="button"
                  >
                    Commit
                  </button>
                </div>
              </header>

              {rightMode === "details" && selectedCommit ? (
                <div className="space-y-4 px-4 py-4">
                  <div>
                    <p className="text-[0.65rem] text-muted-foreground uppercase tracking-[0.16em]">
                      Selected Commit
                    </p>
                    <p className="mt-2 font-medium text-sm">
                      {selectedCommit.message}
                    </p>
                    <p className="mt-1 text-muted-foreground text-xs">
                      {selectedCommit.shortHash}
                    </p>
                  </div>

                  <div className="space-y-2 rounded-md border border-border/70 bg-background/80 p-3">
                    <div className="flex items-center gap-2 text-xs">
                      <CircleIcon className="size-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">SHA</span>
                      <code className="ml-auto font-mono text-foreground">
                        {selectedCommit.shortHash}
                      </code>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <ArrowBendRightUpIcon className="size-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Author</span>
                      <span className="ml-auto">{selectedCommit.author}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <ClockCounterClockwiseIcon className="size-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Committed</span>
                      <span className="ml-auto">
                        {formatCommitDate(selectedCommit.date)}
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-xs">
                      <TagIcon className="mt-0.5 size-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Refs</span>
                      <div className="ml-auto flex flex-wrap justify-end gap-1">
                        {(selectedCommit.refs.length > 0
                          ? selectedCommit.refs
                          : ["-"]
                        ).map((ref) => (
                          <span
                            className="rounded border border-border/75 bg-muted/40 px-1.5 py-0.5 text-[0.65rem]"
                            key={ref}
                          >
                            {ref}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <form className="flex min-h-0 flex-1 flex-col px-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="commit-summary">Commit summary</Label>
                    <Input
                      id="commit-summary"
                      onChange={(event) =>
                        setDraftCommitSummary(event.target.value)
                      }
                      placeholder="Describe your changes"
                      value={draftCommitSummary}
                    />
                  </div>
                  <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2">
                    <Label htmlFor="commit-description">Description</Label>
                    <textarea
                      className="min-h-32 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
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
                    disabled={
                      isStagingAll ||
                      isCommitting ||
                      (hasUnstagedChanges ? false : !canCommit)
                    }
                    onClick={handlePrimaryCommitAction}
                    type="button"
                  >
                    <DotOutlineIcon className="size-4" />
                    Stage Changes to Commit
                  </Button>
                </form>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
