import fs from "node:fs";
import path from "node:path";

import { bootstrapInitialSuperAdmin } from "~/server/auth/bootstrap";
import { db } from "~/server/db";

/**
 * One-time CLI bootstrap script for provisioning the initial SUPER_ADMIN account.
 *
 * Required runtime environment variables (never hardcoded):
 * - BOOTSTRAP_ADMIN_NAME
 * - BOOTSTRAP_ADMIN_EMAIL
 * - BOOTSTRAP_ADMIN_PASSWORD (min 12 chars)
 *
 * Optional:
 * - BOOTSTRAP_ADMIN_TOTP_SECRET (Base32 TOTP secret provided by operator at execution time)
 * - BOOTSTRAP_MFA_OUTPUT_FILE (Path to write one-time MFA enrollment bundle with 0600 permissions;
 *   secrets are NEVER printed to stdout/stderr logs)
 */
async function main() {
  const name =
    process.env.BOOTSTRAP_SUPER_ADMIN_NAME ?? process.env.BOOTSTRAP_ADMIN_NAME;
  const email =
    process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL ?? process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password =
    process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD ??
    process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const totpSecretBase32 =
    process.env.BOOTSTRAP_SUPER_ADMIN_TOTP_SECRET ??
    process.env.BOOTSTRAP_ADMIN_TOTP_SECRET;
  const mfaOutputFile =
    process.env.BOOTSTRAP_MFA_OUTPUT_FILE ?? "superadmin-mfa.json";

  if (!name || !email || !password) {
    console.error(
      "Bootstrap dibatalkan: Variabel lingkungan BOOTSTRAP_SUPER_ADMIN_NAME (atau BOOTSTRAP_ADMIN_NAME), BOOTSTRAP_SUPER_ADMIN_EMAIL, dan BOOTSTRAP_SUPER_ADMIN_PASSWORD wajib diberikan saat eksekusi.",
    );
    process.exit(1);
  }

  try {
    const result = await bootstrapInitialSuperAdmin(db, {
      name,
      email,
      password,
      totpSecretBase32,
    });

    if (mfaOutputFile) {
      const resolvedPath = path.resolve(mfaOutputFile);
      fs.writeFileSync(
        resolvedPath,
        JSON.stringify(
          {
            userId: result.user.id,
            email: result.user.email,
            otpauthUri: result.mfaEnrollment.otpauthUri,
            totpSecretBase32: result.mfaEnrollment.secretBase32,
            recoveryCodes: result.mfaEnrollment.recoveryCodes,
          },
          null,
          2,
        ),
        { encoding: "utf8", mode: 0o600 },
      );
    }

    console.info(
      `Bootstrap berhasil: Akun SUPER_ADMIN (${result.user.id}) telah dibuat dengan MFA aktif.`,
    );
    if (mfaOutputFile) {
      console.info(
        `Kredensial & Recovery Codes MFA disimpan di: ${path.resolve(mfaOutputFile)}`,
      );
    }
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kesalahan tidak diketahui";
    console.error(`Bootstrap gagal: ${message}`);
    process.exit(1);
  }
}

void main();

