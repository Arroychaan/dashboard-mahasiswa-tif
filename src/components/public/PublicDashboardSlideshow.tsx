"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import type {
  PublicCourseScheduleDTO,
  PublicGraduateStatsDTO,
  PublicLecturerDTO,
  PublicOverviewDTO,
  PublicPublicationStatsDTO,
} from "~/lib/validators";
import { api } from "~/trpc/react";
import {
  AnnouncementsScene,
  type PublicAnnouncementItem,
} from "./AnnouncementsScene";
import { BrandedHeader } from "./BrandedHeader";
import {
  filterCourseSchedules,
  type PublicDayFilter,
} from "./course-schedule-utils";
import { CourseScheduleScene } from "./CourseScheduleScene";
import {
  DEFAULT_DATA_REFRESH_INTERVAL_MS,
  DEFAULT_SCENE_DURATION_MS,
  IDLE_TIMEOUT_MS,
  THEME_CONFIGS,
  type PublicDisplayTheme,
  type PublicSceneId,
} from "./design-tokens";
import { FeedbackQrScene, type FeedbackQrConfig } from "./FeedbackQrScene";
import { GraduateScene } from "./GraduateScene";
import {
  createInitialKioskHybridState,
  kioskHybridReducer,
} from "./kiosk-hybrid-state";
import { LecturerScene } from "./LecturerScene";
import { OverviewScene } from "./OverviewScene";
import { PublicationScene } from "./PublicationScene";
import {
  getActiveSceneId,
  type SlideshowDatasetCounts,
} from "./slideshow-engine";

const DEFAULT_FEEDBACK_QR_CONFIG: FeedbackQrConfig = {
  qrPath: "/contoh.png",
  title: "Kotak Saran & Sumbangan",
  description:
    "Pindai kode QR untuk menyampaikan aspirasi, kritik & saran, atau sumbangan bagi Program Studi Teknik Informatika UNISSULA.",
};

const EMPTY_OVERVIEW: PublicOverviewDTO = {
  totalGraduates: 0,
  totalLecturers: 0,
  totalPublications: 0,
  totalJournals: 0,
  totalArticles: 0,
  lastUpdatedAt: null,
};

const EMPTY_GRADUATE_STATS: PublicGraduateStatsDTO = {
  byGraduationYear: [],
  byEntryYear: [],
  recentGraduates: [],
};

const EMPTY_LECTURERS: PublicLecturerDTO[] = [];

const EMPTY_PUBLICATION_STATS: PublicPublicationStatsDTO = {
  byYearAndKind: [],
  recentPublications: [],
};

const EMPTY_COURSE_SCHEDULES: PublicCourseScheduleDTO[] = [];

const SCHEDULE_STATUS_TICK_MS = 30_000;

export interface PublicDashboardInitialData {
  overview?: PublicOverviewDTO;
  graduateStats?: PublicGraduateStatsDTO;
  lecturers?: PublicLecturerDTO[];
  publicationStats?: PublicPublicationStatsDTO;
  announcements?: PublicAnnouncementItem[];
  feedbackQr?: FeedbackQrConfig;
  courseSchedules?: PublicCourseScheduleDTO[];
  theme?: PublicDisplayTheme;
}

interface PublicDashboardSlideshowProps {
  initialData?: PublicDashboardInitialData;
  sceneDurationMs?: number;
  refreshIntervalMs?: number;
  idleTimeoutMs?: number;
}

