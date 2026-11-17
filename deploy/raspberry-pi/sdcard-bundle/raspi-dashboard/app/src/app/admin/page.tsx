"use client";

import Link from "next/link";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusBadge,
} from "~/components/admin/AdminStates";
import { api } from "~/trpc/react";

export default function AdminOverviewPage() {
  const meQuery = api.users.me.useQuery();
  const gradStats = api.graduates.stats.useQuery();
  const lectStats = api.lecturers.stats.useQuery();
  const pubStats = api.publications.stats.useQuery();

  const isLoading =
    gradStats.isLoading || lectStats.isLoading || pubStats.isLoading;
  const isError = gradStats.isError || lectStats.isError || pubStats.isError;

  if (isLoading) {
    return (
      <LoadingState message="Memuat ringkasan data lulusan, dosen, dan publikasi..." />
    );
  }

  if (isError || !gradStats.data || !lectStats.data || !pubStats.data) {
    return (
      <ErrorState
        message="Gagal memuat ringkasan statistik administrasi dari server."
        onRetry={() => {
          void gradStats.refetch();
          void lectStats.refetch();
          void pubStats.refetch();
        }}
      />
    );
  }

  const g = gradStats.data;
  const l = lectStats.data;
  const p = pubStats.data;
  const userRole = meQuery.data?.role ?? "EDITOR";

  const recentItems = [
    ...g.recentChanges.map((item) => ({
      id: `grad-${item.id}`,
      category: "Lulusan" as const,
      title: item.fullName,
      subtitle: `Angkatan ${item.entryYear} • Lulus ${item.graduationYear}`,
      isPublished: item.isPublished,
      updatedAt: new Date(item.updatedAt),
      href: "/admin/mahasiswa",
    })),
    ...l.recentChanges.map((item) => ({
      id: `lect-${item.id}`,
      category: "Dosen" as const,
      title: item.fullName,
      subtitle: `${item.position} • ${item.expertise}`,
      isPublished: item.isPublished,
      updatedAt: new Date(item.updatedAt),
      href: "/admin/dosen",
    })),
    ...p.recentChanges.map((item) => ({
      id: `pub-${item.id}`,
      category: "Publikasi" as const,
      title: item.title,
      subtitle: `${item.kind === "JOURNAL" ? "Jurnal" : "Artikel"} • ${item.journalName} (${item.publicationYear})`,
      isPublished: item.isPublished,
      updatedAt: new Date(item.updatedAt),
      href: "/admin/publikasi",
    })),
  ]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 10);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Ringkasan Sistem Administrasi
          </h1>
          <p className="mt-1 text-sm text-slate-700">
            Ikhtisar jumlah rekaman terpublikasi dan draf untuk Dashboard
            Monitoring Laboratorium Informatika UNISSULA.
          </p>
        </div>
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs text-blue-950">
          <span className="font-semibold">Alur Publikasi:</span> Konten baru
          tersimpan sebagai Draf dan tampil di publik setelah disetujui oleh
          ADMIN atau SUPER_ADMIN.
        </div>
      </div>

      {/* Primary Summary Metrics */}
      <section aria-label="Ringkasan Jumlah Rekaman">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* Graduates Summary */}
          <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-6">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">
                  Total Data Lulusan
                </h2>
                <Link
                  href="/admin/mahasiswa"
                  className="text-xs font-semibold text-blue-800 underline hover:no-underline"
                >
                  Kelola Lulusan
                </Link>
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {g.total}
              </p>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
              <div className="rounded bg-emerald-50 px-3 py-2 text-emerald-950">
                <dt className="font-medium">Terpublikasi</dt>
                <dd className="mt-0.5 text-base font-bold">{g.published}</dd>
              </div>
              <div className="rounded bg-amber-50 px-3 py-2 text-amber-950">
                <dt className="font-medium">Draf</dt>
                <dd className="mt-0.5 text-base font-bold">{g.draft}</dd>
              </div>
            </dl>
          </div>

          {/* Lecturers Summary */}
          <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-6">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">
                  Total Data Dosen
                </h2>
                <Link
                  href="/admin/dosen"
                  className="text-xs font-semibold text-blue-800 underline hover:no-underline"
                >
                  Kelola Dosen
                </Link>
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {l.total}
              </p>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
              <div className="rounded bg-emerald-50 px-3 py-2 text-emerald-950">
                <dt className="font-medium">Terpublikasi</dt>
                <dd className="mt-0.5 text-base font-bold">{l.published}</dd>
              </div>
              <div className="rounded bg-amber-50 px-3 py-2 text-amber-950">
                <dt className="font-medium">Draf</dt>
                <dd className="mt-0.5 text-base font-bold">{l.draft}</dd>
              </div>
            </dl>
          </div>

          {/* Publications Summary */}
          <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-6">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">
                  Total Publikasi Unik
                </h2>
                <Link
                  href="/admin/publikasi"
                  className="text-xs font-semibold text-blue-800 underline hover:no-underline"
                >
                  Kelola Publikasi
                </Link>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <p className="text-3xl font-bold text-slate-900">{p.total}</p>
                <span className="text-xs font-medium text-slate-600">
                  {p.journals} Jurnal &bull; {p.articles} Artikel
                </span>
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
              <div className="rounded bg-emerald-50 px-3 py-2 text-emerald-950">
                <dt className="font-medium">Terpublikasi</dt>
                <dd className="mt-0.5 text-base font-bold">{p.published}</dd>
              </div>
              <div className="rounded bg-amber-50 px-3 py-2 text-amber-950">
                <dt className="font-medium">Draf</dt>
                <dd className="mt-0.5 text-base font-bold">{p.draft}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* Quick Navigation to Content Management */}
      <section aria-label="Navigasi Cepat Manajemen Konten">
        <h2 className="text-base font-bold text-slate-900">
          Navigasi Cepat Modul Manajemen
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/admin/mahasiswa"
            className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
          >
            <div className="text-sm font-bold text-blue-900">
              Manajemen Lulusan
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Tambah, perbarui, dan kelola status publikasi data lulusan.
            </p>
          </Link>

          <Link
            href="/admin/dosen"
            className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
          >
            <div className="text-sm font-bold text-blue-900">
              Manajemen Dosen
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Kelola profil dosen, jabatan, keahlian, NIDN/NIP, dan foto resmi.
            </p>
          </Link>

          <Link
            href="/admin/publikasi"
            className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
          >
            <div className="text-sm font-bold text-blue-900">
              Manajemen Publikasi
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Kelola jurnal, artikel ilmiah, dan penugasan multi-penulis dosen.
            </p>
          </Link>

          {(userRole === "ADMIN" || userRole === "SUPER_ADMIN") && (
            <Link
              href="/admin/pengguna"
              className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
            >
              <div className="text-sm font-bold text-blue-900">
                Manajemen Pengguna &amp; Peran
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Kelola akun pengelola dan tinjau catatan audit keamanan.
              </p>
            </Link>
          )}
        </div>
      </section>

      {/* Recent Content Changes */}
      <section aria-label="Perubahan Konten Terbaru">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            Perubahan Konten Terbaru
          </h2>
          <span className="text-xs text-slate-600">
            Menampilkan hingga 10 pembaruan terakhir
          </span>
        </div>

        <div className="mt-3">
          {recentItems.length === 0 ? (
            <EmptyState
              title="Belum Ada Rekaman Konten"
              description="Database saat ini masih kosong. Gunakan modul Data Lulusan, Data Dosen, atau Publikasi Ilmiah untuk mulai menambahkan rekaman draf."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-700 uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Kategori
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Nama / Judul Rekaman
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Rincian
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Waktu Pembaruan
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Tautan
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {recentItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">
                        {item.category}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {item.title}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {item.subtitle}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <StatusBadge isPublished={item.isPublished} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                        {item.updatedAt.toLocaleString("id-ID")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Link
                          href={item.href}
                          className="text-xs font-semibold text-blue-800 underline hover:no-underline"
                        >
                          Buka Modul
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
