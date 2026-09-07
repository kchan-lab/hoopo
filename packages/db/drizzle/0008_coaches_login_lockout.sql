ALTER TABLE "coaches" ADD COLUMN "failed_login_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "locked_until" timestamp with time zone;