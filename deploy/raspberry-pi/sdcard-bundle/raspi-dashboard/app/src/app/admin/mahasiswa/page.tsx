"use client";

import { useEffect, useId, useState } from "react";

import {
  EmptyState,
  ErrorState,
  FeedbackBanner,
  LoadingState,
  StatusBadge,
} from "~/components/admin/AdminStates";
import { ConfirmDialog } from "~/components/admin/ConfirmDialog";
import { createGraduateSchema, updateGraduateSchema } from "~/lib/validators";
import { api } from "~/trpc/react";

const PAGE_SIZE = 15;

export default function AdminGraduatesPage() {
  const utils = api.useUtils();
  const meQuery = api.users.me.useQuery();
  const canPublishOrDelete =
    meQuery.data?.role === "ADMIN" || meQuery.data?.role === "SUPER_ADMIN";

  // Search, filter & pagination states
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "PUBLISHED" | "DRAFT"
  >("ALL");
  const [gradYearFilter, setGradYearFilter] = useState<string>("");
  const [pageIndex, setPageIndex] = useState(0);

  // Form modal states
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [entryYear, setEntryYear] = useState<string>("2020");
  const [graduationYear, setGraduationYear] = useState<string>("2024");
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation dialog state
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    fullName: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Page feedback banner
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const searchInputId = useId();
  const statusFilterId = useId();
  const yearFilterId = useId();
  const modalTitleId = useId();
  const fullNameId = useId();
  const entryYearId = useId();
  const gradYearId = useId();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPageIndex(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!formOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setFormOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [formOpen]);

  const parsedGradYearFilter =
    gradYearFilter.trim().length === 4 ? Number(gradYearFilter) : undefined;

  const filterParams = {
    search: debouncedSearch || undefined,
    isPublished:
      statusFilter === "PUBLISHED"
        ? true
        : statusFilter === "DRAFT"
          ? false
          : undefined,
    graduationYear:
      parsedGradYearFilter &&
      !Number.isNaN(parsedGradYearFilter) &&
      parsedGradYearFilter >= 1950 &&
      parsedGradYearFilter <= 2100
        ? parsedGradYearFilter
        : undefined,
  };

  const listQuery = api.graduates.list.useQuery({
    ...filterParams,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  });

  const countQuery = api.graduates.count.useQuery(filterParams);

  const createMutation = api.graduates.create.useMutation({
    onSuccess: async (created) => {
      await Promise.all([
        utils.graduates.invalidate(),
        utils.publicDashboard.invalidate(),
      ]);
      setFormOpen(false);
      setFeedback({
        kind: "success",
        message: `Data lulusan "${created.fullName}" berhasil disimpan sebagai Draf.`,
      });
    },
    onError: (err) => {
      setFormError(err.message || "Gagal menyimpan data lulusan.");
    },
  });

  const updateMutation = api.graduates.update.useMutation({
    onSuccess: async (updated) => {
      await Promise.all([
        utils.graduates.invalidate(),
        utils.publicDashboard.invalidate(),
      ]);
      setFormOpen(false);
      setFeedback({
        kind: "success",
        message: `Data lulusan "${updated.fullName}" berhasil diperbarui.`,
      });
    },
    onError: (err) => {
      setFormError(err.message || "Gagal memperbarui data lulusan.");
    },
  });

  const setPublishedMutation = api.graduates.setPublished.useMutation({
    onSuccess: async (updated) => {
      await Promise.all([
        utils.graduates.invalidate(),
        utils.publicDashboard.invalidate(),
      ]);
      setFeedback({
        kind: "success",
        message: updated.isPublished
          ? `Data lulusan "${updated.fullName}" telah dipublikasikan ke dashboard publik.`
          : `Data lulusan "${updated.fullName}" telah dikembalikan ke status Draf.`,
      });
    },
    onError: (err) => {
      setFeedback({
        kind: "error",
        message: err.message || "Gagal mengubah status publikasi lulusan.",
      });
    },
  });

  const deleteMutation = api.graduates.delete.useMutation({
    onSuccess: async () => {
      const deletedName = deleteTarget?.fullName ?? "";
      setDeleteTarget(null);
      setDeleteError(null);
      await Promise.all([
        utils.graduates.invalidate(),
        utils.publicDashboard.invalidate(),
      ]);
      setFeedback({
        kind: "success",
        message: `Data lulusan "${deletedName}" telah dihapus secara permanen.`,
      });
    },
    onError: (err) => {
      setDeleteError(err.message || "Gagal menghapus data lulusan.");
    },
  });

  function openCreateModal() {
    setEditingId(null);
    setFullName("");
    setEntryYear("2020");
    setGraduationYear("2024");
    setFormError(null);
    setFormOpen(true);
  }

  function openEditModal(item: {
    id: string;
    fullName: string;
    entryYear: number;
    graduationYear: number;
  }) {
    setEditingId(item.id);
    setFullName(item.fullName);
    setEntryYear(String(item.entryYear));
    setGraduationYear(String(item.graduationYear));
    setFormError(null);
    setFormOpen(true);
  }

  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const parsedEntry = Number(entryYear);
    const parsedGrad = Number(graduationYear);

    if (editingId) {
      const validation = updateGraduateSchema.safeParse({
        id: editingId,
        fullName,
        entryYear: parsedEntry,
        graduationYear: parsedGrad,
      });

      if (!validation.success) {
        const firstIssue = validation.error.issues[0];
        setFormError(firstIssue?.message ?? "Data formulir tidak valid.");
        return;
      }

      updateMutation.mutate(validation.data);
    } else {
      const validation = createGraduateSchema.safeParse({
        fullName,
        entryYear: parsedEntry,
        graduationYear: parsedGrad,
        isPublished: false,
      });

      if (!validation.success) {
        const firstIssue = validation.error.issues[0];
        setFormError(firstIssue?.message ?? "Data formulir tidak valid.");
        return;
      }

      createMutation.mutate(validation.data);
    }
  }

  const totalRecords = countQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    setPublishedMutation.isPending ||
    deleteMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Manajemen Data Lulusan
          </h1>
          <p className="mt-1 text-sm text-slate-700">
            Kelola rekaman kelulusan mahasiswa Program Studi Teknik Informatika.
            Sesuai kontrak privasi, atribut NIM tidak disimpan dalam sistem ini.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex min-h-[44px] items-center rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
        >
          Tambah Data Lulusan
        </button>
      </div>

      {feedback && (
        <FeedbackBanner
          kind={feedback.kind}
          message={feedback.message}
          onDismiss={() => setFeedback(null)}
        />
      )}

      {/* Search & Filter Controls */}
      <section
        aria-label="Filter dan Pencarian Data Lulusan"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor={searchInputId}
              className="block text-xs font-semibold text-slate-700"
            >
              Cari Nama Lengkap Lulusan
            </label>
            <input
              id={searchInputId}
              type="search"
              placeholder="Ketik nama lulusan..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
            />
          </div>

          <div>
            <label
              htmlFor={statusFilterId}
              className="block text-xs font-semibold text-slate-700"
            >
              Status Publikasi
            </label>
            <select
              id={statusFilterId}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(
                  e.target.value as "ALL" | "PUBLISHED" | "DRAFT",
                );
                setPageIndex(0);
              }}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
            >
              <option value="ALL">Semua Status</option>
              <option value="PUBLISHED">Terpublikasi</option>
              <option value="DRAFT">Draf</option>
            </select>
          </div>

          <div>
            <label
              htmlFor={yearFilterId}
              className="block text-xs font-semibold text-slate-700"
            >
              Filter Tahun Lulus (4 Digit)
            </label>
            <input
              id={yearFilterId}
              type="number"
              min={1950}
              max={2100}
              placeholder="Contoh: 2024"
              value={gradYearFilter}
              onChange={(e) => {
                setGradYearFilter(e.target.value);
                setPageIndex(0);
              }}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
            />
          </div>
        </div>
      </section>

      {/* Graduate Table / States */}
      {listQuery.isLoading ? (
        <LoadingState message="Memuat daftar lulusan..." />
      ) : listQuery.isError ? (
        <ErrorState
          message={listQuery.error.message || "Gagal memuat data lulusan."}
          onRetry={() => void listQuery.refetch()}
        />
      ) : !listQuery.data || listQuery.data.length === 0 ? (
        <EmptyState
          title={
            debouncedSearch || statusFilter !== "ALL" || gradYearFilter
              ? "Tidak Ada Data Lulusan yang Cocok"
              : "Belum Ada Data Lulusan"
          }
          description={
            debouncedSearch || statusFilter !== "ALL" || gradYearFilter
              ? "Ubah kata kunci pencarian atau reset filter untuk melihat rekaman lainnya."
              : "Tambahkan data lulusan pertama untuk mulai menyusun statistik angkatan dan kelulusan."
          }
          actionLabel={
            debouncedSearch || statusFilter !== "ALL" || gradYearFilter
              ? "Reset Filter"
              : "Tambah Data Lulusan"
          }
          onAction={() => {
            if (debouncedSearch || statusFilter !== "ALL" || gradYearFilter) {
              setSearchInput("");
              setDebouncedSearch("");
              setStatusFilter("ALL");
              setGradYearFilter("");
              setPageIndex(0);
            } else {
              openCreateModal();
            }
          }}
        />
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-700 uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Nama Lengkap Lulusan
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Tahun Masuk
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Tahun Lulus
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Masa Studi
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status Publikasi
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Tindakan
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {listQuery.data.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {row.fullName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {row.entryYear}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {row.graduationYear}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {row.graduationYear - row.entryYear} tahun
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge isPublished={row.isPublished} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          disabled={isMutating}
                          className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                        >
                          Edit
                        </button>

                        {canPublishOrDelete && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setPublishedMutation.mutate({
                                  id: row.id,
                                  isPublished: !row.isPublished,
                                })
                              }
                              disabled={isMutating}
                              className={`rounded border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                                row.isPublished
                                  ? "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
                                  : "border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100"
                              }`}
                            >
                              {row.isPublished
                                ? "Tarik ke Draf"
                                : "Publikasikan"}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError(null);
                                setDeleteTarget({
                                  id: row.id,
                                  fullName: row.fullName,
                                });
                              }}
                              disabled={isMutating}
                              className="rounded border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
                            >
                              Hapus
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Server-Side Pagination Footer */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-700">
            <div>
              Menampilkan{" "}
              <span className="font-semibold">
                {pageIndex * PAGE_SIZE + 1}
              </span>{" "}
              hingga{" "}
              <span className="font-semibold">
                {Math.min((pageIndex + 1) * PAGE_SIZE, totalRecords)}
              </span>{" "}
              dari <span className="font-semibold">{totalRecords}</span> rekaman
              lulusan
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                disabled={pageIndex === 0 || listQuery.isFetching}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <span className="font-medium">
                Halaman {pageIndex + 1} dari {totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPageIndex((p) => (p + 1 < totalPages ? p + 1 : p))
                }
                disabled={pageIndex + 1 >= totalPages || listQuery.isFetching}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {formOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={modalTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
        >
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
            <h2 id={modalTitleId} className="text-lg font-bold text-slate-900">
              {editingId ? "Edit Data Lulusan" : "Tambah Data Lulusan Baru"}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {editingId
                ? "Perubahan pada rekaman yang telah terpublikasi akan langsung diperbarui."
                : "Rekaman baru akan disimpan sebagai Draf hingga disetujui oleh ADMIN atau SUPER_ADMIN."}
            </p>

            {formError && (
              <div
                role="alert"
                className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-950"
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor={fullNameId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Nama Lengkap Lulusan
                </label>
                <input
                  id={fullNameId}
                  type="text"
                  required
                  maxLength={255}
                  placeholder="Masukkan nama lengkap beserta gelar"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={entryYearId}
                    className="block text-sm font-semibold text-slate-800"
                  >
                    Tahun Masuk (Angkatan)
                  </label>
                  <input
                    id={entryYearId}
                    type="number"
                    required
                    min={1950}
                    max={2100}
                    value={entryYear}
                    onChange={(e) => setEntryYear(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  />
                </div>

                <div>
                  <label
                    htmlFor={gradYearId}
                    className="block text-sm font-semibold text-slate-800"
                  >
                    Tahun Lulus
                  </label>
                  <input
                    id={gradYearId}
                    type="number"
                    required
                    min={1950}
                    max={2100}
                    value={graduationYear}
                    onChange={(e) => setGraduationYear(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                  className="inline-flex min-h-[44px] items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                  className="inline-flex min-h-[44px] items-center rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Menyimpan..."
                    : editingId
                      ? "Simpan Perubahan"
                      : "Simpan sebagai Draf"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus Data Lulusan"
        description={
          deleteTarget
            ? `Apakah Anda yakin ingin menghapus data lulusan "${deleteTarget.fullName}" secara permanen? Tindakan ini tidak dapat dibatalkan.`
            : ""
        }
        confirmLabel="Ya, Hapus Rekaman"
        isPending={deleteMutation.isPending}
        errorMessage={deleteError}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate({ id: deleteTarget.id });
          }
        }}
      />
    </div>
  );
}
