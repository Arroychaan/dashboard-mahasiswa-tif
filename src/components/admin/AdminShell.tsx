"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { logoutAdminAction } from "~/app/admin/actions";
import {
  FeedbackBanner,
  LoadingState,
  RoleBadge,
} from "~/components/admin/AdminStates";
import { type UserDTO } from "~/lib/validators";
import { type UserRole } from "~/server/db/schema";
import { api } from "~/trpc/react";

interface NavItem {
  href: string;
  label: string;
  description: string;
  minRoles: readonly UserRole[];
}

const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/admin",
    label: "Ringkasan Sistem",
    description: "Statistik draf dan terpublikasi",
    minRoles: ["EDITOR", "ADMIN", "SUPER_ADMIN"],
  },
  {
    href: "/admin/mahasiswa",
    label: "Data Lulusan",
    description: "Manajemen angkatan dan kelulusan",
    minRoles: ["EDITOR", "ADMIN", "SUPER_ADMIN"],
  },
  {
    href: "/admin/dosen",
    label: "Data Dosen",
    description: "Profil, jabatan, keahlian, dan foto",
    minRoles: ["EDITOR", "ADMIN", "SUPER_ADMIN"],
  },
  {
    href: "/admin/publikasi",
    label: "Publikasi Ilmiah",
    description: "Jurnal, artikel, dan relasi penulis",
    minRoles: ["EDITOR", "ADMIN", "SUPER_ADMIN"],
  },
  {
    href: "/admin/pengumuman",
    label: "Pengumuman",
    description: "Pengumuman & Berita Acara",
    minRoles: ["EDITOR", "ADMIN", "SUPER_ADMIN"],
  },
  {
    href: "/admin/pengguna",
    label: "Pengguna & Audit",
    description: "Hak akses akun dan riwayat perubahan",
    minRoles: ["ADMIN", "SUPER_ADMIN"],
  },
  {
    href: "/admin/pengaturan",
    label: "Pengaturan Display",
    description: "Tema tampilan layar program studi",
    minRoles: ["ADMIN", "SUPER_ADMIN"],
  },
] as const;

