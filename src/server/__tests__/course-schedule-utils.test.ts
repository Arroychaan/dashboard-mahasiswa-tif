import { describe, expect, it } from "vitest";

import {
  filterCourseSchedules,
  getJakartaDayAndMinutes,
  getScheduleLiveStatus,
  parseTimeToMinutes,
  resolveEffectiveDay,
} from "~/components/public/course-schedule-utils";
import {
  COURSE_SCHEDULES_PAGE_SIZE,
  IDLE_TIMEOUT_MS,
  PUBLIC_SCENE_DEFINITIONS,
} from "~/components/public/design-tokens";
import {
  advanceSlideshowState,
  createInitialSlideshowState,
  getActiveSceneId,
  jumpToScene,
  resetToAttractState,
} from "~/components/public/slideshow-engine";
import type { PublicCourseScheduleDTO } from "~/lib/validators";

const SAMPLE_SCHEDULES: PublicCourseScheduleDTO[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    dayOfWeek: "SENIN",
    startTime: "08:00",
    endTime: "09:30",
    courseName: "Kalkulus",
    className: "A",
    roomName: "R106",
    lecturerName: "Dr. Hendra Kusuma",
    semester: 1,
    academicYear: "2026/2027",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    dayOfWeek: "SENIN",
    startTime: "13:00",
    endTime: "14:30",
    courseName: "Kecerdasan Buatan",
    className: "B",
    roomName: "R108",
    lecturerName: "Dr. Ahmad Fauzi",
    semester: 5,
    academicYear: "2026/2027",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    dayOfWeek: "SENIN",
    startTime: "13:00",
    endTime: "14:30",
    courseName: "Sistem Biomedis",
    className: "A",
    roomName: "R109",
    lecturerName: "Dr. Siti Rahmawati",
    semester: 5,
    academicYear: "2026/2027",
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    dayOfWeek: "SELASA",
    startTime: "09:45",
    endTime: "11:15",
    courseName: "Desain Basis Data",
    className: "B",
    roomName: "R304",
    lecturerName: "Budi Santoso",
    semester: 3,
    academicYear: "2026/2027",
  },
];

describe("Task 3: WIB schedule status utils & 7-scene slideshow engine", () => {
  it("resolves Asia/Jakarta day and minutes across UTC midnight boundary (UTC+7)", () => {
    // 2026-11-22 is Sunday UTC; 17:30Z = Monday 2026-11-23 00:30 WIB
    const utcEveningSunday = new Date("2026-11-22T17:30:00.000Z");
    expect(getJakartaDayAndMinutes(utcEveningSunday)).toEqual({
      dayOfWeek: "SENIN",
      minutesSinceMidnight: 30,
      dayLabel: "Senin",
    });

    // 2026-11-22 06:00Z = Sunday 13:00 WIB
    const sundayWib = new Date("2026-11-22T06:00:00.000Z");
    expect(getJakartaDayAndMinutes(sundayWib)).toEqual({
      dayOfWeek: "MINGGU",
      minutesSinceMidnight: 13 * 60,
      dayLabel: "Minggu",
    });

    expect(parseTimeToMinutes("13:45")).toBe(13 * 60 + 45);
  });

  it("computes live status boundaries (UPCOMING, ONGOING inclusive start / exclusive end, FINISHED, OTHER_DAY)", () => {
    const aiClass = SAMPLE_SCHEDULES[1]!; // SENIN 13:00-14:30

    // Monday 12:59 WIB (05:59Z) -> UPCOMING
    expect(
      getScheduleLiveStatus(aiClass, new Date("2026-11-23T05:59:00.000Z")),
    ).toBe("UPCOMING");

    // Monday 13:00 WIB (06:00Z) -> ONGOING (inclusive start)
    expect(
      getScheduleLiveStatus(aiClass, new Date("2026-11-23T06:00:00.000Z")),
    ).toBe("ONGOING");

    // Monday 14:29 WIB (07:29Z) -> ONGOING
    expect(
      getScheduleLiveStatus(aiClass, new Date("2026-11-23T07:29:00.000Z")),
    ).toBe("ONGOING");

    // Monday 14:30 WIB (07:30Z) -> FINISHED (exclusive end)
    expect(
      getScheduleLiveStatus(aiClass, new Date("2026-11-23T07:30:00.000Z")),
    ).toBe("FINISHED");

    // Tuesday 13:30 WIB (06:30Z) -> OTHER_DAY
    expect(
      getScheduleLiveStatus(aiClass, new Date("2026-11-24T06:30:00.000Z")),
    ).toBe("OTHER_DAY");
  });

  it("handles Sunday TODAY filter gracefully and filters by day and room accurately", () => {
    const sundayWib = new Date("2026-11-22T06:00:00.000Z");
    expect(resolveEffectiveDay("TODAY", sundayWib)).toBe("MINGGU");
    expect(
      filterCourseSchedules(SAMPLE_SCHEDULES, {
        dayFilter: "TODAY",
        roomFilter: "ALL",
        now: sundayWib,
      }),
    ).toEqual([]);

    const mondayWib = new Date("2026-11-23T06:30:00.000Z");
    const mondayAll = filterCourseSchedules(SAMPLE_SCHEDULES, {
      dayFilter: "TODAY",
      roomFilter: "ALL",
      now: mondayWib,
    });
    expect(mondayAll.map((s) => s.courseName)).toEqual([
      "Kalkulus",
      "Kecerdasan Buatan",
      "Sistem Biomedis",
    ]);

    const mondayR108 = filterCourseSchedules(SAMPLE_SCHEDULES, {
      dayFilter: "SENIN",
      roomFilter: "R108",
      now: sundayWib,
    });
    expect(mondayR108.map((s) => s.courseName)).toEqual(["Kecerdasan Buatan"]);
  });

  it("rotates across 7 scenes with fair courseSchedulePageIndex pagination, jumpToScene, and resetToAttractState", () => {
    expect(PUBLIC_SCENE_DEFINITIONS).toHaveLength(7);
    expect(PUBLIC_SCENE_DEFINITIONS[6]?.id).toBe("COURSE_SCHEDULE");
    expect(COURSE_SCHEDULES_PAGE_SIZE).toBe(6);
    expect(IDLE_TIMEOUT_MS).toBe(45_000);

    const counts = {
      graduatesCount: 10,
      lecturersCount: 4,
      publicationsCount: 6,
      announcementsCount: 3,
      courseSchedulesCount: 14, // 3 pages at pageSize=6
    };

    let state = createInitialSlideshowState();
    const seenSchedulePages = new Set<number>();

    // 3 full cycles = 3 * 7 = 21 transitions
    for (let i = 0; i < 21; i += 1) {
      if (getActiveSceneId(state) === "COURSE_SCHEDULE") {
        seenSchedulePages.add(state.courseSchedulePageIndex);
      }
      state = advanceSlideshowState(state, counts);
    }

    expect(state.completedCycles).toBe(3);
    expect(getActiveSceneId(state)).toBe("OVERVIEW");
    expect(seenSchedulePages).toEqual(new Set([0, 1, 2]));

    // Direct scene jump & attract reset
    const jumped = jumpToScene(state, "COURSE_SCHEDULE");
    expect(getActiveSceneId(jumped)).toBe("COURSE_SCHEDULE");
    expect(jumped.sceneIndex).toBe(6);

    const reset = resetToAttractState({
      ...jumped,
      courseSchedulePageIndex: 2,
    });
    expect(reset.sceneIndex).toBe(0);
    expect(getActiveSceneId(reset)).toBe("OVERVIEW");
    expect(reset.courseSchedulePageIndex).toBe(0);
  });
});
