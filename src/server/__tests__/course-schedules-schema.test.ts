import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  COURSE_DAYS,
  COURSE_ROOMS,
  createCourseScheduleSchema,
  updateCourseScheduleSchema,
} from "~/lib/validators";
import * as schema from "~/server/db/schema";
import {
  DUMMY_COURSE_SCHEDULES,
  seedDummyCourseSchedules,
} from "~/server/db/seed-course-schedules";

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

describe("Task 1: course_schedules schema, validators & dummy seed", () => {
  beforeAll(async () => {
    pgClient = new PGlite();
    testDb = drizzle(pgClient, { schema });
    await applyMigrations(pgClient);
  });

  beforeEach(async () => {
    await pgClient.exec(`
      TRUNCATE TABLE "course_schedules" RESTART IDENTITY CASCADE;
    `);
  });

  it("exports expected day and room constants", () => {
    expect(COURSE_DAYS).toEqual([
      "SENIN",
      "SELASA",
      "RABU",
      "KAMIS",
      "JUMAT",
      "SABTU",
    ]);
    expect(COURSE_ROOMS).toEqual([
      "R106",
      "R107",
      "R108",
      "R109",
      "R303",
      "R304",
      "R305",
      "R306",
      "R307",
      "R308",
    ]);
  });

  it("validates valid course schedule payloads and rejects invalid/inverted time ranges", () => {
    const valid = createCourseScheduleSchema.safeParse({
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
    expect(valid.success).toBe(true);

    // Non-padded hour rejected
    expect(
      createCourseScheduleSchema.safeParse({
        dayOfWeek: "SENIN",
        startTime: "8:00",
        endTime: "09:30",
        courseName: "Kalkulus",
        className: "A",
        roomName: "R106",
        lecturerName: "Dosen A",
      }).success,
    ).toBe(false);

    // Out-of-bounds clock rejected
    expect(
      createCourseScheduleSchema.safeParse({
        dayOfWeek: "SENIN",
        startTime: "25:99",
        endTime: "26:00",
        courseName: "Kalkulus",
        className: "A",
        roomName: "R106",
        lecturerName: "Dosen A",
      }).success,
    ).toBe(false);

    // Inverted range (endTime < startTime) rejected
    expect(
      createCourseScheduleSchema.safeParse({
        dayOfWeek: "SENIN",
        startTime: "14:30",
        endTime: "13:00",
        courseName: "Kalkulus",
        className: "A",
        roomName: "R106",
        lecturerName: "Dosen A",
      }).success,
    ).toBe(false);

    // Equal range (endTime === startTime) rejected
    expect(
      createCourseScheduleSchema.safeParse({
        dayOfWeek: "SENIN",
        startTime: "13:00",
        endTime: "13:00",
        courseName: "Kalkulus",
        className: "A",
        roomName: "R106",
        lecturerName: "Dosen A",
      }).success,
    ).toBe(false);

    // Out-of-range semester rejected (0 and 9)
    expect(
      createCourseScheduleSchema.safeParse({
        dayOfWeek: "SENIN",
        startTime: "08:00",
        endTime: "09:30",
        courseName: "Kalkulus",
        className: "A",
        roomName: "R106",
        lecturerName: "Dosen A",
        semester: 0,
      }).success,
    ).toBe(false);
    expect(
      createCourseScheduleSchema.safeParse({
        dayOfWeek: "SENIN",
        startTime: "08:00",
        endTime: "09:30",
        courseName: "Kalkulus",
        className: "A",
        roomName: "R106",
        lecturerName: "Dosen A",
        semester: 9,
      }).success,
    ).toBe(false);

    // updateCourseScheduleSchema also enforces endTime > startTime
    expect(
      updateCourseScheduleSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        dayOfWeek: "SELASA",
        startTime: "15:00",
        endTime: "14:00",
        courseName: "Sistem Operasi",
        className: "A",
        roomName: "R305",
        lecturerName: "Dosen B",
      }).success,
    ).toBe(false);
  });

  it("seeds exactly 5 realistic published dummy schedules idempotently", async () => {
    expect(DUMMY_COURSE_SCHEDULES).toHaveLength(5);

    const first = await seedDummyCourseSchedules(
      testDb as unknown as Parameters<typeof seedDummyCourseSchedules>[0],
    );
    expect(first).toEqual({ insertedCount: 5, skipped: false });

    const rows = await testDb.select().from(schema.courseSchedules);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.isPublished)).toBe(true);

    const aiClass = rows.find((r) => r.courseName === "Kecerdasan Buatan");
    expect(aiClass).toMatchObject({
      dayOfWeek: "SENIN",
      className: "B",
      roomName: "R108",
      startTime: "13:00",
      endTime: "14:30",
    });

    const bioClass = rows.find((r) => r.courseName === "Sistem Biomedis");
    expect(bioClass).toMatchObject({
      dayOfWeek: "SENIN",
      className: "A",
      roomName: "R109",
      startTime: "13:00",
      endTime: "14:30",
    });

    // Second invocation is idempotent (0 inserted, skipped = true)
    const second = await seedDummyCourseSchedules(
      testDb as unknown as Parameters<typeof seedDummyCourseSchedules>[0],
    );
    expect(second).toEqual({ insertedCount: 0, skipped: true });

    const rowsAfter = await testDb.select().from(schema.courseSchedules);
    expect(rowsAfter).toHaveLength(5);
  });
});
