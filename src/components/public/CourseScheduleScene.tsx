"use client";

import {
  COURSE_DAYS,
  COURSE_ROOMS,
  type PublicCourseScheduleDTO,
} from "~/lib/validators";
import {
  DAY_LABELS,
  filterCourseSchedules,
  getScheduleLiveStatus,
  resolveEffectiveDay,
  type PublicDayFilter,
  type ScheduleLiveStatus,
} from "./course-schedule-utils";
import {
  COURSE_SCHEDULES_PAGE_SIZE,
  THEME_CONFIGS,
  type ThemeTokens,
} from "./design-tokens";
import { getPaginatedSlice } from "./slideshow-engine";

export interface CourseScheduleSceneProps {
  schedules: PublicCourseScheduleDTO[];
  pageIndex?: number;
  dayFilter?: PublicDayFilter;
  roomFilter?: string;
  now?: Date;
  isPaused?: boolean;
  themeTokens?: ThemeTokens;
  onDayFilterChange?: (day: PublicDayFilter) => void;
  onRoomFilterChange?: (room: string) => void;
  onPageChange?: (pageIndex: number) => void;
}

function getStatusBadgePresentation(
  status: ScheduleLiveStatus,
  dayLabel: string,
  themeId: ThemeTokens["id"],
): { label: string; className: string; showActiveDot: boolean } {
  if (themeId === "MONOCHROME") {
    if (status === "ONGOING") {
      return {
        label: "Sedang Berlangsung",
        className: "border border-black bg-black text-white",
        showActiveDot: true,
      };
    }
    if (status === "UPCOMING") {
      return {
        label: "Akan Datang",
        className: "border border-black bg-white text-black",
        showActiveDot: false,
      };
    }
    if (status === "FINISHED") {
      return {
        label: "Selesai",
        className: "border border-neutral-400 bg-neutral-100 text-neutral-700",
        showActiveDot: false,
      };
    }
    return {
      label: dayLabel,
      className: "border border-neutral-500 bg-neutral-50 text-black",
      showActiveDot: false,
    };
  }

  if (themeId === "DARK") {
    if (status === "ONGOING") {
      return {
        label: "Sedang Berlangsung",
        className:
          "border border-emerald-500/60 bg-emerald-950 text-emerald-300",
        showActiveDot: true,
      };
    }
    if (status === "UPCOMING") {
      return {
        label: "Akan Datang",
        className: "border border-sky-500/50 bg-sky-950 text-sky-300",
        showActiveDot: false,
      };
    }
    if (status === "FINISHED") {
      return {
        label: "Selesai",
        className: "border border-slate-700 bg-slate-800 text-slate-400",
        showActiveDot: false,
      };
    }
    return {
      label: dayLabel,
      className: "border border-slate-700 bg-slate-800 text-slate-300",
      showActiveDot: false,
    };
  }

  if (status === "ONGOING") {
    return {
      label: "Sedang Berlangsung",
      className: "border border-emerald-300 bg-emerald-50 text-emerald-900",
      showActiveDot: true,
    };
  }
  if (status === "UPCOMING") {
    return {
      label: "Akan Datang",
      className: "border border-sky-300 bg-sky-50 text-sky-900",
      showActiveDot: false,
    };
  }
  if (status === "FINISHED") {
    return {
      label: "Selesai",
      className: "border border-slate-200 bg-slate-100 text-slate-600",
      showActiveDot: false,
    };
  }
  return {
    label: dayLabel,
    className: "border border-slate-200 bg-slate-100 text-slate-700",
    showActiveDot: false,
  };
}

