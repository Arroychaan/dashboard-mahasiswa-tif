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
  createAnnouncementSchema,
  updateAnnouncementSchema,
  type AnnouncementCategoryType,
} from "~/lib/validators";
import { api } from "~/trpc/react";

const PAGE_SIZE = 10;

interface AnnouncementRow {
  id: string;
  title: string;
  category: AnnouncementCategoryType;
  content: string;
  eventDate: Date;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export default function AdminAnnouncementsPage() {
  const utils = api.useUtils();
  const meQuery = api.users.me.useQuery();
  const canPublishOrDelete =
    meQuery.data?.role === "ADMIN" || meQuery.data?.role === "SUPER_ADMIN";

  // Search & Filter state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    "ALL" | AnnouncementCategoryType
  >("ALL");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "PUBLISHED" | "DRAFT"
  >("ALL");
  const [pageIndex, setPageIndex] = useState(0);

  // Form Modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] =
    useState<AnnouncementCategoryType>("PENGUMUMAN");
  const [eventDateStr, setEventDateStr] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [content, setContent] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Detail Modal state
  const [detailTarget, setDetailTarget] = useState<AnnouncementRow | null>(
    null,
  );

  // Delete Dialog state
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementRow | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Page Feedback Banner
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const searchInputId = useId();
  const categoryFilterId = useId();
  const statusFilterId = useId();
  const modalTitleId = useId();
  const fieldTitleId = useId();
  const fieldCategoryId = useId();
  const fieldDateId = useId();
  const fieldContentId = useId();
  const fieldPublishId = useId();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPageIndex(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPageIndex(0);
  }, [categoryFilter, statusFilter]);

  const filterParams = {
    search: debouncedSearch || undefined,
    category: categoryFilter === "ALL" ? undefined : categoryFilter,
    isPublished:
      statusFilter === "ALL"
        ? undefined
        : statusFilter === "PUBLISHED"
          ? true
          : false,
  };

  const listQuery = api.announcements.list.useQuery({
    ...filterParams,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  });

  const countQuery = api.announcements.count.useQuery(filterParams);

  const createMutation = api.announcements.create.useMutation({
    onSuccess: (item) => {
      setFeedback({
        kind: "success",
        message: `Pengumuman "${item.title}" berhasil ditambahkan${
          item.isPublished ? " dan dipublikasikan" : " sebagai draf"
        }.`,
      });
      closeForm();
      void utils.announcements.list.invalidate();
      void utils.publicDashboard.announcements.invalidate();
    },
    onError: (err) => {
      setFormError(err.message || "Gagal menambahkan pengumuman.");
    },
  });

  const updateMutation = api.announcements.update.useMutation({
    onSuccess: (item) => {
      setFeedback({
        kind: "success",
        message: `Pengumuman "${item.title}" berhasil diperbarui.`,
      });
      closeForm();
      void utils.announcements.list.invalidate();
      void utils.publicDashboard.announcements.invalidate();
    },
    onError: (err) => {
      setFormError(err.message || "Gagal memperbarui pengumuman.");
    },
  });

  const setPublishedMutation = api.announcements.setPublished.useMutation({
    onSuccess: (item) => {
      setFeedback({
        kind: "success",
        message: `Status publikasi "${item.title}" diubah menjadi ${
          item.isPublished ? "Terpublikasi" : "Draf"
        }.`,
      });
      void utils.announcements.list.invalidate();
      void utils.publicDashboard.announcements.invalidate();
    },
    onError: (err) => {
      setFeedback({
        kind: "error",
        message: `Gagal mengubah status publikasi: ${err.message}`,
      });
    },
  });

  const deleteMutation = api.announcements.delete.useMutation({
    onSuccess: () => {
      setFeedback({
        kind: "success",
        message: "Pengumuman berhasil dihapus.",
      });
      setDeleteTarget(null);
      void utils.announcements.list.invalidate();
      void utils.publicDashboard.announcements.invalidate();
    },
    onError: (err) => {
      setDeleteError(err.message || "Gagal menghapus pengumuman.");
    },
  });

  function openCreateForm() {
    setEditingId(null);
    setTitle("");
    setCategory("PENGUMUMAN");
    setEventDateStr(new Date().toISOString().slice(0, 10));
    setContent("");
    setIsPublished(false);
    setFormError(null);
    setFormOpen(true);
  }

