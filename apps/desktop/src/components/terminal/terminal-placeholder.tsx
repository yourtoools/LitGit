import { cn } from "@litgit/ui/lib/utils";
import { SpinnerGapIcon } from "@phosphor-icons/react";

interface TerminalPlaceholderProps {
  className?: string;
  description?: string;
  title?: string;
}

export function TerminalPlaceholder({
  className,
  description = "Starting runtime and shell session",
  title = "Opening terminal…",
}: TerminalPlaceholderProps) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "flex h-full flex-col items-center justify-center gap-2 rounded-md bg-background px-4 py-4",
        className
      )}
    >
      <div className="flex items-center gap-2 font-medium text-foreground">
        <SpinnerGapIcon
          aria-hidden="true"
          className="size-4 animate-spin text-muted-foreground"
        />
        <span>{title}</span>
      </div>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
