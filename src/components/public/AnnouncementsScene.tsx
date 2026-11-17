"use client";

import {
  ANNOUNCEMENTS_PAGE_SIZE,
  THEME_CONFIGS,
  type ThemeTokens,
} from "./design-tokens";
import { getPaginatedSlice } from "./slideshow-engine";

export interface PublicAnnouncementItem {
  id: string;
  title: string;
  category: "PENGUMUMAN" | "BERITA_ACARA";
  content: string;
  eventDate: Date;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface AnnouncementsSceneProps {
  announcements: PublicAnnouncementItem[];
  pageIndex?: number;
  themeTokens?: ThemeTokens;
}

export function AnnouncementsScene({
  announcements,
  pageIndex = 0,
  themeTokens = THEME_CONFIGS.LIGHT,
}: AnnouncementsSceneProps) {
  const { pageItems, safePageIndex, totalPages, totalItems } =
    getPaginatedSlice(announcements, pageIndex, ANNOUNCEMENTS_PAGE_SIZE);

  if (totalItems === 0) {
    return (
      <section
        aria-label="Pengumuman & Berita Acara Program Studi Teknik Informatika"
        className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center"
      >
        <div
          className={`max-w-md rounded-2xl border p-8 shadow-sm ${themeTokens.surface.card} ${themeTokens.surface.border}`}
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <svg
              className="h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.75"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.455a20.01 20.01 0 01-1.353-3.719m3.015-.5c.34-1.25.586-2.54.725-3.86M16.5 7.5a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zm0 0c0 1.657 1.343 3 3 3m-3-3c0-1.657-1.343-3-3-3"
              />
            </svg>
          </div>
          <h3 className={`text-lg font-bold ${themeTokens.surface.title}`}>
            Belum Ada Pengumuman Terbit
          </h3>
          <p className={`mt-2 text-xs sm:text-sm ${themeTokens.surface.body}`}>
            Agenda kegiatan, surat edaran, dan berita acara Program Studi Teknik Informatika UNISSULA akan tampil di sini saat dipublikasikan.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Pengumuman & Berita Acara Program Studi Teknik Informatika"
      className="flex min-h-0 flex-1 flex-col justify-between gap-3 overflow-hidden"
    >
      {/* 3-Column Grid for Zero-Scroll 100vh Layout */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {pageItems.map((item) => {
          const isBeritaAcara = item.category === "BERITA_ACARA";
          const formattedDate = new Date(item.eventDate).toLocaleDateString(
            "id-ID",
            {
              day: "numeric",
              month: "long",
              year: "numeric",
            },
          );

          return (
            <article
              key={item.id}
              className={`flex min-h-0 flex-col justify-between rounded-2xl border p-5 sm:p-6 transition-all shadow-sm ${themeTokens.surface.card} ${themeTokens.surface.border}`}
            >
              <div className="space-y-3">
                {/* Badge Category and Event Date */}
                <div className="flex items-center justify-between gap-2 border-b pb-3 border-inherit/40">
                  <span
                    className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold tracking-wide uppercase ${
                      isBeritaAcara
                        ? "bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-300 dark:border-purple-800"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-800"
                    }`}
                  >
                    {isBeritaAcara ? "Berita Acara" : "Pengumuman"}
                  </span>
                  <div className={`text-xs font-semibold ${themeTokens.surface.statLabel}`}>
                    {formattedDate}
                  </div>
                </div>

                {/* Announcement Title */}
                <h3
                  className={`text-base font-extrabold sm:text-lg lg:text-xl line-clamp-2 leading-snug ${themeTokens.surface.title}`}
                >
                  {item.title}
                </h3>

                {/* Announcement Excerpt / Content Body */}
                <p
                  className={`text-xs sm:text-sm leading-relaxed line-clamp-6 lg:line-clamp-8 whitespace-pre-line ${themeTokens.surface.body}`}
                >
                  {item.content}
                </p>
              </div>

              {/* Bottom Card Footer */}
              <div className="mt-4 pt-3 border-t border-inherit/40 flex items-center justify-between text-[11px] font-medium text-slate-400">
                <span>Program Studi Teknik Informatika</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                  UNISSULA
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {/* Pagination Footer Indicator if more than 3 items */}
      {totalPages > 1 && (
        <div
          className={`flex shrink-0 items-center justify-between px-2 text-xs font-semibold ${themeTokens.surface.statLabel}`}
        >
          <span>
            Menampilkan halaman {safePageIndex + 1} dari {totalPages}
          </span>
          <div className="flex gap-1.5">
            {Array.from({ length: totalPages }, (_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full transition-all ${
                  i === safePageIndex
                    ? "w-5 bg-emerald-600"
                    : "bg-slate-300 dark:bg-slate-700"
                }`}
              />
            ))}
          </div>
          <span>Total {totalItems} Pengumuman</span>
        </div>
      )}
    </section>
  );
}
