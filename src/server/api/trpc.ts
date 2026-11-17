import { initTRPC, TRPCError } from "@trpc/server";
import { type Session } from "next-auth";
import superjson from "superjson";
import { ZodError } from "zod";

import { auth } from "~/server/auth";
import { verifySessionUser } from "~/server/auth/session";
import { db } from "~/server/db";
import { type UserRole } from "~/server/db/schema";

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
  const result = await verifySessionUser(ctx.db, ctx.session);
  if (!result.ok) {
    throw new TRPCError({
      code: result.reason === "MFA_REQUIRED" ? "FORBIDDEN" : "UNAUTHORIZED",
      message: result.message,
    });
  }

  return next({
    ctx: {
      ...ctx,
      session: {
        ...ctx.session!,
        user: result.sessionUser,
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
