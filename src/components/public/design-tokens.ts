/**
 * Design Tokens & Configuration Constants for the UNISSULA Informatics
 * Public Digital Signage Dashboard (`/`).
 *
 * Visual Direction:
 * - Minimalist, clean, and elegant for laboratory wall-mounted monitors & kiosks.
 * - Anti-AI Slop: zero generic neon glows, zero blanket glassmorphism, zero floating pills.
 * - Terse, professional copywriting without filler words.
 */

export const DEFAULT_SCENE_DURATION_MS = 15_000; // 15 seconds per scene
export const DEFAULT_DATA_REFRESH_INTERVAL_MS = 60_000; // 60 seconds background refresh
export const CLOCK_TICK_INTERVAL_MS = 1_000; // 1 second clock update
export const IDLE_TIMEOUT_MS = 45_000; // 45 seconds idle reset for touch kiosk

export const GRADUATES_PAGE_SIZE = 10;
export const LECTURERS_PAGE_SIZE = 4;
export const PUBLICATIONS_PAGE_SIZE = 6;
export const ANNOUNCEMENTS_PAGE_SIZE = 3;
export const COURSE_SCHEDULES_PAGE_SIZE = 6;

export type PublicSceneId =
  | "OVERVIEW"
  | "GRADUATES"
  | "LECTURERS"
  | "PUBLICATIONS"
  | "ANNOUNCEMENTS"
  | "FEEDBACK_QR"
  | "COURSE_SCHEDULE";

export interface PublicSceneDefinition {
  orderNumber: number;
  id: PublicSceneId;
  shortLabel: string;
  title: string;
  subtitle: string;
}

export const PUBLIC_SCENE_DEFINITIONS: readonly [
  PublicSceneDefinition,
  ...PublicSceneDefinition[],
] = [
  {
    id: "OVERVIEW",
    orderNumber: 1,
    shortLabel: "Ringkasan",
    title: "Ringkasan Akademik Program Studi",
    subtitle: "Data terverifikasi lulusan, dosen, dan publikasi ilmiah",
  },
  {
    id: "GRADUATES",
    orderNumber: 2,
    shortLabel: "Lulusan",
    title: "Data Kelulusan Mahasiswa",
    subtitle: "Distribusi alumni berdasarkan tahun angkatan dan tahun lulus",
  },
  {
    id: "LECTURERS",
    orderNumber: 3,
    shortLabel: "Dosen",
    title: "Dosen & Peneliti Program Studi",
    subtitle: "Bidang keahlian, jabatan fungsional, dan profil akademik",
  },
  {
    id: "PUBLICATIONS",
    orderNumber: 4,
    shortLabel: "Publikasi",
    title: "Publikasi Ilmiah Program Studi",
    subtitle: "Rekapan jurnal dan artikel ilmiah dosen teknik informatika",
  },
  {
    id: "ANNOUNCEMENTS",
    orderNumber: 5,
    shortLabel: "Pengumuman",
    title: "Pengumuman & Berita Acara",
    subtitle: "Agenda kegiatan, surat edaran, dan pengumuman resmi program studi",
  },
  {
    id: "FEEDBACK_QR",
    orderNumber: 6,
    shortLabel: "Kotak Saran",
    title: "Kotak Saran & Sumbangan",
    subtitle: "Pindai kode QR untuk menyampaikan aspirasi atau sumbangan",
  },
  {
    id: "COURSE_SCHEDULE",
    orderNumber: 7,
    shortLabel: "Jadwal",
    title: "Jadwal Mata Kuliah Program Studi",
    subtitle:
      "Jadwal perkuliahan harian, ruangan, dan dosen pengampu Teknik Informatika",
  },
] as const;

export type PublicDisplayTheme = "LIGHT" | "DARK" | "MONOCHROME";

export interface ThemeTokens {
  id: PublicDisplayTheme;
  name: string;
  description: string;
  container: string;
  header: {
    bg: string;
    border: string;
    badge: string;
    title: string;
    subtitle: string;
    clockTime: string;
    clockDate: string;
    tagPill: string;
  };
  surface: {
    base: string;
    card: string;
    cardBorder: string;
    statValue: string;
    statLabel: string;
    statCaption: string;
    tableHeader: string;
    tableRowAlt: string;
    badgeBase: string;
  };
  chart: {
    graduatesBar: string;
    entryCohortBar: string;
    journalBar: string;
    articleBar: string;
    gridStroke: string;
    axisText: string;
    tooltipBg: string;
    tooltipBorder: string;
    tooltipText: string;
  };
}

