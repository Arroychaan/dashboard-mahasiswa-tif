import type { PublicPublicationStatsDTO } from "~/lib/validators";
import { PUBLICATIONS_PAGE_SIZE, THEME_CONFIGS, type ThemeTokens } from "./design-tokens";
import { PublicEmptyState } from "./PublicEmptyState";
import { getPaginatedSlice } from "./slideshow-engine";

interface PublicationSceneProps {
  publicationStats: PublicPublicationStatsDTO;
  pageIndex: number;
  pageSize?: number;
  themeTokens?: ThemeTokens;
}

export function PublicationScene({
  publicationStats,
  pageIndex,
  pageSize = PUBLICATIONS_PAGE_SIZE,
  themeTokens = THEME_CONFIGS.LIGHT,
}: PublicationSceneProps) {
  const allPublications = publicationStats.recentPublications;

  if (allPublications.length === 0) {
    return (
      <PublicEmptyState
        title="Belum Ada Publikasi Ilmiah Terpublikasi"
        description="Daftar jurnal dan artikel ilmiah dosen akan tampil otomatis setelah karya ilmiah disetujui."
        themeTokens={themeTokens}
      />
    );
  }

  const slice = getPaginatedSlice(allPublications, pageIndex, pageSize);

  return (
    <section
      aria-label="Daftar Publikasi Jurnal dan Artikel Ilmiah"
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
            Publikasi Ilmiah
          </span>
          <p className={`text-sm font-medium 2xl:text-lg ${themeTokens.surface.statLabel}`}>
            Menampilkan karya{" "}
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
            publikasi
          </p>
        </div>

        <div
          data-testid="publication-pagination-indicator"
          className={`rounded border px-3.5 py-1.5 text-xs font-bold tabular-nums sm:text-sm 2xl:text-base ${themeTokens.surface.badgeBase}`}
        >
          Halaman Otomatis {slice.safePageIndex + 1} dari {slice.totalPages}
        </div>
      </div>

      {/* Publication Cards Grid (2 Columns on Desktop/TV) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:gap-7">
        {slice.pageItems.map((pub, idx) => {
          const itemNumber = slice.startItemNumber + idx;
          return (
            <div
              key={pub.id}
              className={`flex flex-col justify-between rounded-lg border p-5 transition-colors lg:p-6 2xl:p-8 ${themeTokens.surface.card} ${themeTokens.surface.cardBorder}`}
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded border px-2 py-0.5 text-xs font-bold ${themeTokens.surface.badgeBase}`}>
                      #{itemNumber}
                    </span>
                    <span
                      className={`rounded px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                        pub.kind === "JOURNAL"
                          ? "bg-sky-600 text-white"
                          : "bg-emerald-600 text-white"
                      }`}
                    >
                      {pub.kind === "JOURNAL" ? "Jurnal Ilmiah" : "Artikel Ilmiah"}
                    </span>
                  </div>

                  <span className={`text-xs font-bold tabular-nums sm:text-sm 2xl:text-base ${themeTokens.surface.statValue}`}>
                    Tahun {pub.publicationYear}
                  </span>
                </div>

                <h3 className={`mt-3 text-base font-bold leading-snug sm:text-lg 2xl:text-xl ${themeTokens.surface.statValue}`}>
                  {pub.title}
                </h3>

                <p className={`mt-1.5 text-xs font-medium italic sm:text-sm 2xl:text-base ${themeTokens.surface.statCaption}`}>
                  {pub.journalName}
                </p>

                {pub.authors.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className={`text-xs font-semibold ${themeTokens.surface.statLabel}`}>
                      Penulis Dosen:
                    </span>
                    {pub.authors.map((author) => (
                      <span
                        key={author.id}
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${themeTokens.surface.badgeBase}`}
                      >
                        {author.fullName}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {(pub.doi ?? pub.url) && (
                <div className={`mt-4 border-t pt-3 text-xs ${themeTokens.surface.cardBorder} ${themeTokens.surface.statCaption}`}>
                  {pub.doi && <div>DOI: {pub.doi}</div>}
                  {pub.url && (
                    <div className="truncate text-blue-600 dark:text-sky-400">
                      {pub.url}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
