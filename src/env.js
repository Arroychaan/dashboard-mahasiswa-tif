import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side environment variables schema.
   */
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string().min(32)
        : z.string().min(1).optional(),
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Client-side environment variables schema (prefixed with `NEXT_PUBLIC_`).
   */
  client: {
    // No client-exposed secrets or variables required in Phase 1
  },

  /**
   * Manual destructuring of `process.env` for Next.js edge/bundler compatibility.
   */
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  },

  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION=1` to skip env validation (e.g. in CI/Docker build stages).
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
