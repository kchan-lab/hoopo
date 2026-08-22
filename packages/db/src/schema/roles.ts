import { pgRole } from "drizzle-orm/pg-core";

// アプリの権限保持ロール(NOLOGIN / NOBYPASSRLS)。作成・GRANT はカスタムマイグレーション
// (drizzle/0001_app_role_and_rls.sql)で行うため existing() で宣言だけする。
// 環境別のログインロール(hoopo_app_local / _stg / _prod)は GRANT hoopo_app で権限を継承する
// (plan.md 設計判断2d)
export const hoopoApp = pgRole("hoopo_app").existing();
