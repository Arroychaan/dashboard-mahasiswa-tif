"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { loginAdminAction } from "~/app/admin/actions";

export function AdminLoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const emailId = useId();
  const passwordId = useId();
  const mfaId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await loginAdminAction({
        email: email.trim(),
        password,
        mfaCode: mfaCode.trim() ? mfaCode.trim() : undefined,
      });

      if (!result.ok) {
        setErrorMessage(
          result.message ??
            "Email, kata sandi, atau kode verifikasi tidak valid.",
        );
        return;
      }

      queryClient.clear();
      router.replace("/admin");
      router.refresh();
    } catch {
      setErrorMessage("Terjadi gangguan saat memproses otentikasi.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-between bg-slate-100 px-4 py-10 text-slate-900">
      <header className="mx-auto w-full max-w-md text-center">
        <p className="text-xs font-semibold tracking-wider text-blue-900 uppercase">
          Universitas Islam Sultan Agung (UNISSULA)
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          Panel Administrasi Program Studi Teknik Informatika
        </h1>
        <p className="mt-1 text-sm text-slate-700">
          Program Studi Teknik Informatika
        </p>
      </header>

      <main className="mx-auto my-8 w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold text-slate-900">
          Masuk ke Sistem Manajemen
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Gunakan akun resmi yang terdaftar. Akun dengan peran SUPER_ADMIN wajib
          menyertakan kode verifikasi TOTP MFA 6 digit atau kode pemulihan.
        </p>

        {errorMessage && (
          <div
            role="alert"
            className="mt-4 rounded-md border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-950"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
          <div>
            <label
              htmlFor={emailId}
              className="block text-sm font-semibold text-slate-800"
            >
              Alamat Email Resmi
            </label>
            <input
              id={emailId}
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="nama@unissula.ac.id"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
            />
          </div>

          <div>
            <label
              htmlFor={passwordId}
              className="block text-sm font-semibold text-slate-800"
            >
              Kata Sandi
            </label>
            <input
              id={passwordId}
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Masukkan kata sandi"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
            />
          </div>

          <div>
            <label
              htmlFor={mfaId}
              className="block text-sm font-semibold text-slate-800"
            >
              Kode TOTP MFA / Kode Pemulihan (Wajib bagi SUPER_ADMIN)
            </label>
            <input
              id={mfaId}
              name="mfaCode"
              type="text"
              inputMode="text"
              autoComplete="one-time-code"
              placeholder="6 digit TOTP atau XXXX-XXXX"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              disabled={isSubmitting}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-800"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !email.trim() || !password}
              className="flex min-h-[44px] w-full items-center justify-center rounded-md bg-blue-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 disabled:opacity-50"
            >
              {isSubmitting
                ? "Memverifikasi Kredensial..."
                : "Masuk ke Panel Admin"}
            </button>
          </div>
        </form>

        <div className="mt-6 border-t border-slate-200 pt-4 text-center">
          <Link
            href="/"
            className="text-xs font-semibold text-blue-800 underline hover:no-underline"
          >
            Kembali ke Dashboard Monitoring Publik
          </Link>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-md text-center text-xs text-slate-600">
        <span>
          Akses terbatas untuk personel terotentikasi Program Studi Teknik Informatika
          UNISSULA.
        </span>
      </footer>
    </div>
  );
}

