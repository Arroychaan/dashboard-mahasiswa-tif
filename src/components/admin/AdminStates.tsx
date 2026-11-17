"use client";

import Link from "next/link";

import { type UserRole } from "~/server/db/schema";

export function StatusBadge({ isPublished }: { isPublished: boolean }) {
  if (isPublished) {
    return (
      <span className="inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
        Terpublikasi
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
      Draf
    </span>
  );
}

export function RoleBadge({ role }: { role: UserRole }) {
  if (role === "SUPER_ADMIN") {
    return (
      <span className="inline-flex items-center rounded-md border border-blue-300 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-900">
        SUPER_ADMIN
      </span>
    );
  }
  if (role === "ADMIN") {
    return (
      <span className="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-900">
        ADMIN
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-800">
      EDITOR
    </span>
  );
}

export function LoadingState({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-slate-200 bg-white p-8 text-center"
    >
      <div
        aria-hidden="true"
        className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-blue-800"
      />
      <p className="mt-3 text-sm font-medium text-slate-800">{message}</p>
    </div>
  );
}

export function ErrorState({
  title = "Gagal Memuat Data",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-300 bg-red-50 p-6 text-red-950"
    >
      <h3 className="text-base font-semibold text-red-950">{title}</h3>
      <p className="mt-1 text-sm text-red-900">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex min-h-[40px] items-center rounded-md border border-red-400 bg-white px-4 py-2 text-sm font-medium text-red-950 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
        >
          Muat Ulang Data
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-lg text-sm text-slate-700">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex min-h-[44px] items-center rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function AccessDeniedState({
  title = "Akses Ditolak",
  description = "Peran akun Anda tidak memiliki izin untuk mengakses halaman atau fitur ini.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-300 bg-amber-50 p-8"
    >
      <h2 className="text-lg font-bold text-amber-950">{title}</h2>
      <p className="mt-2 text-sm text-amber-900">{description}</p>
      <div className="mt-5">
        <Link
          href="/admin"
          className="inline-flex min-h-[44px] items-center rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
        >
          Kembali ke Ringkasan Admin
        </Link>
      </div>
    </div>
  );
}

export function FeedbackBanner({
  kind,
  message,
  onDismiss,
}: {
  kind: "success" | "error";
  message: string;
  onDismiss?: () => void;
}) {
  const isError = kind === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm font-medium ${
        isError
          ? "border-red-300 bg-red-50 text-red-950"
          : "border-emerald-300 bg-emerald-50 text-emerald-950"
      }`}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Tutup pemberitahuan"
          className="rounded px-2 py-1 text-xs font-semibold underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
        >
          Tutup
        </button>
      )}
    </div>
  );
}

