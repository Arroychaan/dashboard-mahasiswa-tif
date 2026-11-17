import { eq } from "drizzle-orm";
import { z } from "zod";

import { type db as defaultDb } from "~/server/db";
import { users, type UserRole } from "~/server/db/schema";
import { writeAuditLog } from "~/server/security/audit";
import {
  verifyAndConsumeRecoveryCode,
  verifyTotpToken,
} from "~/server/security/mfa";
import {
  verifyPassword,
  verifyPasswordDummy,
} from "~/server/security/password";
import {
   clearAuthFailures,
  isAuthRateLimited,
  recordAuthFailure,
} from "~/server/security/rate-limit";

export const loginCredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(128),
  mfaCode: z.string().trim().max(32).optional(),
});

export const GENERIC_AUTH_ERROR_MESSAGE =
  "Email, kata sandi, atau kode verifikasi tidak valid.";

export const RATE_LIMIT_AUTH_ERROR_MESSAGE =
  "Terlalu banyak percobaan login yang gagal. Silakan coba lagi nanti.";

export interface AuthenticatedSessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mfaVerified: boolean;
  sessionVersion: number;
}

export type AuthResult =
  | { ok: true; user: AuthenticatedSessionUser }
  | {
      ok: false;
      code: "INVALID_CREDENTIALS" | "RATE_LIMITED" | "MFA_REQUIRED";
      message: string;
    };

type DbClient = Pick<typeof defaultDb, "select" | "update" | "insert">;

/**
 * Verifies user email, Argon2id password hash, active status, rate limit,
 * and mandatory TOTP MFA (or recovery code) for SUPER_ADMIN accounts.
 */
export async function authenticateUserCredentials(
  dbClient: DbClient,
  rawCredentials: unknown,
  clientIdentifier = "default",
): Promise<AuthResult> {
  const parsed = loginCredentialsSchema.safeParse(rawCredentials);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: GENERIC_AUTH_ERROR_MESSAGE,
    };
  }

  const { email, password, mfaCode } = parsed.data;
  const rateLimitKey = `login:${email}:${clientIdentifier}`;

  const rateStatus = isAuthRateLimited(rateLimitKey);
  if (rateStatus.limited) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: RATE_LIMIT_AUTH_ERROR_MESSAGE,
    };
  }

  const [userRecord] = await dbClient
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!userRecord) {
    await verifyPasswordDummy(password);
    recordAuthFailure(rateLimitKey);
    await writeAuditLog(dbClient, {
      actorUserId: null,
      action: "AUTH_LOGIN_FAILED",
      entityType: "AUTH",
      entityId: null,
      metadata: { reason: "unknown_or_inactive_account" },
    });
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: GENERIC_AUTH_ERROR_MESSAGE,
    };
  }

  const passwordValid = await verifyPassword(userRecord.passwordHash, password);
  if (!passwordValid || !userRecord.isActive) {
    recordAuthFailure(rateLimitKey);
    await writeAuditLog(dbClient, {
      actorUserId: userRecord.id,
      action: "AUTH_LOGIN_FAILED",
      entityType: "AUTH",
      entityId: userRecord.id,
      metadata: {
        reason: !userRecord.isActive ? "inactive_account" : "invalid_password",
      },
    });
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: GENERIC_AUTH_ERROR_MESSAGE,
    };
  }

  // Enforce mandatory TOTP MFA for SUPER_ADMIN (or any account with mfaEnabled = true)
  const requiresMfa =
    userRecord.role === "SUPER_ADMIN" || userRecord.mfaEnabled;

  let mfaVerified = false;
  if (requiresMfa) {
    if (!userRecord.mfaEnabled || !userRecord.mfaSecretEncrypted) {
      recordAuthFailure(rateLimitKey);
      await writeAuditLog(dbClient, {
        actorUserId: userRecord.id,
        action: "AUTH_LOGIN_FAILED",
        entityType: "AUTH",
        entityId: userRecord.id,
        metadata: { reason: "mfa_not_provisioned_for_super_admin" },
      });
      return {
        ok: false,
        code: "MFA_REQUIRED",
        message: GENERIC_AUTH_ERROR_MESSAGE,
      };
    }

    if (!mfaCode || mfaCode.trim().length === 0) {
      recordAuthFailure(rateLimitKey);
      await writeAuditLog(dbClient, {
        actorUserId: userRecord.id,
        action: "AUTH_LOGIN_FAILED",
        entityType: "AUTH",
        entityId: userRecord.id,
        metadata: { reason: "mfa_code_missing" },
      });
      return {
        ok: false,
        code: "MFA_REQUIRED",
        message: GENERIC_AUTH_ERROR_MESSAGE,
      };
    }

    const totpValid = verifyTotpToken(
      userRecord.mfaSecretEncrypted,
      mfaCode,
      userRecord.email,
    );

    if (totpValid) {
      mfaVerified = true;
    } else {
      const recoveryCheck = await verifyAndConsumeRecoveryCode(
        userRecord.mfaRecoveryCodesHashed,
        mfaCode,
      );
      if (recoveryCheck.matched) {
        mfaVerified = true;
        await dbClient
          .update(users)
          .set({
            mfaRecoveryCodesHashed: recoveryCheck.remainingHashes,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userRecord.id));
      }
    }

    if (!mfaVerified) {
      recordAuthFailure(rateLimitKey);
      await writeAuditLog(dbClient, {
        actorUserId: userRecord.id,
        action: "AUTH_LOGIN_FAILED",
        entityType: "AUTH",
        entityId: userRecord.id,
        metadata: { reason: "invalid_mfa_code" },
      });
      return {
        ok: false,
        code: "INVALID_CREDENTIALS",
        message: GENERIC_AUTH_ERROR_MESSAGE,
      };
    }
  } else {
    mfaVerified = true;
  }

  clearAuthFailures(rateLimitKey);
  await writeAuditLog(dbClient, {
    actorUserId: userRecord.id,
    action: "AUTH_LOGIN_SUCCESS",
    entityType: "AUTH",
    entityId: userRecord.id,
    metadata: {
      role: userRecord.role,
      mfaVerified,
    },
  });

  return {
    ok: true,
    user: {
      id: userRecord.id,
      name: userRecord.name,
      email: userRecord.email,
      role: userRecord.role,
      isActive: userRecord.isActive,
      mfaVerified,
      sessionVersion: userRecord.sessionVersion,
    },
  };
}

