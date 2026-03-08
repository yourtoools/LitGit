import { Button } from "@litgit/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@litgit/ui/components/dialog";
import { Input } from "@litgit/ui/components/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { KeyboardIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  getKeyboardShortcutsShortcutLabel,
  getNewTabShortcutLabel,
  getOpenRepositoryShortcutLabel,
  getPrimaryModifierAriaKey,
  getReopenClosedTabShortcutLabel,
  isEditableTarget,
  isShortcutHelpShortcut,
} from "@/lib/keyboard-shortcuts";

interface ShortcutEntry {
  description: string;
  group: string;
  id: string;
  keys: string[];
  keywords: string[];
  label: string;
}

const ShortcutKeys = ({ keys }: { keys: string[] }) => {
  return (
    <span className="flex items-center gap-1 font-medium text-foreground/90 text-xs">
      {keys.map((key) => (
        <kbd
          className="min-w-6 rounded-md border border-border/70 bg-background/90 px-1.5 py-0.5 text-center font-mono text-xs uppercase tracking-[0.16em] shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]"
          key={key}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
};

const shortcutLabelToKeys = (label: string) => {
  return label.split(" + ");
};

export function KeyboardShortcutsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [shortcutQuery, setShortcutQuery] = useState("");
  const shortcutHelpId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      const timeout = setTimeout(() => setShortcutQuery(""), 200);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  const shortcuts = useMemo<ShortcutEntry[]>(() => {
    return [
      {
        description:
          "Open the repository picker from anywhere in the workspace.",
        group: "Workspace",
        id: "open-repository",
        keywords: ["repository", "repo", "open", "picker", "workspace"],
        keys: shortcutLabelToKeys(getOpenRepositoryShortcutLabel()),
        label: "Open Repository",
      },
      {
        description: "Create a fresh tab without leaving the current context.",
        group: "Tabs",
        id: "new-tab",
        keywords: ["tab", "create", "new", "workspace"],
        keys: shortcutLabelToKeys(getNewTabShortcutLabel()),
        label: "New Tab",
      },
      {
        description: "Restore the most recently closed tab.",
        group: "Tabs",
        id: "reopen-tab",
        keywords: ["tab", "reopen", "restore", "closed", "history"],
        keys: shortcutLabelToKeys(getReopenClosedTabShortcutLabel()),
        label: "Reopen Closed Tab",
      },
      {
        description: "Open this shortcuts panel from anywhere in the app.",
        group: "Help",
        id: "keyboard-shortcuts",
        keywords: ["keyboard", "shortcuts", "help", "command", "palette"],
        keys: shortcutLabelToKeys(getKeyboardShortcutsShortcutLabel()),
        label: "Keyboard Shortcuts",
      },
      {
        description: "Move between visible shortcut rows inside the dialog.",
        group: "Dialog Navigation",
        id: "dialog-navigation",
        keywords: ["up", "down", "arrow", "navigate", "dialog"],
        keys: ["Up", "Down"],
        label: "Navigate Shortcuts",
      },
      {
        description:
          "Close the dialog and return focus to the previous trigger.",
        group: "Dialog Navigation",
        id: "dialog-close",
        keywords: ["escape", "close", "dismiss", "dialog"],
        keys: ["Esc"],
        label: "Close Dialog",
      },
    ];
  }, []);

  const visibleShortcuts = useMemo(() => {
    const normalizedQuery = shortcutQuery.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return shortcuts;
    }

    return shortcuts.filter((shortcut) => {
      const haystack = [
        shortcut.group,
        shortcut.label,
        shortcut.description,
        ...shortcut.keywords,
        ...shortcut.keys,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [shortcutQuery, shortcuts]);

  const shortcutGroups = useMemo(() => {
    return Array.from(
      new Set(visibleShortcuts.map((shortcut) => shortcut.group))
    );
  }, [visibleShortcuts]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleShortcutHelp = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      if (!isShortcutHelpShortcut(event)) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setIsOpen(true);
    };

    window.addEventListener("keydown", handleShortcutHelp);

    return () => {
      window.removeEventListener("keydown", handleShortcutHelp);
    };
  }, []);

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-haspopup="dialog"
              aria-keyshortcuts={`${getPrimaryModifierAriaKey()}+/`}
              aria-label={`Keyboard shortcuts (${getKeyboardShortcutsShortcutLabel()})`}
              className="hover:bg-transparent hover:text-foreground dark:hover:bg-transparent"
              onClick={() => setIsOpen(true)}
              size="icon-sm"
              variant="ghost"
            >
              <KeyboardIcon />
            </Button>
          }
        />
        <TooltipContent side="top">
          Keyboard Shortcuts ({getKeyboardShortcutsShortcutLabel()})
        </TooltipContent>
      </Tooltip>

      <Dialog onOpenChange={setIsOpen} open={isOpen}>
        <DialogContent
          className="max-w-2xl gap-0 overflow-hidden border border-border/70 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-background)_94%,transparent),color-mix(in_oklab,var(--color-muted)_78%,transparent))] p-0 shadow-2xl"
          showCloseButton={false}
        >
          <DialogHeader className="border-border/60 border-b px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle>Keyboard Shortcuts</DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-relaxed">
                  Search commands, actions, or keys. The list keeps a visible
                  scrollbar when it grows longer.
                </DialogDescription>
              </div>
              <div className="flex items-center gap-3">
                <ShortcutKeys
                  keys={shortcutLabelToKeys(
                    getKeyboardShortcutsShortcutLabel()
                  )}
                />
                <Button
                  aria-label="Close keyboard shortcuts"
                  className="-mt-1 -mr-2 hover:bg-transparent hover:text-foreground"
                  onClick={() => setIsOpen(false)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <XIcon />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="border-border/60 border-b px-4 py-4">
            <Input
              aria-describedby={shortcutHelpId}
              autoFocus
              onChange={(event) => setShortcutQuery(event.target.value)}
              placeholder="Filter shortcuts"
              ref={inputRef}
              value={shortcutQuery}
            />
            <p className="sr-only" id={shortcutHelpId}>
              This dialog lists available keyboard shortcuts. Use the filter
              field to narrow the list and press Escape to close the dialog.
            </p>
          </div>

          <div className="max-h-96 overflow-y-auto px-4 py-4 [scrollbar-color:color-mix(in_oklab,var(--color-muted-foreground)_55%,transparent)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/45 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2">
            {shortcutGroups.length === 0 ? (
              <div className="py-8 text-left">
                <p className="font-medium text-foreground text-sm">
                  No shortcuts found
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  Try searching for tab, repository, zoom, or escape.
                </p>
              </div>
            ) : (
              shortcutGroups.map((group) => (
                <section className="mb-6 last:mb-0" key={group}>
                  <div className="mb-2 px-3 font-semibold text-foreground text-sm">
                    {group}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {visibleShortcuts
                      .filter((shortcut) => shortcut.group === group)
                      .map((shortcut) => (
                        <div
                          className="group flex flex-col gap-1.5 rounded-md px-3 py-3 hover:bg-muted/50"
                          key={shortcut.id}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-foreground text-sm">
                              {shortcut.label}
                            </span>
                            <ShortcutKeys keys={shortcut.keys} />
                          </div>
                          <p className="text-muted-foreground text-sm leading-relaxed">
                            {shortcut.description}
                          </p>
                        </div>
                      ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
