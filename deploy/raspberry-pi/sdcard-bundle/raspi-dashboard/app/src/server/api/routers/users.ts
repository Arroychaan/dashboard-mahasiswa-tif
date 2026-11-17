import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import {
  changeUserPasswordSchema,
  changeUserRoleSchema,
  createUserSchema,
  listUsersInputSchema,
  resetUserPasswordSchema,
  setUserActiveSchema,
  updateUserSchema,
  userDtoSchema,
  type UserDTO,
} from "~/lib/validators";
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { users } from "~/server/db/schema";
import { writeAuditLog } from "~/server/security/audit";
import {
  encryptTotpSecret,
  generateMfaRecoveryCodes,
  generateTotpEnrollment,
} from "~/server/security/mfa";
import { hashPassword, verifyPassword } from "~/server/security/password";
import {
  assertCanCreateUserWithRole,
  assertCanManageTargetUser,
} from "~/server/security/rbac";

const userPublicColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  isActive: users.isActive,
  mfaEnabled: users.mfaEnabled,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;

export const usersRouter = createTRPCRouter({
  me: protectedProcedure
    .output(userDtoSchema)
    .query(async ({ ctx }): Promise<UserDTO> => {
      const [user] = await ctx.db
        .select(userPublicColumns)
        .from(users)
        .where(eq(users.id, ctx.session.user.id))
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Akun pengguna tidak ditemukan.",
        });
      }

      return user;
    }),

  list: adminProcedure
    .input(listUsersInputSchema)
    .output(z.array(userDtoSchema))
    .query(async ({ ctx, input }): Promise<UserDTO[]> => {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      return ctx.db
        .select(userPublicColumns)
        .from(users)
        .orderBy(users.name)
        .limit(limit)
        .offset(offset);
    }),

  getById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(userDtoSchema)
    .query(async ({ ctx, input }): Promise<UserDTO> => {
      const [user] = await ctx.db
        .select(userPublicColumns)
        .from(users)
        .where(eq(users.id, input.id))
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pengguna tidak ditemukan.",
        });
      }

      return user;
    }),

  create: adminProcedure
    .input(createUserSchema)
    .output(userDtoSchema)
    .mutation(async ({ ctx, input }): Promise<UserDTO> => {
      assertCanCreateUserWithRole(ctx.session.user.role, input.role);

      return ctx.db.transaction(async (tx) => {
        const [existingEmail] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1);

        if (existingEmail) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Alamat email sudah digunakan oleh akun lain.",
          });
        }

        const passwordHash = await hashPassword(input.password);

        let mfaEnabled = false;
        let mfaSecretEncrypted: string | null = null;
        let mfaRecoveryCodesHashed: string[] = [];

        if (input.role === "SUPER_ADMIN" || input.totpSecretBase32) {
          mfaEnabled = true;
          mfaSecretEncrypted = input.totpSecretBase32
            ? encryptTotpSecret(input.totpSecretBase32.toUpperCase())
            : generateTotpEnrollment(input.email).encryptedSecret;
          const recovery = await generateMfaRecoveryCodes();
          mfaRecoveryCodesHashed = recovery.hashedRecoveryCodes;
        }

        const [created] = await tx
          .insert(users)
          .values({
            name: input.name,
            email: input.email,
            passwordHash,
            role: input.role,
            isActive: input.isActive,
            mfaEnabled,
            mfaSecretEncrypted,
            mfaRecoveryCodesHashed,
            sessionVersion: 1,
          })
          .returning(userPublicColumns);

        if (!created) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Gagal membuat akun pengguna.",
          });
        }

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: "USER_CREATE",
          entityType: "USER",
          entityId: created.id,
          metadata: {
            email: created.email,
            role: created.role,
            isActive: created.isActive,
            mfaEnabled: created.mfaEnabled,
          },
        });

        return created;
      });
    }),

  changeRole: adminProcedure
    .input(changeUserRoleSchema)
    .output(userDtoSchema)
    .mutation(async ({ ctx, input }): Promise<UserDTO> => {
      return ctx.db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(users)
          .where(eq(users.id, input.id))
          .limit(1);

        if (!target) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pengguna tidak ditemukan.",
          });
        }

        assertCanManageTargetUser({
          actorUserId: ctx.session.user.id,
          actorRole: ctx.session.user.role,
          targetUserId: target.id,
          targetCurrentRole: target.role,
          targetNextRole: input.role,
        });

        // Prevent demoting the last active SUPER_ADMIN
        if (
          target.role === "SUPER_ADMIN" &&
          target.isActive &&
          input.role !== "SUPER_ADMIN"
        ) {
          const [activeSuperAdmins] = await tx
            .select({ value: count() })
            .from(users)
            .where(
              and(eq(users.role, "SUPER_ADMIN"), eq(users.isActive, true)),
            );

          if (Number(activeSuperAdmins?.value ?? 0) <= 1) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Tidak dapat menurunkan peran SUPER_ADMIN aktif terakhir.",
            });
          }
        }

        let mfaEnabled = target.mfaEnabled;
        let mfaSecretEncrypted = target.mfaSecretEncrypted;
        let mfaRecoveryCodesHashed = target.mfaRecoveryCodesHashed;

        if (input.role === "SUPER_ADMIN" && (!mfaEnabled || !mfaSecretEncrypted)) {
          mfaEnabled = true;
          mfaSecretEncrypted = input.totpSecretBase32
            ? encryptTotpSecret(input.totpSecretBase32.toUpperCase())
            : generateTotpEnrollment(target.email).encryptedSecret;
          const recovery = await generateMfaRecoveryCodes();
          mfaRecoveryCodesHashed = recovery.hashedRecoveryCodes;
        }

        const [updated] = await tx
          .update(users)
          .set({
            role: input.role,
            mfaEnabled,
            mfaSecretEncrypted,
            mfaRecoveryCodesHashed,
            sessionVersion: target.sessionVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(users.id, target.id))
          .returning(userPublicColumns);

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Gagal memperbarui peran pengguna.",
          });
        }

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: "USER_CHANGE_ROLE",
          entityType: "USER",
          entityId: updated.id,
          metadata: {
            previousRole: target.role,
            newRole: updated.role,
          },
        });

        return updated;
      });
    }),

  setActive: adminProcedure
    .input(setUserActiveSchema)
    .output(userDtoSchema)
    .mutation(async ({ ctx, input }): Promise<UserDTO> => {
      return ctx.db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(users)
          .where(eq(users.id, input.id))
          .limit(1);

        if (!target) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pengguna tidak ditemukan.",
          });
        }

        assertCanManageTargetUser({
          actorUserId: ctx.session.user.id,
          actorRole: ctx.session.user.role,
          targetUserId: target.id,
          targetCurrentRole: target.role,
        });

        // Prevent deactivating the last active SUPER_ADMIN
        if (
          target.role === "SUPER_ADMIN" &&
          target.isActive &&
          !input.isActive
        ) {
          const [activeSuperAdmins] = await tx
            .select({ value: count() })
            .from(users)
            .where(
              and(eq(users.role, "SUPER_ADMIN"), eq(users.isActive, true)),
            );

          if (Number(activeSuperAdmins?.value ?? 0) <= 1) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Tidak dapat menonaktifkan akun SUPER_ADMIN aktif terakhir.",
            });
          }
        }

        const [updated] = await tx
          .update(users)
          .set({
            isActive: input.isActive,
            sessionVersion: target.sessionVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(users.id, target.id))
          .returning(userPublicColumns);

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Gagal mengubah status aktif pengguna.",
          });
        }

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: input.isActive ? "USER_ACTIVATE" : "USER_DEACTIVATE",
          entityType: "USER",
          entityId: updated.id,
          metadata: {
            isActive: updated.isActive,
          },
        });

        return updated;
      });
    }),

  changePassword: protectedProcedure
    .input(changeUserPasswordSchema)
    .output(userDtoSchema)
    .mutation(async ({ ctx, input }): Promise<UserDTO> => {
      return ctx.db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(users)
          .where(eq(users.id, input.id))
          .limit(1);

        if (!target) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pengguna tidak ditemukan.",
          });
        }

        const isSelf = ctx.session.user.id === target.id;
        if (isSelf) {
          if (!input.currentPassword) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Kata sandi saat ini wajib diisi untuk mengubah kata sandi sendiri.",
            });
          }
          const validCurrent = await verifyPassword(
            target.passwordHash,
            input.currentPassword,
          );
          if (!validCurrent) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Kata sandi saat ini tidak sesuai.",
            });
          }
        } else {
          assertCanManageTargetUser({
            actorUserId: ctx.session.user.id,
            actorRole: ctx.session.user.role,
            targetUserId: target.id,
            targetCurrentRole: target.role,
          });
        }

        const newPasswordHash = await hashPassword(input.newPassword);

        const [updated] = await tx
          .update(users)
          .set({
            passwordHash: newPasswordHash,
            sessionVersion: target.sessionVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(users.id, target.id))
          .returning(userPublicColumns);

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Gagal memperbarui kata sandi pengguna.",
          });
        }

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: "USER_CHANGE_PASSWORD",
          entityType: "USER",
          entityId: updated.id,
          metadata: {
            changedBySelf: isSelf,
          },
        });

        return updated;
      });
    }),

  update: adminProcedure
    .input(updateUserSchema)
    .output(userDtoSchema)
    .mutation(async ({ ctx, input }): Promise<UserDTO> => {
      return ctx.db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(users)
          .where(eq(users.id, input.id))
          .limit(1);

        if (!target) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pengguna tidak ditemukan.",
          });
        }

        assertCanManageTargetUser({
          actorUserId: ctx.session.user.id,
          actorRole: ctx.session.user.role,
          targetUserId: target.id,
          targetCurrentRole: target.role,
          targetNextRole: input.role,
        });

        if (
          target.role === "SUPER_ADMIN" &&
          target.isActive &&
          (input.role !== "SUPER_ADMIN" || !input.isActive)
        ) {
          const [activeSuperAdmins] = await tx
            .select({ value: count() })
            .from(users)
            .where(
              and(eq(users.role, "SUPER_ADMIN"), eq(users.isActive, true)),
            );

          if (Number(activeSuperAdmins?.value ?? 0) <= 1) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Tidak dapat menonaktifkan atau menurunkan peran SUPER_ADMIN aktif terakhir.",
            });
          }
        }

        let mfaEnabled = target.mfaEnabled;
        let mfaSecretEncrypted = target.mfaSecretEncrypted;
        let mfaRecoveryCodesHashed = target.mfaRecoveryCodesHashed;

        if (
          input.role === "SUPER_ADMIN" &&
          (!mfaEnabled || !mfaSecretEncrypted)
        ) {
          mfaEnabled = true;
          mfaSecretEncrypted = generateTotpEnrollment(
            input.email,
          ).encryptedSecret;
          const recovery = await generateMfaRecoveryCodes();
          mfaRecoveryCodesHashed = recovery.hashedRecoveryCodes;
        }

        const [updated] = await tx
          .update(users)
          .set({
            name: input.name,
            email: input.email,
            role: input.role,
            isActive: input.isActive,
            mfaEnabled,
            mfaSecretEncrypted,
            mfaRecoveryCodesHashed,
            sessionVersion: target.sessionVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(users.id, target.id))
          .returning(userPublicColumns);

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Gagal memperbarui akun pengguna.",
          });
        }

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: "USER_UPDATE",
          entityType: "USER",
          entityId: updated.id,
          metadata: {
            role: updated.role,
            isActive: updated.isActive,
          },
        });

        return updated;
      });
    }),

  resetPassword: adminProcedure
    .input(resetUserPasswordSchema)
    .output(userDtoSchema)
    .mutation(async ({ ctx, input }): Promise<UserDTO> => {
      return ctx.db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(users)
          .where(eq(users.id, input.id))
          .limit(1);

        if (!target) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pengguna tidak ditemukan.",
          });
        }

        assertCanManageTargetUser({
          actorUserId: ctx.session.user.id,
          actorRole: ctx.session.user.role,
          targetUserId: target.id,
          targetCurrentRole: target.role,
        });

        const newPasswordHash = await hashPassword(input.newPassword);

        const [updated] = await tx
          .update(users)
          .set({
            passwordHash: newPasswordHash,
            sessionVersion: target.sessionVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(users.id, target.id))
          .returning(userPublicColumns);

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Gagal mereset kata sandi pengguna.",
          });
        }

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: "USER_PASSWORD_RESET",
          entityType: "USER",
          entityId: updated.id,
          metadata: {},
        });

        return updated;
      });
    }),
});
