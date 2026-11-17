import type { PublicGraduateStatsDTO } from "~/lib/validators";
import { GRADUATES_PAGE_SIZE, THEME_CONFIGS, type ThemeTokens } from "./design-tokens";
import { PublicEmptyState } from "./PublicEmptyState";
import { getPaginatedSlice } from "./slideshow-engine";

interface GraduateSceneProps {
  graduateStats: PublicGraduateStatsDTO;
  pageIndex: number;
  pageSize?: number;
  themeTokens?: ThemeTokens;
}

export function GraduateScene({
  graduateStats,
  pageIndex,
  pageSize = GRADUATES_PAGE_SIZE,
  themeTokens = THEME_CONFIGS.LIGHT,
}: GraduateSceneProps) {
  const allGraduates = graduateStats.recentGraduates;

  if (allGraduates.length === 0) {
    return (
      <PublicEmptyState
        title="Belum Ada Data Lulusan Terpublikasi"
        description="Daftar lulusan akan tampil otomatis setelah data kelulusan diverifikasi dan dipublikasikan."
        themeTokens={themeTokens}
      />
    );
  }

  const slice = getPaginatedSlice(allGraduates, pageIndex, pageSize);

  return (
    <section
      aria-label="Direktori Lulusan Terpublikasi"
      className="space-y-6 2xl:space-y-8"
    >
      {/* Top Status & Pagination Bar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-4 rounded-lg border px-5 py-3.5 transition-colors 2xl:px-7 2xl:py-5 ${themeTokens.surface.card} ${themeTokens.surface.cardBorder}`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center rounded px-3 py-1 text-xs font-bold uppercase 2xl:text-sm ${themeTokens.header.badge}`}
          >
            Lulusan Terdaftar
          </span>
          <p className={`text-sm font-medium 2xl:text-lg ${themeTokens.surface.statLabel}`}>
            Menampilkan{" "}
            <span className={`font-bold tabular-nums ${themeTokens.surface.statValue}`}>
              {slice.startItemNumber}
            </span>{" "}
            -{" "}
            <span className={`font-bold tabular-nums ${themeTokens.surface.statValue}`}>
              {slice.endItemNumber}
            </span>{" "}
            dari{" "}
            <span className={`font-bold tabular-nums ${themeTokens.surface.statValue}`}>
              {slice.totalItems}
            </span>{" "}
            alumni
          </p>
        </div>

        <div
          data-testid="graduate-pagination-indicator"
          className={`rounded border px-3.5 py-1.5 text-xs font-bold tabular-nums sm:text-sm 2xl:text-base ${themeTokens.surface.badgeBase}`}
        >
          Halaman Otomatis {slice.safePageIndex + 1} dari {slice.totalPages}
        </div>
      </div>

      {/* Main Content: Structured Graduate Table + Cohort Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 2xl:gap-8">
        <div
          className={`overflow-hidden rounded-lg border lg:col-span-8 ${themeTokens.surface.card} ${themeTokens.surface.cardBorder}`}
        >
          <table className={`min-w-full divide-y text-left ${themeTokens.surface.cardBorder}`}>
            <thead
              className={`text-xs font-bold tracking-wider uppercase sm:text-sm 2xl:text-base ${themeTokens.surface.tableHeader}`}
            >
              <tr>
                <th scope="col" className="w-16 px-5 py-3.5 2xl:px-7 2xl:py-5">
                  No.
                </th>
                <th scope="col" className="px-5 py-3.5 2xl:px-7 2xl:py-5">
                  Nama Lulusan
                </th>
                <th scope="col" className="px-5 py-3.5 2xl:px-7 2xl:py-5">
                  Tahun Masuk
                </th>
                <th scope="col" className="px-5 py-3.5 2xl:px-7 2xl:py-5">
                  Tahun Lulus
                </th>
                <th scope="col" className="px-5 py-3.5 2xl:px-7 2xl:py-5">
                  Masa Studi
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y ${themeTokens.surface.cardBorder}`}>
              {slice.pageItems.map((grad, idx) => {
                const itemNumber = slice.startItemNumber + idx;
                const studyYears = Math.max(
                  1,
                  grad.graduationYear - grad.entryYear,
                );
                return (
                  <tr
                    key={grad.id}
                    className={`transition-colors ${
                      idx % 2 === 1 ? themeTokens.surface.tableRowAlt : ""
                    }`}
                  >
                    <td className={`px-5 py-3.5 text-xs font-bold tabular-nums sm:text-sm 2xl:px-7 2xl:py-5 2xl:text-base ${themeTokens.surface.statCaption}`}>
                      {itemNumber}
                    </td>
                    <td className={`px-5 py-3.5 text-sm font-semibold sm:text-base 2xl:px-7 2xl:py-5 2xl:text-lg ${themeTokens.surface.statValue}`}>
                      {grad.fullName}
                    </td>
                    <td className={`px-5 py-3.5 text-xs font-medium tabular-nums sm:text-sm 2xl:px-7 2xl:py-5 2xl:text-base ${themeTokens.surface.statLabel}`}>
                      {grad.entryYear}
                    </td>
                    <td className={`px-5 py-3.5 text-xs font-bold tabular-nums sm:text-sm 2xl:px-7 2xl:py-5 2xl:text-base ${themeTokens.surface.statValue}`}>
                      {grad.graduationYear}
                    </td>
                    <td className="px-5 py-3.5 text-xs font-medium sm:text-sm 2xl:px-7 2xl:py-5 2xl:text-base">
                      <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${themeTokens.surface.badgeBase}`}>
                        {studyYears} Tahun
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Cohort Breakdown Sidebar */}
        <div
          className={`rounded-lg border p-5 transition-colors lg:col-span-4 lg:p-6 2xl:p-8 ${themeTokens.surface.card} ${themeTokens.surface.cardBorder}`}
        >
          <div className={`mb-4 border-b pb-3 ${themeTokens.surface.cardBorder}`}>
            <h3 className={`text-base font-bold sm:text-lg 2xl:text-2xl ${themeTokens.surface.statValue}`}>
              Kelulusan per Angkatan
            </h3>
            <p className={`text-xs sm:text-sm 2xl:text-base ${themeTokens.surface.statCaption}`}>
              Distribusi lulusan berdasarkan angkatan masuk
            </p>
          </div>

          <div className="space-y-3 2xl:space-y-4">
            {graduateStats.byEntryYear.slice(0, 8).map((c) => (
              <div
                key={c.year}
                className={`flex items-center justify-between rounded border p-3 ${themeTokens.surface.badgeBase}`}
              >
                <div>
                  <div className={`text-xs font-bold uppercase ${themeTokens.surface.statLabel}`}>
                    Angkatan
                  </div>
                  <div className={`text-lg font-extrabold tabular-nums sm:text-xl 2xl:text-2xl ${themeTokens.surface.statValue}`}>
                    {c.year}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-xs font-semibold uppercase ${themeTokens.surface.statCaption}`}>
                    Jumlah Lulus
                  </div>
                  <div className={`text-xl font-extrabold tabular-nums sm:text-2xl 2xl:text-3xl ${themeTokens.surface.statValue}`}>
                    {c.count}{" "}
                    <span className="text-xs font-normal">Alumni</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
