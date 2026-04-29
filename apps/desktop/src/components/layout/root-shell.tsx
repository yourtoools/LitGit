import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BranchSelectorPalette } from "@/components/shell/branch-selector-palette";
import Footer from "@/components/shell/footer";
import Header from "@/components/shell/header";
import { WindowTitlebar } from "@/components/shell/window-titlebar";
import { shouldUseWindowTitlebar } from "@/lib/runtime-window-chrome";

interface RootShellProps {
  children: ReactNode;
}

export function RootShell({ children }: RootShellProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const usesWindowTitlebar = shouldUseWindowTitlebar();

  if (pathname === "/onboarding") {
    return (
      <div
        className={
          usesWindowTitlebar
            ? "grid h-dvh min-h-0 grid-rows-[auto_1fr] overflow-hidden"
            : "grid h-dvh min-h-0 grid-rows-[1fr] overflow-hidden"
        }
      >
        {usesWindowTitlebar ? <WindowTitlebar hideSearch /> : null}
        <main className="h-full min-h-0 overflow-y-auto">{children}</main>
      </div>
    );
  }

  return (
    <div className="grid h-dvh min-h-0 grid-rows-app-shell overflow-hidden">
      <Header />
      <main className="min-h-0 overflow-y-auto">{children}</main>
      <Footer />
      <BranchSelectorPalette />
    </div>
  );
}
