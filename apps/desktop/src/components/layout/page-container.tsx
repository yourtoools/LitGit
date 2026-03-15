import { cn } from "@litgit/ui/lib/utils";
import type { HTMLAttributes } from "react";

interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const paddingSizes = {
  sm: "px-4 py-4 sm:px-6 sm:py-5",
  md: "px-6 py-5 sm:px-8 sm:py-6",
  lg: "px-10 py-6 lg:px-25 lg:py-11",
  xl: "px-12 py-8 lg:px-32 lg:py-16",
};

export function PageContainer({
  size = "lg",
  className,
  children,
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn("container mx-auto", paddingSizes[size], className)}
      {...props}
    >
      {children}
    </div>
  );
}
