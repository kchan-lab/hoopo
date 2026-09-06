CREATE TABLE "year_rollovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "year_rollovers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "year_rollovers" ADD CONSTRAINT "year_rollovers_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "year_rollovers_team_executed_idx" ON "year_rollovers" USING btree ("team_id","executed_at");--> statement-breakpoint
CREATE POLICY "year_rollovers_team_isolation" ON "year_rollovers" AS PERMISSIVE FOR ALL TO "hoopo_app" USING (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid)) WITH CHECK (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid));--> statement-breakpoint
-- 新テーブルは 0001 に倣って個別に GRANT する(ALTER DEFAULT PRIVILEGES は使わない)
GRANT SELECT, INSERT, UPDATE, DELETE ON "year_rollovers" TO hoopo_app;
--> statement-breakpoint
-- 所有者にも RLS を効かせる(0001 と同じ方針)
ALTER TABLE "year_rollovers" FORCE ROW LEVEL SECURITY;
