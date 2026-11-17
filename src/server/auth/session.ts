import { eq } from "drizzle-orm";
import { type Session } from "next-auth";

import { type UserDTO } from "~/lib/validators";
import { auth } from "~/server/auth";
import { db, type db as defaultDb } from "~/server/db";
import { users, type UserRole } from "~/server/db/schema";

type DbClient = Pick<typeof defaultDb, "select">;

export interface VerifiedSessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mfaVerified: boolean;
  sessionVersion: number;
}

export type SessionVerificationResult =
  | {
      ok: true;
      sessionUser: VerifiedSessionUser;
      userDto: UserDTO;
    }
  | {
      ok: false;
      reason: "UNAUTHENTICATED" | "INVALID_SESSION" | "MFA_REQUIRED";
      message: string;
    };

/**
 * Re-verifies an Auth.js session against PostgreSQL (`isActive`, `role`,
 * `sessionVersion`, and mandatory TOTP MFA for SUPER_ADMIN / MFA-enabled accounts).
 */
export async function verifySessionUser(
  dbClient: DbClient,
  session: Session | null,
): Promise<SessionVerificationResult> {
  const sessionUser = session?.user;
  if (!sessionUser?.id) {
    return {
      ok: false,
      reason: "UNAUTHENTICATED",
      message: "Otentikasi diperlukan untuk mengakses prosedur ini.",
    };
  }

  const [dbUser] = await dbClient
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      mfaEnabled: users.mfaEnabled,
      mfaSecretEncrypted: users.mfaSecretEncrypted,
      sessionVersion: users.sessionVersion,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  if (!dbUser?.isActive) {
    return {
      ok: false,
      reason: "INVALID_SESSION",
      message: "Sesi tidak valid atau akun tidak aktif.",
    };
  }

  if (
    sessionUser.sessionVersion !== undefined &&
    sessionUser.sessionVersion !== dbUser.sessionVersion
  ) {
    return {
      ok: false,
      reason: "INVALID_SESSION",
      message: "Sesi telah kedaluwarsa karena perubahan keamanan akun.",
    };
  }

  if (sessionUser.role !== dbUser.role) {
    return {
      ok: false,
      reason: "INVALID_SESSION",
      message: "Peran akun telah diperbarui. Silakan masuk kembali.",
    };
  }

  if (dbUser.role === "SUPER_ADMIN" || dbUser.mfaEnabled) {
    if (
      !dbUser.mfaEnabled ||
      !dbUser.mfaSecretEncrypted ||
      sessionUser.mfaVerified !== true
    ) {
      return {
        ok: false,
        reason: "MFA_REQUIRED",
        message:
          "Verifikasi TOTP MFA wajib diselesaikan untuk mengakses hak akses ini.",
      };
    }
  }

  return {
    ok: true,
    sessionUser: {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      isActive: dbUser.isActive,
      mfaVerified: Boolean(sessionUser.mfaVerified),
      sessionVersion: dbUser.sessionVersion,
    },
    userDto: {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      isActive: dbUser.isActive,
      mfaEnabled: dbUser.mfaEnabled,
      createdAt: dbUser.createdAt,
      updatedAt: dbUser.updatedAt,
    },
  };
}

/**
 * Reads the current NextAuth session and verifies it against live database state.
 */
export async function getVerifiedServerSession(): Promise<SessionVerificationResult> {
  const session = await auth();
  return verifySessionUser(db, session);
}

