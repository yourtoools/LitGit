import { Button } from "@litgit/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import {
  DesktopIcon,
  DownloadSimpleIcon,
  FolderSimpleIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

interface QuickActionButtonProps {
  disabled?: boolean;
  icon: ReactNode;
  label: ReactNode;
  onClick: () => void;
  shortcut?: string;
  shortcutAriaLabel?: string;
  tooltip: string;
}

export function QuickActionButton({
  icon,
  label,
  shortcut,
  shortcutAriaLabel,
  tooltip,
  onClick,
  disabled,
}: QuickActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger className="w-full">
        <Button
          aria-keyshortcuts={shortcutAriaLabel}
          className="group h-auto w-full flex-col items-start justify-start gap-3 rounded-xl border border-primary/20 bg-primary/10 px-4 py-4 text-left shadow-none transition-colors hover:border-primary/45 hover:bg-primary/20"
          disabled={disabled}
          onClick={onClick}
          type="button"
          variant="ghost"
        >
          {icon}
          <span className="w-full">
            <span className="block font-mono text-primary/80 text-xs uppercase tracking-[0.2em] transition-colors group-hover:text-primary">
              Execute
            </span>
            <span className="mt-1 flex items-center gap-2 font-mono font-semibold text-sm tracking-tight">
              {label}
              {shortcut && (
                <span className="rounded border border-current/35 px-1.5 py-0.5 font-mono text-xs uppercase tracking-wider">
                  {shortcut}
                </span>
              )}
            </span>
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

interface QuickActionsLauncherProps {
  isInitializingRepository?: boolean;
  isPickingRepo?: boolean;
  onCloneRepository: () => void;
  onOpenRepository: () => void;
  onStartLocalRepository: () => void;
  openShortcutAria?: string;
  openShortcutLabel?: string;
}

export function QuickActionsLauncher({
  isInitializingRepository,
  isPickingRepo,
  onCloneRepository,
  onOpenRepository,
  onStartLocalRepository,
  openShortcutAria,
  openShortcutLabel,
}: QuickActionsLauncherProps) {
  const getOpenRepoButtonLabel = () => {
    if (isPickingRepo) {
      return "Opening…";
    }
    if (isInitializingRepository) {
      return "Initializing…";
    }
    return "Open repository";
  };

  return (
    <TooltipProvider delay={900}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <QuickActionButton
          disabled={isPickingRepo || isInitializingRepository}
          icon={
            <FolderSimpleIcon
              aria-hidden="true"
              className="size-5 text-primary transition-colors group-hover:text-primary"
            />
          }
          label={getOpenRepoButtonLabel()}
          onClick={onOpenRepository}
          shortcut={openShortcutLabel}
          shortcutAriaLabel={openShortcutAria}
          tooltip="Browse a local folder and open it in a tab."
        />
        <QuickActionButton
          icon={
            <DownloadSimpleIcon
              aria-hidden="true"
              className="size-5 text-primary transition-colors group-hover:text-primary"
            />
          }
          label="Clone Repository"
          onClick={onCloneRepository}
          tooltip="Clone from a remote URL to a local folder and open it."
        />
        <QuickActionButton
          icon={
            <DesktopIcon
              aria-hidden="true"
              className="size-5 text-primary transition-colors group-hover:text-primary"
            />
          }
          label="Start Local Repo"
          onClick={onStartLocalRepository}
          tooltip="Initialize a brand-new repository in a selected folder."
        />
      </div>
    </TooltipProvider>
  );
}
