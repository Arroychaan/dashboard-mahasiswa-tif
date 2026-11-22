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
import { DAY_LABELS } from "~/components/public/course-schedule-utils";
import {
  COURSE_DAYS,
  COURSE_ROOMS,
  createCourseScheduleSchema,
  updateCourseScheduleSchema,
  type DayOfWeekType,
} from "~/lib/validators";
import { api } from "~/trpc/react";

const PAGE_SIZE = 15;

interface CourseScheduleRow {
  id: string;
  dayOfWeek: DayOfWeekType;
  startTime: string;
  endTime: string;
  courseName: string;
  className: string;
  roomName: string;
  lecturerName: string;
  semester: number | null;
  academicYear: string | null;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export default function AdminCourseSchedulesPage() {
  const utils = api.useUtils();
  const meQuery = api.users.me.useQuery();
  const canPublishOrDelete =
    meQuery.data?.role === "ADMIN" || meQuery.data?.role === "SUPER_ADMIN";

  // Search, filter & pagination state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dayFilter, setDayFilter] = useState<"ALL" | DayOfWeekType>("ALL");
  const [roomFilter, setRoomFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "PUBLISHED" | "DRAFT"
  >("ALL");
  const [pageIndex, setPageIndex] = useState(0);

  // Create / Edit modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeekType>("SENIN");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:30");
  const [courseName, setCourseName] = useState("");
  const [className, setClassName] = useState("A");
  const [roomName, setRoomName] = useState<string>(COURSE_ROOMS[0]);
  const [lecturerName, setLecturerName] = useState("");
  const [semesterStr, setSemesterStr] = useState("");
  const [academicYear, setAcademicYear] = useState("2026/2027");
  const [isPublished, setIsPublished] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<CourseScheduleRow | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Feedback banner
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const searchInputId = useId();
  const dayFilterId = useId();
  const roomFilterId = useId();
  const statusFilterId = useId();
  const modalTitleId = useId();
  const fieldCourseId = useId();
  const fieldClassId = useId();
  const fieldDayId = useId();
  const fieldRoomId = useId();
  const fieldRoomDatalistId = useId();
  const fieldStartId = useId();
  const fieldEndId = useId();
  const fieldLecturerId = useId();
  const fieldSemesterId = useId();
  const fieldAcademicYearId = useId();
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
  }, [dayFilter, roomFilter, statusFilter]);

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

  const filterParams = {
    search: debouncedSearch || undefined,
    dayOfWeek: dayFilter === "ALL" ? undefined : dayFilter,
    roomName: roomFilter === "ALL" ? undefined : roomFilter,
    isPublished:
      statusFilter === "PUBLISHED"
        ? true
        : statusFilter === "DRAFT"
          ? false
          : undefined,
  };

  const listQuery = api.courseSchedules.list.useQuery({
    ...filterParams,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  });

  const countQuery = api.courseSchedules.count.useQuery(filterParams);
  const totalAllCountQuery = api.courseSchedules.count.useQuery(undefined);

  async function invalidateSchedules() {
    await Promise.all([
      utils.courseSchedules.invalidate(),
      utils.publicDashboard.courseSchedules.invalidate(),
      utils.publicDashboard.overview.invalidate(),
    ]);
  }

  const createMutation = api.courseSchedules.create.useMutation({
    onSuccess: async (created) => {
      await invalidateSchedules();
      setFormOpen(false);
      setEditingId(null);
      setFeedback({
        kind: "success",
        message: `Jadwal "${created.courseName} (Kelas ${created.className})" berhasil ditambahkan${
          created.isPublished ? " dan dipublikasikan" : " sebagai Draf"
        }.`,
      });
    },
    onError: (err) => {
      setFormError(err.message || "Gagal menambahkan jadwal mata kuliah.");
    },
  });

  const updateMutation = api.courseSchedules.update.useMutation({
    onSuccess: async (updated) => {
      await invalidateSchedules();
      setFormOpen(false);
      setEditingId(null);
      setFeedback({
        kind: "success",
        message: `Jadwal "${updated.courseName} (Kelas ${updated.className})" berhasil diperbarui.`,
      });
    },
    onError: (err) => {
      setFormError(err.message || "Gagal memperbarui jadwal mata kuliah.");
    },
  });

  const setPublishedMutation = api.courseSchedules.setPublished.useMutation({
    onSuccess: async (updated) => {
      await invalidateSchedules();
      setFeedback({
        kind: "success",
        message: `Status publikasi "${updated.courseName}" diubah menjadi ${
          updated.isPublished ? "Terpublikasi" : "Draf"
        }.`,
      });
    },
    onError: (err) => {
      setFeedback({
        kind: "error",
        message: err.message || "Gagal mengubah status publikasi jadwal.",
      });
    },
  });

