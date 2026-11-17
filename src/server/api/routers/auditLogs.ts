import { desc, eq } from "drizzle-orm";

import { listAuditLogsInputSchema } from "~/lib/validators";
import { createTRPCRouter, superAdminProcedure } from "~/server/api/trpc";
import { auditLogs, users } from "~/server/db/schema";

/**
 * Audit Logs Router (`auditLogs`)
 * Restricted strictly to `SUPER_ADMIN` per RBAC policy.
 */
export const auditLogsRouter = createTRPCRouter({
  list: superAdminProcedure
    .input(listAuditLogsInputSchema)
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      return ctx.db
        .select({
          id: auditLogs.id,
          actorUserId: auditLogs.actorUserId,
          actorName: users.name,
          actorEmail: users.email,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          metadata: auditLogs.metadata,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorUserId, users.id))
        .where(
          input?.entityType
            ? eq(auditLogs.entityType, input.entityType.trim().toUpperCase())
            : undefined,
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset);
    }),
});
