import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_SOURCE_CODE_URL: z.url(),
    VITE_BUG_REPORT_URL: z.url(),
    VITE_RELEASE_NOTES_URL: z.url(),
  },
  runtimeEnvStrict: {
    VITE_SOURCE_CODE_URL: import.meta.env.VITE_SOURCE_CODE_URL,
    VITE_BUG_REPORT_URL: import.meta.env.VITE_BUG_REPORT_URL,
    VITE_RELEASE_NOTES_URL: import.meta.env.VITE_RELEASE_NOTES_URL,
  },
  emptyStringAsUndefined: true,
});