export const THEME_CONFIGS: Record<PublicDisplayTheme, ThemeTokens> = {
  LIGHT: {
    id: "LIGHT",
    name: "Terang (Clean Academic)",
    description: "Latar putih bersih dengan kontras optimal untuk ruangan program studi berpencahayaan standar.",
    container: "bg-slate-50 text-slate-900",
    header: {
      bg: "bg-white",
      border: "border-slate-200",
      badge: "bg-emerald-700 text-white",
      title: "text-slate-900",
      subtitle: "text-slate-600",
      clockTime: "text-slate-900",
      clockDate: "text-slate-600",
      tagPill: "bg-slate-100 text-slate-700 border-slate-200",
    },
    surface: {
      base: "bg-slate-50",
      card: "bg-white",
      cardBorder: "border-slate-200/90",
      statValue: "text-slate-900",
      statLabel: "text-slate-600",
      statCaption: "text-slate-500",
      tableHeader: "bg-slate-100 text-slate-700",
      tableRowAlt: "bg-slate-50/60",
      badgeBase: "bg-slate-100 text-slate-700 border-slate-200",
    },
    chart: {
      graduatesBar: "#0284c7", // sky-600
      entryCohortBar: "#4f46e5", // indigo-600
      journalBar: "#0284c7",
      articleBar: "#059669", // emerald-600
      gridStroke: "#e2e8f0", // slate-200
      axisText: "#475569", // slate-600
      tooltipBg: "#ffffff",
      tooltipBorder: "#cbd5e1",
      tooltipText: "#0f172a",
    },
  },
  DARK: {
    id: "DARK",
    name: "Gelap (Studio Slate)",
    description: "Latar deep slate elegan dengan kontras tinggi tanpa efek neon yang menyilaukan.",
    container: "bg-slate-950 text-slate-100",
    header: {
      bg: "bg-slate-950",
      border: "border-slate-800",
      badge: "bg-emerald-600 text-white",
      title: "text-white",
      subtitle: "text-slate-400",
      clockTime: "text-white",
      clockDate: "text-slate-400",
      tagPill: "bg-slate-800 text-slate-300 border-slate-700",
    },
    surface: {
      base: "bg-slate-950",
      card: "bg-slate-900",
      cardBorder: "border-slate-800",
      statValue: "text-white",
      statLabel: "text-slate-300",
      statCaption: "text-slate-400",
      tableHeader: "bg-slate-800 text-slate-200",
      tableRowAlt: "bg-slate-900/50",
      badgeBase: "bg-slate-800 text-slate-300 border-slate-700",
    },
    chart: {
      graduatesBar: "#38bdf8", // sky-400
      entryCohortBar: "#818cf8", // indigo-400
      journalBar: "#38bdf8",
      articleBar: "#34d399", // emerald-400
      gridStroke: "#1e293b", // slate-800
      axisText: "#94a3b8", // slate-400
      tooltipBg: "#0f172a",
      tooltipBorder: "#334155",
      tooltipText: "#f8fafc",
    },
  },
  MONOCHROME: {
    id: "MONOCHROME",
    name: "Monokrom (Editorial)",
    description: "Gaya hitam-putih murni kontras tinggi ala publikasi akademik minimalis.",
    container: "bg-white text-black",
    header: {
      bg: "bg-white",
      border: "border-black",
      badge: "bg-black text-white",
      title: "text-black",
      subtitle: "text-neutral-700",
      clockTime: "text-black",
      clockDate: "text-neutral-700",
      tagPill: "bg-neutral-100 text-black border-neutral-300",
    },
    surface: {
      base: "bg-white",
      card: "bg-white",
      cardBorder: "border-black",
      statValue: "text-black",
      statLabel: "text-neutral-800",
      statCaption: "text-neutral-600",
      tableHeader: "bg-neutral-100 text-black font-bold",
      tableRowAlt: "bg-neutral-50",
      badgeBase: "bg-neutral-100 text-black border-black",
    },
    chart: {
      graduatesBar: "#000000",
      entryCohortBar: "#525252",
      journalBar: "#000000",
      articleBar: "#525252",
      gridStroke: "#d4d4d4",
      axisText: "#171717",
      tooltipBg: "#ffffff",
      tooltipBorder: "#000000",
      tooltipText: "#000000",
    },
  },
};

export const SIGNAGE_CHART_COLORS = THEME_CONFIGS.LIGHT.chart;
