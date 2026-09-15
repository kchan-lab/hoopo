-- children.name(フルネーム1本)を family_name / given_name と、その読み
-- family_name_kana / given_name_kana に置き換える(child-name-split/plan.md 設計判断1・2・5)。
-- 本番の部員は0件だが、ローカル/stg には seed 由来の行があるため
-- 「列追加 → 既存行を埋める → NOT NULL 化 → name 削除」の順で行う。
--
-- 姓・名は name を半角スペースで分割して埋める。分割できない名前(空白なし)は
-- given_name が空になってしまうので、その場合は元の名前をそのまま入れる。
-- 読みは name から作れないので、seed の部員(粉浜 太郎 / 粉浜 花子 / 北粉浜 次郎 / 東 三郎)
-- だけ固定値を入れ、それ以外の行には 'ふめい' を入れる(あとから画面で直せる)。
ALTER TABLE "children" ADD COLUMN "family_name" text;--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN "given_name" text;--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN "family_name_kana" text;--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN "given_name_kana" text;--> statement-breakpoint
UPDATE "children" SET
  "family_name" = split_part("name", ' ', 1),
  "given_name" = COALESCE(NULLIF(split_part("name", ' ', 2), ''), "name");--> statement-breakpoint
UPDATE "children" SET
  "family_name_kana" = CASE "family_name"
    WHEN '粉浜' THEN 'こはま'
    WHEN '北粉浜' THEN 'きたこはま'
    WHEN '東' THEN 'ひがし'
    ELSE 'ふめい'
  END,
  "given_name_kana" = CASE "given_name"
    WHEN '太郎' THEN 'たろう'
    WHEN '花子' THEN 'はなこ'
    WHEN '次郎' THEN 'じろう'
    WHEN '三郎' THEN 'さぶろう'
    ELSE 'ふめい'
  END;--> statement-breakpoint
ALTER TABLE "children" ALTER COLUMN "family_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "children" ALTER COLUMN "given_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "children" ALTER COLUMN "family_name_kana" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "children" ALTER COLUMN "given_name_kana" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "children" DROP COLUMN "name";
