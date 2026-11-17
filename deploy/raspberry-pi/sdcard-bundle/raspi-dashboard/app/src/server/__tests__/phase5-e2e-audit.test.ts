import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GraduateScene } from "~/components/public/GraduateScene";
import { createCaller } from "~/server/api/root";
import { type TRPCContext } from "~/server/api/trpc";
import { bootstrapInitialSuperAdmin } from "~/server/auth/bootstrap";
import { authenticateUserCredentials } from "~/server/auth/credentials";
import * as schema from "~/server/db/schema";
import { generateCurrentTotpToken } from "~/server/security/mfa";
import { resetRateLimiterForTests } from "~/server/security/rate-limit";
import { processAndStoreLecturerPhoto } from "~/server/storage/lecturer-photo";

let pgClient: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tempPhotoDir: string;

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

async function truncateAllTables(client: PGlite) {
  await client.exec(`
    TRUNCATE TABLE
      "publication_authors",
      "publications",
      "lecturers",
      "graduates",
      "audit_logs",
      "users"
    RESTART IDENTITY CASCADE;
  `);
}

function makeCallerForUser(
  user?: {
    id: string;
    name: string;
    email: string;
    role: schema.UserRole;
    isActive: boolean;
    mfaVerified: boolean;
    sessionVersion: number;
  } | null,
) {
  const ctx: TRPCContext = {
    db: testDb as unknown as TRPCContext["db"],
    headers: new Headers(),
    session: user
      ? {
          expires: new Date(Date.now() + 3600_000).toISOString(),
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            mfaVerified: user.mfaVerified,
            sessionVersion: user.sessionVersion,
          },
        }
      : null,
  };
  return createCaller(ctx);
}

