"use client";

import { useState } from "react";

import { FeedbackBanner, LoadingState } from "~/components/admin/AdminStates";
import {
  THEME_CONFIGS,
  type PublicDisplayTheme,
} from "~/components/public/design-tokens";
import { api } from "~/trpc/react";

interface ThemeOption {
  id: PublicDisplayTheme;
  title: string;
  tagline: string;
  description: string;
  previewBg: string;
  previewCardBg: string;
  previewBorder: string;
  previewText: string;
  previewAccent: string;
}

const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    id: "LIGHT",
    title: "Terang (Clean Academic)",
    tagline: "Default Sistem",
    description:
      "Latar putih bersih dengan kontras optimal untuk pencahayaan lab standar.",
    previewBg: "bg-slate-50",
    previewCardBg: "bg-white",
    previewBorder: "border-slate-200",
    previewText: "text-slate-900",
    previewAccent: "bg-emerald-700 text-white",
  },
  {
    id: "DARK",
    title: "Gelap (Studio Slate)",
    tagline: "Minim Silau",
    description:
      "Latar deep slate elegan dengan kontras tinggi tanpa efek neon menyilaukan.",
    previewBg: "bg-slate-950",
    previewCardBg: "bg-slate-900",
    previewBorder: "border-slate-800",
    previewText: "text-slate-100",
    previewAccent: "bg-emerald-600 text-white",
  },
  {
    id: "MONOCHROME",
    title: "Monokrom (Editorial)",
    tagline: "Kontras Tinggi",
    description:
      "Gaya hitam-putih murni kontras tinggi ala publikasi akademik minimalis.",
    previewBg: "bg-white",
    previewCardBg: "bg-white",
    previewBorder: "border-black",
    previewText: "text-black",
    previewAccent: "bg-black text-white",
  },
] as const;

export default function AdminSettingsPage() {
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const utils = api.useUtils();

  const settingsQuery = api.systemSettings.getSettings.useQuery(undefined, {
    staleTime: 10_000,
  });

  const updateThemeMutation = api.systemSettings.updatePublicTheme.useMutation({
    onSuccess: (data) => {
      setFeedback({
        kind: "success",
        message: `Tema display lab berhasil diubah ke ${THEME_CONFIGS[data.theme].name}.`,
      });
      void utils.systemSettings.getSettings.invalidate();
      void utils.systemSettings.getPublicTheme.invalidate();
      void utils.publicDashboard.getTheme.invalidate();
    },
    onError: (err) => {
      setFeedback({
        kind: "error",
        message: `Gagal memperbarui tema: ${err.message}`,
      });
    },
  });

  if (settingsQuery.isLoading) {
    return <LoadingState message="Memuat pengaturan sistem..." />;
  }

  const activeTheme: PublicDisplayTheme =
    settingsQuery.data?.publicTheme ?? "LIGHT";
  const lastUpdated = settingsQuery.data?.lastUpdated;
  const updatedByName = settingsQuery.data?.updatedByName;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Pengaturan Display Laboratorium
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Kelola tema dan tampilan visual layar monitor atau TV digital signage
          di Laboratorium Informatika.
        </p>
      </div>

      {feedback && (
        <FeedbackBanner
          kind={feedback.kind}
          message={feedback.message}
          onDismiss={() => setFeedback(null)}
        />
      )}

      {/* Theme Selection Grid */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Pilihan Tema Tampilan
          </h2>
          <p className="text-xs text-slate-400 sm:text-sm">
            Perubahan tema akan otomatis diterapkan ke seluruh layar lab tanpa
            perlu memuat ulang peramban.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {THEME_OPTIONS.map((opt) => {
            const isSelected = activeTheme === opt.id;
            const isPending =
              updateThemeMutation.isPending &&
              updateThemeMutation.variables?.theme === opt.id;

            return (
              <div
                key={opt.id}
                className={`flex flex-col justify-between rounded-xl border p-5 transition-all ${
                  isSelected
                    ? "border-emerald-500 bg-slate-900 ring-2 ring-emerald-500/30"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                }`}
              >
                <div>
                  {/* Miniature Visual Mockup */}
                  <div
                    className={`mb-4 overflow-hidden rounded-lg border p-3 ${opt.previewBg} ${opt.previewBorder}`}
                  >
                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="flex items-center gap-1.5">
                        <div className="h-3 w-3 rounded-full bg-emerald-600" />
                        <span
                          className={`text-[10px] font-bold tracking-wider ${opt.previewText}`}
                        >
                          UNISSULA IF
                        </span>
                      </div>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${opt.previewAccent}`}
                      >
                        {opt.tagline}
                      </span>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <div
                        className={`rounded border p-2 ${opt.previewCardBg} ${opt.previewBorder}`}
                      >
                        <div
                          className={`text-[9px] font-bold ${opt.previewText}`}
                        >
                          124
                        </div>
                        <div className="text-[8px] text-slate-500">Alumni</div>
                      </div>
                      <div
                        className={`rounded border p-2 ${opt.previewCardBg} ${opt.previewBorder}`}
                      >
                        <div
                          className={`text-[9px] font-bold ${opt.previewText}`}
                        >
                          18
                        </div>
                        <div className="text-[8px] text-slate-500">Dosen</div>
                      </div>
                    </div>
                  </div>

                  {/* Text details */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-white">
                      {opt.title}
                    </h3>
                    {isSelected && (
                      <span className="rounded bg-emerald-950 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-800">
                        Aktif
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    {opt.description}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-800/80">
                  <button
                    type="button"
                    disabled={isSelected || updateThemeMutation.isPending}
                    onClick={() =>
                      updateThemeMutation.mutate({ theme: opt.id })
                    }
                    className={`w-full rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                      isSelected
                        ? "bg-slate-800 text-slate-400 cursor-default"
                        : "bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer disabled:opacity-50"
                    }`}
                  >
                    {isPending
                      ? "Menyimpan..."
                      : isSelected
                        ? "Tema Sedang Digunakan"
                        : "Terapkan Tema Ini"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Audit & Status Information */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-400">
        <span className="font-semibold text-slate-300">Status Sinkronisasi: </span>
        Tema display yang aktif akan disiarkan langsung ke tampilan monitor lab
        melalui tRPC polling.
        {lastUpdated && (
          <div className="mt-1.5 text-slate-400">
            Terakhir diubah:{" "}
            <span className="font-medium text-slate-300">
              {new Date(lastUpdated).toLocaleString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              WIB
            </span>
            {updatedByName && (
              <span>
                {" "}
                oleh <span className="font-medium text-slate-300">{updatedByName}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

