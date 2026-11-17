"use client";

import { useEffect, useRef, useState } from "react";

import type {
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
  DEFAULT_DATA_REFRESH_INTERVAL_MS,
  DEFAULT_SCENE_DURATION_MS,
  THEME_CONFIGS,
  type PublicDisplayTheme,
} from "./design-tokens";
import { FeedbackQrScene, type FeedbackQrConfig } from "./FeedbackQrScene";
import { GraduateScene } from "./GraduateScene";
import { LecturerScene } from "./LecturerScene";
import { OverviewScene } from "./OverviewScene";
import { PublicationScene } from "./PublicationScene";
import {
  advanceSlideshowState,
  createInitialSlideshowState,
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

export interface PublicDashboardInitialData {
  overview?: PublicOverviewDTO;
  graduateStats?: PublicGraduateStatsDTO;
  lecturers?: PublicLecturerDTO[];
  publicationStats?: PublicPublicationStatsDTO;
  announcements?: PublicAnnouncementItem[];
  feedbackQr?: FeedbackQrConfig;
  theme?: PublicDisplayTheme;
}

interface PublicDashboardSlideshowProps {
  initialData?: PublicDashboardInitialData;
  sceneDurationMs?: number;
  refreshIntervalMs?: number;
}

export function PublicDashboardSlideshow({
  initialData,
  sceneDurationMs = DEFAULT_SCENE_DURATION_MS,
  refreshIntervalMs = DEFAULT_DATA_REFRESH_INTERVAL_MS,
}: PublicDashboardSlideshowProps) {
  const [slideshowState, setSlideshowState] = useState(
    createInitialSlideshowState,
  );

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

  const countsRef = useRef<SlideshowDatasetCounts>({
    graduatesCount: graduateStats.recentGraduates.length,
    lecturersCount: lecturers.length,
    publicationsCount: publicationStats.recentPublications.length,
    announcementsCount: announcements.length,
  });

  useEffect(() => {
    countsRef.current = {
      graduatesCount: graduateStats.recentGraduates.length,
      lecturersCount: lecturers.length,
      publicationsCount: publicationStats.recentPublications.length,
      announcementsCount: announcements.length,
    };
  }, [
    graduateStats.recentGraduates.length,
    lecturers.length,
    publicationStats.recentPublications.length,
    announcements.length,
  ]);

  useEffect(() => {
    const safeDuration = Math.max(1_000, sceneDurationMs);
    const intervalId = window.setInterval(() => {
      setSlideshowState((prev) =>
        advanceSlideshowState(prev, countsRef.current),
      );
    }, safeDuration);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [sceneDurationMs]);

  const activeSceneId = getActiveSceneId(slideshowState);

  const isRefreshing =
    overviewQuery.isFetching ||
    graduatesQuery.isFetching ||
    lecturersQuery.isFetching ||
    publicationsQuery.isFetching ||
    announcementsQuery.isFetching ||
    feedbackQrQuery.isFetching ||
    themeQuery.isFetching;

  const hasTemporarySyncError =
    overviewQuery.isError ||
    graduatesQuery.isError ||
    lecturersQuery.isError ||
    publicationsQuery.isError ||
    announcementsQuery.isError ||
    feedbackQrQuery.isError;

  const isSingleScreenScene =
    activeSceneId === "OVERVIEW" ||
    activeSceneId === "ANNOUNCEMENTS" ||
    activeSceneId === "FEEDBACK_QR";

  return (
    <div
      className={`flex min-h-screen flex-col justify-between transition-colors duration-200 select-none ${
        isSingleScreenScene ? "lg:h-screen lg:max-h-screen lg:overflow-hidden" : ""
      } ${themeTokens.container}`}
    >
      {/* Top Institutional Header, Asia/Jakarta Clock & Scene Progress Bar */}
      <BrandedHeader
        activeSceneId={activeSceneId}
        lastUpdatedAt={overview.lastUpdatedAt}
        isRefreshing={isRefreshing}
        hasTemporarySyncError={hasTemporarySyncError}
        themeTokens={themeTokens}
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
            pageIndex={slideshowState.graduatePageIndex}
            themeTokens={themeTokens}
          />
        )}

        {activeSceneId === "LECTURERS" && (
          <LecturerScene
            lecturers={lecturers}
            pageIndex={slideshowState.lecturerPageIndex}
            themeTokens={themeTokens}
          />
        )}

        {activeSceneId === "PUBLICATIONS" && (
          <PublicationScene
            publicationStats={publicationStats}
            pageIndex={slideshowState.publicationPageIndex}
            themeTokens={themeTokens}
          />
        )}

        {activeSceneId === "ANNOUNCEMENTS" && (
          <AnnouncementsScene
            announcements={announcements as unknown as PublicAnnouncementItem[]}
            pageIndex={slideshowState.announcementPageIndex}
            themeTokens={themeTokens}
          />
        )}

        {activeSceneId === "FEEDBACK_QR" && (
          <FeedbackQrScene
            feedbackQr={feedbackQr}
            themeTokens={themeTokens}
          />
        )}
      </main>

      {/* Bottom Read-Only Signage Footer */}
      <footer
        className={`shrink-0 border-t px-5 py-2.5 text-xs transition-colors lg:px-8 2xl:px-14 2xl:py-4 2xl:text-sm ${themeTokens.header.bg} ${themeTokens.header.border} ${themeTokens.header.subtitle}`}
      >
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center justify-between gap-4 2xl:max-w-[3600px]">
          <div>
            <span className={`font-bold ${themeTokens.surface.statValue}`}>
              Program Studi Teknik Informatika UNISSULA
            </span>{" "}
            &bull; Informasi Publik Digital
          </div>
          <div className="font-mono tabular-nums">
            Rotasi: {Math.round(sceneDurationMs / 1000)}s &bull; Sinkronisasi:{" "}
            {Math.round(refreshIntervalMs / 1000)}s &bull; Tema: {themeTokens.name}
          </div>
        </div>
      </footer>
    </div>
  );
}
