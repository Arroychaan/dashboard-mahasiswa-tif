import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { bootstrapInitialSuperAdmin } from "~/server/auth/bootstrap";
import { verifySessionUser } from "~/server/auth/session";
import * as schema from "~/server/db/schema";
import { hashPassword } from "~/server/security/password";

let pgClient: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
type GuardDb = Parameters<typeof verifySessionUser>[0];
const asGuardDb = () => testDb as unknown as GuardDb;

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

describe("verifySessionUser server session guard", () => {
  beforeAll(async () => {
    pgClient = new PGlite();
    await applyMigrations(pgClient);
    testDb = drizzle(pgClient, { schema });
  });

  beforeEach(async () => {
    await pgClient.exec(
      'TRUNCATE TABLE "audit_logs", "users" RESTART IDENTITY CASCADE;',
    );
  });

  it("rejects null or incomplete sessions as UNAUTHENTICATED", async () => {
    const resNull = await verifySessionUser(asGuardDb(), null);
    expect(resNull).toEqual({
      ok: false,
      reason: "UNAUTHENTICATED",
      message: "Otentikasi diperlukan untuk mengakses prosedur ini.",
    });
  });

  it("rejects inactive users, role mismatches, and stale sessionVersion", async () => {
    const passwordHash = await hashPassword("EditorPass123!");
    const [editor] = await testDb
      .insert(schema.users)
      .values({
        name: "Editor Guard",
        email: "editor-guard@unissula.ac.id",
        passwordHash,
        role: "EDITOR",
        isActive: true,
        mfaEnabled: false,
        sessionVersion: 2,
      })
      .returning();

    const valid = await verifySessionUser(asGuardDb(), {
      expires: new Date(Date.now() + 3600_000).toISOString(),
      user: {
        id: editor!.id,
        name: editor!.name,
        email: editor!.email,
        role: "EDITOR",
        isActive: true,
        mfaVerified: false,
        sessionVersion: 2,
      },
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.userDto.email).toBe("editor-guard@unissula.ac.id");
      expect(valid.sessionUser.role).toBe("EDITOR");
    }

    const staleVersion = await verifySessionUser(asGuardDb(), {
      expires: new Date(Date.now() + 3600_000).toISOString(),
      user: {
        id: editor!.id,
        name: editor!.name,
        email: editor!.email,
        role: "EDITOR",
        isActive: true,
        mfaVerified: false,
        sessionVersion: 1,
      },
    });
    expect(staleVersion).toMatchObject({
      ok: false,
      reason: "INVALID_SESSION",
    });

    const roleMismatch = await verifySessionUser(asGuardDb(), {
      expires: new Date(Date.now() + 3600_000).toISOString(),
      user: {
        id: editor!.id,
        name: editor!.name,
        email: editor!.email,
        role: "ADMIN",
        isActive: true,
        mfaVerified: false,
        sessionVersion: 2,
      },
    });
    expect(roleMismatch).toMatchObject({
      ok: false,
      reason: "INVALID_SESSION",
    });
  });

  it("enforces mandatory MFA verification for SUPER_ADMIN sessions", async () => {
    const { user: superAdmin } = await bootstrapInitialSuperAdmin(
      asGuardDb() as unknown as Parameters<typeof bootstrapInitialSuperAdmin>[0],
      {
        name: "Super Admin",
        email: "super-guard@unissula.ac.id",
        password: "SuperStrongPassword123!",
      },
    );

    const unverified = await verifySessionUser(asGuardDb(), {
      expires: new Date(Date.now() + 3600_000).toISOString(),
      user: {
        id: superAdmin.id,
        name: superAdmin.name,
        email: superAdmin.email,
        role: "SUPER_ADMIN",
        isActive: true,
        mfaVerified: false,
        sessionVersion: 1,
      },
    });
    expect(unverified).toMatchObject({
      ok: false,
      reason: "MFA_REQUIRED",
    });

    const verified = await verifySessionUser(asGuardDb(), {
      expires: new Date(Date.now() + 3600_000).toISOString(),
      user: {
        id: superAdmin.id,
        name: superAdmin.name,
        email: superAdmin.email,
        role: "SUPER_ADMIN",
        isActive: true,
        mfaVerified: true,
        sessionVersion: 1,
      },
    });
    expect(verified.ok).toBe(true);
  });
});

