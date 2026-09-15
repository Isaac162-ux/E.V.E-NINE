import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

/**
 * Single source of truth for environment variables.
 *
 * Client values come from `import.meta.env` and must carry the VITE_ prefix.
 * Cloudflare bindings should be read from `cloudflare:workers` in server-only
 * code instead of from `process.env` at module scope.
 */
export const env = createEnv({
  clientPrefix: "VITE_",

  client: {
    VITE_APP_TITLE: z.string().min(1).optional(),

    /**
     * HappySeeds attribution badge. Both are optional and the badge stays
     * hidden without them, so a standalone app needs no configuration.
     */
    VITE_HAPPYSEEDS_PROJECT_ID: z.string().min(1).optional(),
    VITE_REACTUS_BASE_URL: z.url().optional(),

    /**
     * Umami analytics. Both are optional; the tracker only loads when the
     * script URL and the site id are present together.
     */
    VITE_UMAMI_SCRIPT_URL: z.url().optional(),
    VITE_UMAMI_WEBSITE_ID: z.string().min(1).optional(),
  },

  runtimeEnv: import.meta.env,

  /**
   * Treat `FOO=` as undefined so Zod reports it as missing rather than as a
   * type mismatch, and so defaults still apply.
   */
  emptyStringAsUndefined: true,
})
