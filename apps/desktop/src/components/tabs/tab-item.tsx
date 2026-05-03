import { Button } from "@litgit/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { cn } from "@litgit/ui/lib/utils";
import {
  FolderSimpleIcon,
  GitBranchIcon,
  SpinnerGapIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import type { Tab } from "@/components/tabs/types/tab-types";
import { getNewTabShortcutLabel } from "@/lib/keyboard-shortcuts";
import { useRepoStore } from "@/stores/repo/use-repo-store";

interface TabItemProps {
  groupColor?: string;
  isActive: boolean;
  isFirst?: boolean;
  isLoading?: boolean;
  isSingleTab: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  tab: Tab;
}

export function TabItem(
  props: TabItemProps & {
    ref?: React.Ref<HTMLDivElement>;
  } & React.HTMLAttributes<HTMLDivElement>
) {
  const {
    tab,
    isActive,
    isLoading = false,
    isSingleTab,
    isFirst = false,
    groupColor,
    onActivate,
    onClose,
    ref,
    ...htmlProps
  } = props;
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [isCloseButtonHovered, setIsCloseButtonHovered] = useState(false);
  const repoPath = useRepoStore((state) => {
    if (!tab.repoId) {
      return null;
    }

    return (
      state.openedRepos.find((repo) => repo.id === tab.repoId)?.path ?? null
    );
  });

  const tabLabel = tab.title;
  const showBranchIcon = tab.repoId !== null;

  const inactiveTabClasses = isFirst
    ? "border-0 bg-background/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
    : "border-0 border-r border-r-border/40 bg-background/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground";

  return (
    <div
      className={cn(
        "group/tab relative inline-flex h-8 w-36 min-w-28 shrink items-center transition-colors duration-150",
        isActive
          ? "border border-border bg-muted/80 text-foreground"
          : inactiveTabClasses,
        htmlProps.className
      )}
      data-state={isActive ? "active" : "inactive"}
      onBlurCapture={(event) => {
        const nextFocusedElement = event.relatedTarget;

        if (
          !(
            nextFocusedElement instanceof Node &&
            event.currentTarget.contains(nextFocusedElement)
          )
        ) {
          setIsFocusWithin(false);
        }
      }}
      onFocusCapture={() => setIsFocusWithin(true)}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      ref={ref}
      style={htmlProps.style}
      {...htmlProps}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-busy={isActive && isLoading}
              aria-controls={`tabpanel-${tab.id}`}
              aria-label={`Open tab ${tabLabel}`}
              aria-selected={isActive}
              className={cn(
                "focus-visible:desktop-focus inline-flex h-full w-full flex-1 items-center gap-1.5 border-0 border-transparent px-2 font-medium text-xs transition-colors focus-visible:text-foreground focus-visible:ring-0! focus-visible:ring-offset-0!",
                !isSingleTab && "pr-5"
              )}
              data-tab-button="true"
              data-tab-id={tab.id}
              id={`tab-${tab.id}`}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onClose(tab.id);
                }
              }}
              onClick={() => onActivate(tab.id)}
              role="tab"
              tabIndex={isActive ? 0 : -1}
              type="button"
              variant="ghost"
            />
          }
        >
          <span className="flex w-full min-w-0 items-center gap-1.5 text-left">
            {groupColor ? (
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: groupColor }}
              />
            ) : null}
            {showBranchIcon ? (
              <GitBranchIcon aria-hidden="true" className="size-3 shrink-0" />
            ) : null}
            <span className="truncate">{tabLabel}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent
          align="start"
          className="max-w-80 space-y-1 px-2 py-1.5"
          side="bottom"
          sideOffset={6}
        >
          {tab.repoId ? (
            <>
              <div className="flex min-w-44 items-center gap-1.5 font-medium">
                <GitBranchIcon aria-hidden="true" className="size-3 shrink-0" />
                <span className="truncate">{tabLabel}</span>
              </div>
              <div className="flex items-center gap-1.5 text-background/70">
                <FolderSimpleIcon
                  aria-hidden="true"
                  className="size-3 shrink-0"
                />
                <span className="truncate">{repoPath ?? "-"}</span>
              </div>
            </>
          ) : (
            <div className="min-w-40">
              <p className="font-medium leading-tight">New Tab</p>
              <p className="mt-1 text-background/70 leading-tight">
                {getNewTabShortcutLabel()}
              </p>
            </div>
          )}
        </TooltipContent>
      </Tooltip>

      <Button
        aria-label={isLoading ? `Loading ${tabLabel}` : `Close ${tabLabel}`}
        className={cn(
          "focus-visible:desktop-focus absolute right-1 size-4 border border-transparent p-0 transition-opacity duration-150 focus-visible:opacity-100 focus-visible:ring-0! focus-visible:ring-offset-0!",
          !isSingleTab && (isActive || isHovered || isFocusWithin)
            ? "pointer-events-auto opacity-100 hover:border-border/70 hover:bg-background/80"
            : "pointer-events-none opacity-0"
        )}
        onClick={(e) => {
          e.stopPropagation();
          onClose(tab.id);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onPointerEnter={() => setIsCloseButtonHovered(true)}
        onPointerLeave={() => setIsCloseButtonHovered(false)}
        tabIndex={
          !isSingleTab && (isActive || isHovered || isFocusWithin) ? 0 : -1
        }
        type="button"
        variant="ghost"
      >
        {isLoading && !isCloseButtonHovered ? (
          <SpinnerGapIcon aria-hidden="true" className="size-3 animate-spin" />
        ) : (
          <XIcon aria-hidden="true" className="size-3" />
        )}
      </Button>
    </div>
  );
}
