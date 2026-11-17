import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, ilike, sql } from "drizzle-orm";

import {
  createGraduateSchema,
  graduateIdSchema,
  listGraduatesInputSchema,
  setPublishedSchema,
  updateGraduateSchema,
} from "~/lib/validators";
import {
  adminProcedure,
  createTRPCRouter,
  editorProcedure,
} from "~/server/api/trpc";
import { graduates } from "~/server/db/schema";
import { writeAuditLog } from "~/server/security/audit";
import { canPublishOrDeleteContent } from "~/server/security/rbac";

function buildGraduateWhereClause(input: {
  search?: string;
  entryYear?: number;
  graduationYear?: number;
  isPublished?: boolean;
} | undefined) {
  const conditions = [];
  if (input?.isPublished !== undefined) {
    conditions.push(eq(graduates.isPublished, input.isPublished));
  }
  if (input?.entryYear !== undefined) {
    conditions.push(eq(graduates.entryYear, input.entryYear));
  }
  if (input?.graduationYear !== undefined) {
    conditions.push(eq(graduates.graduationYear, input.graduationYear));
  }
  if (input?.search && input.search.trim().length > 0) {
    conditions.push(ilike(graduates.fullName, `%${input.search.trim()}%`));
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export const graduatesRouter = createTRPCRouter({
  list: editorProcedure
    .input(listGraduatesInputSchema)
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      return ctx.db
        .select()
        .from(graduates)
        .where(buildGraduateWhereClause(input))
        .orderBy(desc(graduates.graduationYear), graduates.fullName)
        .limit(limit)
        .offset(offset);
    }),

  count: editorProcedure
    .input(listGraduatesInputSchema)
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ value: count() })
        .from(graduates)
        .where(buildGraduateWhereClause(input));

      return { total: Number(row?.value ?? 0) };
    }),

  stats: editorProcedure.query(async ({ ctx }) => {
    const [totals] = await ctx.db
      .select({
        total: count(),
        published: sql<number>`cast(count(case when ${graduates.isPublished} = true then 1 end) as int)`,
        draft: sql<number>`cast(count(case when ${graduates.isPublished} = false then 1 end) as int)`,
      })
      .from(graduates);

    const recentChanges = await ctx.db
      .select({
        id: graduates.id,
        fullName: graduates.fullName,
        entryYear: graduates.entryYear,
        graduationYear: graduates.graduationYear,
        isPublished: graduates.isPublished,
        updatedAt: graduates.updatedAt,
      })
      .from(graduates)
      .orderBy(desc(graduates.updatedAt))
      .limit(5);

    return {
      total: Number(totals?.total ?? 0),
      published: Number(totals?.published ?? 0),
      draft: Number(totals?.draft ?? 0),
      recentChanges,
    };
  }),

  getById: editorProcedure
    .input(graduateIdSchema)
    .query(async ({ ctx, input }) => {
      const [record] = await ctx.db
        .select()
        .from(graduates)
        .where(eq(graduates.id, input.id))
        .limit(1);

      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Data lulusan tidak ditemukan.",
        });
      }

      return record;
    }),

  create: editorProcedure
    .input(createGraduateSchema)
    .mutation(async ({ ctx, input }) => {
      const effectiveIsPublished = canPublishOrDeleteContent(
        ctx.session.user.role,
      )
        ? input.isPublished
        : false;

      return ctx.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(graduates)
          .values({
            fullName: input.fullName,
            entryYear: input.entryYear,
            graduationYear: input.graduationYear,
            isPublished: effectiveIsPublished,
          })
          .returning();

        if (!created) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Gagal menyimpan data lulusan.",
          });
        }

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: "GRADUATE_CREATE",
          entityType: "GRADUATE",
          entityId: created.id,
          metadata: {
            fullName: created.fullName,
            entryYear: created.entryYear,
            graduationYear: created.graduationYear,
            isPublished: created.isPublished,
          },
        });

        return created;
      });
    }),

  update: editorProcedure
    .input(updateGraduateSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(graduates)
          .where(eq(graduates.id, input.id))
          .limit(1);

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Data lulusan tidak ditemukan.",
          });
        }

        const [updated] = await tx
          .update(graduates)
          .set({
            fullName: input.fullName,
            entryYear: input.entryYear,
            graduationYear: input.graduationYear,
            updatedAt: new Date(),
          })
          .where(eq(graduates.id, input.id))
          .returning();

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Gagal memperbarui data lulusan.",
          });
        }

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: "GRADUATE_UPDATE",
          entityType: "GRADUATE",
          entityId: updated.id,
          metadata: {
            fullName: updated.fullName,
            entryYear: updated.entryYear,
            graduationYear: updated.graduationYear,
          },
        });

        return updated;
      });
    }),

  setPublished: adminProcedure
    .input(setPublishedSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(graduates)
          .where(eq(graduates.id, input.id))
          .limit(1);

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Data lulusan tidak ditemukan.",
          });
        }

        const [updated] = await tx
          .update(graduates)
          .set({
            isPublished: input.isPublished,
            updatedAt: new Date(),
          })
          .where(eq(graduates.id, input.id))
          .returning();

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Gagal mengubah status publikasi lulusan.",
          });
        }

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: input.isPublished
            ? "GRADUATE_PUBLISH"
            : "GRADUATE_UNPUBLISH",
          entityType: "GRADUATE",
          entityId: updated.id,
          metadata: {
            isPublished: updated.isPublished,
          },
        });

        return updated;
      });
    }),

  delete: adminProcedure
    .input(graduateIdSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(graduates)
          .where(eq(graduates.id, input.id))
          .limit(1);

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Data lulusan tidak ditemukan.",
          });
        }

        await tx.delete(graduates).where(eq(graduates.id, input.id));

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: "GRADUATE_DELETE",
          entityType: "GRADUATE",
          entityId: existing.id,
          metadata: {
            fullName: existing.fullName,
            entryYear: existing.entryYear,
            graduationYear: existing.graduationYear,
          },
        });

        return { id: existing.id, deleted: true };
      });
    }),
});
