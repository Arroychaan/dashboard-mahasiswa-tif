import { TRPCError } from "@trpc/server";

import { type UserRole } from "~/server/db/schema";

export const ROLE_RANK: Record<UserRole, number> = {
  EDITOR: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
} as const;

export function canManageContent(role: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.EDITOR;
}

export function canPublishOrDeleteContent(role: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.ADMIN;
}

export function canViewUsers(role: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK.ADMIN;
}

export function canViewAuditLogs(role: UserRole): boolean {
  return role === "SUPER_ADMIN";
}

/**
 * Enforces user-creation & role-assignment policy:
 * - SUPER_ADMIN: can create and assign SUPER_ADMIN, ADMIN, or EDITOR.
 * - ADMIN: can ONLY create EDITOR accounts and assign EDITOR role.
 * - EDITOR: cannot create users or assign roles.
 */
export function assertCanCreateUserWithRole(
  actorRole: UserRole,
  targetRole: UserRole,
): void {
  if (actorRole === "SUPER_ADMIN") {
    return;
  }

  if (actorRole === "ADMIN") {
    if (targetRole !== "EDITOR") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "ADMIN hanya diizinkan membuat akun dengan peran EDITOR.",
      });
    }
    return;
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Anda tidak memiliki izin untuk membuat akun pengguna.",
  });
}

/**
 * Enforces user-management and privilege-escalation protections:
 * - Prevents self-promotion or unauthorized self-role changes by ADMIN/EDITOR.
 * - Prevents ADMIN from modifying ADMIN or SUPER_ADMIN accounts.
 * - Prevents ADMIN from assigning ADMIN or SUPER_ADMIN roles.
 */
export function assertCanManageTargetUser(params: {
  actorUserId: string;
  actorRole: UserRole;
  targetUserId: string;
  targetCurrentRole: UserRole;
  targetNextRole?: UserRole;
}): void {
  const {
    actorUserId,
    actorRole,
    targetUserId,
    targetCurrentRole,
    targetNextRole,
  } = params;
  const isSelf = actorUserId === targetUserId;

  if (actorRole === "EDITOR") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "EDITOR tidak memiliki izin untuk mengelola akun pengguna.",
    });
  }

  if (actorRole === "ADMIN") {
    if (isSelf && targetNextRole !== undefined && targetNextRole !== actorRole) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Anda tidak diizinkan mengubah peran akun sendiri.",
      });
    }

    if (targetCurrentRole !== "EDITOR") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "ADMIN hanya dapat mengelola akun dengan peran EDITOR dan tidak dapat memodifikasi akun ADMIN atau SUPER_ADMIN.",
      });
    }

    if (targetNextRole !== undefined && targetNextRole !== "EDITOR") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "ADMIN tidak dapat menetapkan peran yang setara atau lebih tinggi (ADMIN / SUPER_ADMIN).",
      });
    }

    return;
  }
}

