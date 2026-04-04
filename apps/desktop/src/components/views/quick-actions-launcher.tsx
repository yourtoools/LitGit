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
      <TooltipTrigger
        render={
          <Button
            aria-keyshortcuts={shortcutAriaLabel}
            className="focus-visible:desktop-focus group h-auto w-full flex-col items-start justify-start gap-2 border border-border/60 bg-card px-4 py-3 text-left shadow-sm transition-all duration-200 hover:border-primary/30 hover:bg-primary/5 hover:shadow-md focus-visible:ring-0! focus-visible:ring-offset-0!"
            disabled={disabled}
            onClick={onClick}
            type="button"
            variant="ghost"
          />
        }
      >
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/15">
          {icon}
        </div>
        <span className="w-full">
          <span className="block text-muted-foreground text-xs tracking-wide transition-colors group-hover:text-primary/80">
            Execute
          </span>
          <span className="mt-0.5 flex items-center gap-2 font-semibold text-sm tracking-tight">
            {label}
            {shortcut && (
              <span className="rounded border border-border/80 bg-muted/80 px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
                {shortcut}
              </span>
            )}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="rounded-lg" side="bottom" sideOffset={8}>
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
      return "Opening...";
    }
    if (isInitializingRepository) {
      return "Initializing...";
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
              className="size-5 text-primary"
              weight="duotone"
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
              className="size-5 text-primary"
              weight="regular"
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
              className="size-5 text-primary"
              weight="duotone"
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
