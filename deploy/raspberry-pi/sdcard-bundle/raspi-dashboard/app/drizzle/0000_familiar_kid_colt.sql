CREATE TYPE "public"."publication_kind" AS ENUM('JOURNAL', 'ARTICLE');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('SUPER_ADMIN', 'ADMIN', 'EDITOR');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(128) NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" varchar(128),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graduates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"entry_year" integer NOT NULL,
	"graduation_year" integer NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "graduates_entry_year_range_chk" CHECK ("graduates"."entry_year" >= 1950 AND "graduates"."entry_year" <= 2100),
	CONSTRAINT "graduates_graduation_year_valid_chk" CHECK ("graduates"."graduation_year" >= "graduates"."entry_year" AND "graduates"."graduation_year" <= 2100)
);
--> statement-breakpoint
CREATE TABLE "lecturers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"nidn" varchar(64),
	"nip" varchar(64),
	"position" varchar(255) NOT NULL,
	"expertise" varchar(255) NOT NULL,
	"education" text,
	"biography" text,
	"photo_path" varchar(512),
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publication_authors" (
	"publication_id" uuid NOT NULL,
	"lecturer_id" uuid NOT NULL,
	CONSTRAINT "publication_authors_pk" PRIMARY KEY("publication_id","lecturer_id")
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(512) NOT NULL,
	"kind" "publication_kind" NOT NULL,
	"journal_name" varchar(255) NOT NULL,
	"publication_year" integer NOT NULL,
	"doi" varchar(255),
	"url" varchar(1024),
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publications_year_range_chk" CHECK ("publications"."publication_year" >= 1950 AND "publications"."publication_year" <= 2100)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'EDITOR' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "publication_authors" ADD CONSTRAINT "publication_authors_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "publication_authors" ADD CONSTRAINT "publication_authors_lecturer_id_lecturers_id_fk" FOREIGN KEY ("lecturer_id") REFERENCES "public"."lecturers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_type_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "graduates_is_published_idx" ON "graduates" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "graduates_entry_year_idx" ON "graduates" USING btree ("entry_year");--> statement-breakpoint
CREATE INDEX "graduates_graduation_year_idx" ON "graduates" USING btree ("graduation_year");--> statement-breakpoint
CREATE INDEX "graduates_published_grad_year_idx" ON "graduates" USING btree ("is_published","graduation_year");--> statement-breakpoint
CREATE INDEX "lecturers_is_published_idx" ON "lecturers" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "lecturers_nidn_idx" ON "lecturers" USING btree ("nidn");--> statement-breakpoint
CREATE INDEX "lecturers_full_name_idx" ON "lecturers" USING btree ("full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "publication_authors_pub_lecturer_uq" ON "publication_authors" USING btree ("publication_id","lecturer_id");--> statement-breakpoint
CREATE INDEX "publication_authors_publication_id_idx" ON "publication_authors" USING btree ("publication_id");--> statement-breakpoint
CREATE INDEX "publication_authors_lecturer_id_idx" ON "publication_authors" USING btree ("lecturer_id");--> statement-breakpoint
CREATE INDEX "publications_is_published_idx" ON "publications" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "publications_publication_year_idx" ON "publications" USING btree ("publication_year");--> statement-breakpoint
CREATE INDEX "publications_kind_idx" ON "publications" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "publications_published_year_kind_idx" ON "publications" USING btree ("is_published","publication_year","kind");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_is_active_idx" ON "users" USING btree ("is_active");