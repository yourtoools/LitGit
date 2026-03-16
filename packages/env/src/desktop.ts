import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const DEFAULT_MAYAR_URL = "https://mayar.id";
const DEFAULT_SOURCE_CODE_URL = "https://github.com/yourtoools/LitGit";
const DEFAULT_BUG_REPORT_URL = "https://github.com/yourtoools/LitGit/issues";
const DEFAULT_RELEASE_NOTES_URL =
  "https://github.com/yourtoools/LitGit/releases";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_MAYAR_URL: z.url().catch(DEFAULT_MAYAR_URL),
    VITE_SOURCE_CODE_URL: z.url().catch(DEFAULT_SOURCE_CODE_URL),
    VITE_BUG_REPORT_URL: z.url().catch(DEFAULT_BUG_REPORT_URL),
    VITE_RELEASE_NOTES_URL: z.url().catch(DEFAULT_RELEASE_NOTES_URL),
  },
  runtimeEnvStrict: {
    VITE_MAYAR_URL: import.meta.env.VITE_MAYAR_URL ?? DEFAULT_MAYAR_URL,
    VITE_SOURCE_CODE_URL:
      import.meta.env.VITE_SOURCE_CODE_URL ?? DEFAULT_SOURCE_CODE_URL,
    VITE_BUG_REPORT_URL:
      import.meta.env.VITE_BUG_REPORT_URL ?? DEFAULT_BUG_REPORT_URL,
    VITE_RELEASE_NOTES_URL:
      import.meta.env.VITE_RELEASE_NOTES_URL ?? DEFAULT_RELEASE_NOTES_URL,
  },
  emptyStringAsUndefined: true,
});
