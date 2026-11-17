import type {
  PublicGraduateStatsDTO,
  PublicOverviewDTO,
  PublicPublicationStatsDTO,
} from "~/lib/validators";
import {
  AnnualGraduateChart,
  AnnualPublicationChart,
} from "./DashboardCharts";
import { THEME_CONFIGS, type ThemeTokens } from "./design-tokens";
import { computeOverviewInsights } from "./slideshow-engine";
import { StatSummaryCard } from "./StatSummaryCard";

interface OverviewSceneProps {
  overview: PublicOverviewDTO;
  graduateStats: PublicGraduateStatsDTO;
  publicationStats: PublicPublicationStatsDTO;
  themeTokens?: ThemeTokens;
}

export function OverviewScene({
  overview,
  graduateStats,
  publicationStats,
  themeTokens = THEME_CONFIGS.LIGHT,
}: OverviewSceneProps) {
  const insights = computeOverviewInsights(
    overview,
    graduateStats,
    publicationStats,
  );

  return (
    <section
      aria-label="Ringkasan Eksekutif Laboratorium Informatika"
      className="space-y-6 2xl:space-y-8"
    >
      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:gap-6">
        <StatSummaryCard
          label="Total Lulusan Terpublikasi"
          value={overview.totalGraduates}
          unitLabel="Alumni"
          caption={
            insights.latestGraduationYear
              ? `Lulusan terbaru: ${insights.latestGraduationYear} (${insights.latestGraduationCount} alumni)`
              : "Belum ada rekaman lulusan terpublikasi"
          }
          accent="blue"
          themeTokens={themeTokens}
        />

        <StatSummaryCard
          label="Dosen & Peneliti Aktif"
          value={overview.totalLecturers}
          unitLabel="Dosen"
          caption="Staf pengajar & peneliti Program Studi Teknik Informatika"
          accent="sky"
          themeTokens={themeTokens}
        />

        <StatSummaryCard
          label="Total Publikasi Ilmiah Unik"
          value={overview.totalPublications}
          unitLabel="Karya"
          caption={`${overview.totalJournals} Jurnal Ilmiah \u2022 ${overview.totalArticles} Artikel Ilmiah`}
          accent="emerald"
          themeTokens={themeTokens}
        />

        <StatSummaryCard
          label="Rata-Rata Masa Studi"
          value={insights.averageStudyDurationYears ?? 0}
          unitLabel="Tahun"
          caption={
            insights.peakGraduationYear
              ? `Puncak kelulusan: ${insights.peakGraduationYear} (${insights.peakGraduationCount} alumni)`
              : "Dihitung dari selisih tahun lulus dan tahun masuk"
          }
          accent="slate"
          themeTokens={themeTokens}
        />
      </div>

      {/* Annual Progression Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:gap-8">
        <div
          className={`rounded-lg border p-5 transition-colors lg:p-6 2xl:p-8 ${themeTokens.surface.card} ${themeTokens.surface.cardBorder}`}
        >
          <div
            className={`mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b pb-3 ${themeTokens.surface.cardBorder}`}
          >
            <div>
              <h3
                className={`text-base font-bold sm:text-lg 2xl:text-2xl ${themeTokens.surface.statValue}`}
              >
                Tren Kelulusan Tahunan
              </h3>
              <p
                className={`text-xs sm:text-sm 2xl:text-base ${themeTokens.surface.statCaption}`}
              >
                Jumlah alumni berdasarkan tahun kelulusan
              </p>
            </div>
            <span
              className={`rounded border px-2.5 py-1 text-xs font-semibold tabular-nums 2xl:text-sm ${themeTokens.surface.badgeBase}`}
            >
              Total: {overview.totalGraduates} Lulusan
            </span>
          </div>

          <AnnualGraduateChart
            byGraduationYear={graduateStats.byGraduationYear}
            themeTokens={themeTokens}
          />
        </div>

        <div
          className={`rounded-lg border p-5 transition-colors lg:p-6 2xl:p-8 ${themeTokens.surface.card} ${themeTokens.surface.cardBorder}`}
        >
          <div
            className={`mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b pb-3 ${themeTokens.surface.cardBorder}`}
          >
            <div>
              <h3
                className={`text-base font-bold sm:text-lg 2xl:text-2xl ${themeTokens.surface.statValue}`}
              >
                Tren Publikasi Ilmiah Tahunan
              </h3>
              <p
                className={`text-xs sm:text-sm 2xl:text-base ${themeTokens.surface.statCaption}`}
              >
                Rekapitulasi karya ilmiah dosen berdasarkan tahun rilis
              </p>
            </div>
            <span
              className={`rounded border px-2.5 py-1 text-xs font-semibold tabular-nums 2xl:text-sm ${themeTokens.surface.badgeBase}`}
            >
              Total: {overview.totalPublications} Publikasi
            </span>
          </div>

          <AnnualPublicationChart
            byYearAndKind={publicationStats.byYearAndKind}
            themeTokens={themeTokens}
          />
        </div>
      </div>
    </section>
  );
}
