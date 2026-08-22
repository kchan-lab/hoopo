import type postgres from "postgres";

// ローカル/CI 専用: アプリ用ログインロール hoopo_app_local を冪等に用意する。
// stg / prod のログインロールは手動作成(パスワードをコードに置かないため。plan.md 設計判断2d)。
// ここは接続先ガード(assertLocalDatabaseUrl)を通った後にのみ呼ばれる前提で、
// パスワードはローカル既定の 'postgres' に固定する

export const LOCAL_APP_ROLE = "hoopo_app_local";
export const LOCAL_APP_DATABASE_URL = `postgresql://${LOCAL_APP_ROLE}:postgres@localhost:54322/postgres`;

export async function ensureLocalAppRole(
  ownerSql: postgres.Sql,
): Promise<void> {
  // DO ブロック内は文字列リテラルのためバインドパラメータ化できず、
  // LOCAL_APP_ROLE をそのまま埋め込む(定数なのでインジェクションの懸念なし)
  await ownerSql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${LOCAL_APP_ROLE}') THEN
        CREATE ROLE ${LOCAL_APP_ROLE} LOGIN PASSWORD 'postgres'
          NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB IN ROLE hoopo_app;
      END IF;
    END
    $$
  `);
  // ロール別の search_path 設定は GRANT では継承されない(ログインロール自身に必要)ため、
  // マイグレーションの hoopo_app と同じ値をここで設定する。既存ロールにも効かせるため IF の外で毎回実行する
  await ownerSql.unsafe(
    `ALTER ROLE ${LOCAL_APP_ROLE} SET search_path = public, extensions, pg_temp`,
  );
}
