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
    ? "Initialize repository?"
    : "Initialize folder as repository?";
  const description = isRepositoryInitialized
    ? `Repository "${repositoryName}" must have an initial commit to be opened. Do you want LitGit to make that first commit for you?`
    : `Folder "${repositoryName}" is not a Git repository yet. Do you want LitGit to initialize it and create the first commit for you?`;

  let actionLabel = "Create repository";

  if (isRepositoryInitialized) {
    actionLabel = "Initialize";
  }

  if (isInitializing) {
    actionLabel = isRepositoryInitialized
      ? "Initializing..."
      : "Creating repository...";
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isInitializing} size="sm">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
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
