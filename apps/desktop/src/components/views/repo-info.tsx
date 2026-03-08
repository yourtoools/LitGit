import { FolderSimpleIcon, GitBranchIcon } from "@phosphor-icons/react";
import { useRepoStore } from "@/stores/repo/use-repo-store";

export function RepoInfo() {
  const activeRepoId = useRepoStore((state) => state.activeRepoId);
  const openedRepos = useRepoStore((state) => state.openedRepos);

  const activeRepo = openedRepos.find((repo) => repo.id === activeRepoId);

  if (!activeRepo) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">No repository selected</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <div className="flex items-center gap-3">
        <GitBranchIcon className="size-8 text-muted-foreground" />
        <h1 className="font-semibold text-2xl">{activeRepo.name}</h1>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <FolderSimpleIcon className="size-4" />
        <code className="text-sm">{activeRepo.path}</code>
      </div>
    </div>
  );
}
