import type {
  PublicGraduateStatsDTO,
  PublicOverviewDTO,
  PublicPublicationStatsDTO,
} from "~/lib/validators";
import {
  ANNOUNCEMENTS_PAGE_SIZE,
  COURSE_SCHEDULES_PAGE_SIZE,
  GRADUATES_PAGE_SIZE,
  LECTURERS_PAGE_SIZE,
  PUBLICATIONS_PAGE_SIZE,
  PUBLIC_SCENE_DEFINITIONS,
  type PublicSceneId,
} from "./design-tokens";

export interface SlideshowState {
  sceneIndex: number;
  graduatePageIndex: number;
  lecturerPageIndex: number;
  publicationPageIndex: number;
  announcementPageIndex: number;
  courseSchedulePageIndex: number;
  completedCycles: number;
}

export interface SlideshowDatasetCounts {
  graduatesCount: number;
  lecturersCount: number;
  publicationsCount: number;
  announcementsCount?: number;
  courseSchedulesCount?: number;
}

export interface SlideshowPageSizes {
  graduatesPageSize?: number;
  lecturersPageSize?: number;
  publicationsPageSize?: number;
  announcementsPageSize?: number;
  courseSchedulesPageSize?: number;
}

export function createInitialSlideshowState(): SlideshowState {
  return {
    sceneIndex: 0,
    graduatePageIndex: 0,
    lecturerPageIndex: 0,
    publicationPageIndex: 0,
    announcementPageIndex: 0,
    courseSchedulePageIndex: 0,
    completedCycles: 0,
  };
}

export function jumpToScene(
  current: SlideshowState,
  sceneId: PublicSceneId,
): SlideshowState {
  const targetIndex = PUBLIC_SCENE_DEFINITIONS.findIndex(
    (s) => s.id === sceneId,
  );
  if (targetIndex < 0) return current;
  return {
    ...current,
    sceneIndex: targetIndex,
  };
}

export function resetToAttractState(current: SlideshowState): SlideshowState {
  return {
    ...current,
    sceneIndex: 0,
    courseSchedulePageIndex: 0,
  };
}

export function getActiveSceneId(state: SlideshowState): PublicSceneId {
  const safeIndex =
    ((state.sceneIndex % PUBLIC_SCENE_DEFINITIONS.length) +
      PUBLIC_SCENE_DEFINITIONS.length) %
    PUBLIC_SCENE_DEFINITIONS.length;
  return PUBLIC_SCENE_DEFINITIONS[safeIndex]?.id ?? "OVERVIEW";
}

export function computeTotalPages(
  totalItems: number,
  pageSize: number,
): number {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const safeTotal = Math.max(0, Math.floor(totalItems));
  return Math.max(1, Math.ceil(safeTotal / safePageSize));
}

export function normalizePageIndex(
  pageIndex: number,
  totalItems: number,
  pageSize: number,
): number {
  const totalPages = computeTotalPages(totalItems, pageSize);
  const safeIndex = Math.max(0, Math.floor(pageIndex));
  return safeIndex % totalPages;
}

/**
 * Advances the automatic slideshow by one tick (default: every 15 seconds).
 *
 * Fair Pagination Rule:
 * - When transitioning out of a paginated scene (`GRADUATES`, `LECTURERS`, or
 *   `PUBLICATIONS`), that scene's page index advances by 1 modulo its current
 *   `totalPages` so that the next time the scene appears, the next page of
 *   records is shown.
 * - No record is ever permanently skipped, even if the dataset grows or shrinks
 *   between 60-second background refreshes.
 */
