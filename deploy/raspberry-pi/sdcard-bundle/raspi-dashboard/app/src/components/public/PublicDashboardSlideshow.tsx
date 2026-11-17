"use client";

import { useEffect, useRef, useState } from "react";

import type {
  PublicGraduateStatsDTO,
  PublicLecturerDTO,
  PublicOverviewDTO,
  PublicPublicationStatsDTO,
} from "~/lib/validators";
import { api } from "~/trpc/react";
import { BrandedHeader } from "./BrandedHeader";
import {
  DEFAULT_DATA_REFRESH_INTERVAL_MS,
  DEFAULT_SCENE_DURATION_MS,
  THEME_CONFIGS,
  type PublicDisplayTheme,
} from "./design-tokens";
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

  const countsRef = useRef<SlideshowDatasetCounts>({
    graduatesCount: graduateStats.recentGraduates.length,
    lecturersCount: lecturers.length,
    publicationsCount: publicationStats.recentPublications.length,
  });

  useEffect(() => {
    countsRef.current = {
      graduatesCount: graduateStats.recentGraduates.length,
      lecturersCount: lecturers.length,
      publicationsCount: publicationStats.recentPublications.length,
    };
  }, [
    graduateStats.recentGraduates.length,
    lecturers.length,
    publicationStats.recentPublications.length,
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
    themeQuery.isFetching;

  const hasTemporarySyncError =
    overviewQuery.isError ||
    graduatesQuery.isError ||
    lecturersQuery.isError ||
    publicationsQuery.isError;

  return (
    <div
      className={`flex min-h-screen flex-col justify-between transition-colors duration-200 select-none ${themeTokens.container}`}
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
        className="mx-auto w-full max-w-[1920px] flex-1 px-6 py-6 lg:px-10 lg:py-8 2xl:max-w-[3600px] 2xl:px-14 2xl:py-10"
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
      </main>

      {/* Bottom Read-Only Signage Footer */}
      <footer
        className={`border-t px-6 py-3.5 text-xs transition-colors lg:px-10 2xl:px-14 2xl:py-5 2xl:text-sm ${themeTokens.header.bg} ${themeTokens.header.border} ${themeTokens.header.subtitle}`}
      >
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center justify-between gap-4 2xl:max-w-[3600px]">
          <div>
            <span className={`font-bold ${themeTokens.surface.statValue}`}>
              Laboratorium Informatika &bull; Program Studi Teknik Informatika
              UNISSULA
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
