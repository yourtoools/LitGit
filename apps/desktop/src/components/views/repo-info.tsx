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
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { RepositoryCommit } from "@/stores/repo/repo-store-types";
import { useRepoStore } from "@/stores/repo/use-repo-store";

interface SidebarEntry {
  active?: boolean;
  name: string;
  pendingSyncCount?: number;
  type: "branch" | "stash";
}

interface SidebarGroupItem {
  count: number;
  entries: SidebarEntry[];
  key: string;
  name: string;
}

const sidebarGroups: SidebarGroupItem[] = [
  {
    count: 3,
    entries: [
      { active: true, name: "development", type: "branch" },
      { name: "main", pendingSyncCount: 21, type: "branch" },
      { name: "refactor/mono", type: "branch" },
    ],
    key: "local",
    name: "LOCAL",
  },
  {
    count: 2,
    entries: [
      { name: "origin/development", type: "branch" },
      { name: "origin/main", type: "branch" },
    ],
    key: "remote",
    name: "REMOTE",
  },
  {
    count: 3,
    entries: [
      { name: "WIP on development", type: "stash" },
      { name: "WIP on development...", type: "stash" },
      { name: "f3b9f fix: add globals", type: "stash" },
    ],
    key: "stashes",
    name: "STASHES",
  },
];

