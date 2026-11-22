import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
  publicCourseScheduleDtoSchema,
  publicGraduateStatsDtoSchema,
  publicLecturerDtoSchema,
  publicOverviewDtoSchema,
  publicPublicationStatsDtoSchema,
  type PublicGraduateDTO,
  type PublicGraduateStatsDTO,
  type PublicLecturerDTO,
  type PublicOverviewDTO,
  type PublicPublicationDTO,
  type PublicPublicationStatsDTO,
} from "~/lib/validators";
import {
  createTRPCRouter,
  publicProcedure,
  type TRPCContext,
} from "~/server/api/trpc";
import { DEFAULT_FEEDBACK_QR } from "~/server/api/routers/systemSettings";
import {
  announcements,
  courseSchedules,
  graduates,
  lecturers,
  publicationAuthors,
  publications,
  systemSettings,
} from "~/server/db/schema";

async function buildOverview(ctx: TRPCContext): Promise<PublicOverviewDTO> {
  const [gradCount] = await ctx.db
    .select({ value: count() })
    .from(graduates)
    .where(eq(graduates.isPublished, true));

  const [lectCount] = await ctx.db
    .select({ value: count() })
    .from(lecturers)
    .where(eq(lecturers.isPublished, true));

  // Fetch distinct published publications that have >= 1 published lecturer author
  const visiblePubRows = await ctx.db
    .select({
      id: publications.id,
      kind: publications.kind,
      updatedAt: publications.updatedAt,
    })
    .from(publications)
    .innerJoin(
      publicationAuthors,
      eq(publicationAuthors.publicationId, publications.id),
    )
    .innerJoin(
      lecturers,
      and(
        eq(publicationAuthors.lecturerId, lecturers.id),
        eq(lecturers.isPublished, true),
      ),
    )
    .where(eq(publications.isPublished, true));

  const distinctPubs = new Map<
    string,
    { kind: "JOURNAL" | "ARTICLE"; updatedAt: Date }
  >();
  for (const row of visiblePubRows) {
    if (!distinctPubs.has(row.id)) {
      distinctPubs.set(row.id, { kind: row.kind, updatedAt: row.updatedAt });
    }
  }

  let totalJournals = 0;
  let totalArticles = 0;
  let latestTimestamp: number | null = null;

  for (const pub of distinctPubs.values()) {
    if (pub.kind === "JOURNAL") totalJournals += 1;
    else if (pub.kind === "ARTICLE") totalArticles += 1;
    const ts = pub.updatedAt.getTime();
    if (latestTimestamp === null || ts > latestTimestamp) {
      latestTimestamp = ts;
    }
  }

  const [latestGrad] = await ctx.db
    .select({ updatedAt: graduates.updatedAt })
    .from(graduates)
    .where(eq(graduates.isPublished, true))
    .orderBy(desc(graduates.updatedAt))
    .limit(1);

  if (latestGrad) {
    const ts = latestGrad.updatedAt.getTime();
    if (latestTimestamp === null || ts > latestTimestamp) {
      latestTimestamp = ts;
    }
  }

  const [latestLect] = await ctx.db
    .select({ updatedAt: lecturers.updatedAt })
    .from(lecturers)
    .where(eq(lecturers.isPublished, true))
    .orderBy(desc(lecturers.updatedAt))
    .limit(1);

  if (latestLect) {
    const ts = latestLect.updatedAt.getTime();
    if (latestTimestamp === null || ts > latestTimestamp) {
      latestTimestamp = ts;
    }
  }

  const [latestSchedule] = await ctx.db
    .select({ updatedAt: courseSchedules.updatedAt })
    .from(courseSchedules)
    .where(eq(courseSchedules.isPublished, true))
    .orderBy(desc(courseSchedules.updatedAt))
    .limit(1);

  if (latestSchedule) {
    const ts = latestSchedule.updatedAt.getTime();
    if (latestTimestamp === null || ts > latestTimestamp) {
      latestTimestamp = ts;
    }
  }

  return {
    totalGraduates: Number(gradCount?.value ?? 0),
    totalLecturers: Number(lectCount?.value ?? 0),
    totalPublications: distinctPubs.size,
    totalJournals,
    totalArticles,
    lastUpdatedAt: latestTimestamp !== null ? new Date(latestTimestamp) : null,
  };
}

