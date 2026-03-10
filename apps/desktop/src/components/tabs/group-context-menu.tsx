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
import { Button } from "@litgit/ui/components/button";
import { Input } from "@litgit/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@litgit/ui/components/popover";
import { cn } from "@litgit/ui/lib/utils";
import { ExportIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { GROUP_COLORS } from "@/components/tabs/lib/constants";
import { useTabStore } from "@/stores/tabs/use-tab-store";

interface GroupContextMenuProps {
  children: ReactNode;
  groupId: string;
}

export function GroupContextMenu({ groupId, children }: GroupContextMenuProps) {
  const groups = useTabStore((state) => state.groups);
  const renameGroup = useTabStore((state) => state.renameGroup);
  const updateGroupColor = useTabStore((state) => state.updateGroupColor);
  const closeGroup = useTabStore((state) => state.closeGroup);
  const ungroup = useTabStore((state) => state.ungroup);
  const addTab = useTabStore((state) => state.addTab);
  const addTabToGroup = useTabStore((state) => state.addTabToGroup);
  const editingGroupId = useTabStore((state) => state.editingGroupId);
  const setEditingGroupId = useTabStore((state) => state.setEditingGroupId);

  const group = groups.find((candidate) => candidate.id === groupId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmMode, setConfirmMode] = useState<"ungroup" | "close" | null>(
    null
  );

  const isOpen = editingGroupId === groupId;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [isOpen]);

  if (!group) {
    return <>{children}</>;
  }

  const closePopoverMenu = () => {
    setEditingGroupId(null);
  };

  const closeConfirmDialog = () => {
    setConfirmMode(null);
  };

  const handleNewTab = () => {
    const newTabId = addTab();

    if (newTabId) {
      addTabToGroup(newTabId, groupId);
    }

    closePopoverMenu();
  };

  const handleUngroupClick = () => {
    if (group.tabIds.length === 1) {
      setConfirmMode("ungroup");
      closePopoverMenu();
      return;
    }

    ungroup(groupId);
    closePopoverMenu();
  };

  const handleCloseGroupClick = () => {
    setConfirmMode("close");
    closePopoverMenu();
  };

  const handleConfirmAction = () => {
    if (confirmMode === "ungroup") {
      ungroup(groupId);
      closeConfirmDialog();
      return;
    }

    if (confirmMode === "close") {
      closeGroup(groupId);
      closeConfirmDialog();
    }
  };

  return (
    <>
      <Popover
        onOpenChange={(open) => {
          if (!open) {
            closePopoverMenu();
          }
        }}
        open={isOpen}
      >
        <PopoverTrigger
          render={
            <button
              className="border-0 bg-transparent p-0 outline-none"
              onContextMenu={(event) => {
                event.preventDefault();
                setEditingGroupId(groupId);
              }}
              tabIndex={-1}
              type="button"
            />
          }
        >
          {children}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-64 p-1 shadow-md ring-1 ring-border focus:outline-none"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setEditingGroupId(null);
            }
          }}
          side="bottom"
          sideOffset={8}
        >
          <div className="space-y-3 p-2">
            <Input
              className="h-9 w-full"
              onChange={(event) => renameGroup(groupId, event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="Name this group"
              ref={inputRef}
              value={group.name}
            />

            <div className="flex flex-wrap gap-1.5">
              {GROUP_COLORS.map((color) => (
                <button
                  className={cn(
                    "h-5 w-5 shrink-0 rounded-full border-2 transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                    group.color === color
                      ? "scale-110 border-foreground"
                      : "border-transparent"
                  )}
                  key={color}
                  onClick={() => updateGroupColor(groupId, color)}
                  style={{ backgroundColor: color }}
                  title={color}
                  type="button"
                />
              ))}
            </div>
          </div>

          <div className="-mx-1 my-1 h-px bg-border" />

          <div className="flex flex-col">
            <Button
              className="flex w-full justify-start gap-2"
              onClick={handleNewTab}
              variant="ghost"
            >
              <PlusIcon className="h-4 w-4 text-muted-foreground" />
              New tab in group
            </Button>

            <Button
              className="flex w-full justify-start gap-2"
              onClick={handleUngroupClick}
              variant="ghost"
            >
              <ExportIcon className="h-4 w-4 text-muted-foreground" />
              Ungroup
            </Button>

            <Button
              className="flex w-full justify-start gap-2 text-destructive"
              onClick={handleCloseGroupClick}
              variant="ghost"
            >
              <XIcon className="h-4 w-4" />
              Close group
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            closeConfirmDialog();
          }
        }}
        open={Boolean(confirmMode)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmMode === "ungroup"
                ? "Remove last tab group"
                : "Delete tab group"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMode === "ungroup"
                ? `Group "${group.name}" only has one tab left. Removing the group will keep the tab open as a regular tab.`
                : `Delete group "${group.name}" and close all tabs inside it.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              size="sm"
              variant={confirmMode === "ungroup" ? "default" : "destructive"}
            >
              {confirmMode === "ungroup" ? "Remove group" : "Delete group"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