export function CourseScheduleScene({
  schedules,
  pageIndex = 0,
  dayFilter = "TODAY",
  roomFilter = "ALL",
  now = new Date(),
  isPaused = false,
  themeTokens = THEME_CONFIGS.LIGHT,
  onDayFilterChange,
  onRoomFilterChange,
  onPageChange,
}: CourseScheduleSceneProps) {
  const effectiveDay = resolveEffectiveDay(dayFilter, now);
  const effectiveDayLabel = DAY_LABELS[effectiveDay];

  const filtered = filterCourseSchedules(schedules, {
    dayFilter,
    roomFilter,
    now,
  });

  const { pageItems, safePageIndex, totalPages, totalItems } =
    getPaginatedSlice(filtered, pageIndex, COURSE_SCHEDULES_PAGE_SIZE);

  // Combine standard rooms with any custom room names found in schedules
  const availableRooms: string[] = [...COURSE_ROOMS];
  for (const item of schedules) {
    if (!availableRooms.includes(item.roomName)) {
      availableRooms.push(item.roomName);
    }
  }

  const inactivePillClass = `${themeTokens.surface.card} ${themeTokens.surface.cardBorder} ${themeTokens.surface.statLabel}`;
  const activePillClass = themeTokens.header.badge;

  return (
    <section
      aria-label="Jadwal Mata Kuliah Program Studi Teknik Informatika"
      className="flex min-h-0 flex-1 flex-col justify-between gap-2.5 overflow-hidden"
    >
      {/* Compact 2-Row Touch Filter Bar (Day + Room) */}
      <div
        className={`shrink-0 space-y-2 rounded-xl border p-2.5 lg:px-3.5 lg:py-2.5 ${themeTokens.surface.card} ${themeTokens.surface.cardBorder}`}
      >
        {/* Row 1: Day Filter Pills + Active Count */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="group"
            aria-label="Filter Hari Perkuliahan"
            className="flex flex-wrap items-center gap-1.5"
          >
            <button
              type="button"
              onClick={() => onDayFilterChange?.("TODAY")}
              aria-pressed={dayFilter === "TODAY"}
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border px-3.5 text-xs font-bold transition-colors sm:text-sm ${
                dayFilter === "TODAY" ? activePillClass : inactivePillClass
              }`}
            >
              Hari Ini
            </button>

            {COURSE_DAYS.map((day) => {
              const isSelected = dayFilter === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => onDayFilterChange?.(day)}
                  aria-pressed={isSelected}
                  className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border px-3 text-xs font-bold transition-colors sm:text-sm ${
                    isSelected ? activePillClass : inactivePillClass
                  }`}
                >
                  {DAY_LABELS[day]}
                </button>
              );
            })}
          </div>

          <div
            className={`hidden items-center gap-2 text-xs font-semibold sm:flex 2xl:text-sm ${themeTokens.surface.statLabel}`}
          >
            <span>
              {dayFilter === "TODAY"
                ? `Hari Ini (${effectiveDayLabel})`
                : `Hari ${effectiveDayLabel}`}
            </span>
            <span aria-hidden="true">&bull;</span>
            <span className={`font-bold ${themeTokens.surface.statValue}`}>
              {totalItems} Kelas
            </span>
          </div>
        </div>

        {/* Row 2: Room Filter Pills */}
        <div
          role="group"
          aria-label="Filter Ruangan Perkuliahan"
          className="flex flex-wrap items-center gap-1.5 border-t border-inherit pt-2"
        >
          <button
            type="button"
            onClick={() => onRoomFilterChange?.("ALL")}
            aria-pressed={roomFilter === "ALL"}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border px-3 text-xs font-bold transition-colors ${
              roomFilter === "ALL" ? activePillClass : inactivePillClass
            }`}
          >
            Semua Ruangan
          </button>

          {availableRooms.map((room) => {
            const isSelected = roomFilter === room;
            return (
              <button
                key={room}
                type="button"
                onClick={() => onRoomFilterChange?.(room)}
                aria-pressed={isSelected}
                className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border px-2.5 font-mono text-xs font-bold transition-colors ${
                  isSelected ? activePillClass : inactivePillClass
                }`}
              >
                {room}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area: Sunday Holiday / Empty Filter / 2x3 Card Grid */}
      {effectiveDay === "MINGGU" && totalItems === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center">
          <div
            className={`max-w-lg rounded-2xl border p-7 ${themeTokens.surface.card} ${themeTokens.surface.cardBorder}`}
          >
            <h3 className={`text-xl font-extrabold ${themeTokens.header.title}`}>
              Hari Ini Tidak Ada Perkuliahan (Hari Libur)
            </h3>
            <p className={`mt-2 text-sm ${themeTokens.header.subtitle}`}>
              Tidak ada jadwal perkuliahan reguler Program Studi Teknik
              Informatika pada hari Minggu. Ketuk tombol di bawah untuk
              meninjau jadwal awal pekan.
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={() => onDayFilterChange?.("SENIN")}
                className={`inline-flex min-h-[48px] items-center justify-center rounded-lg px-5 text-sm font-bold transition-colors ${themeTokens.header.badge}`}
              >
                Lihat Jadwal Hari Senin
              </button>
            </div>
          </div>
        </div>
      ) : totalItems === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center">
          <div
            className={`max-w-lg rounded-2xl border p-7 ${themeTokens.surface.card} ${themeTokens.surface.cardBorder}`}
          >
            <h3 className={`text-lg font-extrabold ${themeTokens.header.title}`}>
              Belum Ada Jadwal Kuliah untuk Pilihan Ini
            </h3>
            <p className={`mt-2 text-sm ${themeTokens.header.subtitle}`}>
              {roomFilter !== "ALL"
                ? `Tidak ditemukan jadwal terpublikasi di ruangan ${roomFilter} pada hari ${effectiveDayLabel}.`
                : `Belum ada jadwal mata kuliah terpublikasi untuk hari ${effectiveDayLabel}.`}
            </p>
            {roomFilter !== "ALL" && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => onRoomFilterChange?.("ALL")}
                  className={`inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 text-sm font-bold ${themeTokens.header.badge}`}
                >
                  Tampilkan Semua Ruangan
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {pageItems.map((item) => {
            const status = getScheduleLiveStatus(item, now);
            const badge = getStatusBadgePresentation(
              status,
              DAY_LABELS[item.dayOfWeek],
              themeTokens.id,
            );
            const isOngoing = status === "ONGOING";

            return (
              <article
                key={item.id}
                className={`flex min-h-0 flex-col justify-between rounded-xl border p-4 transition-colors 2xl:p-5 ${
                  themeTokens.surface.card
                } ${
                  isOngoing && themeTokens.id !== "MONOCHROME"
                    ? "border-emerald-500 ring-1 ring-emerald-500/30"
                    : themeTokens.surface.cardBorder
                }`}
              >
                <div className="space-y-2.5">
                  {/* Top Row: Room Code + Time Range + Live Status */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-inherit pb-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md px-2.5 py-1 font-mono text-sm font-extrabold tracking-wide ${themeTokens.header.badge}`}
                      >
                        {item.roomName}
                      </span>
                      <span
                        className={`font-mono text-xs font-bold tabular-nums sm:text-sm ${themeTokens.surface.statValue}`}
                      >
                        {item.startTime} – {item.endTime} WIB
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${badge.className}`}
                    >
                      {badge.showActiveDot && (
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 rounded-full bg-emerald-600"
                        />
                      )}
                      {badge.label}
                    </span>
                  </div>

                  {/* Course Name & Class / Semester Metadata */}
                  <div>
                    <h3
                      className={`line-clamp-2 text-base font-extrabold leading-snug sm:text-lg 2xl:text-xl ${themeTokens.header.title}`}
                    >
                      {item.courseName}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold ${themeTokens.surface.badgeBase}`}
                      >
                        Kelas {item.className}
                      </span>
                      {item.semester !== null && (
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${themeTokens.surface.badgeBase}`}
                        >
                          Semester {item.semester}
                        </span>
                      )}
                      {item.academicYear && (
                        <span
                          className={`text-xs font-medium ${themeTokens.surface.statCaption}`}
                        >
                          TA {item.academicYear}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lecturer Footer */}
                <div className="mt-3 border-t border-inherit pt-2.5">
                  <div
                    className={`text-[11px] font-semibold uppercase tracking-wide ${themeTokens.surface.statCaption}`}
                  >
                    Dosen Pengampu
                  </div>
                  <div
                    className={`mt-0.5 truncate text-xs font-bold sm:text-sm ${themeTokens.surface.statValue}`}
                  >
                    {item.lecturerName}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Touch Pagination Bar when matching items exceed 6 cards */}
      {totalPages > 1 && (
        <div
          className={`flex shrink-0 items-center justify-between gap-3 rounded-lg border px-3 py-1.5 text-xs font-semibold ${themeTokens.surface.card} ${themeTokens.surface.cardBorder} ${themeTokens.surface.statLabel}`}
        >
          <span>
            Halaman {safePageIndex + 1} / {totalPages} ({totalItems} Jadwal)
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePageIndex <= 0}
              onClick={() => onPageChange?.(Math.max(0, safePageIndex - 1))}
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border px-3.5 text-xs font-bold disabled:opacity-40 ${inactivePillClass}`}
            >
              Sebelumnya
            </button>
            <button
              type="button"
              disabled={safePageIndex + 1 >= totalPages}
              onClick={() =>
                onPageChange?.(Math.min(totalPages - 1, safePageIndex + 1))
              }
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border px-3.5 text-xs font-bold disabled:opacity-40 ${inactivePillClass}`}
            >
              Berikutnya
            </button>
          </div>

          <span className="hidden sm:inline">
            {isPaused ? "Navigasi Manual Aktif" : "Paginasi Otomatis"}
          </span>
        </div>
      )}
    </section>
  );
}