describe("Phase 5 End-to-End Integration Workflow & OWASP ASVS Data Protection Audit", () => {
  beforeAll(async () => {
    pgClient = new PGlite();
    await applyMigrations(pgClient);
    testDb = drizzle(pgClient, { schema });
    tempPhotoDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "unissula-phase5-photos-"),
    );
  });

  afterAll(() => {
    if (tempPhotoDir && fs.existsSync(tempPhotoDir)) {
      fs.rmSync(tempPhotoDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await truncateAllTables(pgClient);
    resetRateLimiterForTests();
  });

  it("1. Executes the full 18-step end-to-end administrative & public dashboard lifecycle", async () => {
    const publicCaller = makeCallerForUser(null);

    // Step 0: Verify completely empty database state
    const emptyOverview = await publicCaller.publicDashboard.overview();
    expect(emptyOverview).toEqual({
      totalGraduates: 0,
      totalLecturers: 0,
      totalPublications: 0,
      totalJournals: 0,
      totalArticles: 0,
      lastUpdatedAt: null,
    });

    // Step 1: Bootstrap a SUPER_ADMIN in test environment
    const boot = await bootstrapInitialSuperAdmin(
      testDb as unknown as Parameters<typeof bootstrapInitialSuperAdmin>[0],
      {
        name: "Kepala Lab Informatika",
        email: "kalab@unissula.ac.id",
        password: "SuperAdminPassword!2026",
      },
    );
    expect(boot.user.role).toBe("SUPER_ADMIN");
    expect(boot.user.mfaEnabled).toBe(true);

    // Step 2: Authenticate securely with password + TOTP MFA
    const totpCode = generateCurrentTotpToken(
      boot.mfaEnrollment.secretBase32,
      "kalab@unissula.ac.id",
    );
    const authRes = await authenticateUserCredentials(
      testDb as unknown as Parameters<typeof authenticateUserCredentials>[0],
      {
        email: "kalab@unissula.ac.id",
        password: "SuperAdminPassword!2026",
        mfaCode: totpCode,
      },
      "e2e-client",
    );
    expect(authRes.ok).toBe(true);
    if (!authRes.ok) throw new Error("Expected SUPER_ADMIN login to succeed");

    const superCaller = makeCallerForUser(authRes.user);

    // Also create an ADMIN account for publishing steps
    const adminAccount = await superCaller.users.create({
      name: "Admin Prodi",
      email: "admin.if@unissula.ac.id",
      password: "AdminProdiPassword!2026",
      role: "ADMIN",
      isActive: true,
    });
    const adminCaller = makeCallerForUser({
      ...adminAccount,
      mfaVerified: true,
      sessionVersion: 1,
    });

    // Step 3: Create an EDITOR
    const editorAccount = await adminCaller.users.create({
      name: "Staf Editor Lab",
      email: "editor.if@unissula.ac.id",
      password: "EditorStafPassword!2026",
      role: "EDITOR",
      isActive: true,
    });
    expect(editorAccount.role).toBe("EDITOR");

    const editorCaller = makeCallerForUser({
      ...editorAccount,
      mfaVerified: true,
      sessionVersion: 1,
    });

    // Step 4: Verify EDITOR privileges and restrictions
    await expect(editorCaller.users.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(editorCaller.auditLogs.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // Step 5: Add a graduate as draft (EDITOR tries isPublished: true, server forces false)
    const draftGrad = await editorCaller.graduates.create({
      fullName: "Ahmad Fauzan, S.Kom.",
      entryYear: 2020,
      graduationYear: 2024,
      isPublished: true,
    });
    expect(draftGrad.isPublished).toBe(false);

    // Validate EDITOR cannot publish or delete the graduate
    await expect(
      editorCaller.graduates.setPublished({
        id: draftGrad.id,
        isPublished: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      editorCaller.graduates.delete({ id: draftGrad.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Step 6: Verify graduate is invisible publicly while in draft
    const overviewBeforeGradPublish =
      await publicCaller.publicDashboard.overview();
    expect(overviewBeforeGradPublish.totalGraduates).toBe(0);
    const publicGradsBefore = await publicCaller.publicDashboard.graduates();
    expect(publicGradsBefore.recentGraduates).toHaveLength(0);

    // Step 7: Publish graduate as ADMIN
    const publishedGrad = await adminCaller.graduates.setPublished({
      id: draftGrad.id,
      isPublished: true,
    });
    expect(publishedGrad.isPublished).toBe(true);

    // Step 8: Verify dashboard statistics update
    const overviewAfterGradPublish =
      await publicCaller.publicDashboard.overview();
    expect(overviewAfterGradPublish.totalGraduates).toBe(1);
    const publicGradsAfter = await publicCaller.publicDashboard.graduates();
    expect(publicGradsAfter.recentGraduates).toHaveLength(1);
    expect(publicGradsAfter.byGraduationYear).toEqual([
      { year: 2024, count: 1 },
    ]);

    // Step 9: Add a lecturer and profile photo
    const rawPhotoBuffer = await sharp({
      create: {
        width: 320,
        height: 320,
        channels: 3,
        background: { r: 15, g: 50, b: 120 },
      },
    })
      .png()
      .toBuffer();

    const storedPhoto = await processAndStoreLecturerPhoto({
      buffer: rawPhotoBuffer,
      declaredMimeType: "image/png",
      storageRootDir: tempPhotoDir,
    });

    const lecturer1 = await adminCaller.lecturers.create({
      fullName: "Dr. Ir. Bagus Setiawan, M.Kom.",
      nidn: "0615088001",
      nip: "198008152005011002",
      position: "Lektor Kepala",
      expertise: "Rekayasa Perangkat Lunak",
      education: "S3 Ilmu Komputer",
      biography: "Peneliti arsitektur sistem terdistribusi",
      photoPath: storedPhoto.photoPath,
      isPublished: false,
    });
    expect(lecturer1.isPublished).toBe(false);

    // Step 10: Add a publication linked to the lecturer
    const pub1 = await editorCaller.publications.create({
      title: "Arsitektur Mikroservis Tangguh pada Sistem Informasi Akademik",
      kind: "JOURNAL",
      journalName: "Jurnal Rekayasa Sistem dan Teknologi Informasi",
      publicationYear: 2025,
      doi: "10.29207/resti.v9i1.5001",
      url: "https://jurnal.iaii.or.id/index.php/RESTI",
      lecturerIds: [lecturer1.id],
      isPublished: false,
    });
    expect(pub1.isPublished).toBe(false);

    // Step 11: Publish lecturer and publication as ADMIN
    await adminCaller.lecturers.setPublished({
      id: lecturer1.id,
      isPublished: true,
    });
    await adminCaller.publications.setPublished({
      id: pub1.id,
      isPublished: true,
    });

    // Step 12: Verify public publication statistics
    const overviewAfterPub1 = await publicCaller.publicDashboard.overview();
    expect(overviewAfterPub1.totalLecturers).toBe(1);
    expect(overviewAfterPub1.totalPublications).toBe(1);
    expect(overviewAfterPub1.totalJournals).toBe(1);
    expect(overviewAfterPub1.totalArticles).toBe(0);

    // Step 13: Add a second lecturer to the same publication
    const lecturer2 = await adminCaller.lecturers.create({
      fullName: "Ratna Sari, S.Kom., M.Cs.",
      nidn: "0620118802",
      nip: "198811202015042001",
      position: "Lektor",
      expertise: "Keamanan Informasi",
      education: "S2 Ilmu Komputer",
      biography: "Peneliti kriptografi terapan",
      photoPath: null,
      isPublished: true,
    });

    await editorCaller.publications.update({
      id: pub1.id,
      title: pub1.title,
      kind: pub1.kind,
      journalName: pub1.journalName,
      publicationYear: pub1.publicationYear,
      doi: pub1.doi,
      url: pub1.url,
      lecturerIds: [lecturer1.id, lecturer2.id],
    });

    // Step 14: Verify distinct publication count stays correct (still 1, never duplicated!)
    const overviewAfterCoauthor = await publicCaller.publicDashboard.overview();
    expect(overviewAfterCoauthor.totalLecturers).toBe(2);
    expect(overviewAfterCoauthor.totalPublications).toBe(1);

    const publicPubsWithCoauthor =
      await publicCaller.publicDashboard.publications();
    expect(publicPubsWithCoauthor.recentPublications).toHaveLength(1);
    expect(publicPubsWithCoauthor.recentPublications[0]?.authors).toHaveLength(
      2,
    );

    const publicLecturers = await publicCaller.publicDashboard.lecturers();
    expect(publicLecturers).toHaveLength(2);
    expect(publicLecturers[0]?.publishedPublicationCount).toBe(1);
    expect(publicLecturers[1]?.publishedPublicationCount).toBe(1);

    // Step 15: Unpublish the publication
    await adminCaller.publications.setPublished({
      id: pub1.id,
      isPublished: false,
    });

    // Step 16: Verify public data and counts update immediately
    const overviewAfterUnpublish =
      await publicCaller.publicDashboard.overview();
    expect(overviewAfterUnpublish.totalPublications).toBe(0);
    expect(overviewAfterUnpublish.totalJournals).toBe(0);

    const publicPubsAfterUnpublish =
      await publicCaller.publicDashboard.publications();
    expect(publicPubsAfterUnpublish.recentPublications).toHaveLength(0);

    // Step 17: Deactivate the EDITOR user
    const deactivatedEditor = await adminCaller.users.setActive({
      id: editorAccount.id,
      isActive: false,
    });
    expect(deactivatedEditor.isActive).toBe(false);

    // Step 18: Verify their protected access is immediately revoked
    await expect(editorCaller.graduates.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    const deactivatedLogin = await authenticateUserCredentials(
      testDb as unknown as Parameters<typeof authenticateUserCredentials>[0],
      {
        email: "editor.if@unissula.ac.id",
        password: "EditorStafPassword!2026",
      },
      "e2e-client",
    );
    expect(deactivatedLogin.ok).toBe(false);
  });

  it("2. Protects against SQL Injection, Stored XSS, short passwords, and case-sensitive audit filters", async () => {
    const boot = await bootstrapInitialSuperAdmin(
      testDb as unknown as Parameters<typeof bootstrapInitialSuperAdmin>[0],
      {
        name: "Super Admin",
        email: "super@unissula.ac.id",
        password: "SuperAdminPassword!2026",
      },
    );

    const superCaller = makeCallerForUser({
      ...boot.user,
      mfaVerified: true,
      sessionVersion: 1,
    });
    const publicCaller = makeCallerForUser(null);

    // Verify 12-character minimum password enforcement on users.create
    await expect(
      superCaller.users.create({
        name: "Short Password User",
        email: "short@unissula.ac.id",
        password: "Short1!", // 7 chars (< 12)
        role: "EDITOR",
        isActive: true,
      }),
    ).rejects.toThrow();

    // Test SQL Injection payloads in search inputs
    const sqliPayload = `' OR 1=1; DROP TABLE "graduates"; --`;
    const gradSearchRes = await superCaller.graduates.list({
      search: sqliPayload,
      limit: 10,
      offset: 0,
    });
    expect(gradSearchRes).toEqual([]);

    const lectSearchRes = await superCaller.lecturers.list({
      search: sqliPayload,
      limit: 10,
      offset: 0,
    });
    expect(lectSearchRes).toEqual([]);

    // Test Stored XSS payload escaping in rendered Public Scene HTML
    const xssName = `<script>alert("XSS")</script><img src=x onerror=alert(1)>`;
    await superCaller.graduates.create({
      fullName: xssName,
      entryYear: 2020,
      graduationYear: 2024,
      isPublished: true,
    });

    const gradStats = await publicCaller.publicDashboard.graduates();
    const renderedHtml = renderToStaticMarkup(
      createElement(GraduateScene, { graduateStats: gradStats, pageIndex: 0 }),
    );
    expect(renderedHtml).not.toContain("<script>alert");
    expect(renderedHtml).toContain("&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;");

    // Verify case-insensitive entityType filter on auditLogs.list
    const logsLower = await superCaller.auditLogs.list({
      entityType: "graduate",
      limit: 10,
      offset: 0,
    });
    const logsUpper = await superCaller.auditLogs.list({
      entityType: "GRADUATE",
      limit: 10,
      offset: 0,
    });
    expect(logsLower.length).toBeGreaterThan(0);
    expect(logsLower.length).toBe(logsUpper.length);
  });
});

