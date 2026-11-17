import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { BrandedHeader } from "~/components/public/BrandedHeader";
import { THEME_CONFIGS } from "~/components/public/design-tokens";
import { GraduateScene } from "~/components/public/GraduateScene";
import { LecturerScene } from "~/components/public/LecturerScene";
import { OverviewScene } from "~/components/public/OverviewScene";
import { PublicationScene } from "~/components/public/PublicationScene";
import {
  advanceSlideshowState,
  computeOverviewInsights,
  createInitialSlideshowState,
  formatJakartaDateTime,
  getActiveSceneId,
  getPaginatedSlice,
  normalizeAnnualCountSeries,
  normalizeAnnualPublicationSeries,
} from "~/components/public/slideshow-engine";
import { createCaller } from "~/server/api/root";
import { type TRPCContext } from "~/server/api/trpc";
import { bootstrapInitialSuperAdmin } from "~/server/auth/bootstrap";
import * as schema from "~/server/db/schema";

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

describe("Phase 4 Public Digital Signage Dashboard, Slideshow Engine & Scene Verification", () => {
  beforeAll(async () => {
    pgClient = new PGlite();
    await applyMigrations(pgClient);
    testDb = drizzle(pgClient, { schema });
  });

  beforeEach(async () => {
    await truncateAllTables(pgClient);
  });

  describe("1. Automatic Slideshow State Machine & Fair Round-Robin Pagination", () => {
    it("rotates continuously across all 4 scenes and visits every paginated item without skipping", () => {
      const counts = {
        graduatesCount: 25, // 3 pages at pageSize=10 (10, 10, 5)
        lecturersCount: 9, // 3 pages at pageSize=4 (4, 4, 1)
        publicationsCount: 14, // 3 pages at pageSize=6 (6, 6, 2)
        announcementsCount: 8, // 3 pages at pageSize=3 (3, 3, 2)
      };

      const graduateItems = Array.from({ length: 25 }, (_, i) => `grad-${i + 1}`);
      const lecturerItems = Array.from({ length: 9 }, (_, i) => `lect-${i + 1}`);
      const publicationItems = Array.from(
        { length: 14 },
        (_, i) => `pub-${i + 1}`,
      );
      const announcementItems = Array.from(
        { length: 8 },
        (_, i) => `ann-${i + 1}`,
      );

      const seenGraduates = new Set<string>();
      const seenLecturers = new Set<string>();
      const seenPublications = new Set<string>();
      const seenAnnouncements = new Set<string>();

      let state = createInitialSlideshowState();
      expect(getActiveSceneId(state)).toBe("OVERVIEW");

      // Simulate 3 full cycles (18 scene transitions = 3 * 6 scenes)
      for (let step = 0; step < 18; step += 1) {
        const currentScene = getActiveSceneId(state);

        if (currentScene === "GRADUATES") {
          const slice = getPaginatedSlice(
            graduateItems,
            state.graduatePageIndex,
            10,
          );
          for (const item of slice.pageItems) seenGraduates.add(item);
        } else if (currentScene === "LECTURERS") {
          const slice = getPaginatedSlice(
            lecturerItems,
            state.lecturerPageIndex,
            4,
          );
          for (const item of slice.pageItems) seenLecturers.add(item);
        } else if (currentScene === "PUBLICATIONS") {
          const slice = getPaginatedSlice(
            publicationItems,
            state.publicationPageIndex,
            6,
          );
          for (const item of slice.pageItems) seenPublications.add(item);
        } else if (currentScene === "ANNOUNCEMENTS") {
          const slice = getPaginatedSlice(
            announcementItems,
            state.announcementPageIndex,
            3,
          );
          for (const item of slice.pageItems) seenAnnouncements.add(item);
        }

        state = advanceSlideshowState(state, counts);
      }

      expect(state.completedCycles).toBe(3);
      expect(getActiveSceneId(state)).toBe("OVERVIEW");

      // Every single graduate, lecturer, publication, and announcement was displayed across the 3 cycles
      expect(seenGraduates.size).toBe(25);
      expect(seenLecturers.size).toBe(9);
      expect(seenPublications.size).toBe(14);
      expect(seenAnnouncements.size).toBe(8);

      // Verify safe wrapping when dataset shrinks dynamically after a refresh
      const shrunkSlice = getPaginatedSlice(["only-one"], 5, 10);
      expect(shrunkSlice.safePageIndex).toBe(0);
      expect(shrunkSlice.totalPages).toBe(1);
      expect(shrunkSlice.pageItems).toEqual(["only-one"]);
    });

    it("formats Asia/Jakarta date and time accurately and normalizes sparse annual series", () => {
      const sampleDate = new Date("2026-08-17T03:05:09.000Z"); // 10:05:09 WIB
      const formatted = formatJakartaDateTime(sampleDate);
      expect(formatted.timeLabel).toBe("10:05:09 WIB");
      expect(formatted.dateLabel).toContain("2026");

      // Empty series
      expect(normalizeAnnualCountSeries([])).toEqual([]);
      expect(normalizeAnnualPublicationSeries([])).toEqual([]);

      // Sparse series with missing intermediate years (2022 and 2024 -> fills 2023 with 0)
      const gradSeries = normalizeAnnualCountSeries([
        { year: 2022, count: 15 },
        { year: 2024, count: 22 },
      ]);
      expect(gradSeries).toEqual([
        { year: "2022", count: 15 },
        { year: "2023", count: 0 },
        { year: "2024", count: 22 },
      ]);

      const pubSeries = normalizeAnnualPublicationSeries([
        { year: 2023, journalCount: 3, articleCount: 1, total: 4 },
        { year: 2025, journalCount: 5, articleCount: 2, total: 7 },
      ]);
      expect(pubSeries).toEqual([
        { year: "2023", journalCount: 3, articleCount: 1, total: 4 },
        { year: "2024", journalCount: 0, articleCount: 0, total: 0 },
        { year: "2025", journalCount: 5, articleCount: 2, total: 7 },
      ]);
    });
  });

  describe("2. Empty Database Behavior & Scene HTML Verification", () => {
    it("renders truthful zero values and professional empty states across all 4 scenes when database is empty", async () => {
      const publicCaller = makeCallerForUser(null);

      const [overview, graduateStats, lecturers, publicationStats] =
        await Promise.all([
          publicCaller.publicDashboard.overview(),
          publicCaller.publicDashboard.graduates(),
          publicCaller.publicDashboard.lecturers(),
          publicCaller.publicDashboard.publications(),
        ]);

      expect(overview).toEqual({
        totalGraduates: 0,
        totalLecturers: 0,
        totalPublications: 0,
        totalJournals: 0,
        totalArticles: 0,
        lastUpdatedAt: null,
      });

      const insights = computeOverviewInsights(
        overview,
        graduateStats,
        publicationStats,
      );
      expect(insights.averageStudyDurationYears).toBeNull();
      expect(insights.latestGraduationYear).toBeNull();

      const overviewHtml = renderToStaticMarkup(
        createElement(OverviewScene, {
          overview,
          graduateStats,
          publicationStats,
        }),
      );
      const graduateHtml = renderToStaticMarkup(
        createElement(GraduateScene, { graduateStats, pageIndex: 0 }),
      );
      const lecturerHtml = renderToStaticMarkup(
        createElement(LecturerScene, { lecturers, pageIndex: 0 }),
      );
      const publicationHtml = renderToStaticMarkup(
        createElement(PublicationScene, { publicationStats, pageIndex: 0 }),
      );

      expect(overviewHtml).toContain("Total Lulusan Terpublikasi");
      expect(overviewHtml).toContain(
        "Belum Ada Statistik Kelulusan Tahunan",
      );
      expect(graduateHtml).toContain("Belum Ada Data Lulusan Terpublikasi");
      expect(lecturerHtml).toContain("Belum Ada Profil Dosen Terpublikasi");
      expect(publicationHtml).toContain(
        "Belum Ada Publikasi Ilmiah Terpublikasi",
      );
    });
  });

  describe("3. Live Data Integration, Large-List Pagination, Refresh Visibility & Zero Private Leaks", () => {
    it("serves >20 published records without truncation, reflects admin updates on refresh, and never leaks NIP or interactive links", async () => {
      const bootstrapRes = await bootstrapInitialSuperAdmin(
        testDb as unknown as Parameters<typeof bootstrapInitialSuperAdmin>[0],
        {
          name: "Super Admin",
          email: "super@unissula.ac.id",
          password: "SuperSecurePassword123!",
        },
      );

      const adminCaller = makeCallerForUser({
        id: bootstrapRes.user.id,
        name: bootstrapRes.user.name,
        email: bootstrapRes.user.email,
        role: bootstrapRes.user.role,
        isActive: true,
        mfaVerified: true,
        sessionVersion: 1,
      });

      const publicCaller = makeCallerForUser(null);

      // Create 24 published graduates and 2 draft graduates
      for (let i = 1; i <= 24; i += 1) {
        await adminCaller.graduates.create({
          fullName: `Alumni Terpublikasi Ke-${i}`,
          entryYear: 2020,
          graduationYear: 2024,
          isPublished: true,
        });
      }
      await adminCaller.graduates.create({
        fullName: "Mahasiswa Draf Rahasia",
        entryYear: 2021,
        graduationYear: 2025,
        isPublished: false,
      });

      // Create 2 published lecturers (with private NIP) and 1 unpublished lecturer
      const lect1 = await adminCaller.lecturers.create({
        fullName: "Prof. Dr. Hendra Wijaya, M.Kom.",
        nidn: "0601017501",
        nip: "PRIVATE-NIP-99887766",
        position: "Guru Besar",
        expertise: "Keamanan Siber",
        education: "S3 Ilmu Komputer",
        biography: "Peneliti kriptografi dan keamanan jaringan",
        photoPath: null,
        isPublished: true,
      });
      const lect2 = await adminCaller.lecturers.create({
        fullName: "Dr. Siti Aminah, S.T., M.Kom.",
        nidn: "0602028002",
        nip: "PRIVATE-NIP-11223344",
        position: "Lektor Kepala",
        expertise: "Sains Data",
        education: "S3 Teknik Informatika",
        biography: "Peneliti pemelajaran mesin",
        photoPath: null,
        isPublished: true,
      });

      // Create coauthored published publication
      await adminCaller.publications.create({
        title: "Analisis Keamanan Jaringan Kampus Berbasis Deteksi Anomali",
        kind: "JOURNAL",
        journalName: "Jurnal Teknologi Informasi UNISSULA",
        publicationYear: 2025,
        doi: "10.1234/jti.2025.01",
        url: "https://jurnal.unissula.ac.id/jti/article/1",
        lecturerIds: [lect1.id, lect2.id],
        isPublished: true,
      });

      const [overview, graduateStats, lecturers, publicationStats] =
        await Promise.all([
          publicCaller.publicDashboard.overview(),
          publicCaller.publicDashboard.graduates(),
          publicCaller.publicDashboard.lecturers(),
          publicCaller.publicDashboard.publications(),
        ]);

      // Verify all 24 published graduates are returned (no 20-item cap) and draft is excluded
      expect(overview.totalGraduates).toBe(24);
      expect(graduateStats.recentGraduates).toHaveLength(24);
      expect(
        graduateStats.recentGraduates.some((g) =>
          g.fullName.includes("Draf Rahasia"),
        ),
      ).toBe(false);

      // Coauthored publication is counted once (distinct)
      expect(overview.totalPublications).toBe(1);
      expect(publicationStats.recentPublications).toHaveLength(1);
      expect(publicationStats.recentPublications[0]?.authors).toHaveLength(2);

      // Render scenes and verify zero private NIP, zero NIM, and zero clickable <a>/<input> controls
      const gradPage3Html = renderToStaticMarkup(
        createElement(GraduateScene, { graduateStats, pageIndex: 2 }),
      );
      expect(gradPage3Html).toContain("Halaman Otomatis 3 dari 3");

      const lecturerHtml = renderToStaticMarkup(
        createElement(LecturerScene, { lecturers, pageIndex: 0 }),
      );
      expect(lecturerHtml).toContain("Prof. Dr. Hendra Wijaya, M.Kom.");
      expect(lecturerHtml).toContain("0601017501");
      expect(lecturerHtml).not.toContain("PRIVATE-NIP");

      const publicationHtml = renderToStaticMarkup(
        createElement(PublicationScene, { publicationStats, pageIndex: 0 }),
      );
      expect(publicationHtml).toContain(
        "Analisis Keamanan Jaringan Kampus Berbasis Deteksi Anomali",
      );
      expect(publicationHtml).toContain("10.1234/jti.2025.01");
      // URL must be rendered as informational text, not an interactive <a> tag
      expect(publicationHtml).not.toContain("<a ");
      expect(publicationHtml).not.toContain("<input");
      expect(publicationHtml).not.toContain("<button");

      // Verify BrandedHeader renders single theme-aware logo without legacy logos
      const lightHeaderHtml = renderToStaticMarkup(
        createElement(BrandedHeader, {
          activeSceneId: "OVERVIEW",
          lastUpdatedAt: overview.lastUpdatedAt,
          isRefreshing: false,
          hasTemporarySyncError: false,
          themeTokens: THEME_CONFIGS.LIGHT,
        }),
      );
      expect(lightHeaderHtml).toContain("Logo_Unissula_white_theme.png");
      expect(lightHeaderHtml).not.toContain("Logo_Unissula_dark_theme.png");
      expect(lightHeaderHtml).not.toContain("Logo_Unissula_HD.png");
      expect(lightHeaderHtml).not.toContain("Logo_Informatika_HD.png");

      const darkHeaderHtml = renderToStaticMarkup(
        createElement(BrandedHeader, {
          activeSceneId: "OVERVIEW",
          lastUpdatedAt: overview.lastUpdatedAt,
          isRefreshing: false,
          hasTemporarySyncError: false,
          themeTokens: THEME_CONFIGS.DARK,
        }),
      );
      expect(darkHeaderHtml).toContain("Logo_Unissula_dark_theme.png");
      expect(darkHeaderHtml).not.toContain("Logo_Unissula_white_theme.png");
      expect(darkHeaderHtml).not.toContain("Logo_Unissula_HD.png");
      expect(darkHeaderHtml).not.toContain("Logo_Informatika_HD.png");
    });
  });
});

