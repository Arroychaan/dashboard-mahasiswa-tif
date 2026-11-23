import { type Config } from "drizzle-kit";

process.loadEnvFile?.(".env");

import { env } from "~/env";

export default {
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
} satisfies Config;
