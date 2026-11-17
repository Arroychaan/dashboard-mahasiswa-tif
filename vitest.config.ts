import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      SKIP_ENV_VALIDATION: "1",
      AUTH_SECRET: "test-only-auth-secret-key-at-least-32-characters",
      DATABASE_URL:
        "postgresql://postgres:postgres_dev_password@localhost:5432/dashboard_mahasiswa",
    },
    server: {
      deps: {
        inline: ["next-auth", "@t3-oss/env-nextjs"],
      },
    },
  },
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
