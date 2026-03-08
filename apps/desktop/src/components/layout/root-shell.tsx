import type { ReactNode } from "react";
import Header from "@/components/shell/header";

interface RootShellProps {
  children: ReactNode;
}

export function RootShell({ children }: RootShellProps) {
  return (
    <div className="grid h-dvh min-h-0 grid-rows-app-shell overflow-hidden">
      <Header />
      <main className="min-h-0 overflow-y-auto">{children}</main>
      {/* <Footer /> */}
    </div>
  );
}
