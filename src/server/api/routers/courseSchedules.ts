import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";

import {
  courseScheduleIdSchema,
  createCourseScheduleSchema,
  listCourseSchedulesInputSchema,
  setPublishedCourseScheduleSchema,
  updateCourseScheduleSchema,
  type DayOfWeekType,
} from "~/lib/validators";
import {
  adminProcedure,
  createTRPCRouter,
  editorProcedure,
} from "~/server/api/trpc";
import { courseSchedules } from "~/server/db/schema";
import { seedDummyCourseSchedules } from "~/server/db/seed-course-schedules";
import { writeAuditLog } from "~/server/security/audit";
import { canPublishOrDeleteContent } from "~/server/security/rbac";

const DAY_OF_WEEK_ORDER_SQL = sql<number>`CASE ${courseSchedules.dayOfWeek}
  WHEN 'SENIN' THEN 1
  WHEN 'SELASA' THEN 2
  WHEN 'RABU' THEN 3
  WHEN 'KAMIS' THEN 4
  WHEN 'JUMAT' THEN 5
  WHEN 'SABTU' THEN 6
  ELSE 7
END`;

function buildCourseScheduleWhereClause(
  input:
    | {
        search?: string;
        dayOfWeek?: DayOfWeekType;
        roomName?: string;
        isPublished?: boolean;
      }
    | undefined,
) {
  const conditions = [];
  if (input?.isPublished !== undefined) {
    conditions.push(eq(courseSchedules.isPublished, input.isPublished));
  }
  if (input?.dayOfWeek !== undefined) {
    conditions.push(eq(courseSchedules.dayOfWeek, input.dayOfWeek));
  }
  if (input?.roomName && input.roomName.trim().length > 0) {
    conditions.push(eq(courseSchedules.roomName, input.roomName.trim()));
  }
  if (input?.search && input.search.trim().length > 0) {
    const pattern = `%${input.search.trim()}%`;
    conditions.push(
      or(
        ilike(courseSchedules.courseName, pattern),
        ilike(courseSchedules.lecturerName, pattern),
        ilike(courseSchedules.roomName, pattern),
      ),
    );
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export const courseSchedulesRouter = createTRPCRouter({
  list: editorProcedure
    .input(listCourseSchedulesInputSchema)
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      return ctx.db
        .select()
        .from(courseSchedules)
        .where(buildCourseScheduleWhereClause(input))
        .orderBy(
          DAY_OF_WEEK_ORDER_SQL,
          asc(courseSchedules.startTime),
          asc(courseSchedules.roomName),
          asc(courseSchedules.courseName),
        )
        .limit(limit)
        .offset(offset);
    }),

  count: editorProcedure
    .input(listCourseSchedulesInputSchema)
    .query(async ({ ctx, input }) => {
      const [result] = await ctx.db
        .select({ total: count() })
        .from(courseSchedules)
        .where(buildCourseScheduleWhereClause(input));
      return { total: Number(result?.total ?? 0) };
    }),

  stats: editorProcedure.query(async ({ ctx }) => {
    const [totalRow] = await ctx.db
      .select({ value: count() })
      .from(courseSchedules);
    const [publishedRow] = await ctx.db
      .select({ value: count() })
      .from(courseSchedules)
      .where(eq(courseSchedules.isPublished, true));

    const recentChanges = await ctx.db
      .select({
        id: courseSchedules.id,
        courseName: courseSchedules.courseName,
        className: courseSchedules.className,
        dayOfWeek: courseSchedules.dayOfWeek,
        startTime: courseSchedules.startTime,
        endTime: courseSchedules.endTime,
        roomName: courseSchedules.roomName,
        isPublished: courseSchedules.isPublished,
        updatedAt: courseSchedules.updatedAt,
      })
      .from(courseSchedules)
      .orderBy(desc(courseSchedules.updatedAt))
      .limit(5);

    const total = Number(totalRow?.value ?? 0);
    const published = Number(publishedRow?.value ?? 0);

    return {
      total,
      published,
      draft: Math.max(0, total - published),
      recentChanges,
    };
  }),

  getById: editorProcedure
    .input(courseScheduleIdSchema)
    .query(async ({ ctx, input }) => {
      const [item] = await ctx.db
        .select()
        .from(courseSchedules)
        .where(eq(courseSchedules.id, input.id))
        .limit(1);

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Data jadwal mata kuliah tidak ditemukan.",
        });
      }
      return item;
    }),

  create: editorProcedure
    .input(createCourseScheduleSchema)
    .mutation(async ({ ctx, input }) => {
      const canPublish = canPublishOrDeleteContent(ctx.session.user.role);
      const isPublished = canPublish ? input.isPublished : false;

      const [created] = await ctx.db
        .insert(courseSchedules)
        .values({
          dayOfWeek: input.dayOfWeek,
          startTime: input.startTime,
          endTime: input.endTime,
          courseName: input.courseName,
          className: input.className,
          roomName: input.roomName,
          lecturerName: input.lecturerName,
          semester: input.semester ?? null,
          academicYear: input.academicYear?.trim() ? input.academicYear.trim() : null,
          isPublished,
        })
        .returning();

      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Gagal menyimpan jadwal mata kuliah.",
        });
      }

      await writeAuditLog(ctx.db, {
        actorUserId: ctx.session.user.id,
        action: "CREATE_COURSE_SCHEDULE",
        entityType: "COURSE_SCHEDULE",
        entityId: created.id,
        metadata: {
          courseName: created.courseName,
          className: created.className,
          dayOfWeek: created.dayOfWeek,
          startTime: created.startTime,
          endTime: created.endTime,
          roomName: created.roomName,
          isPublished: created.isPublished,
        },
      });

      return created;
    }),

  update: editorProcedure
    .input(updateCourseScheduleSchema)
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(courseSchedules)
        .where(eq(courseSchedules.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Data jadwal mata kuliah tidak ditemukan.",
        });
      }

      const [updated] = await ctx.db
        .update(courseSchedules)
        .set({
          dayOfWeek: input.dayOfWeek,
          startTime: input.startTime,
          endTime: input.endTime,
          courseName: input.courseName,
          className: input.className,
          roomName: input.roomName,
          lecturerName: input.lecturerName,
          semester: input.semester ?? null,
          academicYear: input.academicYear?.trim() ? input.academicYear.trim() : null,
        })
        .where(eq(courseSchedules.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Gagal memperbarui jadwal mata kuliah.",
        });
      }

      await writeAuditLog(ctx.db, {
        actorUserId: ctx.session.user.id,
        action: "UPDATE_COURSE_SCHEDULE",
        entityType: "COURSE_SCHEDULE",
        entityId: updated.id,
        metadata: {
          courseName: updated.courseName,
          className: updated.className,
          dayOfWeek: updated.dayOfWeek,
          roomName: updated.roomName,
        },
      });

      return updated;
    }),

  setPublished: adminProcedure
    .input(setPublishedCourseScheduleSchema)
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(courseSchedules)
        .where(eq(courseSchedules.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Data jadwal mata kuliah tidak ditemukan.",
        });
      }

      const [updated] = await ctx.db
        .update(courseSchedules)
        .set({ isPublished: input.isPublished })
        .where(eq(courseSchedules.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Gagal mengubah status publikasi jadwal mata kuliah.",
        });
      }

      await writeAuditLog(ctx.db, {
        actorUserId: ctx.session.user.id,
        action: input.isPublished
          ? "PUBLISH_COURSE_SCHEDULE"
          : "UNPUBLISH_COURSE_SCHEDULE",
        entityType: "COURSE_SCHEDULE",
        entityId: updated.id,
        metadata: {
          courseName: updated.courseName,
          roomName: updated.roomName,
          isPublished: updated.isPublished,
        },
      });

      return updated;
    }),

  delete: adminProcedure
    .input(courseScheduleIdSchema)
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(courseSchedules)
        .where(eq(courseSchedules.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Data jadwal mata kuliah tidak ditemukan.",
        });
      }

      await ctx.db
        .delete(courseSchedules)
        .where(eq(courseSchedules.id, input.id));

      await writeAuditLog(ctx.db, {
        actorUserId: ctx.session.user.id,
        action: "DELETE_COURSE_SCHEDULE",
        entityType: "COURSE_SCHEDULE",
        entityId: input.id,
        metadata: {
          courseName: existing.courseName,
          className: existing.className,
          roomName: existing.roomName,
        },
      });

      return { success: true };
    }),

  seedDummy: adminProcedure.mutation(async ({ ctx }) => {
    const result = await seedDummyCourseSchedules(ctx.db);

    if (!result.skipped && result.insertedCount > 0) {
      await writeAuditLog(ctx.db, {
        actorUserId: ctx.session.user.id,
        action: "SEED_DUMMY_COURSE_SCHEDULES",
        entityType: "COURSE_SCHEDULE",
        entityId: null,
        metadata: {
          insertedCount: result.insertedCount,
        },
      });
    }

    return result;
  }),
});
