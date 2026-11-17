import { auditLogsRouter } from "~/server/api/routers/auditLogs";
import { graduatesRouter } from "~/server/api/routers/graduates";
import { lecturersRouter } from "~/server/api/routers/lecturers";
import { publicationsRouter } from "~/server/api/routers/publications";
import { publicDashboardRouter } from "~/server/api/routers/publicDashboard";
import { systemSettingsRouter } from "~/server/api/routers/systemSettings";
import { usersRouter } from "~/server/api/routers/users";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * Primary application tRPC router with locked router keys.
 */
export const appRouter = createTRPCRouter({
  publicDashboard: publicDashboardRouter,
  graduates: graduatesRouter,
  lecturers: lecturersRouter,
  publications: publicationsRouter,
  users: usersRouter,
  auditLogs: auditLogsRouter,
  systemSettings: systemSettingsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
