import { Button } from "@litgit/ui/components/button";
import { Input } from "@litgit/ui/components/input";
import { cn } from "@litgit/ui/lib/utils";
import {
  FolderSimpleIcon,
  GitBranchIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { useOpenRepositoryTabRouting } from "@/hooks/tabs/use-open-repository-tab-routing";
import { useTabUrlState } from "@/hooks/tabs/use-tab-url-state";
import { useRepoStore } from "@/stores/repo/use-repo-store";

export function NewTabContent() {
  const { activeTabId } = useTabUrlState();
  const tabId = activeTabId || "";

  const openRepository = useRepoStore((state) => state.openRepository);
  const openedRepos = useRepoStore((state) => state.openedRepos);
  const isPickingRepo = useRepoStore((state) => state.isPickingRepo);
  const { routeRepository } = useOpenRepositoryTabRouting();

  const [searchQuery, setSearchQuery] = useState("");

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredRepos = openedRepos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(normalizedSearchQuery) ||
      repo.path.toLowerCase().includes(normalizedSearchQuery)
  );

  const handleOpenRepoPicker = useCallback(async () => {
    if (isPickingRepo) {
      return;
    }

    const result = await openRepository();

    if (!result || result.status === "requires-initial-commit") {
      return;
    }

    await routeRepository(result.repository.id, result.repository.name, {
      preferredTabId: tabId,
    });
  }, [isPickingRepo, openRepository, routeRepository, tabId]);

  return (
    <div className="flex min-h-full flex-col items-center justify-start gap-4 bg-background px-6 py-12">
      {/* Title and Description */}
      <div className="text-center">
        <h1 className="mb-2 flex items-center justify-center gap-3 font-bold text-4xl">
          <GitBranchIcon className="size-10" />
          LitGit
        </h1>
        <p className="text-muted-foreground">
          Fast, fluent, and minimal Git client
        </p>
      </div>

      {/* Open Folder Button */}
      <Button
        className="h-auto gap-3 px-8 py-4 text-lg"
        disabled={isPickingRepo}
        onClick={() => {
          handleOpenRepoPicker().catch(() => {
            return;
          });
        }}
      >
        <FolderSimpleIcon className="size-6" />
        Open Repository
      </Button>

      {/* Recent Repositories */}
      <PageContainer className="w-full max-w-2xl lg:pt-6">
        <div className="rounded-xl border border-border/55 bg-card/35 p-6">
          <h2 className="mb-4 font-medium text-foreground text-lg">
            Recent Repositories
          </h2>

          {/* Search */}
          <div className="relative mb-4">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search recent repositories..."
              type="search"
              value={searchQuery}
            />
          </div>

          {/* Repository List */}
          <ul className="flex flex-col gap-2">
            {filteredRepos.length === 0 ? (
              <li className="rounded border border-border/60 border-dashed py-8 text-center text-muted-foreground text-sm">
                {searchQuery
                  ? `No repositories found matching "${searchQuery}"`
                  : "No recent repositories"}
              </li>
            ) : (
              filteredRepos.map((repo) => (
                <li key={repo.id}>
                  <Button
                    className={cn(
                      "flex h-auto w-full items-start gap-3 rounded-md border border-border/35 p-3 text-left font-normal transition-colors hover:border-border/70 hover:bg-accent/35"
                    )}
                    onClick={() => {
                      routeRepository(repo.id, repo.name, {
                        preferredTabId: tabId,
                      }).catch(() => {
                        return;
                      });
                    }}
                    type="button"
                    variant="ghost"
                  >
                    <FolderSimpleIcon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">
                        {repo.name}
                      </span>
                      <span className="block truncate text-muted-foreground text-xs">
                        {repo.path}
                      </span>
                    </span>
                  </Button>
                </li>
              ))
            )}
          </ul>
        </div>
      </PageContainer>
    </div>
  );
}
