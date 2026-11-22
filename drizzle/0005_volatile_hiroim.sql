CREATE TYPE "public"."day_of_week" AS ENUM('SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU');--> statement-breakpoint
CREATE TABLE "course_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_of_week" "day_of_week" NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL,
	"course_name" varchar(255) NOT NULL,
	"class_name" varchar(32) NOT NULL,
	"room_name" varchar(64) NOT NULL,
	"lecturer_name" varchar(255) NOT NULL,
	"semester" integer,
	"academic_year" varchar(32),
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_schedules_semester_range_chk" CHECK ("course_schedules"."semester" IS NULL OR ("course_schedules"."semester" >= 1 AND "course_schedules"."semester" <= 8))
);
--> statement-breakpoint
CREATE INDEX "course_schedules_day_idx" ON "course_schedules" USING btree ("day_of_week");--> statement-breakpoint
CREATE INDEX "course_schedules_room_idx" ON "course_schedules" USING btree ("room_name");--> statement-breakpoint
CREATE INDEX "course_schedules_is_published_idx" ON "course_schedules" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "course_schedules_published_day_start_idx" ON "course_schedules" USING btree ("is_published","day_of_week","start_time");