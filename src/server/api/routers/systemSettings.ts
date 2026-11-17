import { eq } from "drizzle-orm";
import { z } from "zod";

import { updateFeedbackQrSchema } from "~/lib/validators";
import {
  adminProcedure,
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";
import { systemSettings, users } from "~/server/db/schema";
import { writeAuditLog } from "~/server/security/audit";

export const systemThemeSchema = z.enum(["LIGHT", "DARK", "MONOCHROME"]);
export type SystemThemeValue = z.infer<typeof systemThemeSchema>;

export const DEFAULT_FEEDBACK_QR = {
  qrPath: "/contoh.png",
  title: "Kotak Saran & Sumbangan",
  description:
    "Pindai kode QR untuk menyampaikan aspirasi, kritik & saran, atau sumbangan bagi Program Studi Teknik Informatika UNISSULA.",
};

export const systemSettingsRouter = createTRPCRouter({
  /**
   * Public procedure to fetch the active public display theme for unattended lab kiosks.
   * Defaults to "LIGHT" (Clean Academic) if not configured.
   */
  getPublicTheme: publicProcedure
    .output(z.object({ theme: systemThemeSchema }))
    .query(async ({ ctx }) => {
      try {
        const [setting] = await ctx.db
          .select({
            value: systemSettings.value,
          })
          .from(systemSettings)
          .where(eq(systemSettings.key, "public_theme"))
          .limit(1);

        if (
          setting?.value === "LIGHT" ||
          setting?.value === "DARK" ||
          setting?.value === "MONOCHROME"
        ) {
          return { theme: setting.value };
        }

        return { theme: "LIGHT" as const };
      } catch {
        return { theme: "LIGHT" as const };
      }
    }),

  /**
   * Protected procedure for ADMIN / SUPER_ADMIN to inspect all system settings with updater details.
   */
  getSettings: adminProcedure.query(async ({ ctx }) => {
    try {
      const rows = await ctx.db
        .select({
          key: systemSettings.key,
          value: systemSettings.value,
          updatedAt: systemSettings.updatedAt,
          updatedByUserId: systemSettings.updatedByUserId,
          updatedByName: users.name,
          updatedByEmail: users.email,
        })
        .from(systemSettings)
        .leftJoin(users, eq(systemSettings.updatedByUserId, users.id));

      const publicThemeSetting = rows.find((r) => r.key === "public_theme");
      const qrPathSetting = rows.find((r) => r.key === "feedback_qr_path");
      const titleSetting = rows.find((r) => r.key === "feedback_title");
      const descSetting = rows.find((r) => r.key === "feedback_description");

      return {
        publicTheme:
          (publicThemeSetting?.value as SystemThemeValue | undefined) ?? "LIGHT",
        lastUpdated: publicThemeSetting?.updatedAt ?? null,
        updatedByName: publicThemeSetting?.updatedByName ?? null,
        updatedByEmail: publicThemeSetting?.updatedByEmail ?? null,
        feedbackQr: {
          qrPath: qrPathSetting?.value ?? DEFAULT_FEEDBACK_QR.qrPath,
          title: titleSetting?.value ?? DEFAULT_FEEDBACK_QR.title,
          description: descSetting?.value ?? DEFAULT_FEEDBACK_QR.description,
          lastUpdated: qrPathSetting?.updatedAt ?? null,
          updatedByName: qrPathSetting?.updatedByName ?? null,
        },
        allSettings: rows,
      };
    } catch {
      return {
        publicTheme: "LIGHT" as const,
        lastUpdated: null,
        updatedByName: null,
        updatedByEmail: null,
        feedbackQr: {
          ...DEFAULT_FEEDBACK_QR,
          lastUpdated: null,
          updatedByName: null,
        },
        allSettings: [],
      };
    }
  }),

  /**
   * Protected procedure for ADMIN / SUPER_ADMIN to update the global public display theme.
   * Writes an immutable record to audit_logs.
   */
  updatePublicTheme: adminProcedure
    .input(z.object({ theme: systemThemeSchema }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();

      await ctx.db
        .insert(systemSettings)
        .values({
          key: "public_theme",
          value: input.theme,
          updatedAt: now,
          updatedByUserId: ctx.session.user.id,
        })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: {
            value: input.theme,
            updatedAt: now,
            updatedByUserId: ctx.session.user.id,
          },
        });

      await writeAuditLog(ctx.db, {
        actorUserId: ctx.session.user.id,
        action: "UPDATE_PUBLIC_THEME",
        entityType: "SYSTEM_SETTING",
        entityId: "public_theme",
        metadata: {
          previousSetting: "public_theme",
          newTheme: input.theme,
        },
      });

      return {
        success: true,
        theme: input.theme,
        updatedAt: now,
      };
    }),

  /**
   * Protected procedure for ADMIN / SUPER_ADMIN to update feedback QR image and copy.
   */
  updateFeedbackQr: adminProcedure
    .input(updateFeedbackQrSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const userId = ctx.session.user.id;

      const entries = [
        { key: "feedback_qr_path", value: input.qrPath },
        { key: "feedback_title", value: input.title },
        { key: "feedback_description", value: input.description },
      ];

      for (const entry of entries) {
        await ctx.db
          .insert(systemSettings)
          .values({
            key: entry.key,
            value: entry.value,
            updatedAt: now,
            updatedByUserId: userId,
          })
          .onConflictDoUpdate({
            target: systemSettings.key,
            set: {
              value: entry.value,
              updatedAt: now,
              updatedByUserId: userId,
            },
          });
      }

      await writeAuditLog(ctx.db, {
        actorUserId: userId,
        action: "UPDATE_FEEDBACK_QR",
        entityType: "SYSTEM_SETTING",
        entityId: "feedback_qr",
        metadata: {
          qrPath: input.qrPath,
          title: input.title,
        },
      });

      return {
        success: true,
        qrPath: input.qrPath,
        title: input.title,
        description: input.description,
        updatedAt: now,
      };
    }),
});
