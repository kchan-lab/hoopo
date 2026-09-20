-- children.grade の上限を 6 → 7 に広げる(grade-junior-high/plan.md 設計判断1・7)。
-- 7 は「中学1年生」。このチームには例外として中学1年生が在籍していて、
-- CHECK 制約(1..6)のままだと登録できない。列は smallint なので型の変更は不要。
-- 範囲を狭める方向ではないため、既存行の書き換えも起こらない。
ALTER TABLE "children" DROP CONSTRAINT "children_grade_check";--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_grade_check" CHECK ("children"."grade" BETWEEN 1 AND 7);