async function buildGraduateStats(
  ctx: TRPCContext,
): Promise<PublicGraduateStatsDTO> {
  const byGraduationYearRows = await ctx.db
    .select({
      year: graduates.graduationYear,
      count: count(),
    })
    .from(graduates)
    .where(eq(graduates.isPublished, true))
    .groupBy(graduates.graduationYear)
    .orderBy(graduates.graduationYear);

  const byEntryYearRows = await ctx.db
    .select({
      year: graduates.entryYear,
      count: count(),
    })
    .from(graduates)
    .where(eq(graduates.isPublished, true))
    .groupBy(graduates.entryYear)
    .orderBy(graduates.entryYear);

  const recentGraduates: PublicGraduateDTO[] = await ctx.db
    .select({
      id: graduates.id,
      fullName: graduates.fullName,
      entryYear: graduates.entryYear,
      graduationYear: graduates.graduationYear,
    })
    .from(graduates)
    .where(eq(graduates.isPublished, true))
    .orderBy(desc(graduates.graduationYear), graduates.fullName);

  return {
    byGraduationYear: byGraduationYearRows.map((r) => ({
      year: r.year,
      count: Number(r.count),
    })),
    byEntryYear: byEntryYearRows.map((r) => ({
      year: r.year,
      count: Number(r.count),
    })),
    recentGraduates,
  };
}

async function buildPublicLecturers(
  ctx: TRPCContext,
): Promise<PublicLecturerDTO[]> {
  // Strictly select public columns only — `nip` is never queried or returned
  const rows = await ctx.db
    .select({
      id: lecturers.id,
      fullName: lecturers.fullName,
      nidn: lecturers.nidn,
      position: lecturers.position,
      expertise: lecturers.expertise,
      education: lecturers.education,
      biography: lecturers.biography,
      photoPath: lecturers.photoPath,
    })
    .from(lecturers)
    .where(eq(lecturers.isPublished, true))
    .orderBy(lecturers.fullName);

  if (rows.length === 0) {
    return [];
  }

  const publishedLinks = await ctx.db
    .select({
      lecturerId: publicationAuthors.lecturerId,
      publicationId: publications.id,
    })
    .from(publicationAuthors)
    .innerJoin(
      publications,
      and(
        eq(publicationAuthors.publicationId, publications.id),
        eq(publications.isPublished, true),
      ),
    )
    .where(
      inArray(
        publicationAuthors.lecturerId,
        rows.map((r) => r.id),
      ),
    );

  const pubCountByLecturer = new Map<string, Set<string>>();
  for (const link of publishedLinks) {
    const set = pubCountByLecturer.get(link.lecturerId) ?? new Set<string>();
    set.add(link.publicationId);
    pubCountByLecturer.set(link.lecturerId, set);
  }

  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    nidn: row.nidn,
    position: row.position,
    expertise: row.expertise,
    education: row.education,
    biography: row.biography,
    photoPath: row.photoPath,
    publishedPublicationCount: pubCountByLecturer.get(row.id)?.size ?? 0,
  }));
}

async function buildPublicationStats(
  ctx: TRPCContext,
): Promise<PublicPublicationStatsDTO> {
  // Query published publications joined with published lecturers
  const joinedRows = await ctx.db
    .select({
      pubId: publications.id,
      title: publications.title,
      kind: publications.kind,
      journalName: publications.journalName,
      publicationYear: publications.publicationYear,
      doi: publications.doi,
      url: publications.url,
      authorId: lecturers.id,
      authorFullName: lecturers.fullName,
      authorNidn: lecturers.nidn,
    })
    .from(publications)
    .innerJoin(
      publicationAuthors,
      eq(publicationAuthors.publicationId, publications.id),
    )
    .innerJoin(
      lecturers,
      and(
        eq(publicationAuthors.lecturerId, lecturers.id),
        eq(lecturers.isPublished, true),
      ),
    )
    .where(eq(publications.isPublished, true))
    .orderBy(
      desc(publications.publicationYear),
      publications.title,
      lecturers.fullName,
    );

  const pubMap = new Map<string, PublicPublicationDTO>();
  for (const row of joinedRows) {
    let existing = pubMap.get(row.pubId);
    if (!existing) {
      existing = {
        id: row.pubId,
        title: row.title,
        kind: row.kind,
        journalName: row.journalName,
        publicationYear: row.publicationYear,
        doi: row.doi,
        url: row.url,
        authors: [],
      };
      pubMap.set(row.pubId, existing);
    }

    if (!existing.authors.some((a) => a.id === row.authorId)) {
      existing.authors.push({
        id: row.authorId,
        fullName: row.authorFullName,
        nidn: row.authorNidn,
      });
    }
  }

  const distinctPublications = Array.from(pubMap.values());

  const yearAggMap = new Map<
    number,
    { year: number; journalCount: number; articleCount: number; total: number }
  >();

  for (const pub of distinctPublications) {
    const entry = yearAggMap.get(pub.publicationYear) ?? {
      year: pub.publicationYear,
      journalCount: 0,
      articleCount: 0,
      total: 0,
    };
    if (pub.kind === "JOURNAL") entry.journalCount += 1;
    else if (pub.kind === "ARTICLE") entry.articleCount += 1;
    entry.total += 1;
    yearAggMap.set(pub.publicationYear, entry);
  }

  const byYearAndKind = Array.from(yearAggMap.values()).sort(
    (a, b) => a.year - b.year,
  );

  return {
    byYearAndKind,
    recentPublications: distinctPublications,
  };
}

