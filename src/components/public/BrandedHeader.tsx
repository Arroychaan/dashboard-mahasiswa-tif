"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import {
  CLOCK_TICK_INTERVAL_MS,
  PUBLIC_SCENE_DEFINITIONS,
  THEME_CONFIGS,
  type PublicSceneId,
  type ThemeTokens,
} from "./design-tokens";
import { formatJakartaDateTime } from "./slideshow-engine";

interface BrandedHeaderProps {
  activeSceneId: PublicSceneId;
  lastUpdatedAt: Date | null;
  isRefreshing: boolean;
  hasTemporarySyncError: boolean;
  isPaused?: boolean;
  themeTokens?: ThemeTokens;
  onSelectScene?: (sceneId: PublicSceneId) => void;
  onResumeSlideshow?: () => void;
}

export function BrandedHeader({
  activeSceneId,
  lastUpdatedAt,
  isRefreshing,
  hasTemporarySyncError,
  isPaused = false,
  themeTokens = THEME_CONFIGS.LIGHT,
  onSelectScene,
  onResumeSlideshow,
}: BrandedHeaderProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, CLOCK_TICK_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const jakartaClock = now ? formatJakartaDateTime(now) : null;
  const activeScene =
    PUBLIC_SCENE_DEFINITIONS.find((s) => s.id === activeSceneId) ??
    PUBLIC_SCENE_DEFINITIONS[0];

  return (
    <header
      className={`shrink-0 border-b transition-colors duration-200 px-5 py-2.5 lg:px-8 lg:py-3 2xl:px-14 2xl:py-5 ${themeTokens.header.bg} ${themeTokens.header.border}`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Theme-Aware Institutional Logo & Identity */}
        <div className="flex items-center gap-4 2xl:gap-5">
          <Image
            src={
              themeTokens.id === "DARK"
                ? "/Logo_Unissula_dark_theme.png"
                : "/Logo_Unissula_white_theme.png"
            }
            alt="Logo Teknik Informatika Universitas Islam Sultan Agung"
            width={185}
            height={60}
            className="h-10 w-auto shrink-0 object-contain sm:h-11 2xl:h-14"
            priority
          />

          <div>
            <p
              className={`text-xs font-semibold tracking-wider uppercase sm:text-sm 2xl:text-base ${themeTokens.header.subtitle}`}
            >
              Universitas Islam Sultan Agung &bull; Teknik Informatika
            </p>
            <h1
              className={`mt-0.5 text-xl font-extrabold tracking-tight sm:text-2xl lg:text-3xl 2xl:text-4xl ${themeTokens.header.title}`}
            >
              Dashboard Program Studi Teknik Informatika
            </h1>
          </div>
        </div>

        {/* Right: Asia/Jakarta Date & Clock */}
        <div
          className={`flex flex-wrap items-center justify-between gap-4 border-t pt-3 lg:justify-end lg:border-t-0 lg:pt-0 ${themeTokens.header.border}`}
        >
          <div className="text-left lg:text-right">
            <div
              data-testid="jakarta-clock-time"
              className={`font-mono text-2xl font-extrabold tracking-tight tabular-nums sm:text-3xl 2xl:text-4xl ${themeTokens.header.clockTime}`}
            >
              {jakartaClock ? jakartaClock.timeLabel : "WIB"}
            </div>
            <div
              data-testid="jakarta-clock-date"
              className={`mt-0.5 text-xs font-medium sm:text-sm 2xl:text-base ${themeTokens.header.clockDate}`}
            >
              {jakartaClock
                ? jakartaClock.dateLabel
                : "Zona Waktu Asia/Jakarta"}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar: Active Scene Title & Scene Progress Indicator */}
      <div
        className={`mt-2.5 flex flex-col gap-2 border-t pt-2.5 sm:flex-row sm:items-center sm:justify-between 2xl:mt-4 2xl:pt-3 ${themeTokens.header.border}`}
      >
        <div>
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-flex items-center rounded px-2.5 py-0.5 text-xs font-bold tracking-wider uppercase 2xl:text-sm ${themeTokens.header.badge}`}
            >
              Layar {activeScene.orderNumber} /{" "}
              {PUBLIC_SCENE_DEFINITIONS.length}
            </span>
            <h2
              className={`text-base font-bold sm:text-lg 2xl:text-2xl ${themeTokens.header.title}`}
            >
              {activeScene.title}
            </h2>
          </div>
          <p
            className={`mt-0.5 text-xs sm:text-sm 2xl:text-base ${themeTokens.header.subtitle}`}
          >
            {activeScene.subtitle}
          </p>
        </div>

        {/* Touch-Friendly Scene Navigation & Sync Status */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PUBLIC_SCENE_DEFINITIONS.map((scene) => {
            const isActive = scene.id === activeSceneId;
            const sharedClass = `inline-flex min-h-[44px] items-center rounded-lg border px-3 py-1.5 text-xs font-bold tracking-wide transition-colors 2xl:px-4 2xl:py-2 2xl:text-sm ${
              isActive
                ? themeTokens.header.badge
                : `${themeTokens.header.bg} ${themeTokens.header.subtitle} ${themeTokens.header.border}`
            }`;

            if (onSelectScene) {
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => onSelectScene(scene.id)}
                  aria-current={isActive ? "step" : undefined}
                  className={sharedClass}
                >
                  {scene.orderNumber}. {scene.shortLabel}
                </button>
              );
            }

            return (
              <div key={scene.id} className={sharedClass}>
                {scene.orderNumber}. {scene.shortLabel}
              </div>
            );
          })}

          {isPaused && (
            <div className="ml-1 flex items-center gap-1.5">
              <span
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold ${
                  themeTokens.id === "MONOCHROME"
                    ? "border-black bg-neutral-100 text-black"
                    : themeTokens.id === "DARK"
                      ? "border-amber-500/60 bg-amber-950 text-amber-200"
                      : "border-amber-300 bg-amber-50 text-amber-900"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-amber-500"
                />
                Mode Interaktif
              </span>
              {onResumeSlideshow && (
                <button
                  type="button"
                  onClick={onResumeSlideshow}
                  className={`inline-flex min-h-[44px] items-center rounded-lg px-3 text-xs font-bold transition-colors ${themeTokens.header.badge}`}
                >
                  Lanjutkan Rotasi
                </button>
              )}
            </div>
          )}

          {!isPaused && (
            <div
              className={`ml-1 hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium xl:inline-flex 2xl:text-xs ${themeTokens.header.bg} ${themeTokens.header.subtitle} ${themeTokens.header.border}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  hasTemporarySyncError
                    ? "bg-amber-500"
                    : isRefreshing
                      ? "bg-sky-500"
                      : "bg-emerald-600"
                }`}
              />
              <span>
                {hasTemporarySyncError
                  ? "Menampilkan data lokal"
                  : lastUpdatedAt
                    ? `Update: ${new Date(
                        lastUpdatedAt,
                      ).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}`
                    : "Sinkronisasi otomatis"}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
