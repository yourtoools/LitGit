import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@litgit/ui/components/alert-dialog";
import { TrashIcon } from "@phosphor-icons/react";
import type { TabGroup } from "@/stores/tabs/tab-types";

interface EmptyGroupDialogProps {
  group: TabGroup | null;
  onDeleteGroup: () => void;
  onKeepGroup: () => void;
  onOpenChange: (open: boolean) => void;
}

export function EmptyGroupDialog({
  group,
  onDeleteGroup,
  onKeepGroup,
  onOpenChange,
}: EmptyGroupDialogProps) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={Boolean(group)}>
      <AlertDialogContent className="gap-3 p-3 text-xs" size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-sm">
            Empty tab group
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            {group
              ? `Group "${group.name}" no longer has any tabs. Add a new tab to keep the group, or delete the empty group.`
              : "This group no longer has any tabs. Add a new tab to keep it, or delete the empty group."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="-mx-3 -mb-3 p-3 sm:grid-cols-[1fr_1fr]">
          <AlertDialogAction
            className="text-xs"
            onClick={onKeepGroup}
            size="sm"
            variant="outline"
          >
            Keep group
          </AlertDialogAction>
          {group && (
            <AlertDialogAction
              className="text-xs"
              onClick={onDeleteGroup}
              size="sm"
              variant="destructive"
            >
              <TrashIcon data-icon="inline-start" />
              Delete group
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