export const publicDashboardRouter = createTRPCRouter({
  overview: publicProcedure
    .output(publicOverviewDtoSchema)
    .query(({ ctx }) => buildOverview(ctx)),

  getSummary: publicProcedure
    .output(publicOverviewDtoSchema)
    .query(({ ctx }) => buildOverview(ctx)),

  graduates: publicProcedure
    .output(publicGraduateStatsDtoSchema)
    .query(({ ctx }) => buildGraduateStats(ctx)),

  getGraduateStats: publicProcedure
    .output(publicGraduateStatsDtoSchema)
    .query(({ ctx }) => buildGraduateStats(ctx)),

  lecturers: publicProcedure
    .output(z.array(publicLecturerDtoSchema))
    .query(({ ctx }) => buildPublicLecturers(ctx)),

  getLecturers: publicProcedure
    .output(z.array(publicLecturerDtoSchema))
    .query(({ ctx }) => buildPublicLecturers(ctx)),

  publications: publicProcedure
    .output(publicPublicationStatsDtoSchema)
    .query(({ ctx }) => buildPublicationStats(ctx)),

  getPublicationStats: publicProcedure
    .output(publicPublicationStatsDtoSchema)
    .query(({ ctx }) => buildPublicationStats(ctx)),

  getTheme: publicProcedure
    .output(z.object({ theme: z.enum(["LIGHT", "DARK", "MONOCHROME"]) }))
    .query(async ({ ctx }) => {
      try {
        const [setting] = await ctx.db
          .select({ value: systemSettings.value })
          .from(systemSettings)
          .where(eq(systemSettings.key, "public_theme"))
          .limit(1);

        if (
          setting?.value === "LIGHT" ||
          setting?.value === "DARK" ||
          setting?.value === "MONOCHROME"
        ) {
          return { theme: setting.value };
        }
        return { theme: "LIGHT" as const };
      } catch {
        return { theme: "LIGHT" as const };
      }
    }),

  /**
   * Published announcements ordered by eventDate descending for Slide 5.
   */
  announcements: publicProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: announcements.id,
        title: announcements.title,
        category: announcements.category,
        content: announcements.content,
        eventDate: announcements.eventDate,
        isPublished: announcements.isPublished,
        createdAt: announcements.createdAt,
        updatedAt: announcements.updatedAt,
      })
      .from(announcements)
      .where(eq(announcements.isPublished, true))
      .orderBy(desc(announcements.eventDate));
  }),

  /**
   * Feedback and suggestion QR code configuration for Slide 6.
   */
  feedbackQr: publicProcedure.query(async ({ ctx }) => {
    try {
      const rows = await ctx.db
        .select({ key: systemSettings.key, value: systemSettings.value })
        .from(systemSettings)
        .where(
          inArray(systemSettings.key, [
            "feedback_qr_path",
            "feedback_title",
            "feedback_description",
          ]),
        );

      const map = new Map(rows.map((r) => [r.key, r.value]));

      return {
        qrPath: map.get("feedback_qr_path") ?? DEFAULT_FEEDBACK_QR.qrPath,
        title: map.get("feedback_title") ?? DEFAULT_FEEDBACK_QR.title,
        description:
          map.get("feedback_description") ?? DEFAULT_FEEDBACK_QR.description,
      };
    } catch {
      return DEFAULT_FEEDBACK_QR;
    }
  }),

  /**
   * Published weekly course schedules ordered Mon–Sat then startTime asc for Slide 7.
   */
  courseSchedules: publicProcedure
    .output(z.array(publicCourseScheduleDtoSchema))
    .query(async ({ ctx }) => {
      const dayRankSql = sql<number>`CASE ${courseSchedules.dayOfWeek}
        WHEN 'SENIN' THEN 1
        WHEN 'SELASA' THEN 2
        WHEN 'RABU' THEN 3
        WHEN 'KAMIS' THEN 4
        WHEN 'JUMAT' THEN 5
        WHEN 'SABTU' THEN 6
        ELSE 7
      END`;

      return ctx.db
        .select({
          id: courseSchedules.id,
          dayOfWeek: courseSchedules.dayOfWeek,
          startTime: courseSchedules.startTime,
          endTime: courseSchedules.endTime,
          courseName: courseSchedules.courseName,
          className: courseSchedules.className,
          roomName: courseSchedules.roomName,
          lecturerName: courseSchedules.lecturerName,
          semester: courseSchedules.semester,
          academicYear: courseSchedules.academicYear,
        })
        .from(courseSchedules)
        .where(eq(courseSchedules.isPublished, true))
        .orderBy(
          dayRankSql,
          asc(courseSchedules.startTime),
          asc(courseSchedules.roomName),
          asc(courseSchedules.courseName),
        );
    }),
});
