import { Toaster } from "@litgit/ui/components/sonner";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { RootShell } from "@/components/layout/root-shell";
import { ThemeProvider } from "@/components/providers/theme-provider";

import "@/styles/index.css";

export interface RouterAppContext extends Record<string, never> {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "LitGit",
      },
      {
        name: "description",
        content: "Fast, fluent, and minimal Git client",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <RootShell>
          <Outlet />
        </RootShell>
        <Toaster position="top-right" richColors />
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
    </>
  );
}
