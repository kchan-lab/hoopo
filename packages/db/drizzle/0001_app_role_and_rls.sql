-- カスタムマイグレーション(plan.md 設計判断2d・9)。
-- アプリの権限保持ロール hoopo_app と、RLS の強制、team 未確定導線用の SECURITY DEFINER 関数を定義する。
-- 環境別ログインロール(hoopo_app_local / _stg / _prod)はパスワードを含むためここでは作らず、
-- 環境ごとに手動作成して GRANT hoopo_app で権限を継承させる。

-- 権限保持ロール(冪等)。BYPASSRLS を持たず、テーブル所有者にもしない
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hoopo_app') THEN
    CREATE ROLE hoopo_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
  END IF;
END
$$;--> statement-breakpoint

-- search_path 経由のオブジェクトすり替え防止(extensions は Supabase 環境のみ存在。無い環境では無視される)。
-- pg_temp を末尾に明示する(明示しないと暗黙に先頭で検索され、一時テーブルが本物のテーブルを隠蔽できる)。
-- ロール別設定はログイン時のロールにしか適用されず GRANT では継承されないため、
-- 環境別ログインロール(hoopo_app_local / _stg / _prod)にも作成時に同じ設定を入れること
ALTER ROLE hoopo_app SET search_path = public, extensions, pg_temp;--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO hoopo_app;--> statement-breakpoint

-- テーブル単位で明示 GRANT する(ALTER DEFAULT PRIVILEGES は使わない — ポリシー未設定の
-- 新テーブルが自動で開くのを防ぐため。新テーブル追加時はこのファイルに倣って個別に GRANT する)
GRANT SELECT, INSERT, UPDATE, DELETE ON
  coaches, guardians, guardian_children, children, child_availabilities,
  practices, practice_menus, attendances, fee_records, announcements, lineups
TO hoopo_app;--> statement-breakpoint

-- teams の作成・削除は運用オペレーションの責務(アプリからは参照と設定変更のみ)
GRANT SELECT, UPDATE ON teams TO hoopo_app;--> statement-breakpoint

-- Supabase の自動公開ロールからは明示的に剥奪する(クラウド側の既定変化に依存しない)。
-- 素の Postgres(CI)には存在しないため存在チェック付き
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
  END IF;
END
$$;--> statement-breakpoint

-- 全テーブルで RLS を有効化+FORCE(テーブル所有者のバイパスも封じる)。
-- ポリシー本体は次のマイグレーション(drizzle-kit generate による pgPolicy 反映)で作成される
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE teams FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE coaches FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE guardians FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE guardian_children ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE guardian_children FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE children ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE children FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE child_availabilities ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE child_availabilities FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE practices ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE practices FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE practice_menus ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE practice_menus FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE attendances FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE fee_records ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE fee_records FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE announcements FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE lineups ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE lineups FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- team 未確定導線(初回登録・LIFF ログイン)の escape hatch はこの2関数に限定する(plan.md 設計判断9)。
-- 返す列は ID と team_id のみ。これ以外の目的で RLS を迂回する接続をアプリから使うことは禁止
CREATE OR REPLACE FUNCTION public.resolve_invite_code(code text)
RETURNS TABLE (child_id uuid, team_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.team_id FROM children c
  WHERE c.invite_code = code AND c.archived = false
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.resolve_guardian_by_lookup(lookup text)
RETURNS TABLE (guardian_id uuid, team_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT g.id, g.team_id FROM guardians g
  WHERE g.line_user_id_lookup = lookup
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.resolve_invite_code(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_invite_code(text) TO hoopo_app;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_guardian_by_lookup(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.resolve_guardian_by_lookup(text) TO hoopo_app;
