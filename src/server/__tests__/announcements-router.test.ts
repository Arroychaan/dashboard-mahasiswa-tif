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

describe("Announcements & Feedback QR Router Verification", () => {
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
        "announcements",
        "system_settings",
        "audit_logs",
        "users"
      RESTART IDENTITY CASCADE;
    `);

    const pwd = await hashPassword("ValidPassword123!");
    const [adminUser] = await testDb
      .insert(schema.users)
      .values({
        name: "Admin User",
        email: "admin.announcements@unissula.ac.id",
        passwordHash: pwd,
        role: "ADMIN",
        isActive: true,
      })
      .returning();
    adminId = adminUser!.id;

    const [editorUser] = await testDb
      .insert(schema.users)
      .values({
        name: "Editor User",
        email: "editor.announcements@unissula.ac.id",
        passwordHash: pwd,
        role: "EDITOR",
        isActive: true,
      })
      .returning();
    editorId = editorUser!.id;
  });

  it("1. EDITOR can create and update draft announcements, but cannot publish or delete", async () => {
    const editorCaller = createCaller(
      makeContext(testDb, { id: editorId, role: "EDITOR" }),
    );

    const created = await editorCaller.announcements.create({
      title: "Ujian Susulan Semester Genap",
      category: "PENGUMUMAN",
      content: "Pendaftaran ujian susulan dibuka hingga akhir pekan.",
      eventDate: new Date("2026-11-25T08:00:00.000Z"),
      isPublished: true, // Should be forced to false for EDITOR
    });

    expect(created.id).toBeDefined();
    expect(created.isPublished).toBe(false);

    // Update announcement
    const updated = await editorCaller.announcements.update({
      id: created.id,
      title: "Ujian Susulan Semester Genap (Revisi)",
    });
    expect(updated.title).toBe("Ujian Susulan Semester Genap (Revisi)");

    // EDITOR cannot publish
    await expect(
      editorCaller.announcements.setPublished({
        id: created.id,
        isPublished: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // EDITOR cannot delete
    await expect(
      editorCaller.announcements.delete({ id: created.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("2. ADMIN can publish and delete announcements, and public caller only sees published items", async () => {
    const adminCaller = createCaller(
      makeContext(testDb, { id: adminId, role: "ADMIN" }),
    );
    const publicCaller = createCaller(makeContext(testDb, undefined));

    const item1 = await adminCaller.announcements.create({
      title: "Seminar Riset Informatika",
      category: "BERITA_ACARA",
      content: "Pelaksanaan seminar proposal riset mahasiswa tingkat akhir.",
      eventDate: new Date("2026-11-20T09:00:00.000Z"),
      isPublished: false,
    });

    const item2 = await adminCaller.announcements.create({
      title: "Pengumuman Magang MBKM",
      category: "PENGUMUMAN",
      content: "Informasi mitra industri untuk program magang semester depan.",
      eventDate: new Date("2026-11-22T10:00:00.000Z"),
      isPublished: true,
    });

    // Public only sees item2 (item1 is draft)
    let publicList = await publicCaller.publicDashboard.announcements();
    expect(publicList).toHaveLength(1);
    expect(publicList[0]?.id).toBe(item2.id);

    // ADMIN publishes item1
    await adminCaller.announcements.setPublished({
      id: item1.id,
      isPublished: true,
    });

    publicList = await publicCaller.publicDashboard.announcements();
    expect(publicList).toHaveLength(2);
    // Ordered by eventDate descending (item2 is 11-22, item1 is 11-20)
    expect(publicList[0]?.id).toBe(item2.id);
    expect(publicList[1]?.id).toBe(item1.id);

    // ADMIN deletes item2
    await adminCaller.announcements.delete({ id: item2.id });
    publicList = await publicCaller.publicDashboard.announcements();
    expect(publicList).toHaveLength(1);
    expect(publicList[0]?.id).toBe(item1.id);
  });

  it("3. Feedback QR: public receives default fallback, ADMIN can update, EDITOR is rejected", async () => {
    const publicCaller = createCaller(makeContext(testDb, undefined));
    const defaultQr = await publicCaller.publicDashboard.feedbackQr();
    expect(defaultQr.qrPath).toBe("/contoh.png");
    expect(defaultQr.title).toBe("Kotak Saran & Sumbangan");

    const editorCaller = createCaller(
      makeContext(testDb, { id: editorId, role: "EDITOR" }),
    );
    await expect(
      editorCaller.systemSettings.updateFeedbackQr({
        qrPath: "/uploads/qr/new-qr.webp",
        title: "Kotak Saran Mahasiswa",
        description: "Silakan pindai kode QR.",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const adminCaller = createCaller(
      makeContext(testDb, { id: adminId, role: "ADMIN" }),
    );
    const updatedRes = await adminCaller.systemSettings.updateFeedbackQr({
      qrPath: "/uploads/qr/new-qr.webp",
      title: "Kotak Saran & Aspirasi",
      description: "Pindai kode QR untuk menyampaikan saran dan sumbangan.",
    });
    expect(updatedRes.success).toBe(true);

    const publicUpdated = await publicCaller.publicDashboard.feedbackQr();
    expect(publicUpdated.qrPath).toBe("/uploads/qr/new-qr.webp");
    expect(publicUpdated.title).toBe("Kotak Saran & Aspirasi");
  });
});
