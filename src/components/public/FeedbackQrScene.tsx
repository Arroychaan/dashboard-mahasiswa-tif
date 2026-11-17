"use client";

import Image from "next/image";

import { THEME_CONFIGS, type ThemeTokens } from "./design-tokens";

export interface FeedbackQrConfig {
  qrPath: string;
  title: string;
  description: string;
}

interface FeedbackQrSceneProps {
  feedbackQr: FeedbackQrConfig;
  themeTokens?: ThemeTokens;
}

export function FeedbackQrScene({
  feedbackQr,
  themeTokens = THEME_CONFIGS.LIGHT,
}: FeedbackQrSceneProps) {
  return (
    <section
      aria-label="Kotak Saran & Sumbangan Program Studi Teknik Informatika"
      className="flex min-h-0 flex-1 flex-col items-center justify-center p-4 lg:p-6 overflow-hidden"
    >
      <div
        className={`w-full max-w-2xl rounded-3xl border p-8 sm:p-10 lg:p-12 shadow-xl flex flex-col items-center text-center transition-all ${themeTokens.surface.card} ${themeTokens.surface.cardBorder}`}
      >
        {/* QR Code Container - Always pure white background for 100% scan reliability */}
        <div className="relative h-60 w-60 sm:h-72 sm:w-72 lg:h-80 lg:w-80 rounded-2xl bg-white p-4 sm:p-5 shadow-2xl border-4 border-emerald-600/30 ring-4 ring-black/5 flex items-center justify-center">
          <Image
            src={feedbackQr.qrPath}
            alt={feedbackQr.title}
            width={320}
            height={320}
            unoptimized
            priority
            className="h-full w-full object-contain"
          />
        </div>

        {/* Title */}
        <h3
          className={`mt-6 sm:mt-8 text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight ${themeTokens.header.title}`}
        >
          {feedbackQr.title}
        </h3>

        {/* Description Copy */}
        <p
          className={`mt-3 max-w-lg text-sm sm:text-base lg:text-lg leading-relaxed ${themeTokens.header.subtitle}`}
        >
          {feedbackQr.description}
        </p>

        {/* Guidance Pill */}
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-50/80 px-4 py-1.5 text-xs sm:text-sm font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
            />
          </svg>
          Arahkan kamera smartphone Anda ke kode QR di atas
        </div>
      </div>
    </section>
  );
}
