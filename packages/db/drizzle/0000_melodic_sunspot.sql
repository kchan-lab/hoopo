CREATE TYPE "public"."approval_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('full', 'partial', 'absent');--> statement-breakpoint
CREATE TYPE "public"."fee_status" AS ENUM('paid', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."lineup_role" AS ENUM('starter', 'bench');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"notify_line" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"practice_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"comment" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendances_practice_child_unique" UNIQUE("practice_id","child_id"),
	CONSTRAINT "attendances_comment_partial_only" CHECK ("attendances"."status" = 'partial' OR "attendances"."comment" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "child_availabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "child_availabilities_child_slot_unique" UNIQUE("child_id","weekday","start_time"),
	CONSTRAINT "child_availabilities_weekday_check" CHECK ("child_availabilities"."weekday" BETWEEN 0 AND 6)
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"nickname_kana" text,
	"grade" smallint NOT NULL,
	"gender" text NOT NULL,
	"coach_note" text,
	"invite_code" text NOT NULL,
	"photo_path" text,
	"status" "approval_status" DEFAULT 'active' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "children_invite_code_unique" UNIQUE("invite_code"),
	CONSTRAINT "children_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "children_grade_check" CHECK ("children"."grade" BETWEEN 1 AND 6),
	CONSTRAINT "children_gender_check" CHECK ("children"."gender" IN ('male', 'female'))
);
--> statement-breakpoint
CREATE TABLE "coaches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"email" text NOT NULL,
	"auth_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coaches_email_unique" UNIQUE("email"),
	CONSTRAINT "coaches_auth_type_check" CHECK ("coaches"."auth_type" IN ('line', 'email'))
);
--> statement-breakpoint
CREATE TABLE "fee_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"year" smallint NOT NULL,
	"month" smallint NOT NULL,
	"status" "fee_status" DEFAULT 'unpaid' NOT NULL,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_records_child_year_month_unique" UNIQUE("child_id","year","month"),
	CONSTRAINT "fee_records_month_check" CHECK ("fee_records"."month" BETWEEN 1 AND 12)
);
--> statement-breakpoint
CREATE TABLE "guardian_children" (
	"team_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"status" "approval_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardian_children_guardian_id_child_id_pk" PRIMARY KEY("guardian_id","child_id"),
	CONSTRAINT "guardian_children_relation_check" CHECK ("guardian_children"."relation" IN ('father', 'mother', 'grandparent', 'other'))
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"line_user_id" text NOT NULL,
	"line_user_id_lookup" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardians_id_team_id_unique" UNIQUE("id","team_id"),
	CONSTRAINT "guardians_team_lookup_unique" UNIQUE("team_id","line_user_id_lookup"),
	CONSTRAINT "guardians_line_user_id_not_plaintext" CHECK ("guardians"."line_user_id" !~ '^U[0-9a-f]{32}$')
);
--> statement-breakpoint
CREATE TABLE "lineups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"practice_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"role" "lineup_role" NOT NULL,
	"position" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lineups_practice_child_unique" UNIQUE("practice_id","child_id"),
	CONSTRAINT "lineups_position_check" CHECK ("lineups"."position" IN ('PG', 'SG', 'SF', 'PF', 'C'))
);
--> statement-breakpoint
CREATE TABLE "practice_menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"practice_id" uuid NOT NULL,
	"duration_min" smallint,
	"content" text NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"held_on" date NOT NULL,
	"weekday" smallint GENERATED ALWAYS AS (EXTRACT(DOW FROM held_on)::smallint) STORED,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"location" text,
	"note" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practices_id_team_id_unique" UNIQUE("id","team_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"logo_path" text,
	"team_color" text,
	"line_group_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_line_group_id_unique" UNIQUE("line_group_id")
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_child_fk" FOREIGN KEY ("child_id","team_id") REFERENCES "public"."children"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_practice_fk" FOREIGN KEY ("practice_id","team_id") REFERENCES "public"."practices"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_availabilities" ADD CONSTRAINT "child_availabilities_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_availabilities" ADD CONSTRAINT "child_availabilities_child_fk" FOREIGN KEY ("child_id","team_id") REFERENCES "public"."children"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_records" ADD CONSTRAINT "fee_records_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_records" ADD CONSTRAINT "fee_records_child_fk" FOREIGN KEY ("child_id","team_id") REFERENCES "public"."children"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_children" ADD CONSTRAINT "guardian_children_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_children" ADD CONSTRAINT "guardian_children_guardian_fk" FOREIGN KEY ("guardian_id","team_id") REFERENCES "public"."guardians"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_children" ADD CONSTRAINT "guardian_children_child_fk" FOREIGN KEY ("child_id","team_id") REFERENCES "public"."children"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_practice_fk" FOREIGN KEY ("practice_id","team_id") REFERENCES "public"."practices"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_child_fk" FOREIGN KEY ("child_id","team_id") REFERENCES "public"."children"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_menus" ADD CONSTRAINT "practice_menus_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_menus" ADD CONSTRAINT "practice_menus_practice_fk" FOREIGN KEY ("practice_id","team_id") REFERENCES "public"."practices"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practices" ADD CONSTRAINT "practices_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_team_published_idx" ON "announcements" USING btree ("team_id","published_at");--> statement-breakpoint
CREATE INDEX "attendances_team_id_idx" ON "attendances" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "attendances_child_id_idx" ON "attendances" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "child_availabilities_team_id_idx" ON "child_availabilities" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "children_team_id_idx" ON "children" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "coaches_team_id_idx" ON "coaches" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "fee_records_team_id_idx" ON "fee_records" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "guardian_children_team_id_idx" ON "guardian_children" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "guardian_children_child_id_idx" ON "guardian_children" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "lineups_team_id_idx" ON "lineups" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "practice_menus_practice_id_idx" ON "practice_menus" USING btree ("practice_id","sort");--> statement-breakpoint
CREATE INDEX "practice_menus_team_id_idx" ON "practice_menus" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "practices_team_held_on_idx" ON "practices" USING btree ("team_id","held_on");