export function PublicDashboardSlideshow({
  initialData,
  sceneDurationMs = DEFAULT_SCENE_DURATION_MS,
  refreshIntervalMs = DEFAULT_DATA_REFRESH_INTERVAL_MS,
  idleTimeoutMs = IDLE_TIMEOUT_MS,
}: PublicDashboardSlideshowProps) {
  const [kioskState, dispatch] = useReducer(
    kioskHybridReducer,
    undefined,
    createInitialKioskHybridState,
  );
  const [liveNow, setLiveNow] = useState<Date>(() => new Date());
  const idleTimerRef = useRef<number | null>(null);

  const queryOptions = {
    refetchInterval: refreshIntervalMs,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    staleTime: Math.min(30_000, refreshIntervalMs),
    retry: 3,
  } as const;

  const overviewQuery = api.publicDashboard.overview.useQuery(undefined, {
    ...queryOptions,
    initialData: initialData?.overview,
    placeholderData: (prev) => prev,
  });

  const graduatesQuery = api.publicDashboard.graduates.useQuery(undefined, {
    ...queryOptions,
    initialData: initialData?.graduateStats,
    placeholderData: (prev) => prev,
  });

  const lecturersQuery = api.publicDashboard.lecturers.useQuery(undefined, {
    ...queryOptions,
    initialData: initialData?.lecturers,
    placeholderData: (prev) => prev,
  });

  const publicationsQuery = api.publicDashboard.publications.useQuery(
    undefined,
    {
      ...queryOptions,
      initialData: initialData?.publicationStats,
      placeholderData: (prev) => prev,
    },
  );

  const announcementsQuery = api.publicDashboard.announcements.useQuery(
    undefined,
    {
      ...queryOptions,
      initialData: initialData?.announcements,
      placeholderData: (prev) => prev,
    },
  );

  const feedbackQrQuery = api.publicDashboard.feedbackQr.useQuery(undefined, {
    ...queryOptions,
    initialData: initialData?.feedbackQr,
    placeholderData: (prev) => prev,
  });

  const courseSchedulesQuery = api.publicDashboard.courseSchedules.useQuery(
    undefined,
    {
      ...queryOptions,
      initialData: initialData?.courseSchedules,
      placeholderData: (prev) => prev,
    },
  );

  const themeQuery = api.systemSettings.getPublicTheme.useQuery(undefined, {
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    initialData: initialData?.theme ? { theme: initialData.theme } : undefined,
  });

  const activeThemeId: PublicDisplayTheme =
    themeQuery.data?.theme ?? initialData?.theme ?? "LIGHT";
  const themeTokens = THEME_CONFIGS[activeThemeId] ?? THEME_CONFIGS.LIGHT;

  const overview = overviewQuery.data ?? EMPTY_OVERVIEW;
  const graduateStats = graduatesQuery.data ?? EMPTY_GRADUATE_STATS;
  const lecturers = lecturersQuery.data ?? EMPTY_LECTURERS;
  const publicationStats = publicationsQuery.data ?? EMPTY_PUBLICATION_STATS;
  const announcements = announcementsQuery.data ?? [];
  const feedbackQr = feedbackQrQuery.data ?? DEFAULT_FEEDBACK_QR_CONFIG;
  const courseSchedules = courseSchedulesQuery.data ?? EMPTY_COURSE_SCHEDULES;

  // Compute today's schedule count for unattended round-robin pagination
  const todayScheduleCount = useMemo(
    () =>
      filterCourseSchedules(courseSchedules, {
        dayFilter: "TODAY",
        roomFilter: "ALL",
        now: liveNow,
      }).length,
    [courseSchedules, liveNow],
  );

  const countsRef = useRef<SlideshowDatasetCounts>({
    graduatesCount: graduateStats.recentGraduates.length,
    lecturersCount: lecturers.length,
    publicationsCount: publicationStats.recentPublications.length,
    announcementsCount: announcements.length,
    courseSchedulesCount: todayScheduleCount,
  });

  useEffect(() => {
    countsRef.current = {
      graduatesCount: graduateStats.recentGraduates.length,
      lecturersCount: lecturers.length,
      publicationsCount: publicationStats.recentPublications.length,
      announcementsCount: announcements.length,
      courseSchedulesCount: todayScheduleCount,
    };
  }, [
    graduateStats.recentGraduates.length,
    lecturers.length,
    publicationStats.recentPublications.length,
    announcements.length,
    todayScheduleCount,
  ]);

  // Low-frequency 30s tick for real-time course schedule status badges (Celeron N3350 friendly)
  useEffect(() => {
    const statusTimerId = window.setInterval(() => {
      setLiveNow(new Date());
    }, SCHEDULE_STATUS_TICK_MS);
    return () => {
      window.clearInterval(statusTimerId);
    };
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const bumpIdleTimer = useCallback(() => {
    clearIdleTimer();
    const safeTimeout = Math.max(5_000, idleTimeoutMs);
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      dispatch({ type: "IDLE_TIMEOUT_RESET" });
    }, safeTimeout);
  }, [clearIdleTimer, idleTimeoutMs]);

  useEffect(() => {
    if (!kioskState.isPaused) {
      clearIdleTimer();
    }
  }, [kioskState.isPaused, clearIdleTimer]);

  useEffect(() => {
    return () => {
      clearIdleTimer();
    };
  }, [clearIdleTimer]);

  // Automatic 15s slideshow rotation (no-op while paused)
  useEffect(() => {
    if (kioskState.isPaused) return;
    const safeDuration = Math.max(1_000, sceneDurationMs);
    const intervalId = window.setInterval(() => {
      dispatch({ type: "AUTO_TICK", counts: countsRef.current });
    }, safeDuration);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [sceneDurationMs, kioskState.isPaused]);

  // Escape key closes announcement modal
  useEffect(() => {
    if (!kioskState.activeModalAnnouncement) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        bumpIdleTimer();
        dispatch({ type: "CLOSE_ANNOUNCEMENT_MODAL" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [kioskState.activeModalAnnouncement, bumpIdleTimer]);

  const handleRootInteraction = useCallback(() => {
    bumpIdleTimer();
    dispatch({ type: "TOUCH_INTERACT" });
  }, [bumpIdleTimer]);

  const handleSelectScene = useCallback(
    (sceneId: PublicSceneId) => {
      bumpIdleTimer();
      dispatch({ type: "SELECT_SCENE", sceneId });
    },
    [bumpIdleTimer],
  );

  const handleResumeSlideshow = useCallback(() => {
    clearIdleTimer();
    dispatch({ type: "RESUME_SLIDESHOW" });
  }, [clearIdleTimer]);

  const handleDayFilterChange = useCallback(
    (day: PublicDayFilter) => {
      bumpIdleTimer();
      dispatch({ type: "SET_DAY_FILTER", day });
    },
    [bumpIdleTimer],
  );

  const handleRoomFilterChange = useCallback(
    (room: string) => {
      bumpIdleTimer();
      dispatch({ type: "SET_ROOM_FILTER", room });
    },
    [bumpIdleTimer],
  );

  const handleSchedulePageChange = useCallback(
    (pageIndex: number) => {
      bumpIdleTimer();
      dispatch({ type: "SET_SCHEDULE_PAGE", pageIndex });
    },
    [bumpIdleTimer],
  );

  const handleAnnouncementPageChange = useCallback(
    (pageIndex: number) => {
      bumpIdleTimer();
      dispatch({ type: "SET_ANNOUNCEMENT_PAGE", pageIndex });
    },
    [bumpIdleTimer],
  );

  const handleSelectAnnouncement = useCallback(
    (announcement: PublicAnnouncementItem) => {
      bumpIdleTimer();
      dispatch({ type: "OPEN_ANNOUNCEMENT_MODAL", announcement });
    },
    [bumpIdleTimer],
  );

  const handleCloseAnnouncementModal = useCallback(() => {
    bumpIdleTimer();
    dispatch({ type: "CLOSE_ANNOUNCEMENT_MODAL" });
  }, [bumpIdleTimer]);

  const activeSceneId = getActiveSceneId(kioskState.slideshow);

  const isRefreshing =
    overviewQuery.isFetching ||
    graduatesQuery.isFetching ||
    lecturersQuery.isFetching ||
    publicationsQuery.isFetching ||
    announcementsQuery.isFetching ||
    feedbackQrQuery.isFetching ||
    courseSchedulesQuery.isFetching ||
    themeQuery.isFetching;

  const hasTemporarySyncError =
    overviewQuery.isError ||
    graduatesQuery.isError ||
    lecturersQuery.isError ||
    publicationsQuery.isError ||
    announcementsQuery.isError ||
    feedbackQrQuery.isError ||
    courseSchedulesQuery.isError;

  const isSingleScreenScene =
    activeSceneId === "OVERVIEW" ||
    activeSceneId === "ANNOUNCEMENTS" ||
    activeSceneId === "FEEDBACK_QR" ||
    activeSceneId === "COURSE_SCHEDULE";

  const activeAnnouncement = kioskState.activeModalAnnouncement;

  return (
    <div
      onPointerDown={handleRootInteraction}
      className={`flex min-h-screen flex-col justify-between transition-colors duration-200 select-none ${
        isSingleScreenScene
          ? "lg:h-screen lg:max-h-screen lg:overflow-hidden"
          : ""
      } ${themeTokens.container}`}
    >
      {/* Top Institutional Header, Asia/Jakarta Clock & Touch Scene Navigation */}
      <BrandedHeader
        activeSceneId={activeSceneId}
        lastUpdatedAt={overview.lastUpdatedAt}
        isRefreshing={isRefreshing}
        hasTemporarySyncError={hasTemporarySyncError}
        isPaused={kioskState.isPaused}
        themeTokens={themeTokens}
        onSelectScene={handleSelectScene}
        onResumeSlideshow={handleResumeSlideshow}
      />

      {/* Active Scene Content Area */}
      <main
        aria-live="polite"
        data-testid={`public-scene-${activeSceneId.toLowerCase()}`}
        className={`mx-auto flex min-h-0 w-full max-w-[1920px] flex-1 flex-col px-5 py-3 lg:px-8 lg:py-4 2xl:max-w-[3600px] 2xl:px-14 2xl:py-8 ${
          isSingleScreenScene ? "lg:overflow-hidden" : ""
        }`}
      >
        {activeSceneId === "OVERVIEW" && (
          <OverviewScene
            overview={overview}
            graduateStats={graduateStats}
            publicationStats={publicationStats}
            themeTokens={themeTokens}
          />
        )}

        {activeSceneId === "GRADUATES" && (
          <GraduateScene
            graduateStats={graduateStats}
            pageIndex={kioskState.slideshow.graduatePageIndex}
            themeTokens={themeTokens}
          />
        )}

        {activeSceneId === "LECTURERS" && (
          <LecturerScene
            lecturers={lecturers}
            pageIndex={kioskState.slideshow.lecturerPageIndex}
            themeTokens={themeTokens}
          />
        )}

        {activeSceneId === "PUBLICATIONS" && (
          <PublicationScene
            publicationStats={publicationStats}
            pageIndex={kioskState.slideshow.publicationPageIndex}
            themeTokens={themeTokens}
          />
        )}

        {activeSceneId === "ANNOUNCEMENTS" && (
          <AnnouncementsScene
            announcements={announcements}
            pageIndex={
              kioskState.isPaused
                ? kioskState.manualAnnouncementPageIndex
                : kioskState.slideshow.announcementPageIndex
            }
            isPaused={kioskState.isPaused}
            themeTokens={themeTokens}
            onSelectAnnouncement={handleSelectAnnouncement}
            onPageChange={handleAnnouncementPageChange}
          />
        )}

        {activeSceneId === "FEEDBACK_QR" && (
          <FeedbackQrScene
            feedbackQr={feedbackQr}
            themeTokens={themeTokens}
          />
        )}

        {activeSceneId === "COURSE_SCHEDULE" && (
          <CourseScheduleScene
            schedules={courseSchedules}
            pageIndex={
              kioskState.isPaused
                ? kioskState.manualSchedulePageIndex
                : kioskState.slideshow.courseSchedulePageIndex
            }
            dayFilter={kioskState.selectedDayFilter}
            roomFilter={kioskState.selectedRoomFilter}
            now={liveNow}
            isPaused={kioskState.isPaused}
            themeTokens={themeTokens}
            onDayFilterChange={handleDayFilterChange}
            onRoomFilterChange={handleRoomFilterChange}
            onPageChange={handleSchedulePageChange}
          />
        )}
      </main>

      {/* Bottom Hybrid Kiosk Footer */}
      <footer
        className={`shrink-0 border-t px-5 py-2.5 text-xs transition-colors lg:px-8 2xl:px-14 2xl:py-4 2xl:text-sm ${themeTokens.header.bg} ${themeTokens.header.border} ${themeTokens.header.subtitle}`}
      >
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center justify-between gap-4 2xl:max-w-[3600px]">
          <div>
            <span className={`font-bold ${themeTokens.surface.statValue}`}>
              Program Studi Teknik Informatika UNISSULA
            </span>{" "}
            &bull;{" "}
            {kioskState.isPaused
              ? `Mode Kiosk Interaktif (Reset otomatis ${Math.round(idleTimeoutMs / 1000)}s)`
              : "Sentuh layar kapan saja untuk mencari jadwal atau membaca pengumuman"}
          </div>
          <div className="font-mono tabular-nums">
            Rotasi: {Math.round(sceneDurationMs / 1000)}s &bull; Sinkronisasi:{" "}
            {Math.round(refreshIntervalMs / 1000)}s &bull; Tema:{" "}
            {themeTokens.name}
          </div>
        </div>
      </footer>

      {/* Touch-Friendly Full Announcement Reader Modal */}
      {activeAnnouncement && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="public-announcement-modal-title"
          onClick={handleCloseAnnouncementModal}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 sm:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl border p-6 shadow-xl sm:p-8 ${themeTokens.surface.card} ${themeTokens.surface.cardBorder}`}
          >
            <div className="flex items-start justify-between gap-4 border-b border-inherit pb-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${themeTokens.header.badge}`}
                  >
                    {activeAnnouncement.category === "BERITA_ACARA"
                      ? "Berita Acara"
                      : "Pengumuman"}
                  </span>
                  <span
                    className={`text-xs font-semibold sm:text-sm ${themeTokens.surface.statLabel}`}
                  >
                    {new Date(activeAnnouncement.eventDate).toLocaleDateString(
                      "id-ID",
                      {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      },
                    )}
                  </span>
                </div>
                <h2
                  id="public-announcement-modal-title"
                  className={`text-xl font-extrabold leading-snug sm:text-2xl ${themeTokens.header.title}`}
                >
                  {activeAnnouncement.title}
                </h2>
              </div>

              <button
                type="button"
                onClick={handleCloseAnnouncementModal}
                aria-label="Tutup jendela pengumuman"
                className={`inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-lg border px-4 text-sm font-bold ${themeTokens.surface.badgeBase}`}
              >
                Tutup
              </button>
            </div>

            <div
              className={`mt-5 flex-1 overflow-y-auto whitespace-pre-line pr-2 text-base leading-relaxed sm:text-lg ${themeTokens.surface.statValue}`}
            >
              {activeAnnouncement.content}
            </div>

            <div className="mt-6 flex items-center justify-between gap-4 border-t border-inherit pt-4">
              <span className={`text-xs font-medium ${themeTokens.header.subtitle}`}>
                Program Studi Teknik Informatika UNISSULA
              </span>
              <button
                type="button"
                onClick={handleCloseAnnouncementModal}
                className={`inline-flex min-h-[48px] items-center justify-center rounded-lg px-6 text-sm font-bold ${themeTokens.header.badge}`}
              >
                Tutup Pengumuman
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
