import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import {
  createLecturerSchema,
  lecturerIdSchema,
  listLecturersInputSchema,
  setPublishedSchema,
  updateLecturerSchema,
} from "~/lib/validators";
import {
  adminProcedure,
  createTRPCRouter,
  editorProcedure,
} from "~/server/api/trpc";
import { lecturers, publicationAuthors } from "~/server/db/schema";
import { writeAuditLog } from "~/server/security/audit";
import { canPublishOrDeleteContent } from "~/server/security/rbac";

function buildLecturerWhereClause(
  input:
    | {
        search?: string;
        isPublished?: boolean;
      }
    | undefined,
) {
  const conditions = [];
  if (input?.isPublished !== undefined) {
    conditions.push(eq(lecturers.isPublished, input.isPublished));
  }
  if (input?.search && input.search.trim().length > 0) {
    const q = `%${input.search.trim()}%`;
    conditions.push(
      or(
        ilike(lecturers.fullName, q),
        ilike(lecturers.nidn, q),
        ilike(lecturers.position, q),
        ilike(lecturers.expertise, q),
      ),
    );
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export const lecturersRouter = createTRPCRouter({
  list: editorProcedure
    .input(listLecturersInputSchema)
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;
      const canSeeNip = canPublishOrDeleteContent(ctx.session.user.role);

      const rows = await ctx.db
        .select()
        .from(lecturers)
        .where(buildLecturerWhereClause(input))
        .orderBy(lecturers.fullName)
        .limit(limit)
        .offset(offset);

      if (rows.length === 0) {
        return [];
      }

      const authorCounts = await ctx.db
        .select({
          lecturerId: publicationAuthors.lecturerId,
          value: count(),
        })
        .from(publicationAuthors)
        .where(
          inArray(
            publicationAuthors.lecturerId,
            rows.map((r) => r.id),
          ),
        )
        .groupBy(publicationAuthors.lecturerId);

      const countMap = new Map<string, number>();
      for (const row of authorCounts) {
        countMap.set(row.lecturerId, Number(row.value));
      }

      return rows.map((row) => ({
        ...row,
        nip: canSeeNip ? row.nip : null,
        publicationCount: countMap.get(row.id) ?? 0,
      }));
    }),

  count: editorProcedure
    .input(listLecturersInputSchema)
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ value: count() })
        .from(lecturers)
        .where(buildLecturerWhereClause(input));

      return { total: Number(row?.value ?? 0) };
    }),

  stats: editorProcedure.query(async ({ ctx }) => {
    const [totals] = await ctx.db
      .select({
        total: count(),
        published: sql<number>`cast(count(case when ${lecturers.isPublished} = true then 1 end) as int)`,
        draft: sql<number>`cast(count(case when ${lecturers.isPublished} = false then 1 end) as int)`,
      })
      .from(lecturers);

    const recentChanges = await ctx.db
      .select({
        id: lecturers.id,
        fullName: lecturers.fullName,
        position: lecturers.position,
        expertise: lecturers.expertise,
        isPublished: lecturers.isPublished,
        updatedAt: lecturers.updatedAt,
      })
      .from(lecturers)
      .orderBy(desc(lecturers.updatedAt))
      .limit(5);

    return {
      total: Number(totals?.total ?? 0),
      published: Number(totals?.published ?? 0),
      draft: Number(totals?.draft ?? 0),
      recentChanges,
    };
  }),

  getById: editorProcedure
    .input(lecturerIdSchema)
    .query(async ({ ctx, input }) => {
      const canSeeNip = canPublishOrDeleteContent(ctx.session.user.role);

      const [record] = await ctx.db
        .select()
        .from(lecturers)
        .where(eq(lecturers.id, input.id))
        .limit(1);

      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Data dosen tidak ditemukan.",
        });
      }

      const [pubCount] = await ctx.db
        .select({ value: count() })
        .from(publicationAuthors)
        .where(eq(publicationAuthors.lecturerId, record.id));

      return {
        ...record,
        nip: canSeeNip ? record.nip : null,
        publicationCount: Number(pubCount?.value ?? 0),
      };
    }),

  create: editorProcedure
    .input(createLecturerSchema)
    .mutation(async ({ ctx, input }) => {
      const isAdminOrSuper = canPublishOrDeleteContent(ctx.session.user.role);
      const effectiveIsPublished = isAdminOrSuper ? input.isPublished : false;
      const effectiveNip = isAdminOrSuper ? (input.nip ?? null) : null;

      return ctx.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(lecturers)
          .values({
            fullName: input.fullName,
            nidn: input.nidn ?? null,
            nip: effectiveNip,
            position: input.position,
            expertise: input.expertise,
            education: input.education ?? null,
            biography: input.biography ?? null,
            photoPath: input.photoPath ?? null,
            isPublished: effectiveIsPublished,
          })
          .returning();

        if (!created) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Gagal menyimpan data dosen.",
          });
        }

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: "LECTURER_CREATE",
          entityType: "LECTURER",
          entityId: created.id,
          metadata: {
            fullName: created.fullName,
            nidn: created.nidn,
            position: created.position,
            isPublished: created.isPublished,
          },
        });

        return {
          ...created,
          nip: isAdminOrSuper ? created.nip : null,
        };
      });
    }),

  update: editorProcedure
    .input(updateLecturerSchema)
    .mutation(async ({ ctx, input }) => {
      const isAdminOrSuper = canPublishOrDeleteContent(ctx.session.user.role);

      return ctx.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(lecturers)
          .where(eq(lecturers.id, input.id))
          .limit(1);

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Data dosen tidak ditemukan.",
          });
        }

        const [updated] = await tx
          .update(lecturers)
          .set({
            fullName: input.fullName,
            nidn: input.nidn ?? null,
            nip: isAdminOrSuper ? (input.nip ?? null) : existing.nip,
            position: input.position,
            expertise: input.expertise,
            education: input.education ?? null,
            biography: input.biography ?? null,
            photoPath: input.photoPath ?? null,
            updatedAt: new Date(),
          })
          .where(eq(lecturers.id, input.id))
          .returning();

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Gagal memperbarui data dosen.",
          });
        }

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: "LECTURER_UPDATE",
          entityType: "LECTURER",
          entityId: updated.id,
          metadata: {
            fullName: updated.fullName,
            nidn: updated.nidn,
            position: updated.position,
          },
        });

        return {
          ...updated,
          nip: isAdminOrSuper ? updated.nip : null,
        };
      });
    }),

  setPublished: adminProcedure
    .input(setPublishedSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(lecturers)
          .where(eq(lecturers.id, input.id))
          .limit(1);

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Data dosen tidak ditemukan.",
          });
        }

        const [updated] = await tx
          .update(lecturers)
          .set({
            isPublished: input.isPublished,
            updatedAt: new Date(),
          })
          .where(eq(lecturers.id, input.id))
          .returning();

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Gagal mengubah status publikasi dosen.",
          });
        }

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: input.isPublished
            ? "LECTURER_PUBLISH"
            : "LECTURER_UNPUBLISH",
          entityType: "LECTURER",
          entityId: updated.id,
          metadata: {
            isPublished: updated.isPublished,
          },
        });

        return updated;
      });
    }),

  delete: adminProcedure
    .input(lecturerIdSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(lecturers)
          .where(eq(lecturers.id, input.id))
          .limit(1);

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Data dosen tidak ditemukan.",
          });
        }

        const [linkedCount] = await tx
          .select({ value: count() })
          .from(publicationAuthors)
          .where(eq(publicationAuthors.lecturerId, input.id));

        if (Number(linkedCount?.value ?? 0) > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Dosen tidak dapat dihapus karena masih terdaftar sebagai penulis pada publikasi ilmiah. Lepaskan relasi penulis terlebih dahulu.",
          });
        }

        await tx.delete(lecturers).where(eq(lecturers.id, input.id));

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: "LECTURER_DELETE",
          entityType: "LECTURER",
          entityId: existing.id,
          metadata: {
            fullName: existing.fullName,
          },
        });

        return { id: existing.id, deleted: true };
      });
    }),
});
