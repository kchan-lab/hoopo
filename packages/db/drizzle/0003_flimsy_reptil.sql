ALTER TABLE "coaches" ADD COLUMN "password_hash" text;--> statement-breakpoint
-- ハッシュ未設定の email コーチはログイン不能な不整合データ(ローカル開発 seed のみ想定。
-- stg/prod の coaches は空)。CHECK 追加前に削除して制約違反を防ぐ
DELETE FROM "coaches" WHERE "auth_type" = 'email' AND "password_hash" IS NULL;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_email_auth_requires_password" CHECK ("coaches"."auth_type" <> 'email' OR "coaches"."password_hash" IS NOT NULL);
