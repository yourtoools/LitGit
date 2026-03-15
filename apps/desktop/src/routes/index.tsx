import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({
  tabId: z.string().optional(),
  action: z.enum(["open", "clone"]).optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  component: lazyRouteComponent(
    () => import("@/components/views/new-tab"),
    "NewTabContent"
  ),
});
