import { cn } from "@litgit/ui/lib/utils";
import type * as React from "react";

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex w-full items-center rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        className
      )}
      data-slot="input-group"
      {...props}
    />
  );
}

function InputGroupAddon({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex shrink-0 items-center", className)}
      data-slot="input-group-addon"
      {...props}
    />
  );
}

export { InputGroup, InputGroupAddon };