export function advanceSlideshowState(
  current: SlideshowState,
  counts: SlideshowDatasetCounts,
  pageSizes?: SlideshowPageSizes,
): SlideshowState {
  const gradPageSize = pageSizes?.graduatesPageSize ?? GRADUATES_PAGE_SIZE;
  const lectPageSize = pageSizes?.lecturersPageSize ?? LECTURERS_PAGE_SIZE;
  const pubPageSize = pageSizes?.publicationsPageSize ?? PUBLICATIONS_PAGE_SIZE;
  const announcePageSize =
    pageSizes?.announcementsPageSize ?? ANNOUNCEMENTS_PAGE_SIZE;
  const schedulePageSize =
    pageSizes?.courseSchedulesPageSize ?? COURSE_SCHEDULES_PAGE_SIZE;

  const gradTotalPages = computeTotalPages(counts.graduatesCount, gradPageSize);
  const lectTotalPages = computeTotalPages(counts.lecturersCount, lectPageSize);
  const pubTotalPages = computeTotalPages(
    counts.publicationsCount,
    pubPageSize,
  );
  const announceTotalPages = computeTotalPages(
    counts.announcementsCount ?? 0,
    announcePageSize,
  );
  const scheduleTotalPages = computeTotalPages(
    counts.courseSchedulesCount ?? 0,
    schedulePageSize,
  );

  const currentSceneId = getActiveSceneId(current);

  let nextGradPage = normalizePageIndex(
    current.graduatePageIndex,
    counts.graduatesCount,
    gradPageSize,
  );
  let nextLectPage = normalizePageIndex(
    current.lecturerPageIndex,
    counts.lecturersCount,
    lectPageSize,
  );
  let nextPubPage = normalizePageIndex(
    current.publicationPageIndex,
    counts.publicationsCount,
    pubPageSize,
  );
  let nextAnnouncePage = normalizePageIndex(
    current.announcementPageIndex,
    counts.announcementsCount ?? 0,
    announcePageSize,
  );
  let nextSchedulePage = normalizePageIndex(
    current.courseSchedulePageIndex,
    counts.courseSchedulesCount ?? 0,
    schedulePageSize,
  );

  if (currentSceneId === "GRADUATES") {
    nextGradPage = (nextGradPage + 1) % gradTotalPages;
  } else if (currentSceneId === "LECTURERS") {
    nextLectPage = (nextLectPage + 1) % lectTotalPages;
  } else if (currentSceneId === "PUBLICATIONS") {
    nextPubPage = (nextPubPage + 1) % pubTotalPages;
  } else if (currentSceneId === "ANNOUNCEMENTS") {
    nextAnnouncePage = (nextAnnouncePage + 1) % announceTotalPages;
  } else if (currentSceneId === "COURSE_SCHEDULE") {
    nextSchedulePage = (nextSchedulePage + 1) % scheduleTotalPages;
  }

  const nextSceneIndex =
    (current.sceneIndex + 1) % PUBLIC_SCENE_DEFINITIONS.length;
  const nextCompletedCycles =
    nextSceneIndex === 0
      ? current.completedCycles + 1
      : current.completedCycles;

  return {
    sceneIndex: nextSceneIndex,
    graduatePageIndex: nextGradPage,
    lecturerPageIndex: nextLectPage,
    publicationPageIndex: nextPubPage,
    announcementPageIndex: nextAnnouncePage,
    courseSchedulePageIndex: nextSchedulePage,
    completedCycles: nextCompletedCycles,
  };
}

export interface PaginatedSliceResult<T> {
  pageItems: T[];
  safePageIndex: number;
  totalPages: number;
  totalItems: number;
  startItemNumber: number;
  endItemNumber: number;
}

export function getPaginatedSlice<T>(
  items: readonly T[],
  pageIndex: number,
  pageSize: number,
): PaginatedSliceResult<T> {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalItems = items.length;
  const totalPages = computeTotalPages(totalItems, safePageSize);
  const safePageIndex = normalizePageIndex(pageIndex, totalItems, safePageSize);

  if (totalItems === 0) {
    return {
      pageItems: [],
      safePageIndex: 0,
      totalPages: 1,
      totalItems: 0,
      startItemNumber: 0,
      endItemNumber: 0,
    };
  }

  const startOffset = safePageIndex * safePageSize;
  const pageItems = items.slice(startOffset, startOffset + safePageSize);

  return {
    pageItems,
    safePageIndex,
    totalPages,
    totalItems,
    startItemNumber: startOffset + 1,
    endItemNumber: startOffset + pageItems.length,
  };
}

/**
 * Formats a Date into `Asia/Jakarta` (WIB) date and 24-hour clock strings.
 */
export function formatJakartaDateTime(date: Date): {
  dateLabel: string;
  timeLabel: string;
} {
  const dateFormatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const timeFormatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return {
    dateLabel: dateFormatter.format(date),
    timeLabel: `${timeFormatter.format(date).replace(/\./g, ":")} WIB`,
  };
}

/**
 * Ensures annual chart series handle missing intermediate years gracefully
 * when the year span is reasonable (<= 15 years), without inventing data
 * outside the observed min/max range.
 */
