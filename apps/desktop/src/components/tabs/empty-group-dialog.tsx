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
import type { TabGroup } from "@/components/tabs/types/tab-types";

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
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Empty tab group</AlertDialogTitle>
          <AlertDialogDescription>
            {group
              ? `Group "${group.name}" no longer has any tabs. Add a new tab to keep the group, or delete the empty group.`
              : "This group no longer has any tabs. Add a new tab to keep it, or delete the empty group."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:grid-cols-[1fr_1fr]">
          <AlertDialogAction onClick={onKeepGroup} size="sm" variant="outline">
            Keep group and add tab
          </AlertDialogAction>
          {group && (
            <AlertDialogAction
              onClick={onDeleteGroup}
              size="sm"
              variant="destructive"
            >
              <TrashIcon data-icon="inline-start" />
              Delete empty group
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
