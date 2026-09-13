CREATE TYPE "public"."line_message_kind" AS ENUM('schedule', 'announcement', 'reminder');--> statement-breakpoint
CREATE TYPE "public"."line_message_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TABLE "line_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"kind" "line_message_kind" NOT NULL,
	"ref" text NOT NULL,
	"recipient_count" integer NOT NULL,
	"status" "line_message_status" NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "line_messages_recipient_count_check" CHECK ("line_messages"."recipient_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "line_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "line_messages" ADD CONSTRAINT "line_messages_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "line_messages_team_sent_idx" ON "line_messages" USING btree ("team_id","sent_at");--> statement-breakpoint
CREATE POLICY "line_messages_team_isolation" ON "line_messages" AS PERMISSIVE FOR ALL TO "hoopo_app" USING (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid)) WITH CHECK (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid));--> statement-breakpoint
-- 新テーブルは 0001 に倣って個別に GRANT する(ALTER DEFAULT PRIVILEGES は使わない)
GRANT SELECT, INSERT, UPDATE, DELETE ON "line_messages" TO hoopo_app;
--> statement-breakpoint
-- 所有者にも RLS を効かせる(0001 と同じ方針)
ALTER TABLE "line_messages" FORCE ROW LEVEL SECURITY;
