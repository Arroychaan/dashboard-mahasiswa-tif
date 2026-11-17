import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  adminProcedure,
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";
import { systemSettings, users } from "~/server/db/schema";
import { writeAuditLog } from "~/server/security/audit";

export const systemThemeSchema = z.enum(["LIGHT", "DARK", "MONOCHROME"]);
export type SystemThemeValue = z.infer<typeof systemThemeSchema>;

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

      return {
        publicTheme:
          (publicThemeSetting?.value as SystemThemeValue | undefined) ?? "LIGHT",
        lastUpdated: publicThemeSetting?.updatedAt ?? null,
        updatedByName: publicThemeSetting?.updatedByName ?? null,
        updatedByEmail: publicThemeSetting?.updatedByEmail ?? null,
        allSettings: rows,
      };
    } catch {
      return {
        publicTheme: "LIGHT" as const,
        lastUpdated: null,
        updatedByName: null,
        updatedByEmail: null,
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
});
