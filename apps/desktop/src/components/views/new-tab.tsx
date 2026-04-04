import { env } from "@litgit/env/desktop";
import { Button } from "@litgit/ui/components/button";
import { Input } from "@litgit/ui/components/input";
import { Label } from "@litgit/ui/components/label";
import { TooltipProvider } from "@litgit/ui/components/tooltip";
import { cn } from "@litgit/ui/lib/utils";
import { useWindowEvent } from "@mantine/hooks";
import {
  BugIcon,
  CodeIcon,
  DesktopIcon,
  DownloadSimpleIcon,
  FolderSimpleIcon,
  GearIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { GitIdentityDialog } from "@/components/views/git-identity-dialog";
import { QuickActionButton } from "@/components/views/quick-actions-launcher";
import { RepositoryCloneDialog } from "@/components/views/repository-clone-dialog";
import { RepositoryInitializeDialog } from "@/components/views/repository-initialize-dialog";
import { RepositoryStartLocalDialog } from "@/components/views/repository-start-local-dialog";
import { useOpenRepositoryTabRouting } from "@/hooks/tabs/use-open-repository-tab-routing";
import { useTabUrlState } from "@/hooks/tabs/use-tab-url-state";
import {
  COMBOBOX_DEBOUNCE_DELAY_MS,
  useDebouncedValue,
} from "@/hooks/use-debounced-value";
import {
  getPrimaryShortcutAria,
  getPrimaryShortcutLabel,
  isEditableTarget,
  isPrimaryShortcut,
} from "@/lib/keyboard-shortcuts";
import { getRepoGitIdentity } from "@/lib/tauri-repo-client";
import { usePreferencesStore } from "@/stores/preferences/use-preferences-store";
import { resolveHeadCommit } from "@/stores/repo/repo-store.helpers";
import type {
  GitIdentityStatus,
  GitIdentityWriteInput,
  PickedRepositorySelection,
} from "@/stores/repo/repo-store-types";
import { useRepoStore } from "@/stores/repo/use-repo-store";

const SOURCE_CODE_URL = env.VITE_SOURCE_CODE_URL;
const BUG_REPORT_URL = env.VITE_BUG_REPORT_URL;
const RECENT_REPO_SEARCH_INPUT_ID = "recent-repositories-search";
const RECENT_REPO_SEARCH_HINT_ID = "recent-repositories-search-hint";
const RECENT_REPO_SEARCH_STATUS_ID = "recent-repositories-search-status";
const RECENT_LIST_SCROLL_EDGE_THRESHOLD = 2;
const RECENT_REPOS_COLLAPSED_LIMIT = 5;

export function NewTabContent() {
  const navigate = useNavigate();
  const initializeRepository = useRepoStore(
    (state) => state.initializeRepository
  );
  const openRepository = useRepoStore((state) => state.openRepository);
  const openedRepos = useRepoStore((state) => state.openedRepos);
  const repoCommits = useRepoStore((state) => state.repoCommits);
  const repoBranches = useRepoStore((state) => state.repoBranches);
  const isPickingRepo = useRepoStore((state) => state.isPickingRepo);
  const isRefreshingOpenedRepos = useRepoStore(
    (state) => state.isRefreshingOpenedRepos
  );
  const { routeRepository } = useOpenRepositoryTabRouting();
  const { activeTabId } = useTabUrlState();
  const resetSettingsSearch = usePreferencesStore(
    (state) => state.resetSettingsSearch
  );
  const setSection = usePreferencesStore((state) => state.setSection);

  const tabId = activeTabId || "";
  const search = useSearch({ strict: false });
  const action = search.action as string | undefined;

  const [searchInputValue, setSearchInputValue] = useState("");
  const debouncedSearchQuery = useDebouncedValue(
    searchInputValue,
    COMBOBOX_DEBOUNCE_DELAY_MS
  );
  const [isInitializingRepository, setIsInitializingRepository] =
    useState(false);
  const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);
  const [isStartLocalDialogOpen, setIsStartLocalDialogOpen] = useState(false);
  const [isGitIdentityDialogOpen, setIsGitIdentityDialogOpen] = useState(false);
  const [gitIdentityStatus, setGitIdentityStatus] =
    useState<GitIdentityStatus | null>(null);
  const [pendingRepoInitialization, setPendingRepoInitialization] =
    useState<PickedRepositorySelection | null>(null);
  const [showRecentTopFade, setShowRecentTopFade] = useState(false);
  const [showRecentBottomFade, setShowRecentBottomFade] = useState(false);
  const [focusedRepoIndex, setFocusedRepoIndex] = useState(-1);
  const [isExpanded, setIsExpanded] = useState(false);
  const recentListRef = useRef<HTMLDivElement | null>(null);
  const repoButtonRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const openShortcutLabel = getPrimaryShortcutLabel("o");
  const openShortcutAria = getPrimaryShortcutAria("o");
  const searchShortcutLabel = getPrimaryShortcutLabel("k");
  const searchShortcutAria = getPrimaryShortcutAria("k");
  const normalizedSearchQuery = debouncedSearchQuery.trim().toLowerCase();

  const recentRepos = useMemo(() => [...openedRepos].reverse(), [openedRepos]);

  const filteredRepos = recentRepos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(normalizedSearchQuery) ||
      repo.path.toLowerCase().includes(normalizedSearchQuery)
  );

  const isSearching = normalizedSearchQuery.length > 0;
  const hasMoreThanLimit = filteredRepos.length > RECENT_REPOS_COLLAPSED_LIMIT;
  const shouldCollapse = hasMoreThanLimit && !isSearching && !isExpanded;

  const visibleRepos = useMemo(
    () =>
      shouldCollapse
        ? filteredRepos.slice(0, RECENT_REPOS_COLLAPSED_LIMIT)
        : filteredRepos,
    [filteredRepos, shouldCollapse]
  );

  const focusRecentSearchInput = useCallback(() => {
    if (typeof document === "undefined") {
      return;
    }

    const input = document.getElementById(RECENT_REPO_SEARCH_INPUT_ID);

    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    input.focus();
    input.select();
  }, []);

  const handleOpenRepoPicker = useCallback(async () => {
    if (isPickingRepo || isInitializingRepository) {
      return;
    }

    const result = await openRepository();

    if (!result) {
      return;
    }

    if (result.status === "requires-initial-commit") {
      setPendingRepoInitialization(result.repository);
      return;
    }

    await routeRepository(result.repository.id, result.repository.name, {
      preferredTabId: tabId,
    });
  }, [
    isInitializingRepository,
    isPickingRepo,
    openRepository,
    routeRepository,
    tabId,
  ]);

  useEffect(() => {
    if (!action) {
      return;
    }

    if (action === "clone") {
      setIsCloneDialogOpen(true);
    }

    if (action === "open") {
      handleOpenRepoPicker().catch(() => undefined);
    }

    navigate({ to: "/", search: {}, replace: true }).catch(() => undefined);
  }, [action, handleOpenRepoPicker, navigate]);

  const completeRepositoryInitialization = useCallback(
    async (gitIdentity?: GitIdentityWriteInput | null) => {
      if (!(pendingRepoInitialization && !isInitializingRepository)) {
        return;
      }

      setIsInitializingRepository(true);

      try {
        const openedRepository = await initializeRepository(
          pendingRepoInitialization,
          gitIdentity
        );

        if (!openedRepository) {
          return;
        }

        setPendingRepoInitialization(null);
        setIsGitIdentityDialogOpen(false);
        await routeRepository(openedRepository.id, openedRepository.name, {
          preferredTabId: tabId,
        });
      } finally {
        setIsInitializingRepository(false);
      }
    },
    [
      initializeRepository,
      isInitializingRepository,
      pendingRepoInitialization,
      routeRepository,
      tabId,
    ]
  );

  const handleInitializeRepository = useCallback(async () => {
    if (!(pendingRepoInitialization && !isInitializingRepository)) {
      return;
    }

    const identityStatus = await getRepoGitIdentity(
      pendingRepoInitialization.path
    );

    if (identityStatus.effective.isComplete) {
      await completeRepositoryInitialization();
      return;
    }

    setGitIdentityStatus(identityStatus);
    setIsGitIdentityDialogOpen(true);
  }, [
    completeRepositoryInitialization,
    isInitializingRepository,
    pendingRepoInitialization,
  ]);

  const openExternalUrl = useCallback(async (url: string) => {
    if (isTauri()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const updateRecentListFades = useCallback(() => {
    const recentList = recentListRef.current;

    if (!recentList) {
      return;
    }

    const maxScrollTop = Math.max(
      0,
      recentList.scrollHeight - recentList.clientHeight
    );

    setShowRecentTopFade(
      recentList.scrollTop > RECENT_LIST_SCROLL_EDGE_THRESHOLD
    );
    setShowRecentBottomFade(
      recentList.scrollTop < maxScrollTop - RECENT_LIST_SCROLL_EDGE_THRESHOLD &&
        maxScrollTop > 0
    );
  }, []);

  const wasRefreshingOpenedReposRef = useRef(isRefreshingOpenedRepos);

  useEffect(() => {
    const wasRefreshingOpenedRepos = wasRefreshingOpenedReposRef.current;

    if (
      wasRefreshingOpenedRepos &&
      !isRefreshingOpenedRepos &&
      recentListRef.current
    ) {
      recentListRef.current.scrollTop = 0;
      updateRecentListFades();
    }

    wasRefreshingOpenedReposRef.current = isRefreshingOpenedRepos;
  }, [isRefreshingOpenedRepos, updateRecentListFades]);

  useEffect(() => {
    const recentList = recentListRef.current;

    if (!recentList) {
      return;
    }

    updateRecentListFades();

    const resizeObserver = new ResizeObserver(() => {
      updateRecentListFades();
    });
    const mutationObserver = new MutationObserver(() => {
      updateRecentListFades();
    });

    resizeObserver.observe(recentList);
    mutationObserver.observe(recentList, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    recentList.addEventListener("scroll", updateRecentListFades, {
      passive: true,
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      recentList.removeEventListener("scroll", updateRecentListFades);
    };
  }, [updateRecentListFades]);

  useWindowEvent("keydown", (event) => {
    if (event.repeat || pendingRepoInitialization) {
      return;
    }

    if (!isPrimaryShortcut(event, "k")) {
      return;
    }

    if (isEditableTarget(event.target)) {
      return;
    }

    event.preventDefault();
    focusRecentSearchInput();
  });

  const handleRepoListKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (visibleRepos.length === 0) {
        return;
      }

      let nextIndex = focusedRepoIndex;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        nextIndex =
          focusedRepoIndex < visibleRepos.length - 1 ? focusedRepoIndex + 1 : 0;
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        nextIndex =
          focusedRepoIndex > 0 ? focusedRepoIndex - 1 : visibleRepos.length - 1;
      } else if (event.key === "Home") {
        event.preventDefault();
        nextIndex = 0;
      } else if (event.key === "End") {
        event.preventDefault();
        nextIndex = visibleRepos.length - 1;
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (focusedRepoIndex >= 0 && visibleRepos[focusedRepoIndex]) {
          const repo = visibleRepos[focusedRepoIndex];
          routeRepository(repo.id, repo.name, {
            preferredTabId: tabId,
          }).catch(() => {
            return;
          });
        }
      } else {
        return;
      }

      setFocusedRepoIndex(nextIndex);
      const repo = visibleRepos[nextIndex];
      if (repo) {
        const button = repoButtonRefs.current.get(repo.id);
        button?.focus();
      }
    },
    [visibleRepos, focusedRepoIndex, routeRepository, tabId]
  );

  const totalReposLabel =
    openedRepos.length === 1 ? "repository" : "repositories";
  const filteredReposLabel =
    filteredRepos.length === 1 ? "repository" : "repositories";

  const searchStatusMessage = normalizedSearchQuery
    ? `${filteredRepos.length} ${filteredReposLabel} found for ${normalizedSearchQuery}`
    : `${openedRepos.length} recent ${totalReposLabel} available`;

  const getRepoBranchLabel = useCallback(
    (repoId: string) => {
      const branch = repoBranches[repoId]?.find((item) => item.isCurrent)?.name;
      return branch ?? "—";
    },
    [repoBranches]
  );

  const getLastCommitLabel = useCallback(
    (repoId: string) => {
      const message = resolveHeadCommit(repoCommits[repoId] ?? [])?.message;
      return message ?? "No commits yet";
    },
    [repoCommits]
  );

  const openRecentRepository = useCallback(
    (repoId: string, repoName: string) => {
      routeRepository(repoId, repoName, {
        preferredTabId: tabId,
      }).catch(() => {
        return;
      });
    },
    [routeRepository, tabId]
  );

  const getOpenRepoButtonLabel = () => {
    if (isPickingRepo) {
      return "Opening…";
    }
    if (isInitializingRepository) {
      return "Initializing…";
    }
    return "Open repository";
  };
  const openRepoButtonLabel = getOpenRepoButtonLabel();

  return (
    <div className="fade-in zoom-in-95 relative flex min-h-full w-full animate-in flex-col overflow-hidden bg-background text-foreground duration-500">
      <PageContainer className="relative flex w-full flex-1 flex-col gap-6">
        {/* Hero Section with enhanced typography */}
        <header className="flex flex-col gap-3 pt-2">
          <div className="flex items-center gap-3">
            <img
              alt="LitGit logo"
              className="h-10 w-auto"
              height="40"
              src="/src/assets/litgit-logo.png"
              width="40"
            />
            <h1 className="font-bold font-mono text-4xl text-foreground leading-none tracking-tight">
              LitGit
            </h1>
          </div>
          <p className="max-w-xl text-muted-foreground text-sm leading-relaxed">
            A fast, fluent Git client designed for developers who demand speed
            and a clutter-free workflow.
          </p>
        </header>

        {/* Quick Actions with asymmetric layout */}
        <section aria-label="Quick actions" className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
            <h2 className="font-medium font-mono text-muted-foreground text-xs tracking-wide">
              Quick Actions
            </h2>
            <div className="h-px flex-1 bg-gradient-to-l from-border to-transparent" />
          </div>
          <TooltipProvider delay={900}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <QuickActionButton
                disabled={isPickingRepo || isInitializingRepository}
                icon={
                  <FolderSimpleIcon
                    aria-hidden="true"
                    className="size-5 text-primary"
                    weight="duotone"
                  />
                }
                label={openRepoButtonLabel}
                onClick={() => {
                  handleOpenRepoPicker().catch(() => {
                    return;
                  });
                }}
                shortcut={openShortcutLabel}
                shortcutAriaLabel={openShortcutAria}
                tooltip="Browse a local folder and open it in a tab."
              />
              <QuickActionButton
                icon={
                  <DownloadSimpleIcon
                    aria-hidden="true"
                    className="size-5 text-primary"
                    weight="regular"
                  />
                }
                label="Clone Repository"
                onClick={() => setIsCloneDialogOpen(true)}
                tooltip="Clone from a remote URL to a local folder and open it."
              />
              <QuickActionButton
                icon={
                  <DesktopIcon
                    aria-hidden="true"
                    className="size-5 text-primary"
                    weight="duotone"
                  />
                }
                label="Start Local Repo"
                onClick={() => setIsStartLocalDialogOpen(true)}
                tooltip="Initialize a brand-new repository in a selected folder."
              />
            </div>
          </TooltipProvider>
        </section>

        {/* Recent Repositories with enhanced visual hierarchy */}
        <section aria-label="Recent repositories" className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
            <h2 className="font-medium font-mono text-muted-foreground text-xs tracking-wide">
              Recent Repositories
            </h2>
            <div className="h-px flex-1 bg-gradient-to-l from-border to-transparent" />
            {hasMoreThanLimit && !isSearching ? (
              <Button
                className="focus-visible:desktop-focus h-6 gap-1.5 px-2 text-muted-foreground text-xs tracking-wide hover:text-foreground focus-visible:ring-0! focus-visible:ring-offset-0!"
                onClick={() => setIsExpanded((prev) => !prev)}
                type="button"
                variant="ghost"
              >
                {isExpanded ? "Show Less" : "View All"}
              </Button>
            ) : null}
          </div>

          {/* Search input with refined styling */}
          <div className="relative">
            <Label className="sr-only" htmlFor={RECENT_REPO_SEARCH_INPUT_ID}>
              Search recent repositories
            </Label>
            <MagnifyingGlassIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground/70"
            />
            <Input
              aria-describedby={`${RECENT_REPO_SEARCH_HINT_ID} ${RECENT_REPO_SEARCH_STATUS_ID}`}
              aria-keyshortcuts={searchShortcutAria}
              className="focus-visible:desktop-focus h-9 border-border/60 bg-card pr-16 pl-10 text-sm shadow-sm transition-all duration-200 hover:border-border focus-visible:ring-0! focus-visible:ring-offset-0!"
              id={RECENT_REPO_SEARCH_INPUT_ID}
              onChange={(event) => {
                setSearchInputValue(event.target.value);
                setFocusedRepoIndex(-1);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && searchInputValue.length > 0) {
                  event.preventDefault();
                  setSearchInputValue("");
                  setFocusedRepoIndex(-1);
                }
                if (event.key === "ArrowDown" && visibleRepos.length > 0) {
                  event.preventDefault();
                  setFocusedRepoIndex(0);
                  const firstRepo = visibleRepos[0];
                  if (firstRepo) {
                    const button = repoButtonRefs.current.get(firstRepo.id);
                    button?.focus();
                  }
                }
              }}
              placeholder="Search repositories..."
              type="search"
              value={searchInputValue}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 font-mono text-muted-foreground text-xs"
            >
              {searchInputValue ? "ESC" : searchShortcutLabel}
            </span>
          </div>

          <p
            className="text-muted-foreground/70 text-xs leading-normal"
            id={RECENT_REPO_SEARCH_HINT_ID}
          >
            Search by repository name or path. Press {searchShortcutLabel} to
            focus quickly.
          </p>

          <output
            aria-live="polite"
            className="sr-only"
            id={RECENT_REPO_SEARCH_STATUS_ID}
          >
            {searchStatusMessage}
          </output>

          {/* Repository list with refined card styling */}
          <div className="relative overflow-hidden border border-border/80 bg-card shadow-sm">
            {showRecentTopFade && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-8 z-10 h-5 bg-gradient-to-b from-background/95 to-transparent"
              />
            )}
            {showRecentBottomFade && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-5 bg-gradient-to-t from-background/95 to-transparent"
              />
            )}

            {/* Table header with refined styling */}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-4 border-border/60 border-b bg-muted/40 px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
              <span>Repository</span>
              <span>Branch</span>
              <span>Last Commit</span>
              <span>Location</span>
            </div>

            <div
              aria-activedescendant={
                focusedRepoIndex >= 0 && visibleRepos[focusedRepoIndex]
                  ? `repo-${visibleRepos[focusedRepoIndex]?.id}`
                  : undefined
              }
              aria-label={`Recent repositories list, ${searchStatusMessage}`}
              className={cn(
                "min-h-0 [scrollbar-width:thin]",
                !isExpanded && "max-h-80 overflow-y-auto"
              )}
              id="recent-repositories-listbox"
              onKeyDown={handleRepoListKeyDown}
              ref={recentListRef}
              role="listbox"
              tabIndex={0}
            >
              {visibleRepos.length === 0 ? (
                <div
                  aria-selected={false}
                  className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center"
                  role="option"
                  tabIndex={-1}
                >
                  <FolderSimpleIcon
                    className="size-7 text-muted-foreground/40"
                    weight="light"
                  />
                  <p className="text-muted-foreground text-sm">
                    {searchInputValue
                      ? `No repositories found matching "${searchInputValue}"`
                      : "No recent repositories"}
                  </p>
                  <p className="text-muted-foreground/60 text-xs">
                    {searchInputValue
                      ? "Try a different search term"
                      : "Open or clone a repository to get started"}
                  </p>
                </div>
              ) : (
                visibleRepos.map((repo, index) => (
                  <div
                    aria-selected={focusedRepoIndex === index}
                    className={cn(
                      "group grid cursor-pointer grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-4 border-border/40 border-b px-4 py-2 transition-all duration-150",
                      focusedRepoIndex === index
                        ? "bg-primary/5"
                        : "hover:bg-muted/50"
                    )}
                    id={`repo-${repo.id}`}
                    key={repo.id}
                    onClick={() => {
                      openRecentRepository(repo.id, repo.name);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openRecentRepository(repo.id, repo.name);
                      }
                    }}
                    ref={(el) => {
                      if (el) {
                        repoButtonRefs.current.set(repo.id, el);
                      } else {
                        repoButtonRefs.current.delete(repo.id);
                      }
                    }}
                    role="option"
                    tabIndex={focusedRepoIndex === index ? 0 : -1}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                        <FolderSimpleIcon
                          aria-hidden="true"
                          className="size-3.5 text-primary"
                          weight="fill"
                        />
                      </div>
                      <span className="truncate font-medium text-foreground text-sm">
                        {repo.name}
                      </span>
                    </div>
                    <span className="truncate text-muted-foreground text-xs">
                      {getRepoBranchLabel(repo.id)}
                    </span>
                    <span className="truncate text-muted-foreground/80 text-xs">
                      {getLastCommitLabel(repo.id)}
                    </span>
                    <span className="truncate text-muted-foreground/70 text-xs">
                      {repo.path}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Footer with refined styling */}
        <footer className="mt-auto flex flex-col gap-4 border-border/60 border-t pt-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-4 text-muted-foreground/70 text-xs">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-primary/70" />
              <span>{openedRepos.length} repositories</span>
            </div>
            {isSearching && (
              <div className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-primary/40" />
                <span>{filteredRepos.length} matching</span>
              </div>
            )}
          </div>

          <nav aria-label="External resources">
            <ul className="flex flex-wrap items-center gap-1">
              <li>
                <Button
                  aria-label="View source code (opens in new window)"
                  className="focus-visible:desktop-focus h-7 gap-1.5 px-2 text-muted-foreground text-xs tracking-wide hover:text-foreground focus-visible:ring-0! focus-visible:ring-offset-0!"
                  onClick={() => {
                    openExternalUrl(SOURCE_CODE_URL).catch(() => {
                      return;
                    });
                  }}
                  type="button"
                  variant="ghost"
                >
                  <CodeIcon
                    aria-hidden="true"
                    className="size-3.5"
                    weight="regular"
                  />
                  Source
                </Button>
              </li>
              <li>
                <Button
                  aria-label="Report a bug (opens in new window)"
                  className="focus-visible:desktop-focus h-7 gap-1.5 px-2 text-muted-foreground text-xs tracking-wide hover:text-foreground focus-visible:ring-0! focus-visible:ring-offset-0!"
                  onClick={() => {
                    openExternalUrl(BUG_REPORT_URL).catch(() => {
                      return;
                    });
                  }}
                  type="button"
                  variant="ghost"
                >
                  <BugIcon
                    aria-hidden="true"
                    className="size-3.5"
                    weight="regular"
                  />
                  Issues
                </Button>
              </li>
              <li>
                <Button
                  className="focus-visible:desktop-focus h-7 gap-1.5 px-2 text-muted-foreground text-xs tracking-wide hover:text-foreground focus-visible:ring-0! focus-visible:ring-offset-0!"
                  onClick={() => {
                    resetSettingsSearch();
                    setSection("general");
                    navigate({ to: "/settings" }).catch(() => undefined);
                  }}
                  type="button"
                  variant="ghost"
                >
                  <GearIcon
                    aria-hidden="true"
                    className="size-3.5"
                    weight="regular"
                  />
                  Settings
                </Button>
              </li>
            </ul>
          </nav>
        </footer>
      </PageContainer>

      <RepositoryInitializeDialog
        isInitializing={isInitializingRepository}
        isRepositoryInitialized={
          pendingRepoInitialization?.isGitRepository ?? false
        }
        onConfirm={() => {
          handleInitializeRepository().catch(() => {
            return;
          });
        }}
        onOpenChange={(open) => {
          if (!(open || isInitializingRepository)) {
            setPendingRepoInitialization(null);
            setIsGitIdentityDialogOpen(false);
          }
        }}
        open={Boolean(pendingRepoInitialization)}
        repositoryName={pendingRepoInitialization?.name ?? "repository"}
      />
      <GitIdentityDialog
        description="LitGit needs your Git author name and email before it can create the first commit. This will be saved to your global Git config."
        identityStatus={gitIdentityStatus}
        onConfirm={async (gitIdentity) => {
          await completeRepositoryInitialization(gitIdentity);
        }}
        onOpenChange={setIsGitIdentityDialogOpen}
        open={isGitIdentityDialogOpen}
        submitLabel="Save and create first commit"
        title="Set your global Git identity"
      />
      <RepositoryCloneDialog
        onOpenChange={setIsCloneDialogOpen}
        open={isCloneDialogOpen}
      />
      <RepositoryStartLocalDialog
        onOpenChange={setIsStartLocalDialogOpen}
        open={isStartLocalDialogOpen}
      />
    </div>
  );
}