  function openEditForm(row: AnnouncementRow) {
    setEditingId(row.id);
    setTitle(row.title);
    setCategory(row.category);
    setEventDateStr(new Date(row.eventDate).toISOString().slice(0, 10));
    setContent(row.content);
    setIsPublished(row.isPublished);
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const parsedDate = new Date(`${eventDateStr}T00:00:00.000Z`);
    if (isNaN(parsedDate.getTime())) {
      setFormError("Format tanggal agenda tidak valid.");
      return;
    }

    if (editingId) {
      const parsed = updateAnnouncementSchema.safeParse({
        id: editingId,
        title: title.trim(),
        category,
        eventDate: parsedDate,
        content: content.trim(),
      });

      if (!parsed.success) {
        setFormError(parsed.error.errors[0]?.message ?? "Validasi data gagal.");
        return;
      }

      updateMutation.mutate(parsed.data);
    } else {
      const parsed = createAnnouncementSchema.safeParse({
        title: title.trim(),
        category,
        eventDate: parsedDate,
        content: content.trim(),
        isPublished: canPublishOrDelete ? isPublished : false,
      });

      if (!parsed.success) {
        setFormError(parsed.error.errors[0]?.message ?? "Validasi data gagal.");
        return;
      }

      createMutation.mutate(parsed.data);
    }
  }

  const items = listQuery.data ?? [];
  const totalCount = countQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Pengumuman & Berita Acara
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Kelola agenda kegiatan, surat edaran, berita acara, dan pengumuman resmi Program Studi Teknik Informatika UNISSULA.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900 cursor-pointer"
        >
          <svg
            className="-ml-0.5 mr-2 h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          Tambah Pengumuman
        </button>
      </div>

      {feedback && (
        <FeedbackBanner
          kind={feedback.kind}
          message={feedback.message}
          onDismiss={() => setFeedback(null)}
        />
      )}

