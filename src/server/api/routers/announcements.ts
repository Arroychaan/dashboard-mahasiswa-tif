import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, ilike } from "drizzle-orm";

import {
  announcementIdSchema,
  createAnnouncementSchema,
  listAnnouncementsInputSchema,
  setPublishedAnnouncementSchema,
  updateAnnouncementSchema,
  type AnnouncementCategoryType,
} from "~/lib/validators";
import {
  adminProcedure,
  createTRPCRouter,
  editorProcedure,
} from "~/server/api/trpc";
import { announcements } from "~/server/db/schema";
import { writeAuditLog } from "~/server/security/audit";
import { canPublishOrDeleteContent } from "~/server/security/rbac";

function buildAnnouncementWhereClause(
  input:
    | {
        search?: string;
        category?: AnnouncementCategoryType;
        isPublished?: boolean;
      }
    | undefined,
) {
  const conditions = [];
  if (input?.isPublished !== undefined) {
    conditions.push(eq(announcements.isPublished, input.isPublished));
  }
  if (input?.category !== undefined) {
    conditions.push(eq(announcements.category, input.category));
  }
  if (input?.search && input.search.trim().length > 0) {
    conditions.push(ilike(announcements.title, `%${input.search.trim()}%`));
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export const announcementsRouter = createTRPCRouter({
  list: editorProcedure
    .input(listAnnouncementsInputSchema)
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      return ctx.db
        .select()
        .from(announcements)
        .where(buildAnnouncementWhereClause(input))
        .orderBy(desc(announcements.eventDate), desc(announcements.createdAt))
        .limit(limit)
        .offset(offset);
    }),

  count: editorProcedure
    .input(listAnnouncementsInputSchema)
    .query(async ({ ctx, input }) => {
      const [result] = await ctx.db
        .select({ total: count() })
        .from(announcements)
        .where(buildAnnouncementWhereClause(input));
      return { total: Number(result?.total ?? 0) };
    }),

  getById: editorProcedure
    .input(announcementIdSchema)
    .query(async ({ ctx, input }) => {
      const [item] = await ctx.db
        .select()
        .from(announcements)
        .where(eq(announcements.id, input.id))
        .limit(1);

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Data pengumuman tidak ditemukan.",
        });
      }
      return item;
    }),

  create: editorProcedure
    .input(createAnnouncementSchema)
    .mutation(async ({ ctx, input }) => {
      const canPublish = canPublishOrDeleteContent(ctx.session.user.role);
      const isPublished = canPublish ? input.isPublished : false;

      const [created] = await ctx.db
        .insert(announcements)
        .values({
          title: input.title,
          category: input.category,
          content: input.content,
          eventDate: input.eventDate,
          isPublished,
        })
        .returning();

      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Gagal menyimpan pengumuman.",
        });
      }

      await writeAuditLog(ctx.db, {
        actorUserId: ctx.session.user.id,
        action: "CREATE_ANNOUNCEMENT",
        entityType: "ANNOUNCEMENT",
        entityId: created.id,
        metadata: {
          title: created.title,
          category: created.category,
          isPublished: created.isPublished,
        },
      });

      return created;
    }),

  update: editorProcedure
    .input(updateAnnouncementSchema)
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(announcements)
        .where(eq(announcements.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Data pengumuman tidak ditemukan.",
        });
      }

      const updateValues: Partial<typeof announcements.$inferInsert> = {};
      if (input.title !== undefined) updateValues.title = input.title;
      if (input.category !== undefined) updateValues.category = input.category;
      if (input.content !== undefined) updateValues.content = input.content;
      if (input.eventDate !== undefined) updateValues.eventDate = input.eventDate;

      const [updated] = await ctx.db
        .update(announcements)
        .set(updateValues)
        .where(eq(announcements.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Gagal memperbarui pengumuman.",
        });
      }

      await writeAuditLog(ctx.db, {
        actorUserId: ctx.session.user.id,
        action: "UPDATE_ANNOUNCEMENT",
        entityType: "ANNOUNCEMENT",
        entityId: updated.id,
        metadata: {
          title: updated.title,
          category: updated.category,
        },
      });

      return updated;
    }),

  setPublished: adminProcedure
    .input(setPublishedAnnouncementSchema)
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(announcements)
        .where(eq(announcements.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Data pengumuman tidak ditemukan.",
        });
      }

      const [updated] = await ctx.db
        .update(announcements)
        .set({ isPublished: input.isPublished })
        .where(eq(announcements.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Gagal mengubah status publikasi pengumuman.",
        });
      }

      await writeAuditLog(ctx.db, {
        actorUserId: ctx.session.user.id,
        action: input.isPublished
          ? "PUBLISH_ANNOUNCEMENT"
          : "UNPUBLISH_ANNOUNCEMENT",
        entityType: "ANNOUNCEMENT",
        entityId: updated.id,
        metadata: {
          title: updated.title,
          isPublished: updated.isPublished,
        },
      });

      return updated;
    }),

  delete: adminProcedure
    .input(announcementIdSchema)
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(announcements)
        .where(eq(announcements.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Data pengumuman tidak ditemukan.",
        });
      }

      await ctx.db.delete(announcements).where(eq(announcements.id, input.id));

      await writeAuditLog(ctx.db, {
        actorUserId: ctx.session.user.id,
        action: "DELETE_ANNOUNCEMENT",
        entityType: "ANNOUNCEMENT",
        entityId: input.id,
        metadata: {
          title: existing.title,
          category: existing.category,
        },
      });

      return { success: true };
    }),
});
