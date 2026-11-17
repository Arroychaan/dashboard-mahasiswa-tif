CREATE TYPE "public"."system_theme" AS ENUM('LIGHT', 'DARK', 'MONOCHROME');--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "system_settings_updated_by_user_id_idx" ON "system_settings" USING btree ("updated_by_user_id");