export function RepoInfo() {
  const activeRepoId = useRepoStore((state) => state.activeRepoId);
  const openedRepos = useRepoStore((state) => state.openedRepos);
  const repoCommits = useRepoStore((state) => state.repoCommits);
  const isLoadingHistory = useRepoStore((state) => state.isLoadingHistory);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<
    Record<string, boolean>
  >({});
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  const [rightMode, setRightMode] = useState<"commit" | "details">("details");
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  const activeRepo = openedRepos.find((repo) => repo.id === activeRepoId);
  const commits = useMemo<RepositoryCommit[]>(
    () => (activeRepoId ? (repoCommits[activeRepoId] ?? []) : []),
    [activeRepoId, repoCommits]
  );
  const selectedCommit = useMemo(
    () => commits.find((item) => item.hash === selectedCommitId) ?? null,
    [commits, selectedCommitId]
  );
  const currentBranch = "development";
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
  const preventLeftClickInMenus = (event: React.MouseEvent) => {
    if (event.button === 0) {
      event.preventDefault();
      event.stopPropagation();
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
          </SidebarHeader>

          <SidebarContent>
            {sidebarGroups.map((group) => (
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
                        <SidebarMenuItem key={`${group.key}-${entry.name}`}>
                          <ContextMenu>
                            <ContextMenuTrigger>
                              <SidebarMenuButton
                                aria-label={entry.name}
                                className={cn(
                                  "group",
                                  entry.active
                                    ? "bg-accent text-accent-foreground"
                                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                )}
                              >
                                {entry.type === "stash" ? (
                                  <StackSimpleIcon className="size-3.5 shrink-0" />
                                ) : (
                                  <GitBranchIcon className="size-3.5 shrink-0" />
                                )}
                                <span className="min-w-0 flex-1 truncate">
                                  {entry.name}
                                </span>
                                {entry.type === "branch" &&
                                typeof entry.pendingSyncCount === "number" &&
                                entry.pendingSyncCount > 0 ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 text-[0.7rem] opacity-90">
                                    <ArrowDownIcon className="size-3" />
                                    {entry.pendingSyncCount}
                                  </span>
                                ) : null}
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    render={
                                      <button
                                        aria-label={`More options for ${entry.name}`}
                                        className={cn(
                                          "ml-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-accent/80 focus-visible:opacity-100 group-hover:opacity-100",
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
                                  {entry.type === "branch" ? (
                                    <DropdownMenuContent
                                      align="end"
                                      className="w-80"
                                      onClick={preventLeftClickInMenus}
                                      onMouseDown={preventLeftClickInMenus}
                                      side="right"
                                      sideOffset={6}
                                    >
                                      <DropdownMenuItem>
                                        Pull (fast-forward if possible)
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>Push</DropdownMenuItem>
                                      <DropdownMenuItem>
                                        Set Upstream
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem>
                                        Fast-forward {entry.name} to{" "}
                                        {currentBranch}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        Merge {currentBranch} into {entry.name}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        Rebase {currentBranch} onto {entry.name}
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem>
                                        Checkout {entry.name}
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem>
                                        Create worktree from {entry.name}
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem>
                                        Create branch here
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        Cherry pick commit
                                      </DropdownMenuItem>
                                      <DropdownMenuSub>
                                        <DropdownMenuSubTrigger>
                                          Reset {currentBranch} to this commit
                                        </DropdownMenuSubTrigger>
                                        <DropdownMenuSubContent>
                                          <DropdownMenuItem>
                                            Soft - keep all changes
                                          </DropdownMenuItem>
                                          <DropdownMenuItem>
                                            Mixed - keep working copy but reset
                                            index
                                          </DropdownMenuItem>
                                          <DropdownMenuItem>
                                            Hard - discard all changes
                                          </DropdownMenuItem>
                                        </DropdownMenuSubContent>
                                      </DropdownMenuSub>
                                      <DropdownMenuItem>
                                        Revert commit
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem>
                                        Explain Branch Changes (Preview)
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem>
                                        Rename {entry.name}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        Delete {entry.name}
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem>
                                        Copy branch name
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        Copy commit sha
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        Copy link to branch: origin/{entry.name}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        Copy link to this commit on remote:
                                        origin
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem>Hide</DropdownMenuItem>
                                      <DropdownMenuItem>
                                        Pin to Left
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>Solo</DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem>
                                        Compare commit against working directory
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem>
                                        Create tag here
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        Create annotated tag here
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  ) : (
                                    <DropdownMenuContent
                                      align="end"
                                      className="w-56"
                                      onClick={preventLeftClickInMenus}
                                      onMouseDown={preventLeftClickInMenus}
                                      side="right"
                                      sideOffset={6}
                                    >
                                      <DropdownMenuItem>
                                        Apply Stash
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        Pop Stash
                                      </DropdownMenuItem>
                                      <DropdownMenuItem>
                                        Delete Stash
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem>
                                        Edit stash message
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem>
                                        Share stash as Cloud Patch
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem>Hide</DropdownMenuItem>
                                    </DropdownMenuContent>
                                  )}
                                </DropdownMenu>
                              </SidebarMenuButton>
                            </ContextMenuTrigger>
                            {entry.type === "branch" ? (
                              <ContextMenuContent
                                className="w-80"
                                onClick={preventLeftClickInMenus}
                                onMouseDown={preventLeftClickInMenus}
                              >
                                <ContextMenuItem>
                                  Pull (fast-forward if possible)
                                </ContextMenuItem>
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
                                <ContextMenuItem>
                                  Checkout {entry.name}
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem>
                                  Create worktree from {entry.name}
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem>
                                  Create branch here
                                </ContextMenuItem>
                                <ContextMenuItem>
                                  Cherry pick commit
                                </ContextMenuItem>
                                <ContextMenuSub>
                                  <ContextMenuSubTrigger>
                                    Reset {currentBranch} to this commit
                                  </ContextMenuSubTrigger>
                                  <ContextMenuSubContent>
                                    <ContextMenuItem>
                                      Soft - keep all changes
                                    </ContextMenuItem>
                                    <ContextMenuItem>
                                      Mixed - keep working copy but reset index
                                    </ContextMenuItem>
                                    <ContextMenuItem>
                                      Hard - discard all changes
                                    </ContextMenuItem>
                                  </ContextMenuSubContent>
                                </ContextMenuSub>
                                <ContextMenuItem>Revert commit</ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem>
                                  Explain Branch Changes (Preview)
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem>
                                  Rename {entry.name}
                                </ContextMenuItem>
                                <ContextMenuItem>
                                  Delete {entry.name}
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem>
                                  Copy branch name
                                </ContextMenuItem>
                                <ContextMenuItem>
                                  Copy commit sha
                                </ContextMenuItem>
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
                                <ContextMenuItem>
                                  Create tag here
                                </ContextMenuItem>
                                <ContextMenuItem>
                                  Create annotated tag here
                                </ContextMenuItem>
                              </ContextMenuContent>
                            ) : (
                              <ContextMenuContent
                                className="w-56"
                                onClick={preventLeftClickInMenus}
                                onMouseDown={preventLeftClickInMenus}
                              >
                                <ContextMenuItem>Apply Stash</ContextMenuItem>
                                <ContextMenuItem>Pop Stash</ContextMenuItem>
                                <ContextMenuItem>Delete Stash</ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem>
                                  Edit stash message
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem>
                                  Share stash as Cloud Patch
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem>Hide</ContextMenuItem>
                              </ContextMenuContent>
                            )}
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
                  placeholder="Describe your changes"
                />
              </div>
              <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2">
                <Label htmlFor="commit-description">Description</Label>
                <textarea
                  className="min-h-32 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                  id="commit-description"
                  placeholder="Optional details..."
                />
              </div>
              <label className="mt-3 inline-flex items-center gap-2 text-xs">
                <input className="rounded border-input" type="checkbox" />
                Amend previous commit
              </label>
              <Button className="mt-4 w-full" type="button">
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
