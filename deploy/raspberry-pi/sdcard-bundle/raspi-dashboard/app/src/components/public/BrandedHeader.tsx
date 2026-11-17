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
  themeTokens?: ThemeTokens;
}

export function BrandedHeader({
  activeSceneId,
  lastUpdatedAt,
  isRefreshing,
  hasTemporarySyncError,
  themeTokens = THEME_CONFIGS.LIGHT,
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
      className={`border-b transition-colors duration-200 px-6 py-4 lg:px-10 lg:py-5 2xl:px-14 2xl:py-6 ${themeTokens.header.bg} ${themeTokens.header.border}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Dual High-DPI Institutional Logos & Identity */}
        <div className="flex items-center gap-4 2xl:gap-5">
          <div className="flex items-center gap-3 shrink-0">
            <Image
              src="/Logo_Unissula_HD.png"
              alt="Logo Universitas Islam Sultan Agung"
              width={56}
              height={52}
              className="h-11 w-auto object-contain sm:h-12 2xl:h-14"
              priority
            />
            <div
              className={`h-8 w-px ${themeTokens.id === "LIGHT" ? "bg-slate-300" : themeTokens.id === "MONOCHROME" ? "bg-black" : "bg-slate-800"}`}
            />
            <Image
              src="/Logo_Informatika_HD.png"
              alt="Logo Program Studi Teknik Informatika"
              width={120}
              height={52}
              className="h-9 w-auto object-contain sm:h-10 2xl:h-12"
              priority
            />
          </div>

          <div>
            <p
              className={`text-xs font-semibold tracking-wider uppercase sm:text-sm 2xl:text-base ${themeTokens.header.subtitle}`}
            >
              Universitas Islam Sultan Agung &bull; Teknik Informatika
            </p>
            <h1
              className={`mt-0.5 text-xl font-extrabold tracking-tight sm:text-2xl lg:text-3xl 2xl:text-4xl ${themeTokens.header.title}`}
            >
              Dashboard Laboratorium Informatika
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
        className={`mt-4 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between ${themeTokens.header.border}`}
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

        {/* Non-Interactive Scene Indicator & Sync Status */}
        <div className="flex flex-wrap items-center gap-2" aria-hidden="true">
          {PUBLIC_SCENE_DEFINITIONS.map((scene) => {
            const isActive = scene.id === activeSceneId;
            return (
              <div
                key={scene.id}
                className={`rounded border px-3 py-1.5 text-xs font-bold tracking-wide transition-colors 2xl:px-4 2xl:py-2 2xl:text-sm ${
                  isActive
                    ? themeTokens.header.badge
                    : `${themeTokens.header.bg} ${themeTokens.header.subtitle} ${themeTokens.header.border}`
                }`}
              >
                {scene.orderNumber}. {scene.shortLabel}
              </div>
            );
          })}

          <div
            className={`ml-2 hidden items-center gap-1.5 rounded border px-2.5 py-1.5 text-[11px] font-medium xl:inline-flex 2xl:text-xs ${themeTokens.header.bg} ${themeTokens.header.subtitle} ${themeTokens.header.border}`}
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
        </div>
      </div>
    </header>
  );
}
