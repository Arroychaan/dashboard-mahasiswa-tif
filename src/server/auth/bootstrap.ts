import { eq, or } from "drizzle-orm";
import { z } from "zod";

import { type db as defaultDb } from "~/server/db";
import { users } from "~/server/db/schema";
import { writeAuditLog } from "~/server/security/audit";
import {
  encryptTotpSecret,
  generateMfaRecoveryCodes,
  generateTotpEnrollment,
} from "~/server/security/mfa";
import { hashPassword } from "~/server/security/password";

export const bootstrapSuperAdminSchema = z.object({
  name: z.string().trim().min(1, "Nama lengkap wajib diisi").max(255),
  email: z.string().trim().toLowerCase().email("Email tidak valid").max(255),
  password: z
    .string()
    .min(12, "Kata sandi SUPER_ADMIN minimal 12 karakter")
    .max(128),
  totpSecretBase32: z
    .string()
    .trim()
    .regex(/^[A-Z2-7]+=*$/i, "Format Base32 TOTP secret tidak valid")
    .min(16)
    .optional(),
});

export interface BootstrapSuperAdminResult {
  user: {
    id: string;
    name: string;
    email: string;
    role: "SUPER_ADMIN";
    isActive: true;
    mfaEnabled: true;
    createdAt: Date;
  };
  mfaEnrollment: {
    secretBase32: string;
    otpauthUri: string;
    recoveryCodes: string[];
  };
}

type DbClient = Pick<typeof defaultDb, "select" | "insert" | "transaction">;

/**
 * One-time initial SUPER_ADMIN provisioning service.
 * - Rejects execution if any SUPER_ADMIN already exists or if the email is already registered.
 * - Never overwrites existing accounts.
 * - Hashes password with Argon2id, encrypts TOTP secret with AES-256-GCM, and hashes recovery codes.
 * - Records sanitized audit log with zero secrets.
 */
export async function bootstrapInitialSuperAdmin(
  dbClient: DbClient,
  rawInput: unknown,
): Promise<BootstrapSuperAdminResult> {
  const input = bootstrapSuperAdminSchema.parse(rawInput);

  return dbClient.transaction(async (tx) => {
    const existing = await tx
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(
        or(eq(users.role, "SUPER_ADMIN"), eq(users.email, input.email)),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new Error(
        "BOOTSTRAP_ALREADY_COMPLETED: Akun SUPER_ADMIN atau email tersebut sudah terdaftar. Eksekusi ulang tidak diizinkan menimpa akun.",
      );
    }

    const passwordHash = await hashPassword(input.password);

    const enrollment = input.totpSecretBase32
      ? {
          secretBase32: input.totpSecretBase32.toUpperCase(),
          encryptedSecret: encryptTotpSecret(
            input.totpSecretBase32.toUpperCase(),
          ),
          otpauthUri: `otpauth://totp/Lab%20Informatika%20UNISSULA:${encodeURIComponent(input.email)}?issuer=Lab%20Informatika%20UNISSULA&secret=${input.totpSecretBase32.toUpperCase()}&algorithm=SHA1&digits=6&period=30`,
        }
      : generateTotpEnrollment(input.email);

    const { plainRecoveryCodes, hashedRecoveryCodes } =
      await generateMfaRecoveryCodes();

    const [created] = await tx
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash,
        role: "SUPER_ADMIN",
        isActive: true,
        mfaEnabled: true,
        mfaSecretEncrypted: enrollment.encryptedSecret,
        mfaRecoveryCodesHashed: hashedRecoveryCodes,
        sessionVersion: 1,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        mfaEnabled: users.mfaEnabled,
        createdAt: users.createdAt,
      });

    if (!created) {
      throw new Error("Gagal membuat akun SUPER_ADMIN awal.");
    }

    await writeAuditLog(tx, {
      actorUserId: created.id,
      action: "SUPER_ADMIN_BOOTSTRAP",
      entityType: "USER",
      entityId: created.id,
      metadata: {
        email: created.email,
        role: created.role,
        mfaEnabled: created.mfaEnabled,
      },
    });

    return {
      user: {
        id: created.id,
        name: created.name,
        email: created.email,
        role: "SUPER_ADMIN",
        isActive: true,
        mfaEnabled: true,
        createdAt: created.createdAt,
      },
      mfaEnrollment: {
        secretBase32: enrollment.secretBase32,
        otpauthUri: enrollment.otpauthUri,
        recoveryCodes: plainRecoveryCodes,
      },
    };
  });
}

