import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({
  tabId: z.string().optional(),
});

export const Route = createFileRoute("/onboarding")({
  validateSearch: searchSchema,
  component: lazyRouteComponent(
    () => import("@/components/views/onboarding-page"),
    "OnboardingPage"
  ),
});
