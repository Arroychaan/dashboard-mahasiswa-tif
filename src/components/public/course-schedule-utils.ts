import type { DayOfWeekType, PublicCourseScheduleDTO } from "~/lib/validators";

export type PublicDayFilter = "TODAY" | DayOfWeekType;
export type JakartaDayOfWeek = DayOfWeekType | "MINGGU";
export type ScheduleLiveStatus =
  | "ONGOING"
  | "UPCOMING"
  | "FINISHED"
  | "OTHER_DAY";

export const DAY_LABELS: Record<JakartaDayOfWeek, string> = {
  SENIN: "Senin",
  SELASA: "Selasa",
  RABU: "Rabu",
  KAMIS: "Kamis",
  JUMAT: "Jumat",
  SABTU: "Sabtu",
  MINGGU: "Minggu",
};

const WEEKDAY_EN_TO_ID: Record<string, JakartaDayOfWeek> = {
  Mon: "SENIN",
  Tue: "SELASA",
  Wed: "RABU",
  Thu: "KAMIS",
  Fri: "JUMAT",
  Sat: "SABTU",
  Sun: "MINGGU",
};

const JAKARTA_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jakarta",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function parseTimeToMinutes(hhmm: string): number {
  const [hourStr, minuteStr] = hhmm.split(":");
  const hours = Number(hourStr);
  const minutes = Number(minuteStr);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }
  return hours * 60 + minutes;
}

export function getJakartaDayAndMinutes(date: Date): {
  dayOfWeek: JakartaDayOfWeek;
  minutesSinceMidnight: number;
  dayLabel: string;
} {
  const parts = JAKARTA_PARTS_FORMATTER.formatToParts(date);
  const weekdayPart = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hourPart = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minutePart = Number(
    parts.find((p) => p.type === "minute")?.value ?? "0",
  );

  const normalizedHour = hourPart === 24 ? 0 : hourPart;
  const dayOfWeek = WEEKDAY_EN_TO_ID[weekdayPart] ?? "SENIN";

  return {
    dayOfWeek,
    minutesSinceMidnight: normalizedHour * 60 + minutePart,
    dayLabel: DAY_LABELS[dayOfWeek],
  };
}

export function resolveEffectiveDay(
  dayFilter: PublicDayFilter,
  now: Date,
): JakartaDayOfWeek {
  if (dayFilter === "TODAY") {
    return getJakartaDayAndMinutes(now).dayOfWeek;
  }
  return dayFilter;
}

export function getScheduleLiveStatus(
  schedule: Pick<PublicCourseScheduleDTO, "dayOfWeek" | "startTime" | "endTime">,
  now: Date,
): ScheduleLiveStatus {
  const { dayOfWeek, minutesSinceMidnight } = getJakartaDayAndMinutes(now);
  if (schedule.dayOfWeek !== dayOfWeek) {
    return "OTHER_DAY";
  }

  const startMinutes = parseTimeToMinutes(schedule.startTime);
  const endMinutes = parseTimeToMinutes(schedule.endTime);

  if (minutesSinceMidnight >= startMinutes && minutesSinceMidnight < endMinutes) {
    return "ONGOING";
  }
  if (minutesSinceMidnight < startMinutes) {
    return "UPCOMING";
  }
  return "FINISHED";
}

export function filterCourseSchedules(
  items: readonly PublicCourseScheduleDTO[],
  params: {
    dayFilter: PublicDayFilter;
    roomFilter: string;
    now: Date;
  },
): PublicCourseScheduleDTO[] {
  const effectiveDay = resolveEffectiveDay(params.dayFilter, params.now);
  if (effectiveDay === "MINGGU") {
    return [];
  }

  const normalizedRoom = params.roomFilter.trim();

  return items
    .filter((item) => {
      if (item.dayOfWeek !== effectiveDay) return false;
      if (normalizedRoom !== "" && normalizedRoom !== "ALL") {
        return item.roomName === normalizedRoom;
      }
      return true;
    })
    .sort((a, b) => {
      const timeCmp = a.startTime.localeCompare(b.startTime);
      if (timeCmp !== 0) return timeCmp;
      const roomCmp = a.roomName.localeCompare(b.roomName);
      if (roomCmp !== 0) return roomCmp;
      return a.courseName.localeCompare(b.courseName);
    });
}
