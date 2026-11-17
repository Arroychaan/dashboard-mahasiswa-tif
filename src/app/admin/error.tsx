"use client";

import { ErrorState } from "~/components/admin/AdminStates";

export default function AdminErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="py-12">
      <ErrorState
        title="Terjadi Kesalahan pada Panel Administrasi"
        message={
          error.message ||
          "Permintaan tidak dapat diproses saat ini. Silakan coba muat ulang halaman."
        }
        onRetry={reset}
      />
    </div>
  );
}

