import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AnnouncementsScene,
  type PublicAnnouncementItem,
} from "~/components/public/AnnouncementsScene";
import { BrandedHeader } from "~/components/public/BrandedHeader";
import { CourseScheduleScene } from "~/components/public/CourseScheduleScene";
import { THEME_CONFIGS } from "~/components/public/design-tokens";
import type { PublicCourseScheduleDTO } from "~/lib/validators";

const MONDAY_SCHEDULES: PublicCourseScheduleDTO[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    dayOfWeek: "SENIN",
    startTime: "08:00",
    endTime: "09:30",
    courseName: "Kalkulus",
    className: "A",
    roomName: "R106",
    lecturerName: "Dr. Ir. Hendra Kusuma, M.T.",
    semester: 1,
    academicYear: "2026/2027",
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    dayOfWeek: "SENIN",
    startTime: "13:00",
    endTime: "14:30",
    courseName: "Kecerdasan Buatan",
    className: "B",
    roomName: "R108",
    lecturerName: "Dr. Ahmad Fauzi, M.Kom.",
    semester: 5,
    academicYear: "2026/2027",
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    dayOfWeek: "SENIN",
    startTime: "14:45",
    endTime: "16:15",
    courseName: "Sistem Operasi",
    className: "A",
    roomName: "R305",
    lecturerName: "Nugroho Adi Prasetyo, M.Kom.",
    semester: 3,
    academicYear: "2026/2027",
  },
];