  const deleteMutation = api.courseSchedules.delete.useMutation({
    onSuccess: async () => {
      await invalidateSchedules();
      setDeleteTarget(null);
      setDeleteError(null);
      setFeedback({
        kind: "success",
        message: "Jadwal mata kuliah berhasil dihapus.",
      });
    },
    onError: (err) => {
      setDeleteError(err.message || "Gagal menghapus jadwal mata kuliah.");
    },
  });

  const seedDummyMutation = api.courseSchedules.seedDummy.useMutation({
    onSuccess: async (res) => {
      await invalidateSchedules();
      setFeedback({
        kind: "success",
        message: res.skipped
          ? "Tabel jadwal sudah berisi data, muat data dummy dilewati."
          : `${res.insertedCount} jadwal mata kuliah dummy berhasil dimuat dan diterbitkan.`,
      });
    },
    onError: (err) => {
      setFeedback({
        kind: "error",
        message: err.message || "Gagal memuat data jadwal dummy.",
      });
    },
  });

  function openCreateModal() {
    setEditingId(null);
    setDayOfWeek("SENIN");
    setStartTime("08:00");
    setEndTime("09:30");
    setCourseName("");
    setClassName("A");
    setRoomName(COURSE_ROOMS[0]);
    setLecturerName("");
    setSemesterStr("");
    setAcademicYear("2026/2027");
    setIsPublished(false);
    setFormError(null);
    setFormOpen(true);
  }

  function openEditModal(row: CourseScheduleRow) {
    setEditingId(row.id);
    setDayOfWeek(row.dayOfWeek);
    setStartTime(row.startTime);
    setEndTime(row.endTime);
    setCourseName(row.courseName);
    setClassName(row.className);
    setRoomName(row.roomName);
    setLecturerName(row.lecturerName);
    setSemesterStr(row.semester !== null ? String(row.semester) : "");
    setAcademicYear(row.academicYear ?? "");
    setIsPublished(row.isPublished);
    setFormError(null);
    setFormOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const parsedSemester =
      semesterStr.trim() === "" ? null : Number(semesterStr.trim());
    if (
      parsedSemester !== null &&
      (Number.isNaN(parsedSemester) ||
        !Number.isInteger(parsedSemester) ||
        parsedSemester < 1 ||
        parsedSemester > 8)
    ) {
      setFormError("Semester harus berupa angka bulat antara 1 sampai 8.");
      return;
    }

    const basePayload = {
      dayOfWeek,
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      courseName: courseName.trim(),
      className: className.trim(),
      roomName: roomName.trim(),
      lecturerName: lecturerName.trim(),
      semester: parsedSemester,
      academicYear: academicYear.trim() || null,
    };

    if (editingId) {
      const parsed = updateCourseScheduleSchema.safeParse({
        id: editingId,
        ...basePayload,
      });
      if (!parsed.success) {
        setFormError(parsed.error.errors[0]?.message ?? "Validasi data gagal.");
        return;
      }
      updateMutation.mutate(parsed.data);
    } else {
      const parsed = createCourseScheduleSchema.safeParse({
        ...basePayload,
        isPublished: canPublishOrDelete ? isPublished : false,
      });
      if (!parsed.success) {
        setFormError(parsed.error.errors[0]?.message ?? "Validasi data gagal.");
        return;
      }
      createMutation.mutate(parsed.data);
    }
  }

  const items = (listQuery.data ?? []) as CourseScheduleRow[];
  const totalCount = countQuery.data?.total ?? 0;
  const totalAllCount = totalAllCountQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasFilters =
    debouncedSearch.length > 0 ||
    dayFilter !== "ALL" ||
    roomFilter !== "ALL" ||
    statusFilter !== "ALL";

  const isMutating =
    createMutation.isPending ||
    updateMutation.isPending ||
    setPublishedMutation.isPending ||
    deleteMutation.isPending ||
    seedDummyMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Manajemen Jadwal Mata Kuliah
          </h1>
          <p className="mt-1 text-sm text-slate-700">
            Kelola jadwal perkuliahan harian Program Studi Teknik Informatika
            (08:00–17:00 WIB, ruangan R106–R308) untuk Slide 7 layar kiosk.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {canPublishOrDelete && totalAllCount === 0 && (
            <button
              type="button"
              disabled={isMutating}
              onClick={() => seedDummyMutation.mutate()}
              className="inline-flex min-h-[44px] items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
            >
              {seedDummyMutation.isPending
                ? "Memuat Dummy..."
                : "Muat 5 Data Dummy"}
            </button>
          )}
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex min-h-[44px] items-center rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
          >
            + Tambah Jadwal
          </button>
        </div>
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
        aria-label="Filter dan Pencarian Jadwal Mata Kuliah"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label
              htmlFor={searchInputId}
              className="block text-xs font-semibold text-slate-700"
            >
              Cari Mata Kuliah / Dosen / Ruang
            </label>
            <input
              id={searchInputId}
              type="search"
              placeholder="Contoh: Kecerdasan Buatan..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
            />
          </div>

