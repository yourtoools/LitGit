import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@litgit/ui/components/alert-dialog";

interface RepositoryInitializeDialogProps {
  isInitializing: boolean;
  isRepositoryInitialized: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  repositoryName: string;
}

export function RepositoryInitializeDialog({
  open,
  repositoryName,
  isInitializing,
  isRepositoryInitialized,
  onOpenChange,
  onConfirm,
}: RepositoryInitializeDialogProps) {
  const title = isRepositoryInitialized
    ? "Create first commit"
    : "Create repository and first commit";
  const description = isRepositoryInitialized
    ? `Repository "${repositoryName}" needs an initial commit before LitGit can open it. LitGit can create that first commit for you now.`
    : `Folder "${repositoryName}" is not a Git repository yet. LitGit can initialize it and create the first commit for you now.`;

  let actionLabel = "Create repo";

  if (isRepositoryInitialized) {
    actionLabel = "Create commit";
  }

  if (isInitializing) {
    actionLabel = isRepositoryInitialized
      ? "Creating commit..."
      : "Creating repo...";
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent className="gap-3 p-3 text-xs" size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-sm">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="-mx-3 -mb-3 p-3">
          <AlertDialogCancel
            className="text-xs"
            disabled={isInitializing}
            size="sm"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="text-xs"
            disabled={isInitializing}
            onClick={onConfirm}
            size="sm"
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