export function normalizeAnnualCountSeries(
  rows: ReadonlyArray<{ year: number; count: number }>,
): Array<{ year: string; count: number }> {
  if (rows.length === 0) return [];

  const sorted = [...rows].sort((a, b) => a.year - b.year);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return [];

  const span = last.year - first.year;
  if (span > 0 && span <= 15) {
    const byYear = new Map<number, number>();
    for (const row of sorted) {
      byYear.set(row.year, row.count);
    }
    const filled: Array<{ year: string; count: number }> = [];
    for (let y = first.year; y <= last.year; y += 1) {
      filled.push({
        year: String(y),
        count: byYear.get(y) ?? 0,
      });
    }
    return filled;
  }

  return sorted.map((r) => ({
    year: String(r.year),
    count: r.count,
  }));
}

export function normalizeAnnualPublicationSeries(
  rows: ReadonlyArray<{
    year: number;
    journalCount: number;
    articleCount: number;
    total: number;
  }>,
): Array<{
  year: string;
  journalCount: number;
  articleCount: number;
  total: number;
}> {
  if (rows.length === 0) return [];

  const sorted = [...rows].sort((a, b) => a.year - b.year);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return [];

  const span = last.year - first.year;
  if (span > 0 && span <= 15) {
    const byYear = new Map<
      number,
      { journalCount: number; articleCount: number; total: number }
    >();
    for (const row of sorted) {
      byYear.set(row.year, {
        journalCount: row.journalCount,
        articleCount: row.articleCount,
        total: row.total,
      });
    }
    const filled: Array<{
      year: string;
      journalCount: number;
      articleCount: number;
      total: number;
    }> = [];
    for (let y = first.year; y <= last.year; y += 1) {
      const entry = byYear.get(y);
      filled.push({
        year: String(y),
        journalCount: entry?.journalCount ?? 0,
        articleCount: entry?.articleCount ?? 0,
        total: entry?.total ?? 0,
      });
    }
    return filled;
  }

  return sorted.map((r) => ({
    year: String(r.year),
    journalCount: r.journalCount,
    articleCount: r.articleCount,
    total: r.total,
  }));
}

export interface OverviewDerivedInsights {
  latestGraduationYear: number | null;
  latestGraduationCount: number;
  peakGraduationYear: number | null;
  peakGraduationCount: number;
  averageStudyDurationYears: number | null;
  latestPublicationYear: number | null;
  latestPublicationCount: number;
}

/**
 * Computes strictly truthful summaries derived from the `publicDashboard`
 * API payloads. Never fabricates growth percentages or placeholder metrics.
 */
export function computeOverviewInsights(
  _overview: PublicOverviewDTO,
  graduateStats: PublicGraduateStatsDTO,
  publicationStats: PublicPublicationStatsDTO,
): OverviewDerivedInsights {
  const gradYears = [...graduateStats.byGraduationYear].sort(
    (a, b) => a.year - b.year,
  );
  const latestGradEntry = gradYears[gradYears.length - 1] ?? null;

  let peakGradEntry: { year: number; count: number } | null = null;
  for (const row of gradYears) {
    if (!peakGradEntry || row.count >= peakGradEntry.count) {
      peakGradEntry = row;
    }
  }

  let averageStudyDurationYears: number | null = null;
  if (graduateStats.recentGraduates.length > 0) {
    const totalDuration = graduateStats.recentGraduates.reduce(
      (acc, g) => acc + Math.max(0, g.graduationYear - g.entryYear),
      0,
    );
    averageStudyDurationYears = Number(
      (totalDuration / graduateStats.recentGraduates.length).toFixed(1),
    );
  }

  const pubYears = [...publicationStats.byYearAndKind].sort(
    (a, b) => a.year - b.year,
  );
  const latestPubEntry = pubYears[pubYears.length - 1] ?? null;

  return {
    latestGraduationYear: latestGradEntry?.year ?? null,
    latestGraduationCount: latestGradEntry?.count ?? 0,
    peakGraduationYear: peakGradEntry?.year ?? null,
    peakGraduationCount: peakGradEntry?.count ?? 0,
    averageStudyDurationYears,
    latestPublicationYear: latestPubEntry?.year ?? null,
    latestPublicationCount: latestPubEntry?.total ?? 0,
  };
}

