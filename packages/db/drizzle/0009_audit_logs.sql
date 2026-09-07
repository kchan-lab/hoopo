CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_id" uuid,
	"detail" jsonb NOT NULL,
	"performed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_performed_by_coaches_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_team_created_idx" ON "audit_logs" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE POLICY "audit_logs_team_isolation" ON "audit_logs" AS PERMISSIVE FOR ALL TO "hoopo_app" USING (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid)) WITH CHECK (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid));--> statement-breakpoint
-- 新テーブルは 0001 に倣って個別に GRANT する(ALTER DEFAULT PRIVILEGES は使わない)
GRANT SELECT, INSERT, UPDATE, DELETE ON "audit_logs" TO hoopo_app;
--> statement-breakpoint
-- 所有者にも RLS を効かせる(0001 と同じ方針)
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
