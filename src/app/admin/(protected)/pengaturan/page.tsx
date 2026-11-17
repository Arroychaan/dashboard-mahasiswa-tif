"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

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
      "Latar putih bersih dengan kontras optimal untuk pencahayaan ruangan standar.",
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

  const [qrPath, setQrPath] = useState("/contoh.png");
  const [qrTitle, setQrTitle] = useState("Kotak Saran & Sumbangan");
  const [qrDescription, setQrDescription] = useState(
    "Pindai kode QR untuk menyampaikan aspirasi, kritik & saran, atau sumbangan bagi Program Studi Teknik Informatika UNISSULA.",
  );
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [qrUploadError, setQrUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = api.useUtils();

  const settingsQuery = api.systemSettings.getSettings.useQuery(undefined, {
    staleTime: 10_000,
  });

  useEffect(() => {
    if (settingsQuery.data?.feedbackQr) {
      setQrPath(settingsQuery.data.feedbackQr.qrPath);
      setQrTitle(settingsQuery.data.feedbackQr.title);
      setQrDescription(settingsQuery.data.feedbackQr.description);
    }
  }, [settingsQuery.data?.feedbackQr]);

  const updateThemeMutation = api.systemSettings.updatePublicTheme.useMutation({
    onSuccess: (data) => {
      setFeedback({
        kind: "success",
        message: `Tema display program studi berhasil diubah ke ${THEME_CONFIGS[data.theme].name}.`,
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

  const updateFeedbackQrMutation =
    api.systemSettings.updateFeedbackQr.useMutation({
      onSuccess: () => {
        setFeedback({
          kind: "success",
          message:
            "Pengaturan kode QR Kotak Saran & Sumbangan berhasil disimpan.",
        });
        void utils.systemSettings.getSettings.invalidate();
        void utils.publicDashboard.feedbackQr.invalidate();
      },
      onError: (err) => {
        setFeedback({
          kind: "error",
          message: `Gagal memperbarui pengaturan QR: ${err.message}`,
        });
      },
    });

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingQr(true);
    setQrUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/feedback-qr", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json()) as { qrPath?: string; error?: string };

      if (!res.ok || !data.qrPath) {
        throw new Error(data.error ?? "Gagal mengunggah gambar QR.");
      }

      setQrPath(data.qrPath);
      setFeedback({
        kind: "success",
        message:
          "Gambar QR baru berhasil diunggah. Klik 'Simpan Pengaturan QR' untuk menerapkan perubahan pada slide display.",
      });
    } catch (err: unknown) {
      setQrUploadError(
        err instanceof Error ? err.message : "Gagal mengunggah gambar QR.",
      );
    } finally {
      setIsUploadingQr(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleSaveQr(e: React.FormEvent) {
    e.preventDefault();
    updateFeedbackQrMutation.mutate({
      qrPath,
      title: qrTitle.trim(),
      description: qrDescription.trim(),
    });
  }

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
          Pengaturan Display Program Studi
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Kelola tema dan tampilan visual layar monitor atau TV digital signage
          di Program Studi Teknik Informatika.
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
            Perubahan tema akan otomatis diterapkan ke seluruh layar program studi tanpa
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

      {/* Feedback QR Settings Section (Slide 6) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Pengaturan Kode QR Kotak Saran & Sumbangan (Slide 6)
          </h2>
          <p className="text-xs text-slate-400 sm:text-sm">
            Konfigurasi kode QR, judul, dan teks instruksi yang ditampilkan pada Slide 6 untuk pemindaian langsung oleh mahasiswa.
          </p>
        </div>

        {qrUploadError && (
          <div className="rounded-lg border border-rose-800 bg-rose-950/60 p-3 text-sm text-rose-300">
            {qrUploadError}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* QR Preview Column */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-950 p-6 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Pratinjau Kode QR
            </span>
            <div className="relative h-56 w-56 overflow-hidden rounded-xl bg-white p-3 shadow-md flex items-center justify-center">
              <Image
                src={qrPath}
                alt="Kode QR Kotak Saran & Sumbangan"
                width={220}
                height={220}
                unoptimized
                className="h-full w-full object-contain"
              />
            </div>
            <p className="mt-3 text-xs text-slate-400 truncate max-w-full">
              Path: <span className="text-slate-300 font-mono">{qrPath}</span>
            </p>

            <div className="mt-4 flex flex-col gap-2 w-full max-w-xs">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileUpload}
                className="hidden"
                id="qr-file-upload-input"
              />
              <button
                type="button"
                disabled={isUploadingQr}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isUploadingQr ? "Mengunggah..." : "Unggah Gambar QR Baru"}
              </button>
              {qrPath !== "/contoh.png" && (
                <button
                  type="button"
                  onClick={() => setQrPath("/contoh.png")}
                  className="text-xs text-slate-400 hover:text-rose-400 transition-colors"
                >
                  Kembalikan ke QR Bawaan (/contoh.png)
                </button>
              )}
            </div>
          </div>

          {/* QR Content Form Column */}
          <form onSubmit={handleSaveQr} className="lg:col-span-2 space-y-4">
            <div>
              <label
                htmlFor="qr-title-input"
                className="block text-xs font-medium text-slate-300"
              >
                Judul Slide QR <span className="text-rose-400">*</span>
              </label>
              <input
                id="qr-title-input"
                type="text"
                required
                value={qrTitle}
                onChange={(e) => setQrTitle(e.target.value)}
                placeholder="Kotak Saran & Sumbangan"
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="qr-desc-input"
                className="block text-xs font-medium text-slate-300"
              >
                Instruksi / Teks Deskripsi <span className="text-rose-400">*</span>
              </label>
              <textarea
                id="qr-desc-input"
                required
                rows={4}
                value={qrDescription}
                onChange={(e) => setQrDescription(e.target.value)}
                placeholder="Pindai kode QR untuk menyampaikan aspirasi..."
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <p className="mt-1 text-xs text-slate-500">
                Teks ini akan ditampilkan di bawah judul pada Slide 6 untuk memandu mahasiswa.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={updateFeedbackQrMutation.isPending}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {updateFeedbackQrMutation.isPending
                  ? "Menyimpan..."
                  : "Simpan Pengaturan QR"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Audit & Status Information */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-400">
        <span className="font-semibold text-slate-300">Status Sinkronisasi: </span>
        Tema display yang aktif akan disiarkan langsung ke tampilan monitor program studi
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

