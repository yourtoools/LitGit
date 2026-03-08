import { env } from "@litgit/env/desktop";
import { Button } from "@litgit/ui/components/button";
import { Input } from "@litgit/ui/components/input";
import { Label } from "@litgit/ui/components/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { cn } from "@litgit/ui/lib/utils";
import {
  BugIcon,
  CaretDownIcon,
  CodeIcon,
  DesktopIcon,
  DownloadSimpleIcon,
  FolderSimpleIcon,
  GearIcon,
  GitBranchIcon,
  GlobeIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mayarLogo from "@/assets/mayar-logo.png";
import { RepositoryInitializeDialog } from "@/components/views/repository-initialize-dialog";
import { useOpenRepositoryTabRouting } from "@/hooks/tabs/use-open-repository-tab-routing";
import { useTabUrlState } from "@/hooks/tabs/use-tab-url-state";
import {
  getPrimaryShortcutAria,
  getPrimaryShortcutLabel,
  isEditableTarget,
  isPrimaryShortcut,
} from "@/lib/keyboard-shortcuts";
import type { PickedRepositorySelection } from "@/stores/repo/repo-store-types";
import { useRepoStore } from "@/stores/repo/use-repo-store";

const MAYAR_URL = env.VITE_MAYAR_URL;
const SOURCE_CODE_URL = env.VITE_SOURCE_CODE_URL;
const BUG_REPORT_URL = env.VITE_BUG_REPORT_URL;
const RECENT_REPO_SEARCH_INPUT_ID = "recent-repositories-search";
const RECENT_REPO_SEARCH_HINT_ID = "recent-repositories-search-hint";
const RECENT_REPO_SEARCH_STATUS_ID = "recent-repositories-search-status";
const RECENT_LIST_SCROLL_EDGE_THRESHOLD = 2;
const RECENT_REPOS_COLLAPSED_LIMIT = 5;

export function NewTabContent() {
  const initializeRepository = useRepoStore(
    (state) => state.initializeRepository
  );
  const openRepository = useRepoStore((state) => state.openRepository);
  const openedRepos = useRepoStore((state) => state.openedRepos);
  const isPickingRepo = useRepoStore((state) => state.isPickingRepo);
  const { routeRepository } = useOpenRepositoryTabRouting();
  const { activeTabId } = useTabUrlState();

  const tabId = activeTabId || "";
  const [searchQuery, setSearchQuery] = useState("");
  const [isInitializingRepository, setIsInitializingRepository] =
    useState(false);
  const [pendingRepoInitialization, setPendingRepoInitialization] =
    useState<PickedRepositorySelection | null>(null);
  const [showRecentTopFade, setShowRecentTopFade] = useState(false);
  const [showRecentBottomFade, setShowRecentBottomFade] = useState(false);
  const [focusedRepoIndex, setFocusedRepoIndex] = useState(-1);
  const [isRecentExpanded, setIsRecentExpanded] = useState(false);
  const recentListRef = useRef<HTMLDivElement | null>(null);
  const repoButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const openShortcutLabel = getPrimaryShortcutLabel("o");
  const openShortcutAria = getPrimaryShortcutAria("o");
  const searchShortcutLabel = getPrimaryShortcutLabel("k");
  const searchShortcutAria = getPrimaryShortcutAria("k");
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredRepos = openedRepos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(normalizedSearchQuery) ||
      repo.path.toLowerCase().includes(normalizedSearchQuery)
  );

  const isSearching = normalizedSearchQuery.length > 0;
  const hasMoreThanLimit = filteredRepos.length > RECENT_REPOS_COLLAPSED_LIMIT;
  const shouldCollapse = hasMoreThanLimit && !isRecentExpanded && !isSearching;

  const visibleRepos = useMemo(
    () =>
      shouldCollapse
        ? filteredRepos.slice(0, RECENT_REPOS_COLLAPSED_LIMIT)
        : filteredRepos,
    [filteredRepos, shouldCollapse]
  );

  const hiddenCount = filteredRepos.length - RECENT_REPOS_COLLAPSED_LIMIT;

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

  const handleInitializeRepository = useCallback(async () => {
    if (!(pendingRepoInitialization && !isInitializingRepository)) {
      return;
    }

    setIsInitializingRepository(true);

    try {
      const openedRepository = await initializeRepository(
        pendingRepoInitialization
      );

      if (!openedRepository) {
        return;
      }

      setPendingRepoInitialization(null);
      await routeRepository(openedRepository.id, openedRepository.name, {
        preferredTabId: tabId,
      });
    } finally {
      setIsInitializingRepository(false);
    }
  }, [
    initializeRepository,
    isInitializingRepository,
    pendingRepoInitialization,
    routeRepository,
    tabId,
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleSearchShortcut = (event: KeyboardEvent) => {
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
    };

    window.addEventListener("keydown", handleSearchShortcut);

    return () => {
      window.removeEventListener("keydown", handleSearchShortcut);
    };
  }, [focusRecentSearchInput, pendingRepoInitialization]);

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
    [visibleRepos, focusedRepoIndex]
  );

  const totalReposLabel =
    openedRepos.length === 1 ? "repository" : "repositories";
  const filteredReposLabel =
    filteredRepos.length === 1 ? "repository" : "repositories";

  const searchStatusMessage = searchQuery
    ? `${filteredRepos.length} ${filteredReposLabel} found for ${searchQuery}`
    : `${openedRepos.length} recent ${totalReposLabel} available`;

  return (
    <div className="fade-in zoom-in-95 flex min-h-full w-full animate-in flex-col items-center justify-start bg-background text-foreground duration-300">
      <div className="flex w-full max-w-xl flex-col gap-10 px-6 py-10 sm:px-8 md:py-14 lg:max-w-2xl">
        {/* Branding — LitGit hero, clean and focused */}
        <header className="flex flex-col items-center gap-1.5 text-center">
          <div className="relative mb-5 flex items-center justify-center">
            {/* Logo container */}
            <div
              aria-hidden="true"
              className="relative flex size-10 rotate-45 items-center justify-center rounded-xl border border-border/50 bg-linear-to-br from-muted/80 to-muted/20 shadow-sm"
            >
              <GitBranchIcon
                className="size-5 -rotate-45 text-foreground/80 drop-shadow-sm"
                weight="bold"
              />
            </div>
          </div>
          <h1 className="bg-linear-to-br from-foreground to-muted-foreground bg-clip-text font-bold text-4xl text-transparent tracking-tight md:text-5xl">
            LitGit
          </h1>
          <p className="max-w-xs text-muted-foreground text-sm leading-relaxed">
            Fast, fluent, and minimal Git client
          </p>
        </header>

        {/* Quick actions */}
        <section aria-label="Quick actions">
          <TooltipProvider delay={1000}>
            <div className="flex flex-col gap-1.5">
              <Tooltip>
                <TooltipTrigger className="w-full">
                  <Button
                    aria-keyshortcuts={openShortcutAria}
                    className="h-12 w-full items-center gap-3 text-left"
                    disabled={isPickingRepo || isInitializingRepository}
                    onClick={() => {
                      handleOpenRepoPicker().catch(() => {
                        return;
                      });
                    }}
                  >
                    <GitBranchIcon
                      aria-hidden="true"
                      className="size-4.5 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-[0.9375rem]">
                      Open repository
                    </span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 rounded border border-primary-foreground/30 px-1.5 py-0.5 text-primary-foreground/80 text-xs leading-none tracking-wide"
                    >
                      {openShortcutLabel}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={8}>
                  Browse a local folder and open it in a tab.
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger className="w-full">
                  <span className="block w-full">
                    <Button
                      aria-disabled="true"
                      className="h-10 w-full items-center gap-3 text-left opacity-45"
                      disabled
                      variant="outline"
                    >
                      <DownloadSimpleIcon
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        Clone repository
                      </span>
                      <span className="shrink-0 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 font-medium text-[0.625rem] text-muted-foreground uppercase leading-none tracking-wide">
                        Soon
                      </span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={8}>
                  Clone from a remote URL directly in the workspace.
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger className="w-full">
                  <span className="block w-full">
                    <Button
                      aria-disabled="true"
                      className="h-10 w-full items-center gap-3 text-left opacity-45"
                      disabled
                      variant="outline"
                    >
                      <DesktopIcon
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        Start local repository
                      </span>
                      <span className="shrink-0 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 font-medium text-[0.625rem] text-muted-foreground uppercase leading-none tracking-wide">
                        Soon
                      </span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={8}>
                  Initialize a brand-new repository in a selected folder.
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </section>

        {/* Recent repositories */}
        <section
          aria-label="Recent repositories"
          className="flex min-h-0 flex-col gap-3"
        >
          <h2 className="font-medium text-foreground text-sm tracking-wide">
            Recent repositories
          </h2>

          <div className="relative">
            <Label className="sr-only" htmlFor={RECENT_REPO_SEARCH_INPUT_ID}>
              Search recent repositories
            </Label>
            <MagnifyingGlassIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-describedby={`${RECENT_REPO_SEARCH_HINT_ID} ${RECENT_REPO_SEARCH_STATUS_ID}`}
              aria-keyshortcuts={searchShortcutAria}
              className="h-9 pr-16 pl-9 text-sm"
              id={RECENT_REPO_SEARCH_INPUT_ID}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setFocusedRepoIndex(-1);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && searchQuery.length > 0) {
                  event.preventDefault();
                  setSearchQuery("");
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
              placeholder="Search recent repositories..."
              type="search"
              value={searchQuery}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 font-medium text-[0.65rem] text-muted-foreground leading-none tracking-wide"
            >
              {searchShortcutLabel}
            </span>
          </div>

          <p
            className="text-muted-foreground/70 text-xs leading-relaxed"
            id={RECENT_REPO_SEARCH_HINT_ID}
          >
            Search by repository name or path. Use {searchShortcutLabel} to
            focus quickly.
          </p>

          <output
            aria-live="polite"
            className="sr-only"
            id={RECENT_REPO_SEARCH_STATUS_ID}
          >
            {searchStatusMessage}
          </output>

          <div className="relative min-h-0 overflow-hidden">
            {showRecentTopFade && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-linear-to-b from-background to-transparent"
              />
            )}
            {showRecentBottomFade && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-linear-to-t from-background to-transparent"
              />
            )}
            <div
              aria-label={`Recent repositories list, ${searchStatusMessage}`}
              className="flex max-h-80 min-h-0 flex-col gap-1 overflow-y-auto pr-1 [scrollbar-width:thin]"
              onKeyDown={handleRepoListKeyDown}
              ref={recentListRef}
              role="listbox"
            >
              {visibleRepos.length === 0 ? (
                <div
                  aria-selected={false}
                  className="rounded border border-border/60 border-dashed py-6 text-center text-muted-foreground text-sm"
                  role="option"
                  tabIndex={-1}
                >
                  {searchQuery
                    ? `No repositories found matching "${searchQuery}"`
                    : "No recent repositories"}
                </div>
              ) : (
                visibleRepos.map((repo, index) => (
                  <div
                    aria-selected={focusedRepoIndex === index}
                    key={repo.id}
                    role="option"
                    tabIndex={-1}
                  >
                    <Button
                      aria-label={`Open repository ${repo.name}, located at ${repo.path}`}
                      className={cn(
                        "group flex h-auto w-full items-center gap-3 rounded-md border border-border/30 bg-background/15 px-3 py-2.5 text-left font-normal transition-colors hover:border-border/60 hover:bg-accent/30 focus-visible:border-ring/70 focus-visible:ring-2 focus-visible:ring-ring/40",
                        focusedRepoIndex === index &&
                          "border-border/60 bg-accent/30"
                      )}
                      onClick={() => {
                        routeRepository(repo.id, repo.name, {
                          preferredTabId: tabId,
                        }).catch(() => {
                          return;
                        });
                      }}
                      ref={(el) => {
                        if (el) {
                          repoButtonRefs.current.set(repo.id, el);
                        } else {
                          repoButtonRefs.current.delete(repo.id);
                        }
                      }}
                      tabIndex={focusedRepoIndex === index ? 0 : -1}
                      type="button"
                      variant="ghost"
                    >
                      <FolderSimpleIcon
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground/80 group-focus-visible:text-foreground/80"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground text-sm leading-snug">
                          {repo.name}
                        </span>
                        <span className="block truncate font-mono text-muted-foreground/80 text-xs leading-snug">
                          {repo.path}
                        </span>
                      </span>
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Show all / collapse toggle */}
          {hasMoreThanLimit && !isSearching && (
            <Button
              aria-expanded={isRecentExpanded}
              className="mx-auto h-7 gap-1.5 px-3 text-muted-foreground text-xs hover:text-foreground"
              onClick={() => setIsRecentExpanded((prev) => !prev)}
              type="button"
              variant="ghost"
            >
              <CaretDownIcon
                aria-hidden="true"
                className={cn(
                  "size-3 transition-transform duration-200",
                  isRecentExpanded && "rotate-180"
                )}
              />
              {isRecentExpanded
                ? "Show less"
                : `Show all (${hiddenCount} more)`}
            </Button>
          )}
        </section>

        {/* Resources & Mayar branding footer */}
        <footer className="flex flex-col items-center gap-4 border-border/40 border-t pt-5">
          <nav aria-label="External resources">
            <ul className="flex flex-wrap items-center justify-center gap-0.5">
              <li>
                <Button
                  aria-label="Visit Mayar website (opens in new window)"
                  className="h-7 gap-1.5 px-2 text-muted-foreground text-xs hover:text-foreground"
                  onClick={() => {
                    openExternalUrl(MAYAR_URL).catch(() => {
                      return;
                    });
                  }}
                  type="button"
                  variant="ghost"
                >
                  <GlobeIcon aria-hidden="true" className="size-3.5" />
                  Visit Mayar
                </Button>
              </li>
              <li>
                <Button
                  aria-label="View source code (opens in new window)"
                  className="h-7 gap-1.5 px-2 text-muted-foreground text-xs hover:text-foreground"
                  onClick={() => {
                    openExternalUrl(SOURCE_CODE_URL).catch(() => {
                      return;
                    });
                  }}
                  type="button"
                  variant="ghost"
                >
                  <CodeIcon aria-hidden="true" className="size-3.5" />
                  Source Code
                </Button>
              </li>
              <li>
                <Button
                  aria-label="Report a bug (opens in new window)"
                  className="h-7 gap-1.5 px-2 text-muted-foreground text-xs hover:text-foreground"
                  onClick={() => {
                    openExternalUrl(BUG_REPORT_URL).catch(() => {
                      return;
                    });
                  }}
                  type="button"
                  variant="ghost"
                >
                  <BugIcon aria-hidden="true" className="size-3.5" />
                  Report a Bug
                </Button>
              </li>
              <li>
                <Button
                  aria-disabled="true"
                  className="h-7 gap-1.5 px-2 text-muted-foreground text-xs opacity-45 hover:text-foreground"
                  disabled
                  type="button"
                  variant="ghost"
                >
                  <GearIcon aria-hidden="true" className="size-3.5" />
                  Settings
                  <span className="text-[0.6rem] text-muted-foreground/60 leading-none">
                    (Soon)
                  </span>
                </Button>
              </li>
            </ul>
          </nav>

          {/* Mayar pill badge — subtle, non-distracting */}
          <div className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-muted/20 px-3 py-1">
            <span className="text-[0.6rem] text-muted-foreground/60 uppercase tracking-[0.2em]">
              Built at
            </span>
            <span className="font-medium text-[0.7rem] text-foreground/85 leading-none">
              Mayar Hackathon
            </span>
            <img
              alt="Mayar brand logo"
              className="h-3.5 w-auto opacity-75"
              height={14}
              loading="lazy"
              src={mayarLogo}
              width={60}
            />
          </div>
        </footer>
      </div>

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
          }
        }}
        open={Boolean(pendingRepoInitialization)}
        repositoryName={pendingRepoInitialization?.name ?? "repository"}
      />
    </div>
  );
}
