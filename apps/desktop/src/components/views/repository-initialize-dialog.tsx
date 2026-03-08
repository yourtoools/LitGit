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
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  repositoryName: string;
}

export function RepositoryInitializeDialog({
  open,
  repositoryName,
  isInitializing,
  onOpenChange,
  onConfirm,
}: RepositoryInitializeDialogProps) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Initialize repository?</AlertDialogTitle>
          <AlertDialogDescription>
            Repository &quot;{repositoryName}&quot; must have an initial commit
            to be opened. Do you want LitGit to make a commit for you?
          </AlertDialogDescription>
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
            {isInitializing ? "Initializing..." : "Initialize"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
