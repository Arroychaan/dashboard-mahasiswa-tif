DROP INDEX "announcements_published_date_idx";--> statement-breakpoint
ALTER TABLE "announcements" ALTER COLUMN "event_date" DROP DEFAULT;