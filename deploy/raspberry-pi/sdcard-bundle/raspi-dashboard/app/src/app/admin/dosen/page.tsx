"use client";

import Image from "next/image";
import { useEffect, useId, useState } from "react";

import {
  EmptyState,
  ErrorState,
  FeedbackBanner,
  LoadingState,
  StatusBadge,
} from "~/components/admin/AdminStates";
import { ConfirmDialog } from "~/components/admin/ConfirmDialog";
import { createLecturerSchema, updateLecturerSchema } from "~/lib/validators";
import { api } from "~/trpc/react";

const PAGE_SIZE = 12;

interface LecturerRow {
  id: string;
  fullName: string;
  nidn: string | null;
  nip: string | null;
  position: string;
  expertise: string;
  education: string | null;
  biography: string | null;
  photoPath: string | null;
  isPublished: boolean;
  publicationCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export default function AdminLecturersPage() {
  const utils = api.useUtils();
  const meQuery = api.users.me.useQuery();
  const canPublishOrDelete =
    meQuery.data?.role === "ADMIN" || meQuery.data?.role === "SUPER_ADMIN";
  // NIP is private to authorized admins (ADMIN and SUPER_ADMIN)
  const canAccessNip = canPublishOrDelete;

  // Search, filter & pagination states
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "PUBLISHED" | "DRAFT"
  >("ALL");
  const [pageIndex, setPageIndex] = useState(0);

  // Create / Edit modal states
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [nidn, setNidn] = useState("");
  const [nip, setNip] = useState("");
  const [position, setPosition] = useState("");
  const [expertise, setExpertise] = useState("");
  const [education, setEducation] = useState("");
  const [biography, setBiography] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Lecturer details modal state
  const [detailTarget, setDetailTarget] = useState<LecturerRow | null>(null);

  // Delete confirmation dialog state
  const [deleteTarget, setDeleteTarget] = useState<LecturerRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Page feedback banner
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const searchInputId = useId();
  const statusFilterId = useId();
  const modalTitleId = useId();
  const detailTitleId = useId();
  const fullNameId = useId();
  const nidnId = useId();
  const nipId = useId();
  const positionId = useId();
  const expertiseId = useId();
  const educationId = useId();
  const biographyId = useId();
  const photoInputId = useId();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPageIndex(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!formOpen && !detailTarget) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (formOpen && !isUploadingPhoto) setFormOpen(false);
        if (detailTarget) setDetailTarget(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [formOpen, detailTarget, isUploadingPhoto]);

  const filterParams = {
    search: debouncedSearch || undefined,
    isPublished:
      statusFilter === "PUBLISHED"
        ? true
        : statusFilter === "DRAFT"
          ? false
          : undefined,
  };

  const listQuery = api.lecturers.list.useQuery({
    ...filterParams,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  });

  const countQuery = api.lecturers.count.useQuery(filterParams);

  const createMutation = api.lecturers.create.useMutation({
    onSuccess: async (created) => {
      await Promise.all([
        utils.lecturers.invalidate(),
        utils.publicDashboard.invalidate(),
      ]);
      setFormOpen(false);
      setFeedback({
        kind: "success",
        message: `Profil dosen "${created.fullName}" berhasil disimpan sebagai Draf.`,
      });
    },
    onError: (err) => {
      setFormError(err.message || "Gagal menyimpan data dosen.");
    },
  });

  const updateMutation = api.lecturers.update.useMutation({
    onSuccess: async (updated) => {
      await Promise.all([
        utils.lecturers.invalidate(),
        utils.publicDashboard.invalidate(),
      ]);
      setFormOpen(false);
      setFeedback({
        kind: "success",
        message: `Profil dosen "${updated.fullName}" berhasil diperbarui.`,
      });
    },
    onError: (err) => {
      setFormError(err.message || "Gagal memperbarui data dosen.");
    },
  });

  const setPublishedMutation = api.lecturers.setPublished.useMutation({
    onSuccess: async (updated) => {
      await Promise.all([
        utils.lecturers.invalidate(),
        utils.publicDashboard.invalidate(),
      ]);
      setFeedback({
        kind: "success",
        message: updated.isPublished
          ? `Profil dosen "${updated.fullName}" telah dipublikasikan ke dashboard publik.`
          : `Profil dosen "${updated.fullName}" telah dikembalikan ke status Draf.`,
      });
    },
    onError: (err) => {
      setFeedback({
        kind: "error",
        message: err.message || "Gagal mengubah status publikasi dosen.",
      });
    },
  });

  const deleteMutation = api.lecturers.delete.useMutation({
    onSuccess: async () => {
      const deletedName = deleteTarget?.fullName ?? "";
      setDeleteTarget(null);
      setDeleteError(null);
      await Promise.all([
        utils.lecturers.invalidate(),
        utils.publicDashboard.invalidate(),
      ]);
      setFeedback({
        kind: "success",
        message: `Profil dosen "${deletedName}" telah dihapus secara permanen.`,
      });
    },
    onError: (err) => {
      setDeleteError(err.message || "Gagal menghapus profil dosen.");
    },
  });

  function openCreateModal() {
    setEditingId(null);
    setFullName("");
    setNidn("");
    setNip("");
    setPosition("");
    setExpertise("");
    setEducation("");
    setBiography("");
    setPhotoPath(null);
    setPhotoUploadError(null);
    setFormError(null);
    setFormOpen(true);
  }

  function openEditModal(item: LecturerRow) {
    setEditingId(item.id);
    setFullName(item.fullName);
    setNidn(item.nidn ?? "");
    setNip(item.nip ?? "");
    setPosition(item.position);
    setExpertise(item.expertise);
    setEducation(item.education ?? "");
    setBiography(item.biography ?? "");
    setPhotoPath(item.photoPath);
    setPhotoUploadError(null);
    setFormError(null);
    setFormOpen(true);
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoUploadError(null);

    if (file.size > 2 * 1024 * 1024) {
      setPhotoUploadError("Ukuran berkas foto melebihi batas maksimal 2 MB.");
      e.target.value = "";
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setPhotoUploadError(
        "Format foto tidak didukung. Gunakan berkas JPEG, PNG, atau WebP.",
      );
      e.target.value = "";
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/lecturer-photo", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as {
        photoPath?: string;
        error?: string;
      };

      if (!response.ok || !payload.photoPath) {
        setPhotoUploadError(
          payload.error ?? "Gagal mengunggah foto profil dosen.",
        );
      } else {
        setPhotoPath(payload.photoPath);
      }
    } catch {
      setPhotoUploadError(
        "Terjadi gangguan jaringan saat mengunggah foto profil.",
      );
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = "";
    }
  }

  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const normalizedPayload = {
      fullName: fullName.trim(),
      nidn: nidn.trim() ? nidn.trim() : null,
      ...(canAccessNip ? { nip: nip.trim() ? nip.trim() : null } : {}),
      position: position.trim(),
      expertise: expertise.trim(),
      education: education.trim() ? education.trim() : null,
      biography: biography.trim() ? biography.trim() : null,
      photoPath,
    };