          <div>
            <label
              htmlFor={dayFilterId}
              className="block text-xs font-semibold text-slate-700"
            >
              Filter Hari
            </label>
            <select
              id={dayFilterId}
              value={dayFilter}
              onChange={(e) =>
                setDayFilter(e.target.value as "ALL" | DayOfWeekType)
              }
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
            >
              <option value="ALL">Semua Hari</option>
              {COURSE_DAYS.map((day) => (
                <option key={day} value={day}>
                  {DAY_LABELS[day]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={roomFilterId}
              className="block text-xs font-semibold text-slate-700"
            >
              Filter Ruangan
            </label>
            <select
              id={roomFilterId}
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
            >
              <option value="ALL">Semua Ruangan</option>
              {COURSE_ROOMS.map((room) => (
                <option key={room} value={room}>
                  {room}
                </option>
              ))}
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
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as "ALL" | "PUBLISHED" | "DRAFT",
                )
              }
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
            >
              <option value="ALL">Semua Status</option>
              <option value="PUBLISHED">Terpublikasi</option>
              <option value="DRAFT">Draf</option>
            </select>
          </div>
        </div>
      </section>

      {/* Schedule Table */}
      {listQuery.isLoading ? (
        <LoadingState message="Memuat daftar jadwal mata kuliah..." />
      ) : listQuery.isError ? (
        <ErrorState
          message={
            listQuery.error.message || "Gagal memuat data jadwal mata kuliah."
          }
          onRetry={() => void listQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={
            hasFilters
              ? "Tidak Ada Jadwal yang Cocok"
              : "Belum Ada Jadwal Mata Kuliah"
          }
          description={
            hasFilters
              ? "Ubah kata kunci pencarian atau sesuaikan filter hari, ruangan, dan status."
              : "Tambahkan jadwal kuliah pertama atau muat 5 data dummy awal untuk mulai menampilkan Slide 7 pada layar kiosk."
          }
          actionLabel="+ Tambah Jadwal"
          onAction={openCreateModal}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-700">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Hari &amp; Jam WIB
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Mata Kuliah &amp; Kelas
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Ruangan
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Dosen Pengampu
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Sem / TA
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {items.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="font-bold text-slate-900">
                        {DAY_LABELS[row.dayOfWeek]}
                      </div>
                      <div className="font-mono text-xs text-slate-600">
                        {row.startTime} – {row.endTime} WIB
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">
                        {row.courseName}
                      </div>
                      <div className="mt-0.5 text-xs font-medium text-slate-600">
                        Kelas {row.className}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="inline-flex rounded border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-900">
                        {row.roomName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {row.lecturerName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-700">
                      <div>
                        {row.semester !== null
                          ? `Semester ${row.semester}`
                          : "—"}
                      </div>
                      {row.academicYear && (
                        <div className="text-slate-500">{row.academicYear}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge isPublished={row.isPublished} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          className="inline-flex min-h-[36px] items-center rounded border border-slate-300 bg-white px-2.5 py-1 text-slate-800 hover:bg-slate-100"
                        >
                          Ubah
                        </button>
                        {canPublishOrDelete && (
                          <>
                            <button
                              type="button"
                              disabled={isMutating}
                              onClick={() =>
                                setPublishedMutation.mutate({
                                  id: row.id,
                                  isPublished: !row.isPublished,
                                })
                              }
                              className={`inline-flex min-h-[36px] items-center rounded border px-2.5 py-1 disabled:opacity-50 ${
                                row.isPublished
                                  ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                                  : "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                              }`}
                            >
                              {row.isPublished
                                ? "Jadikan Draf"
                                : "Publikasikan"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError(null);
                                setDeleteTarget(row);
                              }}
                              className="inline-flex min-h-[36px] items-center rounded border border-red-300 bg-red-50 px-2.5 py-1 text-red-900 hover:bg-red-100"
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-700">
              <span>
                Halaman <strong>{pageIndex + 1}</strong> dari{" "}
                <strong>{totalPages}</strong> ({totalCount} jadwal)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pageIndex === 0}
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                  className="inline-flex min-h-[40px] items-center rounded border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  disabled={pageIndex + 1 >= totalPages}
                  onClick={() =>
                    setPageIndex((p) => Math.min(totalPages - 1, p + 1))
                  }
                  className="inline-flex min-h-[40px] items-center rounded border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
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
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2
                id={modalTitleId}
                className="text-lg font-bold text-slate-900"
              >
                {editingId
                  ? "Ubah Jadwal Mata Kuliah"
                  : "Tambah Jadwal Mata Kuliah"}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-md px-2.5 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                Tutup
              </button>
            </div>

            {formError && (
              <div className="mt-4">
                <FeedbackBanner kind="error" message={formError} />
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor={fieldCourseId}
                    className="block text-xs font-semibold text-slate-800"
                  >
                    Nama Mata Kuliah <span className="text-red-600">*</span>
                  </label>
                  <input
                    id={fieldCourseId}
                    type="text"
                    required
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="Contoh: Kecerdasan Buatan"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  />
                </div>

                <div>
                  <label
                    htmlFor={fieldClassId}
                    className="block text-xs font-semibold text-slate-800"
                  >
                    Kelas <span className="text-red-600">*</span>
                  </label>
                  <input
                    id={fieldClassId}
                    type="text"
                    required
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    placeholder="A / B / Reguler"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={fieldDayId}
                    className="block text-xs font-semibold text-slate-800"
                  >
                    Hari Perkuliahan <span className="text-red-600">*</span>
                  </label>
                  <select
                    id={fieldDayId}
                    value={dayOfWeek}
                    onChange={(e) =>
                      setDayOfWeek(e.target.value as DayOfWeekType)
                    }
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  >
                    {COURSE_DAYS.map((day) => (
                      <option key={day} value={day}>
                        {DAY_LABELS[day]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={fieldRoomId}
                    className="block text-xs font-semibold text-slate-800"
                  >
                    Ruangan <span className="text-red-600">*</span>
                  </label>
                  <input
                    id={fieldRoomId}
                    list={fieldRoomDatalistId}
                    type="text"
                    required
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="R108"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  />
                  <datalist id={fieldRoomDatalistId}>
                    {COURSE_ROOMS.map((room) => (
                      <option key={room} value={room} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={fieldStartId}
                    className="block text-xs font-semibold text-slate-800"
                  >
                    Jam Mulai (WIB) <span className="text-red-600">*</span>
                  </label>
                  <input
                    id={fieldStartId}
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  />
                </div>

                <div>
                  <label
                    htmlFor={fieldEndId}
                    className="block text-xs font-semibold text-slate-800"
                  >
                    Jam Selesai (WIB) <span className="text-red-600">*</span>
                  </label>
                  <input
                    id={fieldEndId}
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor={fieldLecturerId}
                  className="block text-xs font-semibold text-slate-800"
                >
                  Dosen Pengampu <span className="text-red-600">*</span>
                </label>
                <input
                  id={fieldLecturerId}
                  type="text"
                  required
                  value={lecturerName}
                  onChange={(e) => setLecturerName(e.target.value)}
                  placeholder="Nama lengkap & gelar dosen pengampu"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={fieldSemesterId}
                    className="block text-xs font-semibold text-slate-800"
                  >
                    Semester (1–8, Opsional)
                  </label>
                  <input
                    id={fieldSemesterId}
                    type="number"
                    min={1}
                    max={8}
                    value={semesterStr}
                    onChange={(e) => setSemesterStr(e.target.value)}
                    placeholder="Contoh: 5"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  />
                </div>

                <div>
                  <label
                    htmlFor={fieldAcademicYearId}
                    className="block text-xs font-semibold text-slate-800"
                  >
                    Tahun Ajaran (Opsional)
                  </label>
                  <input
                    id={fieldAcademicYearId}
                    type="text"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    placeholder="2026/2027"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  />
                </div>
              </div>

              {!editingId && canPublishOrDelete && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    id={fieldPublishId}
                    type="checkbox"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-800 focus:ring-blue-800"
                  />
                  <label
                    htmlFor={fieldPublishId}
                    className="text-xs font-medium text-slate-800"
                  >
                    Langsung publikasikan ke Slide 7 layar kiosk program studi
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
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
                      : "Simpan Jadwal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="Hapus Jadwal Mata Kuliah"
          description={`Apakah Anda yakin ingin menghapus jadwal "${deleteTarget.courseName} (Kelas ${deleteTarget.className}, ${DAY_LABELS[deleteTarget.dayOfWeek]} ${deleteTarget.startTime}–${deleteTarget.endTime})"?`}
          confirmLabel={
            deleteMutation.isPending ? "Menghapus..." : "Ya, Hapus Jadwal"
          }
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
