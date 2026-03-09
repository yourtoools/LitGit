import { Button } from "@litgit/ui/components/button";
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
  ArrowDownIcon,
  CaretDownIcon,
  CaretRightIcon,
  CircleIcon,
  ClockCounterClockwiseIcon,
  DotOutlineIcon,
  DotsThreeVerticalIcon,
  GitBranchIcon,
  GithubLogoIcon,
  StackSimpleIcon,
  TagIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  type ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type {
  RepositoryCommit,
  RepositoryStash,
} from "@/stores/repo/repo-store-types";
import { useRepoStore } from "@/stores/repo/use-repo-store";

interface SidebarEntry {
  active?: boolean;
  name: string;
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
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<
    Record<string, boolean>
  >({});
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  const [rightMode, setRightMode] = useState<"commit" | "details">("details");
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);
  const [isStagingAll, setIsStagingAll] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isApplyingStash, setIsApplyingStash] = useState(false);
  const [isPoppingStash, setIsPoppingStash] = useState(false);
  const [isDroppingStash, setIsDroppingStash] = useState(false);
  const [draftCommitSummary, setDraftCommitSummary] = useState("");
  const [draftCommitDescription, setDraftCommitDescription] = useState("");
  const [amendPreviousCommit, setAmendPreviousCommit] = useState(false);
  const [openEntryMenuKey, setOpenEntryMenuKey] = useState<string | null>(null);
  const [sidebarFilterInputValue, setSidebarFilterInputValue] = useState("");
  const [sidebarFilterQuery, setSidebarFilterQuery] = useState("");
  const sidebarFilterInputRef = useRef<HTMLInputElement | null>(null);
  const sidebarFilterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [, startSidebarFilterTransition] = useTransition();
  const deferredSidebarFilterQuery = useDeferredValue(sidebarFilterQuery);

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
  const sidebarGroups = useMemo<SidebarGroupItem[]>(() => {
    const localEntries: SidebarEntry[] = [];
    const remoteEntries: SidebarEntry[] = [];
    const stashEntries: SidebarEntry[] = stashes.map((stash) => {
      const label = stash.message.trim();

      return {
        name: label.length > 0 ? `${stash.ref}: ${label}` : stash.ref,
        searchName:
          label.length > 0
            ? `${stash.ref}: ${label}`.toLowerCase()
            : stash.ref.toLowerCase(),
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
        <DropdownMenuItem>Pull (fast-forward if possible)</DropdownMenuItem>
        <DropdownMenuItem>Push</DropdownMenuItem>
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
        <ContextMenuItem>Pull (fast-forward if possible)</ContextMenuItem>
        <ContextMenuItem>Push</ContextMenuItem>
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

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="grid grid-cols-[180px_60px_minmax(0,1fr)] border-border/60 border-b px-3 py-2 text-[0.68rem] text-muted-foreground uppercase tracking-[0.14em]">
            <span>Branch / Tag</span>
            <span className="text-center">Graph</span>
            <span>Commit Message</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
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
                    <span className="text-muted-foreground/70 text-xs">-</span>
                  )}
                </div>
                <div className="relative flex h-full items-center justify-center">
                  <span className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 border-border/60 border-l" />
                  <span
                    className={cn(
                      "relative z-10 size-2 rounded-full border",
                      item.parentHashes.length > 1
                        ? "border-primary bg-primary"
                        : "border-border bg-background"
                    )}
                  />
                  {index === 0 ? (
                    <span className="absolute top-0 left-1/2 h-1/2 -translate-x-1/2 bg-background px-[1px]" />
                  ) : null}
                  {index === commits.length - 1 ? (
                    <span className="absolute bottom-0 left-1/2 h-1/2 -translate-x-1/2 bg-background px-[1px]" />
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
  );
}
