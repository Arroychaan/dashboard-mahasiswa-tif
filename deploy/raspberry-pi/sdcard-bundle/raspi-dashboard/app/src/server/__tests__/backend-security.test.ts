import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createCaller } from "~/server/api/root";
import { type TRPCContext } from "~/server/api/trpc";
import { bootstrapInitialSuperAdmin } from "~/server/auth/bootstrap";
import {
  authenticateUserCredentials,
  GENERIC_AUTH_ERROR_MESSAGE,
} from "~/server/auth/credentials";
import * as schema from "~/server/db/schema";
import { generateCurrentTotpToken } from "~/server/security/mfa";
import { resetRateLimiterForTests } from "~/server/security/rate-limit";

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

describe("Phase 2 Backend Security, Auth, RBAC & Data Contract Verification", () => {
  beforeAll(async () => {
    pgClient = new PGlite();
    await applyMigrations(pgClient);
    testDb = drizzle(pgClient, { schema });
  });

  beforeEach(async () => {
    resetRateLimiterForTests();
    await truncateAllTables(pgClient);
  });

  it("1. Empty database behavior returns zero counts and empty arrays without errors", async () => {
    const publicCaller = makeCallerForUser(null);

    const overview = await publicCaller.publicDashboard.overview();
    expect(overview).toEqual({
      totalGraduates: 0,
      totalLecturers: 0,
      totalPublications: 0,
      totalJournals: 0,
      totalArticles: 0,
      lastUpdatedAt: null,
    });

    const gradStats = await publicCaller.publicDashboard.graduates();
    expect(gradStats).toEqual({
      byGraduationYear: [],
      byEntryYear: [],
      recentGraduates: [],
    });

    const lectList = await publicCaller.publicDashboard.lecturers();
    expect(lectList).toEqual([]);

    const pubStats = await publicCaller.publicDashboard.publications();
    expect(pubStats).toEqual({
      byYearAndKind: [],
      recentPublications: [],
    });
  });

  it("2. One-time SUPER_ADMIN bootstrap provisions encrypted MFA & blocks repeat execution", async () => {
    const boot = await bootstrapInitialSuperAdmin(
      testDb as unknown as Parameters<typeof bootstrapInitialSuperAdmin>[0],
      {
        name: "Principal Super Admin",
        email: "superadmin@unissula.ac.id",
        password: "StrongSuperAdminPass!2026",
      },
    );

    expect(boot.user.role).toBe("SUPER_ADMIN");
    expect(boot.user.mfaEnabled).toBe(true);
    expect(boot.mfaEnrollment.recoveryCodes).toHaveLength(8);

    // Repeat bootstrap must fail and never overwrite existing account
    await expect(
      bootstrapInitialSuperAdmin(
        testDb as unknown as Parameters<typeof bootstrapInitialSuperAdmin>[0],
        {
          name: "Attacker Super Admin",
          email: "other@unissula.ac.id",
          password: "AnotherStrongPass!2026",
        },
      ),
    ).rejects.toThrow(/BOOTSTRAP_ALREADY_COMPLETED/);
  });

  it("3. Authentication: Argon2id verification, mandatory SUPER_ADMIN TOTP MFA, recovery codes, inactive blocking & rate limiting", async () => {
    const boot = await bootstrapInitialSuperAdmin(
      testDb as unknown as Parameters<typeof bootstrapInitialSuperAdmin>[0],
      {
        name: "Super Admin",
        email: "super@unissula.ac.id",
        password: "SuperSecretPassword!2026",
      },
    );

    const dbClient = testDb as unknown as Parameters<
      typeof authenticateUserCredentials
    >[0];

    // Missing MFA code for SUPER_ADMIN must fail with generic message
    const missingMfa = await authenticateUserCredentials(
      dbClient,
      {
        email: "super@unissula.ac.id",
        password: "SuperSecretPassword!2026",
      },
      "client-1",
    );
    expect(missingMfa.ok).toBe(false);
    if (!missingMfa.ok) {
      expect(missingMfa.message).toBe(GENERIC_AUTH_ERROR_MESSAGE);
    }

    // Valid TOTP code succeeds
    const validTotp = generateCurrentTotpToken(
      boot.mfaEnrollment.secretBase32,
      "super@unissula.ac.id",
    );
    const validLogin = await authenticateUserCredentials(
      dbClient,
      {
        email: "super@unissula.ac.id",
        password: "SuperSecretPassword!2026",
        mfaCode: validTotp,
      },
      "client-1",
    );
    expect(validLogin.ok).toBe(true);
    if (validLogin.ok) {
      expect(validLogin.user.role).toBe("SUPER_ADMIN");
      expect(validLogin.user.mfaVerified).toBe(true);
    }

    // Recovery code login works once and is consumed (cannot be reused)
    const firstRecoveryCode = boot.mfaEnrollment.recoveryCodes[0]!;
    const recoveryLogin1 = await authenticateUserCredentials(
      dbClient,
      {
        email: "super@unissula.ac.id",
        password: "SuperSecretPassword!2026",
        mfaCode: firstRecoveryCode,
      },
      "client-2",
    );
    expect(recoveryLogin1.ok).toBe(true);

    const recoveryLogin2 = await authenticateUserCredentials(
      dbClient,
      {
        email: "super@unissula.ac.id",
        password: "SuperSecretPassword!2026",
        mfaCode: firstRecoveryCode,
      },
      "client-2",
    );
    expect(recoveryLogin2.ok).toBe(false);

    // Session without mfaVerified = true cannot bypass MFA at tRPC middleware layer
    const unverifiedSuperCaller = makeCallerForUser({
      id: boot.user.id,
      name: boot.user.name,
      email: boot.user.email,
      role: "SUPER_ADMIN",
      isActive: true,
      mfaVerified: false,
      sessionVersion: 1,
    });
    await expect(unverifiedSuperCaller.users.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // Brute force rate limit after 5 failed attempts
    for (let i = 0; i < 5; i++) {
      const attempt = await authenticateUserCredentials(
        dbClient,
        {
          email: "super@unissula.ac.id",
          password: "WrongPassword123!",
          mfaCode: "000000",
        },
        "brute-client",
      );
      expect(attempt.ok).toBe(false);
    }

    const rateLimitedAttempt = await authenticateUserCredentials(
      dbClient,
      {
        email: "super@unissula.ac.id",
        password: "SuperSecretPassword!2026",
        mfaCode: validTotp,
      },
      "brute-client",
    );
    expect(rateLimitedAttempt.ok).toBe(false);
    if (!rateLimitedAttempt.ok) {
      expect(rateLimitedAttempt.code).toBe("RATE_LIMITED");
    }
  });

  it("4. RBAC boundaries, privilege escalation prevention, and live session invalidation", async () => {
    const boot = await bootstrapInitialSuperAdmin(
      testDb as unknown as Parameters<typeof bootstrapInitialSuperAdmin>[0],
      {
        name: "Super Admin",
        email: "super@unissula.ac.id",
        password: "SuperSecretPassword!2026",
      },
    );

    const superCaller = makeCallerForUser({
      ...boot.user,
      mfaVerified: true,
      sessionVersion: 1,
    });

    // SUPER_ADMIN creates an ADMIN and an EDITOR
    const adminUser = await superCaller.users.create({
      name: "Admin Lab",
      email: "admin@unissula.ac.id",
      password: "AdminPassword!2026",
      role: "ADMIN",
      isActive: true,
    });

    const adminCaller = makeCallerForUser({
      id: adminUser.id,
      name: adminUser.name,
      email: adminUser.email,
      role: "ADMIN",
      isActive: true,
      mfaVerified: true,
      sessionVersion: 1,
    });

    // ADMIN can create an EDITOR account
    const editorUser = await adminCaller.users.create({
      name: "Editor Lab",
      email: "editor@unissula.ac.id",
      password: "EditorPassword!2026",
      role: "EDITOR",
      isActive: true,
    });
    expect(editorUser.role).toBe("EDITOR");

    // ADMIN cannot create ADMIN or SUPER_ADMIN accounts
    await expect(
      adminCaller.users.create({
        name: "Rogue Admin",
        email: "rogue@unissula.ac.id",
        password: "RoguePassword!2026",
        role: "ADMIN",
        isActive: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      adminCaller.users.create({
        name: "Rogue Super",
        email: "roguesuper@unissula.ac.id",
        password: "RoguePassword!2026",
        role: "SUPER_ADMIN",
        isActive: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // ADMIN cannot promote themselves or modify SUPER_ADMIN / ADMIN accounts
    await expect(
      adminCaller.users.changeRole({
        id: adminUser.id,
        role: "SUPER_ADMIN",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      adminCaller.users.changeRole({
        id: editorUser.id,
        role: "ADMIN",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      adminCaller.users.setActive({
        id: boot.user.id,
        isActive: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // ADMIN cannot view sensitive audit logs (restricted to SUPER_ADMIN)
    await expect(adminCaller.auditLogs.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // EDITOR permissions check
    const editorCaller = makeCallerForUser({
      id: editorUser.id,
      name: editorUser.name,
      email: editorUser.email,
      role: "EDITOR",
      isActive: true,
      mfaVerified: true,
      sessionVersion: 1,
    });

    // EDITOR can create graduate draft, but passing isPublished: true is forced to false
    const draftGrad = await editorCaller.graduates.create({
      fullName: "Ahmad Fauzi",
      entryYear: 2020,
      graduationYear: 2024,
      isPublished: true,
    });
    expect(draftGrad.isPublished).toBe(false);

    // EDITOR cannot publish or delete content
    await expect(
      editorCaller.graduates.setPublished({
        id: draftGrad.id,
        isPublished: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      editorCaller.graduates.delete({ id: draftGrad.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // EDITOR cannot list/manage users or audit logs
    await expect(editorCaller.users.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(editorCaller.auditLogs.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // Deactivating EDITOR immediately invalidates their existing session on next request
    await adminCaller.users.setActive({
      id: editorUser.id,
      isActive: false,
    });
    await expect(editorCaller.graduates.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("5. Last active SUPER_ADMIN protection blocks self/other deactivation or demotion", async () => {
    const boot = await bootstrapInitialSuperAdmin(
      testDb as unknown as Parameters<typeof bootstrapInitialSuperAdmin>[0],
      {
        name: "Sole Super Admin",
        email: "sole@unissula.ac.id",
        password: "SoleSuperPassword!2026",
      },
    );

    const superCaller = makeCallerForUser({
      ...boot.user,
      mfaVerified: true,
      sessionVersion: 1,
    });

    // Cannot deactivate or demote the sole active SUPER_ADMIN
    await expect(
      superCaller.users.setActive({
        id: boot.user.id,
        isActive: false,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      superCaller.users.changeRole({
        id: boot.user.id,
        role: "ADMIN",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Create a second active SUPER_ADMIN
    const secondSuper = await superCaller.users.create({
      name: "Second Super Admin",
      email: "second@unissula.ac.id",
      password: "SecondSuperPassword!2026",
      role: "SUPER_ADMIN",
      isActive: true,
    });

    // Now demoting the second SUPER_ADMIN succeeds because the first remains active
    const demoted = await superCaller.users.changeRole({
      id: secondSuper.id,
      role: "ADMIN",
    });
    expect(demoted.role).toBe("ADMIN");

    // And the first SUPER_ADMIN is once again protected as the last active SUPER_ADMIN
    await expect(
      superCaller.users.setActive({
        id: boot.user.id,
        isActive: false,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("6. Input validation blocks invalid years, unsafe URLs, duplicate coauthors, and NIM injection", async () => {
    const boot = await bootstrapInitialSuperAdmin(
      testDb as unknown as Parameters<typeof bootstrapInitialSuperAdmin>[0],
      {
        name: "Super Admin",
        email: "super@unissula.ac.id",
        password: "SuperSecretPassword!2026",
      },
    );
    const superCaller = makeCallerForUser({
      ...boot.user,
      mfaVerified: true,
      sessionVersion: 1,
    });

    // graduationYear < entryYear rejected
    await expect(
      superCaller.graduates.create({
        fullName: "Invalid Year Student",
        entryYear: 2025,
        graduationYear: 2023,
        isPublished: false,
      }),
    ).rejects.toThrow();

    // Injecting unknown field `nim` rejected by strict Zod schema
    await expect(
      superCaller.graduates.create({
        fullName: "NIM Injection Attempt",
        entryYear: 2020,
        graduationYear: 2024,
        isPublished: false,
        // @ts-expect-error testing runtime rejection of forbidden NIM property
        nim: "30102000001",
      }),
    ).rejects.toThrow();

    const lect = await superCaller.lecturers.create({
      fullName: "Dr. Budi Santoso",
      nidn: "0601018501",
      nip: "198501012010121001",
      position: "Lektor Kepala",
      expertise: "Kecerdasan Buatan",
      isPublished: true,
    });

    // Unsafe javascript: URL rejected
    await expect(
      superCaller.publications.create({
        title: "XSS URL Paper",
        kind: "JOURNAL",
        journalName: "Jurnal Informatika",
        publicationYear: 2025,
        url: "javascript:alert(1)",
        lecturerIds: [lect.id],
        isPublished: false,
      }),
    ).rejects.toThrow();

    // Duplicate lecturerIds rejected
    await expect(
      superCaller.publications.create({
        title: "Duplicate Coauthor Paper",
        kind: "JOURNAL",
        journalName: "Jurnal Informatika",
        publicationYear: 2025,
        lecturerIds: [lect.id, lect.id],
        isPublished: false,
      }),
    ).rejects.toThrow();
  });

  it("7. Publication coauthors, explicit deletion protection, distinct counting, and strict public DTO separation", async () => {
    const boot = await bootstrapInitialSuperAdmin(
      testDb as unknown as Parameters<typeof bootstrapInitialSuperAdmin>[0],
      {
        name: "Super Admin",
        email: "super@unissula.ac.id",
        password: "SuperSecretPassword!2026",
      },
    );
    const superCaller = makeCallerForUser({
      ...boot.user,
      mfaVerified: true,
      sessionVersion: 1,
    });
    const publicCaller = makeCallerForUser(null);

    // Create 2 published lecturers and 1 unpublished lecturer (all with private NIP)
    const lect1 = await superCaller.lecturers.create({
      fullName: "Dr. Siti Aminah",
      nidn: "0611028201",
      nip: "198202112008012005",
      position: "Lektor Kepala",
      expertise: "Rekayasa Perangkat Lunak",
      isPublished: true,
    });

    const lect2 = await superCaller.lecturers.create({
      fullName: "Ir. Hendra Wijaya, M.Kom.",
      nidn: "0615058802",
      nip: "198805152015041002",
      position: "Lektor",
      expertise: "Keamanan Siber",
      isPublished: true,
    });

    const lectUnpublished = await superCaller.lecturers.create({
      fullName: "Dosen Draft",
      nidn: "0699999999",
      nip: "199999999999999999",
      position: "Asisten Ahli",
      expertise: "Jaringan Komputer",
      isPublished: false,
    });

    // Co-authored published journal (linked to lect1, lect2, and lectUnpublished)
    const pubCoauthored = await superCaller.publications.create({
      title: "Sistem Deteksi Intrusi Berbasis Deep Learning",
      kind: "JOURNAL",
      journalName: "Journal of Informatics UNISSULA",
      publicationYear: 2025,
      doi: "10.1234/jiu.2025.001",
      url: "https://ejournal.unissula.ac.id/index.php/jiu/article/view/1",
      lecturerIds: [lect1.id, lect2.id, lectUnpublished.id],
      isPublished: true,
    });

    // Published article linked ONLY to an unpublished lecturer -> must NOT appear publicly!
    await superCaller.publications.create({
      title: "Publikasi Tanpa Dosen Terpublikasi",
      kind: "ARTICLE",
      journalName: "Prosiding Seminar Nasional",
      publicationYear: 2025,
      lecturerIds: [lectUnpublished.id],
      isPublished: true,
    });

    // Unpublished journal linked to published lecturer -> must NOT appear publicly!
    await superCaller.publications.create({
      title: "Draft Jurnal Belum Disetujui",
      kind: "JOURNAL",
      journalName: "Jurnal Internal",
      publicationYear: 2025,
      lecturerIds: [lect1.id],
      isPublished: false,
    });

    // Blocking silent deletion of lecturer linked to publication
    await expect(
      superCaller.lecturers.delete({ id: lect1.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Blocking deletion of publication without confirmUnlinkAuthors: true
    await expect(
      superCaller.publications.delete({
        id: pubCoauthored.id,
        confirmUnlinkAuthors: false,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Verify public dashboard overview counts distinct visible publications (only pubCoauthored = 1, never double-counted for 2 co-authors!)
    const overview = await publicCaller.publicDashboard.overview();
    expect(overview.totalLecturers).toBe(2);
    expect(overview.totalPublications).toBe(1);
    expect(overview.totalJournals).toBe(1);
    expect(overview.totalArticles).toBe(0);

    // Verify public publication stats only include published co-authors (lect1 & lect2, excluding lectUnpublished)
    const pubStats = await publicCaller.publicDashboard.publications();
    expect(pubStats.byYearAndKind).toEqual([
      {
        year: 2025,
        journalCount: 1,
        articleCount: 0,
        total: 1,
      },
    ]);
    expect(pubStats.recentPublications).toHaveLength(1);
    expect(pubStats.recentPublications[0]?.authors).toHaveLength(2);

    // Verify public lecturer DTOs never leak NIP
    const publicLecturers = await publicCaller.publicDashboard.lecturers();
    expect(publicLecturers).toHaveLength(2);
    const serializedPublicLecturers = JSON.stringify(publicLecturers);
    expect(serializedPublicLecturers).not.toContain("198202112008012005");
    expect(serializedPublicLecturers).not.toContain("198805152015041002");
    expect(serializedPublicLecturers).not.toContain('"nip"');

    // Verify audit logs never contain passwords, passwordHashes, MFA secrets, or NIP
    const logs = await superCaller.auditLogs.list({ limit: 100 });
    expect(logs.length).toBeGreaterThan(0);
    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).not.toContain("SuperSecretPassword!2026");
    expect(serializedLogs).not.toContain("passwordHash");
    expect(serializedLogs).not.toContain("mfaSecretEncrypted");
    expect(serializedLogs).not.toContain("198202112008012005");
  });
});

