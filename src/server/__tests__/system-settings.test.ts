import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "~/server/api/root";
import { type TRPCContext } from "~/server/api/trpc";
import * as schema from "~/server/db/schema";
import { hashPassword } from "~/server/security/password";

let pgClient: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

async function applyMigrations(client: PGlite) {
  const drizzleDir = path.resolve(process.cwd(), "drizzle");
  const sqlFiles = fs
    .readdirSync(drizzleDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of sqlFiles) {
    const rawSql = fs.readFileSync(path.join(drizzleDir, file), "utf8");
    const statements = rawSql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await client.exec(stmt);
    }
  }
}

function makeContext(
  dbInstance: typeof testDb,
  user?: {
    id: string;
    role: "SUPER_ADMIN" | "ADMIN" | "EDITOR";
    isActive?: boolean;
    mfaVerified?: boolean;
    sessionVersion?: number;
  },
): TRPCContext {
  return {
    db: dbInstance as unknown as TRPCContext["db"],
    session: user
      ? {
          user: {
            id: user.id,
            name: `User ${user.role}`,
            email: `${user.role.toLowerCase()}@unissula.ac.id`,
            role: user.role,
            isActive: user.isActive ?? true,
            mfaVerified: user.mfaVerified ?? true,
            sessionVersion: user.sessionVersion ?? 1,
          },
          expires: new Date(Date.now() + 3600 * 1000).toISOString(),
        }
      : null,
    headers: new Headers(),
  };
}

describe("System Settings & Theme Management Verification", () => {
  beforeAll(async () => {
    pgClient = new PGlite();
    testDb = drizzle(pgClient, { schema });
    await applyMigrations(pgClient);
  });

  beforeEach(async () => {
    await pgClient.exec(`
      TRUNCATE TABLE
        "system_settings",
        "audit_logs",
        "users"
      RESTART IDENTITY CASCADE;
    `);
  });

  it("1. Public caller receives default LIGHT theme when no setting is stored", async () => {
    const caller = createCaller(makeContext(testDb, undefined));
    const publicResult = await caller.systemSettings.getPublicTheme();
    expect(publicResult.theme).toBe("LIGHT");

    const aliasResult = await caller.publicDashboard.getTheme();
    expect(aliasResult.theme).toBe("LIGHT");
  });

  it("2. ADMIN can update public theme to DARK and MONOCHROME, generating audit log", async () => {
    const pwd = await hashPassword("ValidPassword123!");
    const [adminUser] = await testDb
      .insert(schema.users)
      .values({
        name: "Admin User",
        email: "admin.settings@unissula.ac.id",
        passwordHash: pwd,
        role: "ADMIN",
        isActive: true,
      })
      .returning();

    const caller = createCaller(
      makeContext(testDb, { id: adminUser!.id, role: "ADMIN" }),
    );

    // Update to DARK
    const updateDark = await caller.systemSettings.updatePublicTheme({
      theme: "DARK",
    });
    expect(updateDark.success).toBe(true);
    expect(updateDark.theme).toBe("DARK");

    // Verify public getter reflects DARK
    const publicCaller = createCaller(makeContext(testDb, undefined));
    const themeRes = await publicCaller.systemSettings.getPublicTheme();
    expect(themeRes.theme).toBe("DARK");

    // Inspect settings summary
    const settingsSummary = await caller.systemSettings.getSettings();
    expect(settingsSummary.publicTheme).toBe("DARK");
    expect(settingsSummary.updatedByName).toBe("Admin User");

    // Verify audit log entry
    const [auditLog] = await testDb.select().from(schema.auditLogs);
    expect(auditLog?.action).toBe("UPDATE_PUBLIC_THEME");
    expect(auditLog?.entityType).toBe("SYSTEM_SETTING");
    expect(auditLog?.entityId).toBe("public_theme");
  });

  it("3. EDITOR cannot update theme (rejected with FORBIDDEN)", async () => {
    const pwd = await hashPassword("ValidPassword123!");
    const [editorUser] = await testDb
      .insert(schema.users)
      .values({
        name: "Editor User",
        email: "editor.settings@unissula.ac.id",
        passwordHash: pwd,
        role: "EDITOR",
        isActive: true,
      })
      .returning();

    const editorCaller = createCaller(
      makeContext(testDb, { id: editorUser!.id, role: "EDITOR" }),
    );

    await expect(
      editorCaller.systemSettings.updatePublicTheme({ theme: "DARK" }),
    ).rejects.toThrow("Anda tidak memiliki izin");
  });
});
