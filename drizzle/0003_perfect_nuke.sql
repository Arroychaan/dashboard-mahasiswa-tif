CREATE TYPE "public"."announcement_category" AS ENUM('PENGUMUMAN', 'BERITA_ACARA');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"category" "announcement_category" DEFAULT 'PENGUMUMAN' NOT NULL,
	"content" text NOT NULL,
	"event_date" timestamp with time zone DEFAULT now() NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "announcements_is_published_idx" ON "announcements" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "announcements_category_idx" ON "announcements" USING btree ("category");--> statement-breakpoint
CREATE INDEX "announcements_event_date_idx" ON "announcements" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "announcements_published_date_idx" ON "announcements" USING btree ("is_published","event_date");