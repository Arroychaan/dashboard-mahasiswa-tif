import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
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

describe("Task 2: courseSchedules Admin CRUD, RBAC & publicDashboard.courseSchedules", () => {
  let adminId: string;
  let editorId: string;

  beforeAll(async () => {
    pgClient = new PGlite();
    testDb = drizzle(pgClient, { schema });
    await applyMigrations(pgClient);
  });

  beforeEach(async () => {
    await pgClient.exec(`
      TRUNCATE TABLE
        "course_schedules",
        "audit_logs",
        "users"
      RESTART IDENTITY CASCADE;
    `);

    const pwd = await hashPassword("ValidPassword123!");
    const [adminUser] = await testDb
      .insert(schema.users)
      .values({
        name: "Admin Jadwal",
        email: "admin.jadwal@unissula.ac.id",
        passwordHash: pwd,
        role: "ADMIN",
        isActive: true,
      })
      .returning();
    adminId = adminUser!.id;

    const [editorUser] = await testDb
      .insert(schema.users)
      .values({
        name: "Editor Jadwal",
        email: "editor.jadwal@unissula.ac.id",
        passwordHash: pwd,
        role: "EDITOR",
        isActive: true,
      })
      .returning();
    editorId = editorUser!.id;
  });

  it("1. EDITOR can create/update draft schedules, is forced to isPublished=false, and is forbidden from publish/delete/seedDummy", async () => {
    const editorCaller = createCaller(
      makeContext(testDb, { id: editorId, role: "EDITOR" }),
    );
    const publicCaller = createCaller(makeContext(testDb, undefined));

    const created = await editorCaller.courseSchedules.create({
      dayOfWeek: "SENIN",
      startTime: "13:00",
      endTime: "14:30",
      courseName: "Kecerdasan Buatan",
      className: "B",
      roomName: "R108",
      lecturerName: "Dr. Ahmad Fauzi, M.Kom.",
      semester: 5,
      academicYear: "2026/2027",
      isPublished: true, // Must be forced to false for EDITOR
    });

    expect(created.id).toBeDefined();
    expect(created.isPublished).toBe(false);

    // Public display must not expose draft
    const publicList = await publicCaller.publicDashboard.courseSchedules();
    expect(publicList).toHaveLength(0);

    // EDITOR can update draft
    const updated = await editorCaller.courseSchedules.update({
      id: created.id,
      dayOfWeek: "SENIN",
      startTime: "13:00",
      endTime: "14:30",
      courseName: "Kecerdasan Buatan Lanjut",
      className: "B",
      roomName: "R108",
      lecturerName: "Dr. Ahmad Fauzi, M.Kom.",
      semester: 5,
      academicYear: "2026/2027",
    });
    expect(updated.courseName).toBe("Kecerdasan Buatan Lanjut");

    // EDITOR forbidden from setPublished, delete, seedDummy
    await expect(
      editorCaller.courseSchedules.setPublished({
        id: created.id,
        isPublished: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      editorCaller.courseSchedules.delete({ id: created.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      editorCaller.courseSchedules.seedDummy(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("2. ADMIN CRUD, filtering, deterministic Mon-Sat + startTime ordering, public visibility, and audit logging", async () => {
    const adminCaller = createCaller(
      makeContext(testDb, { id: adminId, role: "ADMIN" }),
    );
    const publicCaller = createCaller(makeContext(testDb, undefined));

    const tuesdayClass = await adminCaller.courseSchedules.create({
      dayOfWeek: "SELASA",
      startTime: "08:00",
      endTime: "09:30",
      courseName: "Desain Basis Data",
      className: "B",
      roomName: "R304",
      lecturerName: "Budi Santoso, M.T.",
      semester: 3,
      academicYear: "2026/2027",
      isPublished: true,
    });

    const mondayLate = await adminCaller.courseSchedules.create({
      dayOfWeek: "SENIN",
      startTime: "13:00",
      endTime: "14:30",
      courseName: "Kecerdasan Buatan",
      className: "B",
      roomName: "R108",
      lecturerName: "Dr. Ahmad Fauzi, M.Kom.",
      semester: 5,
      academicYear: "2026/2027",
      isPublished: true,
    });

    const mondayEarlyDraft = await adminCaller.courseSchedules.create({
      dayOfWeek: "SENIN",
      startTime: "08:00",
      endTime: "09:30",
      courseName: "Kalkulus",
      className: "A",
      roomName: "R106",
      lecturerName: "Dr. Hendra Kusuma",
      semester: 1,
      academicYear: "2026/2027",
      isPublished: false,
    });

    // Public list excludes draft and orders SENIN before SELASA
    let publicSchedules = await publicCaller.publicDashboard.courseSchedules();
    expect(publicSchedules.map((s) => s.id)).toEqual([
      mondayLate.id,
      tuesdayClass.id,
    ]);

    // Publish mondayEarlyDraft -> must appear before mondayLate on SENIN
    await adminCaller.courseSchedules.setPublished({
      id: mondayEarlyDraft.id,
      isPublished: true,
    });
    publicSchedules = await publicCaller.publicDashboard.courseSchedules();
    expect(publicSchedules.map((s) => s.id)).toEqual([
      mondayEarlyDraft.id,
      mondayLate.id,
      tuesdayClass.id,
    ]);

    // Admin search/day/room filters
    const byRoom = await adminCaller.courseSchedules.list({
      roomName: "R108",
    });
    expect(byRoom).toHaveLength(1);
    expect(byRoom[0]?.courseName).toBe("Kecerdasan Buatan");

    const byLecturerSearch = await adminCaller.courseSchedules.list({
      search: "Budi Santoso",
    });
    expect(byLecturerSearch).toHaveLength(1);
    expect(byLecturerSearch[0]?.id).toBe(tuesdayClass.id);

    const mondayCount = await adminCaller.courseSchedules.count({
      dayOfWeek: "SENIN",
    });
    expect(mondayCount.total).toBe(2);

    // Delete removes from public view
    await adminCaller.courseSchedules.delete({ id: mondayLate.id });
    publicSchedules = await publicCaller.publicDashboard.courseSchedules();
    expect(publicSchedules.map((s) => s.id)).toEqual([
      mondayEarlyDraft.id,
      tuesdayClass.id,
    ]);

    // Audit logs recorded for COURSE_SCHEDULE mutations
    const logs = await testDb
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityType, "COURSE_SCHEDULE"));
    expect(logs.length).toBeGreaterThanOrEqual(5);
  });

  it("3. ADMIN seedDummy populates 5 published items idempotently and stats reports exact counts", async () => {
    const adminCaller = createCaller(
      makeContext(testDb, { id: adminId, role: "ADMIN" }),
    );

    const seeded = await adminCaller.courseSchedules.seedDummy();
    expect(seeded).toEqual({ insertedCount: 5, skipped: false });

    const repeated = await adminCaller.courseSchedules.seedDummy();
    expect(repeated).toEqual({ insertedCount: 0, skipped: true });

    const stats = await adminCaller.courseSchedules.stats();
    expect(stats.total).toBe(5);
    expect(stats.published).toBe(5);
    expect(stats.draft).toBe(0);
    expect(stats.recentChanges).toHaveLength(5);
  });
});
