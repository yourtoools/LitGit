import { useMemo } from "react";
import { useRepoStore } from "@/stores/repo/use-repo-store";

export const useRootActiveRepoContext = () => {
  const activeRepoId = useRepoStore((state) => state.activeRepoId);
  const openedRepos = useRepoStore((state) => state.openedRepos);
  const activeRepo = useMemo(
    () => openedRepos.find((repo) => repo.id === activeRepoId) ?? null,
    [activeRepoId, openedRepos]
  );

  return useMemo(
    () => ({
      activeRepo,
      activeRepoId,
    }),
    [activeRepo, activeRepoId]
  );
};
