import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { type Session } from "next-auth";
import superjson from "superjson";
import { ZodError } from "zod";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { users, type UserRole } from "~/server/db/schema";

export interface TRPCContext {
  db: typeof db;
  session: Session | null;
  headers: Headers;
}

/**
 * 1. CONTEXT
 * Generates the tRPC context with database client and current Auth.js session.
 */
export const createTRPCContext = async (opts: {
  headers: Headers;
}): Promise<TRPCContext> => {
  const session = await auth();

  return {
    db,
    session,
    ...opts,
  };
};

/**
 * 2. INITIALIZATION
 */
const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;

/**
 * 3. PROCEDURES & LIVE DATABASE-BACKED RBAC MIDDLEWARE
 * - Re-verifies account existence, `isActive`, `role`, `sessionVersion`, and mandatory MFA
 *   against PostgreSQL on every protected procedure call.
 * - Immediately invalidates effective access when an account is deactivated, deleted,
 *   has its role changed, or lacks required SUPER_ADMIN MFA verification.
 */
export const publicProcedure = t.procedure;

const enforceAuthenticatedActiveUser = t.middleware(async ({ ctx, next }) => {
  const sessionUser = ctx.session?.user;
  if (!sessionUser?.id) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Otentikasi diperlukan untuk mengakses prosedur ini.",
    });
  }

  const [dbUser] = await ctx.db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      mfaEnabled: users.mfaEnabled,
      mfaSecretEncrypted: users.mfaSecretEncrypted,
      sessionVersion: users.sessionVersion,
    })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  if (!dbUser?.isActive) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Sesi tidak valid atau akun tidak aktif.",
    });
  }

  if (
    sessionUser.sessionVersion !== undefined &&
    sessionUser.sessionVersion !== dbUser.sessionVersion
  ) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Sesi telah kedaluwarsa karena perubahan keamanan akun.",
    });
  }

  if (sessionUser.role !== dbUser.role) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Peran akun telah diperbarui. Silakan masuk kembali.",
    });
  }

  // Enforce mandatory TOTP MFA verification for SUPER_ADMIN sessions
  if (dbUser.role === "SUPER_ADMIN" || dbUser.mfaEnabled) {
    if (
      !dbUser.mfaEnabled ||
      !dbUser.mfaSecretEncrypted ||
      sessionUser.mfaVerified !== true
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Verifikasi TOTP MFA wajib diselesaikan untuk mengakses hak akses ini.",
      });
    }
  }

  return next({
    ctx: {
      ...ctx,
      session: {
        ...ctx.session!,
        user: {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          role: dbUser.role,
          isActive: dbUser.isActive,
          mfaVerified: Boolean(sessionUser.mfaVerified),
          sessionVersion: dbUser.sessionVersion,
        },
      },
    },
  });
});

export const protectedProcedure = t.procedure.use(
  enforceAuthenticatedActiveUser,
);

const createRoleProcedure = (allowedRoles: readonly UserRole[]) =>
  protectedProcedure.use(({ ctx, next }) => {
    if (!allowedRoles.includes(ctx.session.user.role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Anda tidak memiliki izin untuk mengakses prosedur ini.",
      });
    }
    return next({ ctx });
  });

export const editorProcedure = createRoleProcedure([
  "EDITOR",
  "ADMIN",
  "SUPER_ADMIN",
]);

export const adminProcedure = createRoleProcedure(["ADMIN", "SUPER_ADMIN"]);

export const superAdminProcedure = createRoleProcedure(["SUPER_ADMIN"]);
