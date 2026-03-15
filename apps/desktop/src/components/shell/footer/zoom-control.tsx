import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@litgit/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";

interface FooterZoomControlProps {
  onSelectZoom: (zoom: number) => void;
  zoom: number;
  zoomOptions: number[];
}

export function FooterZoomControl({
  zoom,
  zoomOptions,
  onSelectZoom,
}: FooterZoomControlProps) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              aria-label="Zoom level"
              className="relative flex cursor-pointer items-center gap-1 py-1 outline-none transition-colors hover:text-foreground"
            />
          }
        >
          <MagnifyingGlassIcon size={12} weight="bold" />
          <span className="pt-px leading-none">{zoom}%</span>
        </TooltipTrigger>
        <TooltipContent side="top">Zoom</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="z-50 min-w-20 text-xs"
        side="top"
        sideOffset={8}
      >
        {zoomOptions.map((option) => (
          <DropdownMenuItem
            className="flex cursor-pointer justify-between text-xs"
            key={option}
            onClick={() => onSelectZoom(option)}
          >
            <span>{option}%</span>
            {zoom === option ? (
              <span className="pr-1 text-primary">✓</span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
