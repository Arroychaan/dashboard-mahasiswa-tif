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
import {
  createPublicationSchema,
  updatePublicationSchema,
} from "~/lib/validators";
import { api } from "~/trpc/react";

const PAGE_SIZE = 12;

interface PublicationRow {
  id: string;
  title: string;
  kind: "JOURNAL" | "ARTICLE";
  journalName: string;
  publicationYear: number;
  doi: string | null;
  url: string | null;
  isPublished: boolean;
  authors: Array<{
    id: string;
    fullName: string;
    nidn: string | null;
    isPublished: boolean;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export default function AdminPublicationsPage() {
  const utils = api.useUtils();
  const meQuery = api.users.me.useQuery();
  const canPublishOrDelete =
    meQuery.data?.role === "ADMIN" || meQuery.data?.role === "SUPER_ADMIN";

  // Search, filter & pagination states
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"ALL" | "JOURNAL" | "ARTICLE">(
    "ALL",
  );
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "PUBLISHED" | "DRAFT"
  >("ALL");
  const [yearFilter, setYearFilter] = useState("");
  const [pageIndex, setPageIndex] = useState(0);

  // Create / Edit modal states
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"JOURNAL" | "ARTICLE">("JOURNAL");
  const [journalName, setJournalName] = useState("");
  const [publicationYear, setPublicationYear] = useState(
    String(new Date().getFullYear()),
  );
  const [doi, setDoi] = useState("");
  const [url, setUrl] = useState("");
  const [selectedLecturerIds, setSelectedLecturerIds] = useState<string[]>([]);
  const [authorSearch, setAuthorSearch] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation dialog state
  const [deleteTarget, setDeleteTarget] = useState<PublicationRow | null>(null);
  const [confirmUnlinkChecked, setConfirmUnlinkChecked] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Page feedback banner
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const searchInputId = useId();
  const kindFilterId = useId();
  const statusFilterId = useId();
  const yearFilterId = useId();
  const modalTitleId = useId();
  const titleId = useId();
  const kindId = useId();
  const journalNameId = useId();
  const pubYearId = useId();
  const doiId = useId();
  const urlId = useId();
  const authorSearchId = useId();

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

  const parsedYearFilter =
    yearFilter.trim().length === 4 ? Number(yearFilter) : undefined;

  const filterParams = {
    search: debouncedSearch || undefined,
    kind: kindFilter === "ALL" ? undefined : kindFilter,
    isPublished:
      statusFilter === "PUBLISHED"
        ? true
        : statusFilter === "DRAFT"
          ? false
          : undefined,
    publicationYear:
      parsedYearFilter &&
      !Number.isNaN(parsedYearFilter) &&
      parsedYearFilter >= 1950 &&
      parsedYearFilter <= 2100
        ? parsedYearFilter
        : undefined,
  };

  const listQuery = api.publications.list.useQuery({
    ...filterParams,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  });

  const countQuery = api.publications.count.useQuery(filterParams);

  // Load lecturers for multi-author assignment
  const lecturersDirectoryQuery = api.lecturers.list.useQuery({
    limit: 100,
    offset: 0,
  });

  const createMutation = api.publications.create.useMutation({
    onSuccess: async (created) => {
      await Promise.all([
        utils.publications.invalidate(),
        utils.lecturers.invalidate(),
        utils.publicDashboard.invalidate(),
      ]);
      setFormOpen(false);
      setFeedback({
        kind: "success",
        message: `Publikasi "${created.title}" berhasil disimpan sebagai Draf.`,
      });
    },
    onError: (err) => {
      setFormError(err.message || "Gagal menyimpan data publikasi.");
    },
  });

  const updateMutation = api.publications.update.useMutation({
    onSuccess: async (updated) => {
      await Promise.all([
        utils.publications.invalidate(),
        utils.lecturers.invalidate(),
        utils.publicDashboard.invalidate(),
      ]);
      setFormOpen(false);
      setFeedback({
        kind: "success",
        message: `Publikasi "${updated.title}" berhasil diperbarui.`,
      });
    },
    onError: (err) => {
      setFormError(err.message || "Gagal memperbarui data publikasi.");
    },
  });

  const setPublishedMutation = api.publications.setPublished.useMutation({
    onSuccess: async (updated) => {
      await Promise.all([
        utils.publications.invalidate(),
        utils.publicDashboard.invalidate(),
      ]);
      setFeedback({
        kind: "success",
        message: updated.isPublished
          ? `Publikasi "${updated.title}" telah dipublikasikan ke dashboard publik.`
          : `Publikasi "${updated.title}" telah dikembalikan ke status Draf.`,
      });
    },
    onError: (err) => {
      setFeedback({
        kind: "error",
        message: err.message || "Gagal mengubah status publikasi.",
      });
    },
  });

  const deleteMutation = api.publications.delete.useMutation({
    onSuccess: async () => {
      const deletedTitle = deleteTarget?.title ?? "";
      setDeleteTarget(null);
      setDeleteError(null);
      await Promise.all([
        utils.publications.invalidate(),
        utils.lecturers.invalidate(),
        utils.publicDashboard.invalidate(),
      ]);
      setFeedback({
        kind: "success",
        message: `Publikasi "${deletedTitle}" telah dihapus secara permanen.`,
      });
    },
    onError: (err) => {
      setDeleteError(err.message || "Gagal menghapus data publikasi.");
    },
  });

  function openCreateModal() {
    setEditingId(null);
    setTitle("");
    setKind("JOURNAL");
    setJournalName("");
    setPublicationYear(String(new Date().getFullYear()));
    setDoi("");
    setUrl("");
    setSelectedLecturerIds([]);
    setAuthorSearch("");
    setFormError(null);
    setFormOpen(true);
  }

  function openEditModal(item: PublicationRow) {
    setEditingId(item.id);
    setTitle(item.title);
    setKind(item.kind);
    setJournalName(item.journalName);
    setPublicationYear(String(item.publicationYear));
    setDoi(item.doi ?? "");
    setUrl(item.url ?? "");
    setSelectedLecturerIds(item.authors.map((a) => a.id));
    setAuthorSearch("");
    setFormError(null);
    setFormOpen(true);
  }

  function toggleLecturerSelection(lecturerId: string) {
    setSelectedLecturerIds((prev) =>
      prev.includes(lecturerId)
        ? prev.filter((id) => id !== lecturerId)
        : [...prev, lecturerId],
    );
  }

  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const parsedYear = Number(publicationYear);
    const normalizedPayload = {
      title: title.trim(),
      kind,
      journalName: journalName.trim(),
      publicationYear: parsedYear,
      doi: doi.trim() ? doi.trim() : null,
      url: url.trim() ? url.trim() : null,
      lecturerIds: selectedLecturerIds,
    };

    if (editingId) {
      const validation = updatePublicationSchema.safeParse({
        id: editingId,
        ...normalizedPayload,
      });

      if (!validation.success) {
        const firstIssue = validation.error.issues[0];
        setFormError(firstIssue?.message ?? "Data formulir tidak valid.");
        return;
      }

      updateMutation.mutate(validation.data);
    } else {
      const validation = createPublicationSchema.safeParse({
        ...normalizedPayload,
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

  const availableLecturers = lecturersDirectoryQuery.data ?? [];
  const filteredLecturers = authorSearch.trim()
    ? availableLecturers.filter((l) => {
        const q = authorSearch.trim().toLowerCase();
        return (
          l.fullName.toLowerCase().includes(q) ||
          (l.nidn?.toLowerCase().includes(q) ?? false) ||
          l.expertise.toLowerCase().includes(q)
        );
      })
    : availableLecturers;

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
            Manajemen Publikasi Ilmiah
          </h1>
          <p className="mt-1 text-sm text-slate-700">
            Kelola jurnal dan artikel ilmiah dosen beserta penautan penulis
            bersama (co-authors) tanpa menduplikasi rekaman karya ilmiah.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex min-h-[44px] items-center rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
        >
          Tambah Publikasi
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
        aria-label="Filter dan Pencarian Publikasi"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label
              htmlFor={searchInputId}
              className="block text-xs font-semibold text-slate-700"
            >
              Cari Judul, Jurnal, atau DOI
            </label>
            <input
              id={searchInputId}
              type="search"
              placeholder="Ketik judul atau nama jurnal..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
            />
          </div>

          <div>
            <label
              htmlFor={kindFilterId}
              className="block text-xs font-semibold text-slate-700"
            >
              Jenis Karya Ilmiah
            </label>
            <select
              id={kindFilterId}
              value={kindFilter}
              onChange={(e) => {
                setKindFilter(e.target.value as "ALL" | "JOURNAL" | "ARTICLE");
                setPageIndex(0);
              }}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
            >
              <option value="ALL">Semua Jenis</option>
              <option value="JOURNAL">Jurnal Ilmiah (JOURNAL)</option>
              <option value="ARTICLE">Artikel / Prosiding (ARTICLE)</option>
            </select>
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
              Filter Tahun Terbit
            </label>
            <input
              id={yearFilterId}
              type="number"
              min={1950}
              max={2100}
              placeholder="Contoh: 2024"
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(e.target.value);
                setPageIndex(0);
              }}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
            />
          </div>
        </div>
      </section>

      {/* Publications Table / States */}
      {listQuery.isLoading ? (
        <LoadingState message="Memuat daftar publikasi ilmiah..." />
      ) : listQuery.isError ? (
        <ErrorState
          message={listQuery.error.message || "Gagal memuat data publikasi."}
          onRetry={() => void listQuery.refetch()}
        />
      ) : !listQuery.data || listQuery.data.length === 0 ? (
        <EmptyState
          title={
            debouncedSearch ||
            kindFilter !== "ALL" ||
            statusFilter !== "ALL" ||
            yearFilter
              ? "Tidak Ada Publikasi yang Cocok"
              : "Belum Ada Data Publikasi Ilmiah"
          }
          description={
            debouncedSearch ||
            kindFilter !== "ALL" ||
            statusFilter !== "ALL" ||
            yearFilter
              ? "Ubah kata kunci pencarian atau reset filter untuk melihat publikasi lainnya."
              : "Tambahkan rekaman jurnal atau artikel ilmiah pertama beserta daftar penulis dosen."
          }
          actionLabel={
            debouncedSearch ||
            kindFilter !== "ALL" ||
            statusFilter !== "ALL" ||
            yearFilter
              ? "Reset Filter"
              : "Tambah Publikasi"
          }
          onAction={() => {
            if (
              debouncedSearch ||
              kindFilter !== "ALL" ||
              statusFilter !== "ALL" ||
              yearFilter
            ) {
              setSearchInput("");
              setDebouncedSearch("");
              setKindFilter("ALL");
              setStatusFilter("ALL");
              setYearFilter("");
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
                    Judul &amp; Media Publikasi
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Jenis &amp; Tahun
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Penulis Dosen (Co-Authors)
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Tautan / DOI
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Tindakan
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {listQuery.data.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="max-w-md px-4 py-3">
                      <div className="font-semibold text-slate-900">
                        {row.title}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-600">
                        {row.journalName}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 font-semibold ${
                          row.kind === "JOURNAL"
                            ? "border-blue-300 bg-blue-50 text-blue-950"
                            : "border-slate-300 bg-slate-100 text-slate-800"
                        }`}
                      >
                        {row.kind === "JOURNAL" ? "Jurnal" : "Artikel"}
                      </span>
                      <div className="mt-1 font-semibold text-slate-800">
                        Tahun {row.publicationYear}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {row.authors.length === 0 ? (
                        <span className="text-slate-500">
                          Belum ada penulis tertaut
                        </span>
                      ) : (
                        <ul className="space-y-1">
                          {row.authors.map((author) => (
                            <li
                              key={author.id}
                              className="font-medium text-slate-900"
                            >
                              {author.fullName}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-700">
                      {row.doi && (
                        <div>
                          <span className="font-semibold text-slate-600">
                            DOI:
                          </span>{" "}
                          {row.doi}
                        </div>
                      )}
                      {row.url ? (
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-block font-semibold text-blue-800 hover:underline"
                        >
                          Buka Tautan Eksternal
                        </a>
                      ) : (
                        !row.doi && (
                          <span className="text-slate-500">Tidak ada</span>
                        )
                      )}
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
                                setConfirmUnlinkChecked(false);
                                setDeleteTarget(row);
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
              dari <span className="font-semibold">{totalRecords}</span>{" "}
              publikasi unik
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
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
            <h2 id={modalTitleId} className="text-lg font-bold text-slate-900">
              {editingId
                ? "Edit Rekaman Publikasi Ilmiah"
                : "Tambah Publikasi Ilmiah Baru"}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {editingId
                ? "Perubahan pada rekaman publikasi maupun daftar penulis dosen akan langsung diperbarui."
                : "Publikasi baru akan disimpan sebagai Draf hingga disetujui oleh ADMIN atau SUPER_ADMIN."}
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
                  htmlFor={titleId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Judul Publikasi Ilmiah
                </label>
                <input
                  id={titleId}
                  type="text"
                  required
                  maxLength={500}
                  placeholder="Masukkan judul lengkap artikel atau jurnal ilmiah"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor={kindId}
                    className="block text-sm font-semibold text-slate-800"
                  >
                    Jenis Publikasi
                  </label>
                  <select
                    id={kindId}
                    value={kind}
                    onChange={(e) =>
                      setKind(e.target.value as "JOURNAL" | "ARTICLE")
                    }
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  >
                    <option value="JOURNAL">Jurnal (JOURNAL)</option>
                    <option value="ARTICLE">Artikel (ARTICLE)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor={journalNameId}
                    className="block text-sm font-semibold text-slate-800"
                  >
                    Nama Jurnal / Konferensi / Media Terbit
                  </label>
                  <input
                    id={journalNameId}
                    type="text"
                    required
                    maxLength={255}
                    placeholder="Contoh: Jurnal Teknologi Informasi dan Ilmu Komputer"
                    value={journalName}
                    onChange={(e) => setJournalName(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor={pubYearId}
                    className="block text-sm font-semibold text-slate-800"
                  >
                    Tahun Terbit
                  </label>
                  <input
                    id={pubYearId}
                    type="number"
                    required
                    min={1950}
                    max={2100}
                    value={publicationYear}
                    onChange={(e) => setPublicationYear(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor={doiId}
                    className="block text-sm font-semibold text-slate-800"
                  >
                    Nomor DOI (Opsional)
                  </label>
                  <input
                    id={doiId}
                    type="text"
                    maxLength={255}
                    placeholder="Contoh: 10.25126/jtiik.202411"
                    value={doi}
                    onChange={(e) => setDoi(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor={urlId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Tautan Eksternal HTTP/HTTPS (Opsional)
                </label>
                <input
                  id={urlId}
                  type="url"
                  maxLength={2048}
                  placeholder="https://jurnal.unissula.ac.id/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                />
                <p className="mt-1 text-xs text-slate-600">
                  Hanya protokol <code>http://</code> atau <code>https://</code>{" "}
                  yang diizinkan.
                </p>
              </div>

              {/* Multi-Lecturer Co-Author Selector */}
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label
                      htmlFor={authorSearchId}
                      className="block text-sm font-semibold text-slate-800"
                    >
                      Penulis Dosen Terkait (Minimal 1 Dosen)
                    </label>
                    <p className="text-xs text-slate-600">
                      Pilih satu atau beberapa dosen penulis bersama
                      (co-authors). Terpilih:{" "}
                      <span className="font-bold text-blue-900">
                        {selectedLecturerIds.length} dosen
                      </span>
                    </p>
                  </div>
                </div>

                <input
                  id={authorSearchId}
                  type="search"
                  placeholder="Filter daftar nama dosen..."
                  value={authorSearch}
                  onChange={(e) => setAuthorSearch(e.target.value)}
                  className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                />

                <div className="mt-2 max-h-44 overflow-y-auto rounded border border-slate-200 bg-white divide-y divide-slate-100">
                  {lecturersDirectoryQuery.isLoading ? (
                    <div className="p-3 text-xs text-slate-600">
                      Memuat direktori dosen...
                    </div>
                  ) : filteredLecturers.length === 0 ? (
                    <div className="p-3 text-xs text-slate-600">
                      Tidak ada profil dosen yang cocok. Pastikan profil dosen
                      telah dibuat pada menu Dosen.
                    </div>
                  ) : (
                    filteredLecturers.map((lecturer) => {
                      const checked = selectedLecturerIds.includes(lecturer.id);
                      return (
                        <label
                          key={lecturer.id}
                          className="flex cursor-pointer items-center gap-3 px-3 py-2 text-xs hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              toggleLecturerSelection(lecturer.id)
                            }
                            className="h-4 w-4 rounded border-slate-300 text-blue-800 focus:ring-blue-800"
                          />
                          <div className="flex-1">
                            <span className="font-semibold text-slate-900">
                              {lecturer.fullName}
                            </span>
                            {lecturer.nidn && (
                              <span className="ml-2 text-slate-600">
                                (NIDN: {lecturer.nidn})
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })
                  )}
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
        title="Hapus Rekaman Publikasi Ilmiah"
        description={
          deleteTarget
            ? `Apakah Anda yakin ingin menghapus publikasi "${deleteTarget.title}" secara permanen? Tindakan ini tidak dapat dibatalkan.`
            : ""
        }
        confirmLabel="Ya, Hapus Publikasi"
        checkboxLabel={
          deleteTarget && deleteTarget.authors.length > 0
            ? `Saya mengonfirmasi pelepasan tautan ${deleteTarget.authors.length} penulis dosen pada publikasi ini.`
            : undefined
        }
        checkboxChecked={confirmUnlinkChecked}
        onCheckboxChange={setConfirmUnlinkChecked}
        isPending={deleteMutation.isPending}
        errorMessage={deleteError}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate({
              id: deleteTarget.id,
              confirmUnlinkAuthors: true,
            });
          }
        }}
      />
    </div>
  );
}
