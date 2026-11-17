import { THEME_CONFIGS, type ThemeTokens } from "./design-tokens";

interface PublicEmptyStateProps {
  title: string;
  description: string;
  compact?: boolean;
  themeTokens?: ThemeTokens;
}

/**
 * Clean, minimalist empty-state display for public dashboard scenes.
 */
export function PublicEmptyState({
  title,
  description,
  compact = false,
  themeTokens = THEME_CONFIGS.LIGHT,
}: PublicEmptyStateProps) {
  const isLight = themeTokens.id === "LIGHT";
  const isMonochrome = themeTokens.id === "MONOCHROME";

  const badgeClass = isMonochrome
    ? "border-black bg-neutral-100 text-black font-semibold"
    : isLight
      ? "border-slate-200 bg-slate-100 text-slate-700 font-semibold"
      : "border-slate-700 bg-slate-800 text-slate-300 font-semibold";

  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center rounded-lg border text-center transition-colors ${themeTokens.surface.card} ${themeTokens.surface.cardBorder} ${
        compact ? "p-6 2xl:p-8" : "p-10 lg:p-14 2xl:p-20"
      }`}
    >
      <div className={`mb-3 inline-flex items-center rounded border px-3 py-1 text-xs tracking-wider uppercase 2xl:text-sm ${badgeClass}`}>
        Data Kosong
      </div>
      <h3
        className={`font-bold ${themeTokens.surface.statValue} ${
          compact ? "text-base lg:text-lg 2xl:text-xl" : "text-xl lg:text-2xl 2xl:text-3xl"
        }`}
      >
        {title}
      </h3>
      <p
        className={`mt-2 max-w-2xl ${themeTokens.surface.statCaption} ${
          compact ? "text-xs sm:text-sm 2xl:text-base" : "text-sm sm:text-base 2xl:text-lg"
        }`}
      >
        {description}
      </p>
    </div>
  );
}
