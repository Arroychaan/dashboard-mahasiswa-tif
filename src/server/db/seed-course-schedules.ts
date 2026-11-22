import { count } from "drizzle-orm";

import { courseSchedules, type DayOfWeek } from "~/server/db/schema";

export interface DummyCourseScheduleSeed {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  courseName: string;
  className: string;
  roomName: string;
  lecturerName: string;
  semester: number;
  academicYear: string;
  isPublished: boolean;
}

export const DUMMY_COURSE_SCHEDULES: readonly DummyCourseScheduleSeed[] = [
  {
    dayOfWeek: "SENIN",
    startTime: "08:00",
    endTime: "09:30",
    courseName: "Kalkulus",
    className: "A",
    roomName: "R106",
    lecturerName: "Dr. Ir. Hendra Kusuma, M.T.",
    semester: 1,
    academicYear: "2026/2027",
    isPublished: true,
  },
  {
    dayOfWeek: "SENIN",
    startTime: "13:00",
    endTime: "14:30",
    courseName: "Kecerdasan Buatan",
    className: "B",
    roomName: "R108",
    lecturerName: "Dr. Ahmad Fauzi, S.Kom., M.Kom.",
    semester: 5,
    academicYear: "2026/2027",
    isPublished: true,
  },
  {
    dayOfWeek: "SENIN",
    startTime: "13:00",
    endTime: "14:30",
    courseName: "Sistem Biomedis",
    className: "A",
    roomName: "R109",
    lecturerName: "Dr. Siti Rahmawati, S.T., M.Cs.",
    semester: 5,
    academicYear: "2026/2027",
    isPublished: true,
  },
  {
    dayOfWeek: "SELASA",
    startTime: "09:45",
    endTime: "11:15",
    courseName: "Desain Basis Data",
    className: "B",
    roomName: "R304",
    lecturerName: "Budi Santoso, S.Kom., M.T.",
    semester: 3,
    academicYear: "2026/2027",
    isPublished: true,
  },
  {
    dayOfWeek: "RABU",
    startTime: "14:45",
    endTime: "16:15",
    courseName: "Sistem Operasi",
    className: "A",
    roomName: "R305",
    lecturerName: "Nugroho Adi Prasetyo, S.T., M.Kom.",
    semester: 3,
    academicYear: "2026/2027",
    isPublished: true,
  },
] as const;

type CourseScheduleSeedDb = {
  select: (fields: { total: ReturnType<typeof count> }) => {
    from: (table: typeof courseSchedules) => Promise<Array<{ total: number | string }>>;
  };
  insert: (table: typeof courseSchedules) => {
    values: (
      rows: Array<typeof courseSchedules.$inferInsert>,
    ) => Promise<unknown>;
  };
};

export async function seedDummyCourseSchedules(
  db: CourseScheduleSeedDb,
): Promise<{ insertedCount: number; skipped: boolean }> {
  const [existing] = await db
    .select({ total: count() })
    .from(courseSchedules);

  if (Number(existing?.total ?? 0) > 0) {
    return { insertedCount: 0, skipped: true };
  }

  await db
    .insert(courseSchedules)
    .values(DUMMY_COURSE_SCHEDULES.map((item) => ({ ...item })));

  return {
    insertedCount: DUMMY_COURSE_SCHEDULES.length,
    skipped: false,
  };
}
