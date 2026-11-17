import Image from "next/image";

import type { PublicLecturerDTO } from "~/lib/validators";
import { LECTURERS_PAGE_SIZE, THEME_CONFIGS, type ThemeTokens } from "./design-tokens";
import { PublicEmptyState } from "./PublicEmptyState";
import { getPaginatedSlice } from "./slideshow-engine";

interface LecturerSceneProps {
  lecturers: readonly PublicLecturerDTO[];
  pageIndex: number;
  pageSize?: number;
  themeTokens?: ThemeTokens;
}

function getInitials(fullName: string): string {
  const words = fullName
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "DS";
  if (words.length === 1) return (words[0] ?? "DS").slice(0, 2).toUpperCase();
  return `${words[0]?.[0] ?? "D"}${words[1]?.[0] ?? "S"}`.toUpperCase();
}

export function LecturerScene({
  lecturers,
  pageIndex,
  pageSize = LECTURERS_PAGE_SIZE,
  themeTokens = THEME_CONFIGS.LIGHT,
}: LecturerSceneProps) {
  if (lecturers.length === 0) {
    return (
      <PublicEmptyState
        title="Belum Ada Profil Dosen Terpublikasi"
        description="Direktori dosen dan peneliti Laboratorium Informatika akan tampil otomatis setelah profil dosen dipublikasikan."
        themeTokens={themeTokens}
      />
    );
  }

  const slice = getPaginatedSlice(lecturers, pageIndex, pageSize);

  return (
    <section
      aria-label="Profil Dosen dan Peneliti Terpublikasi"
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
            Dosen &amp; Peneliti
          </span>
          <p className={`text-sm font-medium 2xl:text-lg ${themeTokens.surface.statLabel}`}>
            Menampilkan profil{" "}
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
            dosen
          </p>
        </div>

        <div
          data-testid="lecturer-pagination-indicator"
          className={`rounded border px-3.5 py-1.5 text-xs font-bold tabular-nums sm:text-sm 2xl:text-base ${themeTokens.surface.badgeBase}`}
        >
          Halaman Otomatis {slice.safePageIndex + 1} dari {slice.totalPages}
        </div>
      </div>

      {/* Lecturer Profile Cards Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:gap-8">
        {slice.pageItems.map((lecturer) => (
          <div
            key={lecturer.id}
            className={`flex flex-col rounded-lg border p-6 transition-colors 2xl:p-8 ${themeTokens.surface.card} ${themeTokens.surface.cardBorder}`}
          >
            <div className="flex items-start gap-4 2xl:gap-6">
              <div
                className={`relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded border sm:h-24 sm:w-24 2xl:h-28 2xl:w-28 ${themeTokens.surface.cardBorder} ${
                  themeTokens.id === "LIGHT" ? "bg-slate-100" : "bg-slate-800"
                }`}
              >
                {lecturer.photoPath ? (
                  <Image
                    src={`/api/admin/lecturer-photo?path=${encodeURIComponent(
                      lecturer.photoPath,
                    )}`}
                    alt={`Foto ${lecturer.fullName}`}
                    fill
                    sizes="(max-width: 768px) 96px, 112px"
                    className="object-cover"
                  />
                ) : (
                  <span className={`text-xl font-extrabold sm:text-2xl 2xl:text-3xl ${themeTokens.surface.statCaption}`}>
                    {getInitials(lecturer.fullName)}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded border px-2.5 py-0.5 text-xs font-semibold ${themeTokens.surface.badgeBase}`}>
                    {lecturer.position}
                  </span>
                  {lecturer.nidn && (
                    <span className={`text-xs font-medium tabular-nums ${themeTokens.surface.statCaption}`}>
                      NIDN: {lecturer.nidn}
                    </span>
                  )}
                </div>

                <h3 className={`mt-1.5 text-lg font-bold sm:text-xl 2xl:text-2xl ${themeTokens.surface.statValue}`}>
                  {lecturer.fullName}
                </h3>

                <p className={`mt-1 text-xs font-semibold sm:text-sm 2xl:text-base ${themeTokens.header.subtitle}`}>
                  Keahlian: {lecturer.expertise}
                </p>
              </div>
            </div>

            {lecturer.education && (
              <div className={`mt-4 border-t pt-3 text-xs sm:text-sm 2xl:text-base ${themeTokens.surface.cardBorder} ${themeTokens.surface.statCaption}`}>
                <span className="font-semibold">Pendidikan: </span>
                {lecturer.education}
              </div>
            )}

            {lecturer.biography && (
              <p className={`mt-2 line-clamp-3 text-xs sm:text-sm 2xl:text-base ${themeTokens.surface.statCaption}`}>
                {lecturer.biography}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
