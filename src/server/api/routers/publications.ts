import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import {
  createPublicationSchema,
  deletePublicationSchema,
  listPublicationsInputSchema,
  publicationIdSchema,
  setPublishedSchema,
  updatePublicationSchema,
} from "~/lib/validators";
import {
  adminProcedure,
  createTRPCRouter,
  editorProcedure,
} from "~/server/api/trpc";
import {
  lecturers,
  publicationAuthors,
  publications,
} from "~/server/db/schema";
import { writeAuditLog } from "~/server/security/audit";
import { canPublishOrDeleteContent } from "~/server/security/rbac";

function buildPublicationWhereClause(
  input:
    | {
        search?: string;
        isPublished?: boolean;
        kind?: "JOURNAL" | "ARTICLE";
        publicationYear?: number;
      }
    | undefined,
) {
  const conditions = [];
  if (input?.isPublished !== undefined) {
    conditions.push(eq(publications.isPublished, input.isPublished));
  }
  if (input?.kind !== undefined) {
    conditions.push(eq(publications.kind, input.kind));
  }
  if (input?.publicationYear !== undefined) {
    conditions.push(eq(publications.publicationYear, input.publicationYear));
  }
  if (input?.search && input.search.trim().length > 0) {
    const q = `%${input.search.trim()}%`;
    conditions.push(
      or(
        ilike(publications.title, q),
        ilike(publications.journalName, q),
        ilike(publications.doi, q),
      ),
    );
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export const publicationsRouter = createTRPCRouter({
  list: editorProcedure
    .input(listPublicationsInputSchema)
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      const pubRows = await ctx.db
        .select()
        .from(publications)
        .where(buildPublicationWhereClause(input))
        .orderBy(desc(publications.publicationYear), publications.title)
        .limit(limit)
        .offset(offset);

      if (pubRows.length === 0) {
        return [];
      }

      const authorRows = await ctx.db
        .select({
          publicationId: publicationAuthors.publicationId,
          lecturerId: lecturers.id,
          fullName: lecturers.fullName,
          nidn: lecturers.nidn,
          isPublished: lecturers.isPublished,
        })
        .from(publicationAuthors)
        .innerJoin(
          lecturers,
          eq(publicationAuthors.lecturerId, lecturers.id),
        )
        .where(
          inArray(
            publicationAuthors.publicationId,
            pubRows.map((p) => p.id),
          ),
        );

      const authorsByPub = new Map<
        string,
        Array<{
          id: string;
          fullName: string;
          nidn: string | null;
          isPublished: boolean;
        }>
      >();

      for (const row of authorRows) {
        const list = authorsByPub.get(row.publicationId) ?? [];
        list.push({
          id: row.lecturerId,
          fullName: row.fullName,
          nidn: row.nidn,
          isPublished: row.isPublished,
        });
        authorsByPub.set(row.publicationId, list);
      }

      return pubRows.map((pub) => ({
        ...pub,
        authors: authorsByPub.get(pub.id) ?? [],
      }));
    }),

  count: editorProcedure
    .input(listPublicationsInputSchema)
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ value: count() })
        .from(publications)
        .where(buildPublicationWhereClause(input));

      return { total: Number(row?.value ?? 0) };
    }),

  stats: editorProcedure.query(async ({ ctx }) => {
    const [totals] = await ctx.db
      .select({
        total: count(),
        published: sql<number>`cast(count(case when ${publications.isPublished} = true then 1 end) as int)`,
        draft: sql<number>`cast(count(case when ${publications.isPublished} = false then 1 end) as int)`,
        journals: sql<number>`cast(count(case when ${publications.kind} = 'JOURNAL' then 1 end) as int)`,
        articles: sql<number>`cast(count(case when ${publications.kind} = 'ARTICLE' then 1 end) as int)`,
      })
      .from(publications);

    const recentChanges = await ctx.db
      .select({
        id: publications.id,
        title: publications.title,
        kind: publications.kind,
        journalName: publications.journalName,
        publicationYear: publications.publicationYear,
        isPublished: publications.isPublished,
        updatedAt: publications.updatedAt,
      })
      .from(publications)
      .orderBy(desc(publications.updatedAt))
      .limit(5);

    return {
      total: Number(totals?.total ?? 0),
      published: Number(totals?.published ?? 0),
      draft: Number(totals?.draft ?? 0),
      journals: Number(totals?.journals ?? 0),
      articles: Number(totals?.articles ?? 0),
      recentChanges,
    };
  }),

  getById: editorProcedure
    .input(publicationIdSchema)
    .query(async ({ ctx, input }) => {
      const [record] = await ctx.db
        .select()
        .from(publications)
        .where(eq(publications.id, input.id))
        .limit(1);

      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Data publikasi tidak ditemukan.",
        });
      }

      const authorLinks = await ctx.db
        .select({
          lecturerId: publicationAuthors.lecturerId,
        })
        .from(publicationAuthors)
        .where(eq(publicationAuthors.publicationId, record.id));

      return {
        ...record,
        lecturerIds: authorLinks.map((a) => a.lecturerId),
      };
    }),

  create: editorProcedure
    .input(createPublicationSchema)
    .mutation(async ({ ctx, input }) => {
      const uniqueLecturerIds = Array.from(new Set(input.lecturerIds));
      const effectiveIsPublished = canPublishOrDeleteContent(
        ctx.session.user.role,
      )
        ? input.isPublished
        : false;

      return ctx.db.transaction(async (tx) => {
        const existingLecturers = await tx
          .select({ id: lecturers.id })
          .from(lecturers)
          .where(inArray(lecturers.id, uniqueLecturerIds));

        if (existingLecturers.length !== uniqueLecturerIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Satu atau lebih ID dosen penulis tidak ditemukan di dalam database.",
          });
        }

        const [created] = await tx
          .insert(publications)
          .values({
            title: input.title,
            kind: input.kind,
            journalName: input.journalName,
            publicationYear: input.publicationYear,
            doi: input.doi ?? null,
            url: input.url ?? null,
            isPublished: effectiveIsPublished,
          })
          .returning();

        if (!created) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Gagal menyimpan data publikasi.",
          });
        }

        await tx.insert(publicationAuthors).values(
          uniqueLecturerIds.map((lecturerId) => ({
            publicationId: created.id,
            lecturerId,
          })),
        );

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: "PUBLICATION_CREATE",
          entityType: "PUBLICATION",
          entityId: created.id,
          metadata: {
            title: created.title,
            kind: created.kind,
            publicationYear: created.publicationYear,
            lecturerIds: uniqueLecturerIds,
            isPublished: created.isPublished,
          },
        });

        return {
          ...created,
          lecturerIds: uniqueLecturerIds,
        };
      });
    }),

  update: editorProcedure
    .input(updatePublicationSchema)
    .mutation(async ({ ctx, input }) => {
      const uniqueLecturerIds = Array.from(new Set(input.lecturerIds));

      return ctx.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(publications)
          .where(eq(publications.id, input.id))
          .limit(1);

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Data publikasi tidak ditemukan.",
          });
        }

        const existingLecturers = await tx
          .select({ id: lecturers.id })
          .from(lecturers)
          .where(inArray(lecturers.id, uniqueLecturerIds));

        if (existingLecturers.length !== uniqueLecturerIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Satu atau lebih ID dosen penulis tidak ditemukan di dalam database.",
          });
        }

        const [updated] = await tx
          .update(publications)
          .set({
            title: input.title,
            kind: input.kind,
            journalName: input.journalName,
            publicationYear: input.publicationYear,
            doi: input.doi ?? null,
            url: input.url ?? null,
            updatedAt: new Date(),
          })
          .where(eq(publications.id, input.id))
          .returning();

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Gagal memperbarui data publikasi.",
          });
        }

        // Explicitly synchronize publication_authors within the transaction
        await tx
          .delete(publicationAuthors)
          .where(eq(publicationAuthors.publicationId, updated.id));

        await tx.insert(publicationAuthors).values(
          uniqueLecturerIds.map((lecturerId) => ({
            publicationId: updated.id,
            lecturerId,
          })),
        );

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: "PUBLICATION_UPDATE",
          entityType: "PUBLICATION",
          entityId: updated.id,
          metadata: {
            title: updated.title,
            kind: updated.kind,
            publicationYear: updated.publicationYear,
            lecturerIds: uniqueLecturerIds,
          },
        });

        return {
          ...updated,
          lecturerIds: uniqueLecturerIds,
        };
      });
    }),

  setPublished: adminProcedure
    .input(setPublishedSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(publications)
          .where(eq(publications.id, input.id))
          .limit(1);

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Data publikasi tidak ditemukan.",
          });
        }

        if (input.isPublished) {
          const [authorCount] = await tx
            .select({ value: count() })
            .from(publicationAuthors)
            .where(eq(publicationAuthors.publicationId, existing.id));

          if (Number(authorCount?.value ?? 0) === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Publikasi tanpa dosen penulis tidak dapat dipublikasikan.",
            });
          }
        }

        const [updated] = await tx
          .update(publications)
          .set({
            isPublished: input.isPublished,
            updatedAt: new Date(),
          })
          .where(eq(publications.id, input.id))
          .returning();

        if (!updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Gagal mengubah status publikasi.",
          });
        }

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: input.isPublished
            ? "PUBLICATION_PUBLISH"
            : "PUBLICATION_UNPUBLISH",
          entityType: "PUBLICATION",
          entityId: updated.id,
          metadata: {
            isPublished: updated.isPublished,
          },
        });

        return updated;
      });
    }),

  delete: adminProcedure
    .input(deletePublicationSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(publications)
          .where(eq(publications.id, input.id))
          .limit(1);

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Data publikasi tidak ditemukan.",
          });
        }

        const [authorCount] = await tx
          .select({ value: count() })
          .from(publicationAuthors)
          .where(eq(publicationAuthors.publicationId, existing.id));

        if (
          Number(authorCount?.value ?? 0) > 0 &&
          input.confirmUnlinkAuthors !== true
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Publikasi masih memiliki relasi dosen penulis. Konfirmasi pelepasan relasi penulis (confirmUnlinkAuthors: true) diperlukan sebelum menghapus.",
          });
        }

        if (Number(authorCount?.value ?? 0) > 0) {
          await tx
            .delete(publicationAuthors)
            .where(eq(publicationAuthors.publicationId, existing.id));
        }

        await tx.delete(publications).where(eq(publications.id, existing.id));

        await writeAuditLog(tx, {
          actorUserId: ctx.session.user.id,
          action: "PUBLICATION_DELETE",
          entityType: "PUBLICATION",
          entityId: existing.id,
          metadata: {
            title: existing.title,
            kind: existing.kind,
            publicationYear: existing.publicationYear,
          },
        });

        return { id: existing.id, deleted: true };
      });
    }),
});