    if (editingId) {
      const validation = updateLecturerSchema.safeParse({
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
      const validation = createLecturerSchema.safeParse({
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

  const totalRecords = countQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    setPublishedMutation.isPending ||
    deleteMutation.isPending ||
    isUploadingPhoto;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Manajemen Data Dosen
          </h1>
          <p className="mt-1 text-sm text-slate-700">
            Kelola profil akademik dosen, jabatan fungsional, bidang keahlian,
            dan foto profil resmi. Atribut NIP hanya dapat dilihat dan dikelola
            oleh ADMIN serta SUPER_ADMIN.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex min-h-[44px] items-center rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
        >
          Tambah Data Dosen
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
        aria-label="Filter dan Pencarian Data Dosen"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label
              htmlFor={searchInputId}
              className="block text-xs font-semibold text-slate-700"
            >
              Cari Nama, NIDN, Jabatan, atau Bidang Keahlian
            </label>
            <input
              id={searchInputId}
              type="search"
              placeholder="Ketik nama dosen, NIDN, atau bidang keahlian..."
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
        </div>
      </section>

      {/* Lecturer Table / States */}
      {listQuery.isLoading ? (
        <LoadingState message="Memuat daftar dosen..." />
      ) : listQuery.isError ? (
        <ErrorState
          message={listQuery.error.message || "Gagal memuat data dosen."}
          onRetry={() => void listQuery.refetch()}
        />
      ) : !listQuery.data || listQuery.data.length === 0 ? (
        <EmptyState
          title={
            debouncedSearch || statusFilter !== "ALL"
              ? "Tidak Ada Data Dosen yang Cocok"
              : "Belum Ada Data Dosen"
          }
          description={
            debouncedSearch || statusFilter !== "ALL"
              ? "Ubah kata kunci pencarian atau reset filter untuk melihat profil dosen lainnya."
              : "Tambahkan profil dosen pertama untuk ditampilkan pada direktori dan publikasi penelitian."
          }
          actionLabel={
            debouncedSearch || statusFilter !== "ALL"
              ? "Reset Filter"
              : "Tambah Data Dosen"
          }
          onAction={() => {
            if (debouncedSearch || statusFilter !== "ALL") {
              setSearchInput("");
              setDebouncedSearch("");
              setStatusFilter("ALL");
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
                    Profil Dosen
                  </th>
                  <th scope="col" className="px-4 py-3">
                    NIDN {canAccessNip ? "/ NIP" : ""}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Jabatan &amp; Keahlian
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Publikasi Terkait
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
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {row.photoPath ? (
                          <Image
                            src={row.photoPath}
                            alt={`Foto ${row.fullName}`}
                            width={40}
                            height={40}
                            unoptimized
                            className="h-10 w-10 shrink-0 rounded-full border border-slate-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-xs font-bold text-slate-700">
                            {row.fullName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-slate-900">
                            {row.fullName}
                          </div>
                          {row.education && (
                            <div className="max-w-xs truncate text-xs text-slate-600">
                              {row.education}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-700">
                      <div>
                        <span className="font-medium text-slate-600">
                          NIDN:
                        </span>{" "}
                        {row.nidn ?? "Belum diisi"}
                      </div>
                      {canAccessNip && (
                        <div className="mt-0.5">
                          <span className="font-medium text-slate-600">
                            NIP:
                          </span>{" "}
                          {row.nip ?? "Belum diisi"}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {row.position}
                      </div>
                      <div className="max-w-xs truncate text-xs text-slate-600">
                        {row.expertise}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-700">
                      <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-800">
                        {row.publicationCount} karya
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge isPublished={row.isPublished} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailTarget(row)}
                          className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                        >
                          Detail
                        </button>
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
              dari <span className="font-semibold">{totalRecords}</span> profil
              dosen
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

      {/* Detail Modal */}
      {detailTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={detailTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-4">
                {detailTarget.photoPath ? (
                  <Image
                    src={detailTarget.photoPath}
                    alt={`Foto ${detailTarget.fullName}`}
                    width={64}
                    height={64}
                    unoptimized
                    className="h-16 w-16 rounded-full border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-base font-bold text-slate-700">
                    {detailTarget.fullName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2
                    id={detailTitleId}
                    className="text-lg font-bold text-slate-900"
                  >
                    {detailTarget.fullName}
                  </h2>
                  <p className="text-sm font-medium text-blue-900">
                    {detailTarget.position}
                  </p>
                  <div className="mt-1">
                    <StatusBadge isPublished={detailTarget.isPublished} />
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailTarget(null)}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                Tutup
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <dt className="text-xs font-semibold text-slate-600 uppercase">
                  NIDN (Publik)
                </dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {detailTarget.nidn ?? "Tidak dicantumkan"}
                </dd>
              </div>

              {canAccessNip && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-xs font-semibold text-slate-600 uppercase">
                    NIP (Internal Admin)
                  </dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {detailTarget.nip ?? "Tidak dicantumkan"}
                  </dd>
                </div>
              )}

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                <dt className="text-xs font-semibold text-slate-600 uppercase">
                  Bidang Keahlian
                </dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {detailTarget.expertise}
                </dd>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                <dt className="text-xs font-semibold text-slate-600 uppercase">
                  Riwayat Pendidikan
                </dt>
                <dd className="mt-1 whitespace-pre-line text-slate-800">
                  {detailTarget.education ?? "Belum ada informasi pendidikan."}
                </dd>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                <dt className="text-xs font-semibold text-slate-600 uppercase">
                  Biografi Akademik
                </dt>
                <dd className="mt-1 whitespace-pre-line text-slate-800">
                  {detailTarget.biography ?? "Belum ada biografi singkat."}
                </dd>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <dt className="text-xs font-semibold text-slate-600 uppercase">
                  Jumlah Publikasi Terkait
                </dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {detailTarget.publicationCount} karya ilmiah
                </dd>
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <dt className="text-xs font-semibold text-slate-600 uppercase">
                  Terakhir Diperbarui
                </dt>
                <dd className="mt-1 text-slate-800">
                  {new Date(detailTarget.updatedAt).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
            </dl>
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
              {editingId ? "Edit Profil Dosen" : "Tambah Profil Dosen Baru"}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {editingId
                ? "Perubahan pada profil dosen yang telah dipublikasikan akan langsung diperbarui."
                : "Profil dosen baru akan disimpan sebagai Draf hingga disetujui oleh ADMIN atau SUPER_ADMIN."}
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
              {/* Profile Photo Upload */}
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <label
                  htmlFor={photoInputId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Foto Profil Dosen (Opsional)
                </label>
                <p className="mt-0.5 text-xs text-slate-600">
                  Format yang diizinkan: JPEG, PNG, atau WebP (maksimal 2 MB).
                  Berkas gambar akan diverifikasi dan diproses ulang secara aman
                  di sisi server.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-4">
                  {photoPath ? (
                    <Image
                      src={photoPath}
                      alt="Pratinjau foto dosen"
                      width={64}
                      height={64}
                      unoptimized
                      className="h-16 w-16 rounded-full border border-slate-300 object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-500">
                      Tanpa Foto
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor={photoInputId}
                      className="inline-flex min-h-[40px] cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                    >
                      {isUploadingPhoto ? "Mengunggah..." : "Pilih Berkas Foto"}
                    </label>
                    <input
                      id={photoInputId}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={isUploadingPhoto}
                      onChange={(e) => void handlePhotoSelected(e)}
                      className="sr-only"
                    />

                    {photoPath && (
                      <button
                        type="button"
                        onClick={() => setPhotoPath(null)}
                        disabled={isUploadingPhoto}
                        className="inline-flex min-h-[40px] items-center rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-100"
                      >
                        Hapus Foto
                      </button>
                    )}
                  </div>
                </div>

                {photoUploadError && (
                  <p
                    role="alert"
                    className="mt-2 text-xs font-medium text-red-800"
                  >
                    {photoUploadError}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor={fullNameId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Nama Lengkap Beserta Gelar Akademik
                </label>
                <input
                  id={fullNameId}
                  type="text"
                  required
                  maxLength={255}
                  placeholder="Contoh: Dr. Ir. Ahmad Fauzi, S.Kom., M.Kom."
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={nidnId}
                    className="block text-sm font-semibold text-slate-800"
                  >
                    NIDN (Ditampilkan di Publik)
                  </label>
                  <input
                    id={nidnId}
                    type="text"
                    maxLength={64}
                    placeholder="Contoh: 0612058501"
                    value={nidn}
                    onChange={(e) => setNidn(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  />
                </div>

                {canAccessNip && (
                  <div>
                    <label
                      htmlFor={nipId}
                      className="block text-sm font-semibold text-slate-800"
                    >
                      NIP / NIK Yayasan (Khusus Admin)
                    </label>
                    <input
                      id={nipId}
                      type="text"
                      maxLength={64}
                      placeholder="Contoh: 2106199001"
                      value={nip}
                      onChange={(e) => setNip(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={positionId}
                    className="block text-sm font-semibold text-slate-800"
                  >
                    Jabatan Akademik / Fungsional
                  </label>
                  <input
                    id={positionId}
                    type="text"
                    required
                    maxLength={255}
                    placeholder="Contoh: Lektor Kepala"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  />
                </div>

                <div>
                  <label
                    htmlFor={expertiseId}
                    className="block text-sm font-semibold text-slate-800"
                  >
                    Bidang Keahlian Utama
                  </label>
                  <input
                    id={expertiseId}
                    type="text"
                    required
                    maxLength={255}
                    placeholder="Contoh: Rekayasa Perangkat Lunak & Kecerdasan Buatan"
                    value={expertise}
                    onChange={(e) => setExpertise(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor={educationId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Riwayat Pendidikan (Opsional)
                </label>
                <textarea
                  id={educationId}
                  rows={2}
                  maxLength={4000}
                  placeholder="Contoh: S1 Teknik Informatika UNISSULA, S2 Ilmu Komputer UGM"
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                />
              </div>

              <div>
                <label
                  htmlFor={biographyId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Biografi Singkat &amp; Fokus Riset (Opsional)
                </label>
                <textarea
                  id={biographyId}
                  rows={3}
                  maxLength={8000}
                  placeholder="Tuliskan deskripsi singkat mengenai fokus riset dan pengajaran dosen..."
                  value={biography}
                  onChange={(e) => setBiography(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  disabled={isMutating}
                  className="inline-flex min-h-[44px] items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isMutating}
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

      {/* Delete Confirmation Dialog with Relationship Protection */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus Profil Dosen"
        description={
          deleteTarget
            ? deleteTarget.publicationCount > 0
              ? `Dosen "${deleteTarget.fullName}" masih tercatat sebagai penulis pada ${deleteTarget.publicationCount} publikasi ilmiah. Lepaskan tautan penulis pada publikasi terkait terlebih dahulu sebelum menghapus profil dosen ini.`
              : `Apakah Anda yakin ingin menghapus profil dosen "${deleteTarget.fullName}" secara permanen? Tindakan ini tidak dapat dibatalkan.`
            : ""
        }
        confirmLabel="Ya, Hapus Profil Dosen"
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
