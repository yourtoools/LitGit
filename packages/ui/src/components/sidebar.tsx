import { cn } from "@litgit/ui/lib/utils";
import type * as React from "react";

function Sidebar({ className, ...props }: React.ComponentProps<"aside">) {
  return (
    <aside
      className={cn(
        "flex h-full w-64 shrink-0 flex-col border-border/70 border-r bg-muted/25",
        className
      )}
      data-slot="sidebar"
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("border-border/70 border-b px-4 py-3", className)}
      data-slot="sidebar-header"
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("min-h-0 flex-1 overflow-y-auto px-2 py-3", className)}
      data-slot="sidebar-content"
      {...props}
    />
  );
}

function SidebarGroup({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn("mt-2 space-y-1", className)}
      data-slot="sidebar-group"
      {...props}
    />
  );
}

function SidebarGroupLabel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center justify-between px-2 py-1", className)}
      data-slot="sidebar-group-label"
      {...props}
    />
  );
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("space-y-1", className)}
      data-slot="sidebar-group-content"
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn("space-y-1", className)}
      data-slot="sidebar-menu"
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li className={cn(className)} data-slot="sidebar-menu-item" {...props} />
  );
}

function SidebarMenuButton({
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm transition-colors",
        className
      )}
      data-slot="sidebar-menu-button"
      type={type}
      {...props}
    />
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
};
