import { Antigravity } from "@litgit/ui/components/svgs/antigravity";
import { Bash } from "@litgit/ui/components/svgs/bash";
import { Cursor } from "@litgit/ui/components/svgs/cursor";
import { CursorDark } from "@litgit/ui/components/svgs/cursor-dark";
import { Linux } from "@litgit/ui/components/svgs/linux";
import { Powershell } from "@litgit/ui/components/svgs/powershell";
import { Vscode } from "@litgit/ui/components/svgs/vscode";
import { cn } from "@litgit/ui/lib/utils";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsLeftRightIcon,
  ArrowUpIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FolderOpenIcon,
  GearIcon,
  GitBranchIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TerminalWindowIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";

function ExplorerIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-[14px] shrink-0", className)}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M3 7.25h8.1l1.4 1.6H21v8.9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-10.5Z"
        fill="#FFD54F"
      />
      <path
        d="M3 8.25a2 2 0 0 1 2-2h5.55l1.4 1.6H19a2 2 0 0 1 2 2v.4H3v-2Z"
        fill="#64B5F6"
      />
      <path
        d="M3 10.25h18l-1.38 6.08a2 2 0 0 1-1.95 1.56H5.33a2 2 0 0 1-1.95-1.56L3 10.25Z"
        fill="#FFCA28"
      />
    </svg>
  );
}

export function renderHeaderTabsCommandIcon(
  commandId: string,
  resolvedTheme?: string
) {
  if (commandId.startsWith("settings:") || commandId === "open-settings") {
    return (
      <GearIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
    );
  }

  if (commandId.startsWith("open-with:")) {
    const appId = commandId.replace("open-with:", "");

    switch (appId) {
      case "file-manager":
        return <ExplorerIcon className="mt-0.5 shrink-0" />;
      case "terminal":
        return <Powershell className="mt-0.5 size-3.5 shrink-0" />;
      case "vscode":
        return <Vscode className="mt-0.5 size-3.5 shrink-0" />;
      case "cursor":
        if (resolvedTheme === "dark") {
          return <CursorDark className="mt-0.5 size-3.5 shrink-0" />;
        }
        return <Cursor className="mt-0.5 size-3.5 shrink-0" />;
      case "antigravity":
        return <Antigravity className="mt-0.5 size-3.5 shrink-0" />;
      case "git-bash":
        return <Bash className="mt-0.5 size-3.5 shrink-0" />;
      case "wsl":
        return <Linux className="mt-0.5 size-3.5 shrink-0" />;
      default:
        return (
          <FolderOpenIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        );
    }
  }

  switch (commandId) {
    case "new-tab":
    case "create-local-repository":
      return (
        <PlusIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    case "close-tab":
      return (
        <XIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    case "reopen-tab":
    case "undo-repo-action":
      return (
        <ArrowCounterClockwiseIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    case "next-tab":
      return (
        <ArrowRightIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    case "previous-tab":
      return (
        <ArrowLeftIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    case "search-tabs":
      return (
        <MagnifyingGlassIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    case "clone-repository":
    case "stash-changes":
      return (
        <DownloadSimpleIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    case "open-repository":
      return (
        <FolderOpenIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    case "create-branch":
      return (
        <GitBranchIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    case "pull":
    case "pull-fetch-all":
    case "pull-ff-only":
    case "pull-rebase":
      return (
        <ArrowDownIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    case "push":
      return (
        <ArrowUpIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    case "redo-repo-action":
      return (
        <ArrowClockwiseIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    case "pop-stash":
      return (
        <UploadSimpleIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    case "change-repository":
      return (
        <ArrowsLeftRightIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    case "copy-repo-path":
      return (
        <CopyIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    case "toggle-terminal":
      return (
        <TerminalWindowIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    default:
      return (
        <GitBranchIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
  }
}
