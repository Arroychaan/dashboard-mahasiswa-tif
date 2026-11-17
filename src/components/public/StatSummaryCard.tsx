import { THEME_CONFIGS, type ThemeTokens } from "./design-tokens";

interface StatSummaryCardProps {
  label: string;
  value: number | string;
  unitLabel?: string;
  caption: string;
  accent?: "blue" | "sky" | "emerald" | "slate";
  themeTokens?: ThemeTokens;
}

/**
 * Minimalist statistical summary card with clean 1px border and refined typography.
 */
export function StatSummaryCard({
  label,
  value,
  unitLabel,
  caption,
  accent = "blue",
  themeTokens = THEME_CONFIGS.LIGHT,
}: StatSummaryCardProps) {
  const isLight = themeTokens.id === "LIGHT";
  const isMonochrome = themeTokens.id === "MONOCHROME";

  const accentBorderClass = isMonochrome
    ? "border-t-4 border-t-black border-black bg-white"
    : isLight
      ? accent === "emerald"
        ? "border-t-4 border-t-emerald-600 border-slate-200 bg-white"
        : accent === "sky"
          ? "border-t-4 border-t-teal-600 border-slate-200 bg-white"
          : accent === "slate"
            ? "border-t-4 border-t-slate-500 border-slate-200 bg-white"
            : "border-t-4 border-t-sky-700 border-slate-200 bg-white"
      : accent === "emerald"
        ? "border-t-4 border-t-emerald-500 border-slate-800 bg-slate-900"
        : accent === "sky"
          ? "border-t-4 border-t-sky-400 border-slate-800 bg-slate-900"
          : accent === "slate"
            ? "border-t-4 border-t-slate-400 border-slate-800 bg-slate-900"
            : "border-t-4 border-t-blue-500 border-slate-800 bg-slate-900";

  return (
    <div
      className={`flex flex-col justify-between rounded-lg border p-3.5 transition-colors lg:p-4 2xl:p-7 ${accentBorderClass}`}
    >
      <div className={`text-xs font-bold tracking-wider uppercase sm:text-sm 2xl:text-base ${themeTokens.surface.statLabel}`}>
        {label}
      </div>

      <div className="my-1.5 flex items-baseline gap-2 2xl:my-3.5">
        <span className={`text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl lg:text-4xl xl:text-5xl 2xl:text-7xl ${themeTokens.surface.statValue}`}>
          {value}
        </span>
        {unitLabel && (
          <span className={`text-sm font-semibold sm:text-base 2xl:text-xl ${themeTokens.surface.statCaption}`}>
            {unitLabel}
          </span>
        )}
      </div>

      <p className={`line-clamp-1 text-xs font-medium sm:text-sm 2xl:text-base ${themeTokens.surface.statCaption}`}>
        {caption}
      </p>
    </div>
  );
}
