import { cn } from "@litgit/ui/lib/utils";
import type { HTMLAttributes } from "react";

interface PageShellProps extends HTMLAttributes<HTMLElement> {
  as?: "header" | "footer" | "div" | "section";
  children: React.ReactNode;
}

export function PageShell({
  as: Tag = "div",
  className,
  children,
  ...props
}: PageShellProps) {
  return (
    <Tag className={cn("px-2 sm:px-4", className)} {...props}>
      {children}
    </Tag>
  );
}
