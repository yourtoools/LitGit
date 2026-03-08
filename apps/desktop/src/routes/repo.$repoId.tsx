import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({
  tabId: z.string().optional(),
});

export const Route = createFileRoute("/repo/$repoId")({
  validateSearch: searchSchema,
  component: lazyRouteComponent(
    () => import("@/components/views/repo-info"),
    "RepoInfo"
  ),
});