export function AdminShell({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser?: UserDTO;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname === "/admin/login";

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordFeedback, setPasswordFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const pwdModalTitleId = useId();
  const currentPwdId = useId();
  const newPwdId = useId();
  const confirmPwdId = useId();

  const meQuery = api.users.me.useQuery(undefined, {
    enabled: !isLoginRoute,
    initialData: initialUser,
    retry: false,
    staleTime: 30_000,
  });

  const changePasswordMutation = api.users.changePassword.useMutation({
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordFeedback({
        kind: "success",
        message:
          "Kata sandi berhasil diperbarui. Silakan masuk kembali dengan kata sandi baru.",
      });
      setTimeout(() => {
        setPasswordModalOpen(false);
        router.replace("/admin/login");
      }, 1500);
    },
    onError: (err) => {
      setPasswordFeedback({
        kind: "error",
        message: err.message || "Gagal mengubah kata sandi.",
      });
    },
  });

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isLoginRoute && meQuery.isError) {
      router.replace("/admin/login");
    }
  }, [isLoginRoute, meQuery.isError, router]);

  useEffect(() => {
    if (!passwordModalOpen && !mobileMenuOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPasswordModalOpen(false);
        setMobileMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [passwordModalOpen, mobileMenuOpen]);

  if (isLoginRoute) {
    return <>{children}</>;
  }

  if (meQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <LoadingState message="Memverifikasi sesi dan hak akses administrator..." />
      </div>
    );
  }

  if (meQuery.isError || !meQuery.data) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16">
        <div
          role="alert"
          className="rounded-lg border border-slate-200 bg-white p-8 text-center"
        >
          <h1 className="text-lg font-bold text-slate-900">
            Sesi Administrasi Diperlukan
          </h1>
          <p className="mt-2 text-sm text-slate-700">
            Silakan masuk melalui halaman otentikasi administrator untuk
            melanjutkan.
          </p>
          <div className="mt-5">
            <Link
              href="/admin/login"
              className="inline-flex min-h-[44px] items-center rounded-md bg-blue-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
            >
              Ke Halaman Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentUser = meQuery.data;
  const visibleNavItems = NAV_ITEMS.filter((item) =>
    item.minRoles.includes(currentUser.role),
  );

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordFeedback(null);

    if (newPassword.length < 8) {
      setPasswordFeedback({
        kind: "error",
        message: "Kata sandi baru minimal 8 karakter.",
      });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordFeedback({
        kind: "error",
        message: "Konfirmasi kata sandi baru tidak cocok.",
      });
      return;
    }

    changePasswordMutation.mutate({
      id: currentUser.id,
      currentPassword,
      newPassword,
    });
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logoutAdminAction();
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 lg:flex-row">
      {/* Desktop Sidebar */}
      <aside
        aria-label="Menu Samping Administrasi"
        className="hidden w-72 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex"
      >
        <div className="border-b border-slate-200 bg-blue-900 px-6 py-5 text-white">
          <p className="text-xs font-semibold tracking-wider text-blue-100 uppercase">
            UNISSULA &bull; Teknik Informatika
          </p>
          <p className="mt-1 text-base font-bold text-white">
            Monitoring Program Studi Teknik Informatika
          </p>
        </div>

        <nav aria-label="Navigasi Utama Admin" className="flex-1 space-y-1 p-4">
          {visibleNavItems.map((item) => {
            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`block rounded-md px-3.5 py-2.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 ${
                  isActive
                    ? "bg-blue-800 text-white"
                    : "text-slate-800 hover:bg-slate-100"
                }`}
              >
                <div className="text-sm font-semibold">{item.label}</div>
                <div
                  className={`mt-0.5 text-xs ${
                    isActive ? "text-blue-100" : "text-slate-600"
                  }`}
                >
                  {item.description}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <Link
            href="/"
            className="flex min-h-[40px] items-center justify-center rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
          >
            Lihat Dashboard Publik
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Header */}
        <header className="border-b border-slate-200 bg-white px-4 py-3.5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-expanded={mobileMenuOpen}
                aria-label="Buka atau tutup menu navigasi"
                className="inline-flex min-h-[44px] items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 lg:hidden"
              >
                Menu
              </button>
              <div>
                <p className="text-xs font-medium text-slate-600">
                  Sistem Informasi Monitoring Program Studi
                </p>
                <p className="text-sm font-bold text-slate-900">
                  Panel Administrasi Resmi
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5">
                <div className="text-right">
                  <div className="text-xs font-semibold text-slate-900">
                    {currentUser.name}
                  </div>
                  <div className="text-xs text-slate-600">
                    {currentUser.email}
                  </div>
                </div>
                <RoleBadge role={currentUser.role} />
                {currentUser.mfaEnabled && (
                  <span className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-900">
                    MFA
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setPasswordFeedback(null);
                  setPasswordModalOpen(true);
                }}
                className="inline-flex min-h-[40px] items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
              >
                Ubah Kata Sandi
              </button>

              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={isLoggingOut}
                className="inline-flex min-h-[40px] items-center rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 disabled:opacity-50"
              >
                {isLoggingOut ? "Keluar..." : "Keluar"}
              </button>
            </div>
          </div>

          {/* Mobile/Tablet Navigation Drawer */}
          {mobileMenuOpen && (
            <nav
              aria-label="Navigasi Seluler Admin"
              className="mt-3 space-y-1 border-t border-slate-200 pt-3 lg:hidden"
            >
              {visibleNavItems.map((item) => {
                const isActive =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-md px-3 py-2 text-sm font-semibold ${
                      isActive
                        ? "bg-blue-800 text-white"
                        : "text-slate-800 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <Link
                href="/"
                className="block rounded-md px-3 py-2 text-sm font-medium text-blue-800 hover:bg-slate-100"
              >
                Lihat Dashboard Publik
              </Link>
            </nav>
          )}
        </header>

        {/* Page Main Content */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white px-6 py-3 text-xs text-slate-600">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <span>
              Program Studi Teknik Informatika, Universitas Islam Sultan Agung
              (UNISSULA)
            </span>
            <span>
              Semua perubahan data terpublikasi tercatat dalam audit log
            </span>
          </div>
        </footer>
      </div>

      {/* Self Password Change Modal */}
      {passwordModalOpen && (
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
              Ubah Kata Sandi Akun
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Mengubah kata sandi akan memperbarui versi sesi dan meminta Anda
              masuk kembali.
            </p>

            {passwordFeedback && (
              <div className="mt-3">
                <FeedbackBanner
                  kind={passwordFeedback.kind}
                  message={passwordFeedback.message}
                />
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor={currentPwdId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Kata Sandi Saat Ini
                </label>
                <input
                  id={currentPwdId}
                  type="password"
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                />
              </div>

              <div>
                <label
                  htmlFor={newPwdId}
                  className="block text-sm font-semibold text-slate-800"
                >
                  Kata Sandi Baru (Minimal 8 Karakter)
                </label>
                <input
                  id={newPwdId}
                  type="password"
                  required
                  minLength={8}
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
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
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
    </div>
  );
}

