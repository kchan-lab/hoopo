ALTER TABLE "coaches" ADD COLUMN "line_user_id" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "line_user_id_lookup" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_team_lookup_unique" UNIQUE("team_id","line_user_id_lookup");--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_line_user_id_not_plaintext" CHECK ("coaches"."line_user_id" IS NULL OR "coaches"."line_user_id" !~ '^U[0-9a-f]{32}$');