ALTER TABLE "children" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN "height_cm" smallint;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_height_cm_check" CHECK ("children"."height_cm" IS NULL OR "children"."height_cm" BETWEEN 80 AND 220);