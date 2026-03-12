import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import Footer from "@/components/shell/footer";
import Header from "@/components/shell/header";

interface RootShellProps {
  children: ReactNode;
}

export function RootShell({ children }: RootShellProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  if (pathname === "/onboarding") {
    return (
      <div className="h-dvh min-h-0 overflow-hidden">
        <main className="h-full min-h-0 overflow-y-auto">{children}</main>
      </div>
    );
  }

  return (
    <div className="grid h-dvh min-h-0 grid-rows-app-shell overflow-hidden">
      <Header />
      <main className="min-h-0 overflow-y-auto">{children}</main>
      <Footer />
    </div>
  );
}
