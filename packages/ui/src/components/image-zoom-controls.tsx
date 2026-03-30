"use client";

import { Button } from "@litgit/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@litgit/ui/components/dropdown-menu";
import { formatZoomLabel, ZOOM_PRESETS } from "@litgit/ui/hooks/use-image-zoom";
import { cn } from "@litgit/ui/lib/utils";
import { CaretDownIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react";

const ZOOM_ACTIVE_TOLERANCE = 0.001;

export interface ImageZoomControlsProps {
  canZoomIn: boolean;
  canZoomOut: boolean;
  className?: string;
  currentScale: number;
  fitScale: number;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomTo: (scale: number) => void;
}

function isCloseToScale(scale: number, expectedScale: number): boolean {
  return Math.abs(scale - expectedScale) <= ZOOM_ACTIVE_TOLERANCE;
}

function ImageZoomControls({
  canZoomIn,
  canZoomOut,
  className,
  currentScale,
  fitScale,
  onFit,
  onZoomIn,
  onZoomOut,
  onZoomTo,
}: ImageZoomControlsProps) {
  const currentLabel = formatZoomLabel(currentScale, fitScale);
  const isFitActive = isCloseToScale(currentScale, fitScale);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-6 z-40 flex justify-center px-4",
        className
      )}
      data-slot="image-zoom-controls"
    >
      <div className="pointer-events-auto inline-flex items-center gap-1 rounded-none border border-border/70 bg-background/88 p-1 shadow-black/5 shadow-lg backdrop-blur-xs supports-backdrop-filter:bg-background/75">
        <Button
          aria-label="Zoom out"
          className="rounded-none"
          disabled={!canZoomOut}
          onClick={onZoomOut}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <MinusIcon />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                className="rounded-none px-3 font-medium"
                size="sm"
                type="button"
                variant="ghost"
              />
            }
          >
            <span>{currentLabel}</span>
            <CaretDownIcon className="pointer-events-none size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="center"
            className="w-40 min-w-40 rounded-none p-1"
            side="top"
            sideOffset={8}
          >
            <DropdownMenuItem
              aria-checked={isFitActive}
              className={cn(
                "rounded-none px-2 py-1.5 text-sm",
                isFitActive && "bg-muted text-foreground"
              )}
              onClick={onFit}
              role="menuitemradio"
            >
              Fit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {ZOOM_PRESETS.map((preset) => {
              const isPresetActive = isCloseToScale(currentScale, preset);

              return (
                <DropdownMenuItem
                  aria-checked={isPresetActive}
                  className={cn(
                    "rounded-none px-2 py-1.5 text-sm aria-checked:bg-muted aria-checked:text-foreground",
                    isPresetActive && "bg-muted text-foreground"
                  )}
                  key={preset}
                  onClick={() => {
                    onZoomTo(preset);
                  }}
                  role="menuitemradio"
                >
                  {Math.round(preset * 100)}%
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          aria-label="Zoom in"
          className="rounded-none"
          disabled={!canZoomIn}
          onClick={onZoomIn}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  );
}

export { ImageZoomControls };
