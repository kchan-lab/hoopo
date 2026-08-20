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
  await ownerSql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hoopo_app_local') THEN
        CREATE ROLE hoopo_app_local LOGIN PASSWORD 'postgres'
          NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB IN ROLE hoopo_app;
      END IF;
    END
    $$
  `;
}
