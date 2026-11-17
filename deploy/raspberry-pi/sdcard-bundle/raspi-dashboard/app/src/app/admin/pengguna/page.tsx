"use client";

import { useEffect, useId, useState } from "react";

import {
  AccessDeniedState,
  EmptyState,
  ErrorState,
  FeedbackBanner,
  LoadingState,
  RoleBadge,
} from "~/components/admin/AdminStates";
import { ConfirmDialog } from "~/components/admin/ConfirmDialog";
import { createUserSchema } from "~/lib/validators";
import { api } from "~/trpc/react";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "EDITOR";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export default function AdminUsersPage() {
  const utils = api.useUtils();
  const meQuery = api.users.me.useQuery();
  const actorRole = meQuery.data?.role;
  const actorId = meQuery.data?.id;
  const isSuperAdmin = actorRole === "SUPER_ADMIN";
  const isAdmin = actorRole === "ADMIN";
  const canAccessUserManagement = isSuperAdmin || isAdmin;

  // Create user modal states
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"SUPER_ADMIN" | "ADMIN" | "EDITOR">(
    "EDITOR",
  );
  const [createError, setCreateError] = useState<string | null>(null);

  // Role change modal state (SUPER_ADMIN only)
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<
    "SUPER_ADMIN" | "ADMIN" | "EDITOR"
  >("EDITOR");
  const [roleError, setRoleError] = useState<string | null>(null);

  // Password reset modal state
  const [passwordTarget, setPasswordTarget] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Activate / Deactivate confirmation dialog state
  const [activeTarget, setActiveTarget] = useState<{
    user: UserRow;
    nextActive: boolean;
  } | null>(null);
  const [activeError, setActiveError] = useState<string | null>(null);

  // Audit log filter (SUPER_ADMIN only)
  const [auditEntityFilter, setAuditEntityFilter] = useState<string>("ALL");

  // Page feedback banner
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const createModalTitleId = useId();
  const nameInputId = useId();
  const emailInputId = useId();
  const passwordInputId = useId();
  const roleSelectId = useId();
  const roleModalTitleId = useId();
  const newRoleSelectId = useId();
  const pwdModalTitleId = useId();
  const newPwdId = useId();
  const confirmPwdId = useId();
  const auditEntityFilterId = useId();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setCreateOpen(false);
        setRoleTarget(null);
        setPasswordTarget(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const usersListQuery = api.users.list.useQuery(
    { limit: 100, offset: 0 },
    { enabled: canAccessUserManagement },
  );

  const auditLogsQuery = api.auditLogs.list.useQuery(
    {
      entityType: auditEntityFilter === "ALL" ? undefined : auditEntityFilter,
      limit: 25,
      offset: 0,
    },
    { enabled: isSuperAdmin },
  );

  const createUserMutation = api.users.create.useMutation({
    onSuccess: async (created) => {
      await Promise.all([
        utils.users.invalidate(),
        isSuperAdmin ? utils.auditLogs.invalidate() : Promise.resolve(),
      ]);
      setCreateOpen(false);
      setFeedback({
        kind: "success",
        message: `Akun pengguna "${created.name}" (${created.role}) berhasil dibuat.`,
      });
    },
    onError: (err) => {
      setCreateError(err.message || "Gagal membuat akun pengguna baru.");
    },
  });

  const changeRoleMutation = api.users.changeRole.useMutation({
    onSuccess: async (updated) => {
      await Promise.all([
        utils.users.invalidate(),
        utils.auditLogs.invalidate(),
      ]);
      setRoleTarget(null);
      setRoleError(null);
      setFeedback({
        kind: "success",
        message: `Peran pengguna "${updated.name}" berhasil diubah menjadi ${updated.role}.`,
      });
    },
    onError: (err) => {
      setRoleError(err.message || "Gagal mengubah peran pengguna.");
    },
  });

  const setActiveMutation = api.users.setActive.useMutation({
    onSuccess: async (updated) => {
      await Promise.all([
        utils.users.invalidate(),
        isSuperAdmin ? utils.auditLogs.invalidate() : Promise.resolve(),
      ]);
      setActiveTarget(null);
      setActiveError(null);
      setFeedback({
        kind: "success",
        message: updated.isActive
          ? `Akun "${updated.name}" telah diaktifkan kembali.`
          : `Akun "${updated.name}" telah dinonaktifkan dan sesi aksesnya dicabut.`,
      });
    },
    onError: (err) => {
      setActiveError(err.message || "Gagal mengubah status aktif akun.");
    },
  });

  const changePasswordMutation = api.users.changePassword.useMutation({
    onSuccess: async () => {
      const targetName = passwordTarget?.name ?? "";
      setPasswordTarget(null);
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError(null);
      if (isSuperAdmin) {
        await utils.auditLogs.invalidate();
      }
      setFeedback({
        kind: "success",
        message: `Kata sandi untuk akun "${targetName}" telah diperbarui.`,
      });
    },
    onError: (err) => {
      setPasswordError(err.message || "Gagal mengatur ulang kata sandi.");
    },
  });

  if (meQuery.isLoading) {
    return <LoadingState message="Memeriksa hak akses manajemen pengguna..." />;
  }

  if (!canAccessUserManagement) {
    return (
      <AccessDeniedState
        title="Akses Manajemen Pengguna Dibatasi"
        description="Peran EDITOR hanya diizinkan mengelola draf konten lulusan, dosen, dan publikasi. Manajemen akun pengguna hanya dapat diakses oleh ADMIN dan SUPER_ADMIN."
      />
    );
  }

  function openCreateModal() {
    setName("");
    setEmail("");
    setPassword("");
    setRole("EDITOR");
    setCreateError(null);
    setCreateOpen(true);
  }

  function handleCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);

    const validation = createUserSchema.safeParse({
      name: name.trim(),
      email: email.trim(),
      password,
      role: isSuperAdmin ? role : "EDITOR",
      isActive: true,
    });

    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      setCreateError(firstIssue?.message ?? "Data formulir tidak valid.");
      return;
    }

    createUserMutation.mutate(validation.data);
  }

  function handleRoleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!roleTarget) return;
    setRoleError(null);

    changeRoleMutation.mutate({
      id: roleTarget.id,
      role: selectedNewRole,
    });
  }

  function handlePasswordResetSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!passwordTarget) return;
    setPasswordError(null);

    if (newPassword.length < 12) {
      setPasswordError("Kata sandi baru wajib minimal 12 karakter.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    changePasswordMutation.mutate({
      id: passwordTarget.id,
      newPassword,
    });
  }

  function canManageTargetUser(target: UserRow): boolean {
    if (isSuperAdmin) return true;
    if (isAdmin && target.role === "EDITOR") return true;
    return false;
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Manajemen Pengguna &amp; Hak Akses
          </h1>
          <p className="mt-1 text-sm text-slate-700">
            {isSuperAdmin
              ? "Anda masuk sebagai SUPER_ADMIN: dapat mengelola seluruh akun pengguna (SUPER_ADMIN, ADMIN, EDITOR) serta memeriksa log audit sistem."
              : "Anda masuk sebagai ADMIN: dapat membuat dan mengelola akun berstatus EDITOR."}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex min-h-[44px] items-center rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
        >
          {isSuperAdmin ? "Tambah Akun Pengguna" : "Tambah Akun EDITOR"}
        </button>
      </div>

      {feedback && (
        <FeedbackBanner
          kind={feedback.kind}
          message={feedback.message}
          onDismiss={() => setFeedback(null)}
        />
      )}

      {/* Users Table */}
      <section aria-labelledby="daftar-pengguna-heading" className="space-y-4">
        <h2
          id="daftar-pengguna-heading"
          className="text-base font-bold text-slate-900"
        >
          Daftar Akun Pengelola Sistem
        </h2>

        {usersListQuery.isLoading ? (
          <LoadingState message="Memuat daftar akun pengguna..." />
        ) : usersListQuery.isError ? (
          <ErrorState
            message={
              usersListQuery.error.message || "Gagal memuat daftar pengguna."
            }
            onRetry={() => void usersListQuery.refetch()}
          />
        ) : !usersListQuery.data || usersListQuery.data.length === 0 ? (
          <EmptyState
            title="Belum Ada Akun Pengguna"
            description="Tambahkan akun pengelola untuk mulai mendelegasikan pengelolaan data laboratorium."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-700 uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Nama Pengguna
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Email Institusi
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Peran (RBAC)
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status Akun
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Terdaftar
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Tindakan
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {usersListQuery.data.map((row) => {
                  const isSelf = row.id === actorId;
                  const manageable = canManageTargetUser(row);

                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {row.name}
                        {isSelf && (
                          <span className="ml-2 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-900">
                            Anda
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {row.email}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <RoleBadge role={row.role} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {row.isActive ? (
                          <span className="inline-flex items-center rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-900">
                            Nonaktif
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                        {new Date(row.createdAt).toLocaleDateString("id-ID", {
                          dateStyle: "medium",
                        })}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {!manageable ? (
                          <span className="text-xs text-slate-500">
                            Wewenang SUPER_ADMIN
                          </span>
                        ) : (
                          <div className="inline-flex flex-wrap items-center justify-end gap-2">
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRoleError(null);
                                  setSelectedNewRole(row.role);
                                  setRoleTarget(row);
                                }}
                                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                              >
                                Ubah Peran
                              </button>
                            )}

                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPasswordError(null);
                                  setNewPassword("");
                                  setConfirmPassword("");
                                  setPasswordTarget(row);
                                }}
                                className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                              >
                                Reset Sandi
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setActiveError(null);
                                setActiveTarget({
                                  user: row,
                                  nextActive: !row.isActive,
                                });
                              }}
                              className={`rounded border px-2.5 py-1.5 text-xs font-semibold ${
                                row.isActive
                                  ? "border-red-300 bg-red-50 text-red-900 hover:bg-red-100"
                                  : "border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100"
                              }`}
                            >
                              {row.isActive ? "Nonaktifkan" : "Aktifkan"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Audit Logs Section (SUPER_ADMIN Only) */}
      {isSuperAdmin && (
        <section
          aria-labelledby="log-audit-heading"
          className="space-y-4 border-t border-slate-200 pt-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2
                id="log-audit-heading"
                className="text-base font-bold text-slate-900"
              >
                Log Audit Keamanan &amp; Aktivitas Sistem
              </h2>
              <p className="text-xs text-slate-600">
                Rekaman jejak perubahan konten, publikasi, dan manajemen hak
                akses (khusus SUPER_ADMIN).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor={auditEntityFilterId}
                className="text-xs font-semibold text-slate-700"
              >
                Filter Entitas:
              </label>
              <select
                id={auditEntityFilterId}
                value={auditEntityFilter}
                onChange={(e) => setAuditEntityFilter(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
              >
                <option value="ALL">Semua Entitas</option>
                <option value="GRADUATE">Lulusan (GRADUATE)</option>
                <option value="LECTURER">Dosen (LECTURER)</option>
                <option value="PUBLICATION">Publikasi (PUBLICATION)</option>
                <option value="USER">Pengguna (USER)</option>
                <option value="AUTH">Otentikasi (AUTH)</option>
              </select>
            </div>
          </div>

          {auditLogsQuery.isLoading ? (
            <LoadingState message="Memuat rekaman log audit..." />
          ) : auditLogsQuery.isError ? (
            <ErrorState
              message={
                auditLogsQuery.error.message || "Gagal memuat log audit."
              }
              onRetry={() => void auditLogsQuery.refetch()}
            />
          ) : !auditLogsQuery.data || auditLogsQuery.data.length === 0 ? (
            <EmptyState
              title="Belum Ada Rekaman Log Audit"
              description="Aktivitas mutasi sistem akan dicatat secara otomatis pada tabel audit_logs."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 font-semibold text-slate-700 uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Waktu
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Aktor Pelaksana
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Aksi
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Entitas &amp; ID Target
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditLogsQuery.data.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                        {new Date(log.createdAt).toLocaleString("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-900">
                          {log.actorName ?? "Sistem / CLI Bootstrap"}
                        </div>
                        {log.actorEmail && (
                          <div className="text-slate-600">{log.actorEmail}</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="inline-flex items-center rounded border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-900">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        <span className="font-semibold">{log.entityType}</span>{" "}
                        <span className="font-mono text-[11px] text-slate-500">
                          ({log.entityId})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Create User Modal */}
      {createOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={createModalTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
            <h2
              id={createModalTitleId}
              className="text-lg font-bold text-slate-900"
            >
              {isSuperAdmin ? "Tambah Akun Pengguna Baru" : "Tambah Akun EDITOR"}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Kata sandi awal wajib minimal 12 karakter dan akan di-hash
              menggunakan Argon2id.
            </p>

            {createError && (
              <div
                role="alert"
                className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-950"
              >
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor={nameInputId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Nama Lengkap Pengguna
                </label>
                <input
                  id={nameInputId}
                  type="text"
                  required
                  maxLength={255}
                  placeholder="Masukkan nama lengkap"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                />
              </div>

              <div>
                <label
                  htmlFor={emailInputId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Alamat Email
                </label>
                <input
                  id={emailInputId}
                  type="email"
                  required
                  maxLength={255}
                  placeholder="nama@unissula.ac.id"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                />
              </div>

              <div>
                <label
                  htmlFor={roleSelectId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Peran Pengguna (RBAC)
                </label>
                {isSuperAdmin ? (
                  <select
                    id={roleSelectId}
                    value={role}
                    onChange={(e) =>
                      setRole(
                        e.target.value as "SUPER_ADMIN" | "ADMIN" | "EDITOR",
                      )
                    }
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                  >
                    <option value="EDITOR">
                      EDITOR (Kelola Draf Konten)
                    </option>
                    <option value="ADMIN">
                      ADMIN (Publikasi Konten &amp; Kelola EDITOR)
                    </option>
                    <option value="SUPER_ADMIN">
                      SUPER_ADMIN (Akses Penuh &amp; Log Audit)
                    </option>
                  </select>
                ) : (
                  <input
                    id={roleSelectId}
                    type="text"
                    disabled
                    value="EDITOR (Kelola Draf Konten)"
                    className="mt-1 block w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700"
                  />
                )}
              </div>

              <div>
                <label
                  htmlFor={passwordInputId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Kata Sandi Awal (Minimal 12 Karakter)
                </label>
                <input
                  id={passwordInputId}
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  disabled={createUserMutation.isPending}
                  className="inline-flex min-h-[44px] items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="inline-flex min-h-[44px] items-center rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-50"
                >
                  {createUserMutation.isPending
                    ? "Menyimpan..."
                    : "Buat Akun Pengguna"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role Change Modal (SUPER_ADMIN Only) */}
      {roleTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={roleModalTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
            <h2
              id={roleModalTitleId}
              className="text-lg font-bold text-slate-900"
            >
              Ubah Peran Pengguna
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Mengubah peran untuk akun{" "}
              <span className="font-semibold text-slate-900">
                {roleTarget.name}
              </span>{" "}
              ({roleTarget.email}). Sistem akan menolak penurunan peran apabila
              akun ini adalah satu-satunya SUPER_ADMIN aktif.
            </p>

            {roleError && (
              <div
                role="alert"
                className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-950"
              >
                {roleError}
              </div>
            )}

            <form onSubmit={handleRoleSubmit} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor={newRoleSelectId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Pilih Peran Baru
                </label>
                <select
                  id={newRoleSelectId}
                  value={selectedNewRole}
                  onChange={(e) =>
                    setSelectedNewRole(
                      e.target.value as "SUPER_ADMIN" | "ADMIN" | "EDITOR",
                    )
                  }
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                >
                  <option value="EDITOR">EDITOR</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setRoleTarget(null);
                    setRoleError(null);
                  }}
                  disabled={changeRoleMutation.isPending}
                  className="inline-flex min-h-[44px] items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={changeRoleMutation.isPending}
                  className="inline-flex min-h-[44px] items-center rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-50"
                >
                  {changeRoleMutation.isPending
                    ? "Menyimpan..."
                    : "Simpan Peran Baru"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {passwordTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={pwdModalTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
            <h2
              id={pwdModalTitleId}
              className="text-lg font-bold text-slate-900"
            >
              Reset Kata Sandi Pengguna
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Tetapkan kata sandi baru minimal 12 karakter untuk akun{" "}
              <span className="font-semibold text-slate-900">
                {passwordTarget.name}
              </span>{" "}
              ({passwordTarget.email}).
            </p>

            {passwordError && (
              <div
                role="alert"
                className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-950"
              >
                {passwordError}
              </div>
            )}

            <form
              onSubmit={handlePasswordResetSubmit}
              className="mt-4 space-y-4"
            >
              <div>
                <label
                  htmlFor={newPwdId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Kata Sandi Baru
                </label>
                <input
                  id={newPwdId}
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                />
              </div>

              <div>
                <label
                  htmlFor={confirmPwdId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Konfirmasi Kata Sandi Baru
                </label>
                <input
                  id={confirmPwdId}
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPasswordTarget(null);
                    setPasswordError(null);
                  }}
                  disabled={changePasswordMutation.isPending}
                  className="inline-flex min-h-[44px] items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={changePasswordMutation.isPending}
                  className="inline-flex min-h-[44px] items-center rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-50"
                >
                  {changePasswordMutation.isPending
                    ? "Menyimpan..."
                    : "Simpan Kata Sandi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Activate / Deactivate Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(activeTarget)}
        title={
          activeTarget?.nextActive
            ? "Aktifkan Kembali Akun Pengguna"
            : "Nonaktifkan Akun Pengguna"
        }
        description={
          activeTarget
            ? activeTarget.nextActive
              ? `Apakah Anda yakin ingin mengaktifkan kembali akun "${activeTarget.user.name}" (${activeTarget.user.email})?`
              : `Apakah Anda yakin ingin menonaktifkan akun "${activeTarget.user.name}" (${activeTarget.user.email})? Pengguna yang dinonaktifkan akan langsung kehilangan akses ke panel admin.`
            : ""
        }
        confirmLabel={
          activeTarget?.nextActive
            ? "Ya, Aktifkan Akun"
            : "Ya, Nonaktifkan Akun"
        }
        variant={activeTarget?.nextActive ? "primary" : "danger"}
        isPending={setActiveMutation.isPending}
        errorMessage={activeError}
        onCancel={() => {
          setActiveTarget(null);
          setActiveError(null);
        }}
        onConfirm={() => {
          if (activeTarget) {
            setActiveMutation.mutate({
              id: activeTarget.user.id,
              isActive: activeTarget.nextActive,
            });
          }
        }}
      />
    </div>
  );
}
