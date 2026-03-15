import { useCallback, useState } from "react";
import { useOpenRepositoryTabRouting } from "@/hooks/tabs/use-open-repository-tab-routing";
import { useTabUrlState } from "@/hooks/tabs/use-tab-url-state";
import { useRepoStore } from "@/stores/repo/use-repo-store";

export function useLauncherActions() {
  const openRepository = useRepoStore((state) => state.openRepository);
  const isPickingRepo = useRepoStore((state) => state.isPickingRepo);
  const { routeRepository } = useOpenRepositoryTabRouting();
  const { activeTabId } = useTabUrlState();
  const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);

  const tabId = activeTabId || "";

  const handleOpenRepository = useCallback(async () => {
    if (isPickingRepo) {
      return;
    }

    const result = await openRepository();

    if (!result) {
      return;
    }

    if (result.status === "requires-initial-commit") {
      return result;
    }

    await routeRepository(result.repository.id, result.repository.name, {
      preferredTabId: tabId,
    });

    return result;
  }, [isPickingRepo, openRepository, routeRepository, tabId]);

  const handleOpenCloneDialog = useCallback(() => {
    setIsCloneDialogOpen(true);
  }, []);

  return {
    handleOpenCloneDialog,
    handleOpenRepository,
    isCloneDialogOpen,
    isPickingRepo,
    setIsCloneDialogOpen,
  };
}