      {/* Filters and Search Bar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label
            htmlFor={searchInputId}
            className="block text-xs font-medium text-slate-300"
          >
            Pencarian Judul
          </label>
          <input
            id={searchInputId}
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari berdasarkan judul agenda..."
            className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label
            htmlFor={categoryFilterId}
            className="block text-xs font-medium text-slate-300"
          >
            Filter Kategori
          </label>
          <select
            id={categoryFilterId}
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(
                e.target.value as "ALL" | AnnouncementCategoryType,
              )
            }
            className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="ALL">Semua Kategori</option>
            <option value="PENGUMUMAN">Pengumuman</option>
            <option value="BERITA_ACARA">Berita Acara</option>
          </select>
        </div>

        <div>
          <label
            htmlFor={statusFilterId}
            className="block text-xs font-medium text-slate-300"
          >
            Filter Status Publikasi
          </label>
          <select
            id={statusFilterId}
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as "ALL" | "PUBLISHED" | "DRAFT",
              )
            }
            className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="ALL">Semua Status</option>
            <option value="PUBLISHED">Terpublikasi</option>
            <option value="DRAFT">Draf</option>
          </select>
        </div>
      </div>

      {/* Announcements Table */}
      {listQuery.isLoading ? (
        <LoadingState message="Memuat daftar pengumuman..." />
      ) : listQuery.isError ? (
        <ErrorState
          message={
            listQuery.error.message || "Gagal memuat data pengumuman."
          }
          onRetry={() => void listQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={
            debouncedSearch || categoryFilter !== "ALL" || statusFilter !== "ALL"
              ? "Tidak Ada Pengumuman yang Cocok"
              : "Belum Ada Pengumuman"
          }
          description={
            debouncedSearch || categoryFilter !== "ALL" || statusFilter !== "ALL"
              ? "Coba ubah kata kunci pencarian atau sesuaikan filter kategori dan status."
              : "Tambahkan pengumuman atau berita acara pertama untuk ditampilkan pada layar monitor display program studi."
          }
          actionLabel="Tambah Pengumuman"
          onAction={openCreateForm}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 shadow-xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
              <thead className="bg-slate-900/90 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3.5 sm:px-6">
                    Judul Pengumuman
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Kategori
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Tanggal Agenda
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3.5 text-right sm:px-6"
                  >
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {items.map((row) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-4 sm:px-6">
                      <div className="font-semibold text-white">
                        {row.title}
                      </div>
                      <div className="mt-0.5 line-clamp-1 text-xs text-slate-400 max-w-md">
                        {row.content}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                          row.category === "BERITA_ACARA"
                            ? "bg-purple-950/60 text-purple-300 ring-purple-800/50"
                            : "bg-blue-950/60 text-blue-300 ring-blue-800/50"
                        }`}
                      >
                        {row.category === "BERITA_ACARA"
                          ? "Berita Acara"
                          : "Pengumuman"}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-300">
                      {new Date(row.eventDate).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <StatusBadge isPublished={row.isPublished} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-xs font-medium sm:px-6">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailTarget(row)}
                          className="rounded px-2.5 py-1 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                        >
                          Lihat
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditForm(row)}
                          className="rounded px-2.5 py-1 text-emerald-400 hover:bg-emerald-950/60 hover:text-emerald-300 transition-colors"
                        >
                          Ubah
                        </button>
                        {canPublishOrDelete && (
                          <>
                            <button
                              type="button"
                              disabled={setPublishedMutation.isPending}
                              onClick={() =>
                                setPublishedMutation.mutate({
                                  id: row.id,
                                  isPublished: !row.isPublished,
                                })
                              }
                              className={`rounded px-2.5 py-1 transition-colors ${
                                row.isPublished
                                  ? "text-amber-400 hover:bg-amber-950/60 hover:text-amber-300"
                                  : "text-emerald-400 hover:bg-emerald-950/60 hover:text-emerald-300"
                              }`}
                            >
                              {row.isPublished ? "Jadikan Draf" : "Publikasikan"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(row)}
                              className="rounded px-2.5 py-1 text-rose-400 hover:bg-rose-950/60 hover:text-rose-300 transition-colors"
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

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 sm:px-6">
              <div className="text-xs text-slate-400">
                Menampilkan halaman{" "}
                <span className="font-semibold text-white">{pageIndex + 1}</span>{" "}
                dari{" "}
                <span className="font-semibold text-white">{totalPages}</span>{" "}
                ({totalCount} total pengumuman)
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pageIndex === 0}
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                  className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  disabled={pageIndex + 1 >= totalPages}
                  onClick={() =>
                    setPageIndex((p) => Math.min(totalPages - 1, p + 1))
                  }
                  className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Form Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2
                id={modalTitleId}
                className="text-lg font-bold text-white"
              >
                {editingId ? "Ubah Pengumuman / Berita Acara" : "Tambah Pengumuman Baru"}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <span className="sr-only">Tutup</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            {formError && (
              <div className="rounded-lg border border-rose-800 bg-rose-950/60 p-3 text-sm text-rose-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label
                  htmlFor={fieldTitleId}
                  className="block text-xs font-medium text-slate-300"
                >
                  Judul Pengumuman <span className="text-rose-400">*</span>
                </label>
                <input
                  id={fieldTitleId}
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Jadwal Ujian Tengah Semester Genap 2026/2027"
                  className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={fieldCategoryId}
                    className="block text-xs font-medium text-slate-300"
                  >
                    Kategori <span className="text-rose-400">*</span>
                  </label>
                  <select
                    id={fieldCategoryId}
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as AnnouncementCategoryType)
                    }
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="PENGUMUMAN">Pengumuman</option>
                    <option value="BERITA_ACARA">Berita Acara</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={fieldDateId}
                    className="block text-xs font-medium text-slate-300"
                  >
                    Tanggal Agenda / Berita Acara <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id={fieldDateId}
                    type="date"
                    required
                    value={eventDateStr}
                    onChange={(e) => setEventDateStr(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor={fieldContentId}
                  className="block text-xs font-medium text-slate-300"
                >
                  Isi / Keterangan Pengumuman <span className="text-rose-400">*</span>
                </label>
                <textarea
                  id={fieldContentId}
                  required
                  rows={5}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Tuliskan isi pengumuman atau rangkuman berita acara secara ringkas dan informatif..."
                  className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {!editingId && canPublishOrDelete && (
                <div className="flex items-center gap-2 pt-2">
                  <input
                    id={fieldPublishId}
                    type="checkbox"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label
                    htmlFor={fieldPublishId}
                    className="text-xs text-slate-300 cursor-pointer"
                  >
                    Langsung publikasikan ke layar monitor display program studi
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "Menyimpan..."
                    : editingId
                      ? "Simpan Perubahan"
                      : "Tambah Pengumuman"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Announcement Detail Modal */}
      {detailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset mb-2 ${
                    detailTarget.category === "BERITA_ACARA"
                      ? "bg-purple-950/60 text-purple-300 ring-purple-800/50"
                      : "bg-blue-950/60 text-blue-300 ring-blue-800/50"
                  }`}
                >
                  {detailTarget.category === "BERITA_ACARA"
                    ? "Berita Acara"
                    : "Pengumuman"}
                </span>
                <h3 className="text-lg font-bold text-white">
                  {detailTarget.title}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tanggal Agenda:{" "}
                  {new Date(detailTarget.eventDate).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailTarget(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <span className="sr-only">Tutup</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed py-2">
              {detailTarget.content}
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-400">
              <StatusBadge isPublished={detailTarget.isPublished} />
              <button
                type="button"
                onClick={() => setDetailTarget(null)}
                className="rounded-md bg-slate-800 px-3 py-1.5 font-medium text-white hover:bg-slate-700"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          title="Hapus Pengumuman"
          description={`Apakah Anda yakin ingin menghapus pengumuman "${deleteTarget.title}"? Tindakan ini tidak dapat dibatalkan.`}
          confirmLabel={deleteMutation.isPending ? "Menghapus..." : "Ya, Hapus"}
          cancelLabel="Batal"
          variant="danger"
          isPending={deleteMutation.isPending}
          errorMessage={deleteError}
          onConfirm={() => {
            setDeleteError(null);
            deleteMutation.mutate({ id: deleteTarget.id });
          }}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}