describe("Task 4: Public Kiosk Scenes (CourseScheduleScene, AnnouncementsScene, BrandedHeader)", () => {
  it("renders 2-row finger-friendly filters, real-time badges, and Semester metadata without a 3rd semester filter bar", () => {
    // Monday 13:30 WIB (06:30Z)
    const now = new Date("2026-11-23T06:30:00.000Z");

    const html = renderToStaticMarkup(
      createElement(CourseScheduleScene, {
        schedules: MONDAY_SCHEDULES,
        dayFilter: "TODAY",
        roomFilter: "ALL",
        pageIndex: 0,
        now,
        isPaused: true,
        themeTokens: THEME_CONFIGS.LIGHT,
      }),
    );

    // 2-row filters with >= 44px touch targets
    expect(html).toContain("Hari Ini");
    expect(html).toContain("Senin");
    expect(html).toContain("Sabtu");
    expect(html).toContain("Semua Ruangan");
    expect(html).toContain("R106");
    expect(html).toContain("R308");
    expect(html).toContain("min-h-[44px]");

    // No 3rd Semester filter bar
    expect(html).not.toContain("Semua Semester");

    // Live status badges & card semester metadata
    expect(html).toContain("Sedang Berlangsung");
    expect(html).toContain("Akan Datang");
    expect(html).toContain("Selesai");
    expect(html).toContain("Semester 5");
    expect(html).toContain("Kecerdasan Buatan");
    expect(html).toContain("Kelas B");
  });

  it("renders Sunday holiday state with 1-tap button to view Monday schedules", () => {
    // Sunday 13:00 WIB (06:00Z)
    const sundayNow = new Date("2026-11-22T06:00:00.000Z");

    const html = renderToStaticMarkup(
      createElement(CourseScheduleScene, {
        schedules: MONDAY_SCHEDULES,
        dayFilter: "TODAY",
        roomFilter: "ALL",
        pageIndex: 0,
        now: sundayNow,
        isPaused: false,
        themeTokens: THEME_CONFIGS.LIGHT,
      }),
    );

    expect(html).toContain("Hari Ini Tidak Ada Perkuliahan (Hari Libur)");
    expect(html).toContain("Lihat Jadwal Hari Senin");
  });

  it("caps displayed cards at 6 per screen and renders touch pagination when more than 6 schedules match", () => {
    const now = new Date("2026-11-23T06:30:00.000Z");
    const eightClasses: PublicCourseScheduleDTO[] = Array.from(
      { length: 8 },
      (_, idx) => ({
        id: `20000000-0000-4000-8000-00000000000${idx + 1}`,
        dayOfWeek: "SENIN",
        startTime: `0${8 + idx}:00`.slice(-5),
        endTime: `0${9 + idx}:00`.slice(-5),
        courseName: `Mata Kuliah Uji ${idx + 1}`,
        className: idx % 2 === 0 ? "A" : "B",
        roomName: "R108",
        lecturerName: `Dosen Pengampu ${idx + 1}`,
        semester: (idx % 6) + 1,
        academicYear: "2026/2027",
      }),
    );

    const html = renderToStaticMarkup(
      createElement(CourseScheduleScene, {
        schedules: eightClasses,
        dayFilter: "SENIN",
        roomFilter: "ALL",
        pageIndex: 0,
        now,
        isPaused: true,
        themeTokens: THEME_CONFIGS.DARK,
      }),
    );

    expect(html).toContain("Mata Kuliah Uji 1");
    expect(html).toContain("Mata Kuliah Uji 6");
    expect(html).not.toContain("Mata Kuliah Uji 7");
    expect(html).toContain("Halaman 1 / 2");
    expect(html).toContain("Sebelumnya");
    expect(html).toContain("Berikutnya");

    // Also verifies MONOCHROME theme renders without error
    const monoHtml = renderToStaticMarkup(
      createElement(CourseScheduleScene, {
        schedules: MONDAY_SCHEDULES,
        dayFilter: "SENIN",
        roomFilter: "ALL",
        pageIndex: 0,
        now,
        themeTokens: THEME_CONFIGS.MONOCHROME,
      }),
    );
    expect(monoHtml).toContain("Kecerdasan Buatan");
  });

  it("renders tappable AnnouncementsScene cards and touch-enabled BrandedHeader with pause banner", () => {
    const sampleAnnouncement: PublicAnnouncementItem = {
      id: "30000000-0000-4000-8000-000000000001",
      title: "Jadwal Seminar Proposal TA",
      category: "PENGUMUMAN",
      content: "Mahasiswa tingkat akhir harap mendaftar sebelum hari Jumat.",
      eventDate: new Date("2026-11-25T00:00:00.000Z"),
      isPublished: true,
      createdAt: new Date("2026-11-20T00:00:00.000Z"),
      updatedAt: new Date("2026-11-20T00:00:00.000Z"),
    };

    const announceHtml = renderToStaticMarkup(
      createElement(AnnouncementsScene, {
        announcements: [sampleAnnouncement],
        pageIndex: 0,
        isPaused: true,
        onSelectAnnouncement: () => undefined,
        themeTokens: THEME_CONFIGS.LIGHT,
      }),
    );
    expect(announceHtml).toContain("Ketuk untuk baca lengkap");
    expect(announceHtml).toContain("<button");

    const headerHtml = renderToStaticMarkup(
      createElement(BrandedHeader, {
        activeSceneId: "COURSE_SCHEDULE",
        lastUpdatedAt: new Date("2026-11-22T06:00:00.000Z"),
        isRefreshing: false,
        hasTemporarySyncError: false,
        isPaused: true,
        onSelectScene: () => undefined,
        onResumeSlideshow: () => undefined,
        themeTokens: THEME_CONFIGS.LIGHT,
      }),
    );
    expect(headerHtml).toContain("Layar 7 / 7");
    expect(headerHtml).toContain("7. Jadwal");
    expect(headerHtml).toContain("Mode Interaktif");
    expect(headerHtml).toContain("Lanjutkan Rotasi");
    expect(headerHtml).toContain("min-h-[44px]");
  });

  it("caps custom room filter pills to prevent vertical overflow while preserving an active custom room, and gates 100vh lock by min-height >= 900px", () => {
    const now = new Date("2026-11-23T06:30:00.000Z");
    const manyCustomRoomSchedules: PublicCourseScheduleDTO[] = Array.from(
      { length: 15 },
      (_, idx) => ({
        id: `50000000-0000-4000-8000-0000000000${String(idx + 1).padStart(2, "0")}`,
        dayOfWeek: "SENIN",
        startTime: "08:00",
        endTime: "09:30",
        courseName: `Kuliah Custom ${idx + 1}`,
        className: "A",
        roomName: `LAB-${String(idx + 1).padStart(2, "0")}`,
        lecturerName: "Dosen Pengampu",
        semester: 3,
        academicYear: "2026/2027",
      }),
    );

    const html = renderToStaticMarkup(
      createElement(CourseScheduleScene, {
        schedules: manyCustomRoomSchedules,
        dayFilter: "SENIN",
        roomFilter: "LAB-15",
        pageIndex: 0,
        now,
        themeTokens: THEME_CONFIGS.LIGHT,
      }),
    );

    // 10 default rooms + at most 2 custom rooms = 12 room pills total (+ "Semua Ruangan")
    expect(html).toContain("LAB-15"); // Active custom room is preserved
    expect(html).not.toContain("LAB-14"); // Excess custom rooms are capped

    // Height-gated 100vh lock prevents clipping on 1280x720 / 1366x768 touchscreens
    const globalsCss = fs.readFileSync(
      path.join(process.cwd(), "src/styles/globals.css"),
      "utf8",
    );
    expect(globalsCss).toContain("min-height: 900px");
    expect(globalsCss).toContain(".kiosk-single-screen");

    const slideshowSrc = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/components/public/PublicDashboardSlideshow.tsx",
      ),
      "utf8",
    );
    expect(slideshowSrc).toContain("kiosk-single-screen");
    expect(slideshowSrc).not.toContain("lg:h-screen lg:max-h-screen");
  });
});
