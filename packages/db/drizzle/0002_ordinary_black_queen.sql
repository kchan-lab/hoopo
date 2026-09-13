ALTER TABLE "announcements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "child_availabilities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "children" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coaches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fee_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guardian_children" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guardians" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lineups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "practice_menus" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "practices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "announcements_team_isolation" ON "announcements" AS PERMISSIVE FOR ALL TO "hoopo_app" USING (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid)) WITH CHECK (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "attendances_team_isolation" ON "attendances" AS PERMISSIVE FOR ALL TO "hoopo_app" USING (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid)) WITH CHECK (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "child_availabilities_team_isolation" ON "child_availabilities" AS PERMISSIVE FOR ALL TO "hoopo_app" USING (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid)) WITH CHECK (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "children_team_isolation" ON "children" AS PERMISSIVE FOR ALL TO "hoopo_app" USING (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid)) WITH CHECK (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "coaches_team_isolation" ON "coaches" AS PERMISSIVE FOR ALL TO "hoopo_app" USING (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid)) WITH CHECK (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "fee_records_team_isolation" ON "fee_records" AS PERMISSIVE FOR ALL TO "hoopo_app" USING (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid)) WITH CHECK (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "guardian_children_team_isolation" ON "guardian_children" AS PERMISSIVE FOR ALL TO "hoopo_app" USING (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid)) WITH CHECK (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "guardians_team_isolation" ON "guardians" AS PERMISSIVE FOR ALL TO "hoopo_app" USING (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid)) WITH CHECK (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "lineups_team_isolation" ON "lineups" AS PERMISSIVE FOR ALL TO "hoopo_app" USING (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid)) WITH CHECK (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "practice_menus_team_isolation" ON "practice_menus" AS PERMISSIVE FOR ALL TO "hoopo_app" USING (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid)) WITH CHECK (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "practices_team_isolation" ON "practices" AS PERMISSIVE FOR ALL TO "hoopo_app" USING (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid)) WITH CHECK (team_id = (select nullif(current_setting('app.team_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "teams_team_isolation" ON "teams" AS PERMISSIVE FOR ALL TO "hoopo_app" USING (id = (select nullif(current_setting('app.team_id', true), '')::uuid)) WITH CHECK (id = (select nullif(current_setting('app.team_id', true), '')::uuid));