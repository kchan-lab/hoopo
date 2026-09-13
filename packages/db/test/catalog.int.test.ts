import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ownerClient } from "./helpers";

// カタログのメタテスト(plan.md 設計判断11-⑦)。
// 「全テーブルに team_id / RLS」(CLAUDE.md 絶対原則5)を pg_catalog の走査で機械強制する。
// 新しいテーブルを RLS・team_id なしで追加すると、このテストが自動で落ちる

let owner: postgres.Sql;

beforeAll(() => {
  owner = ownerClient();
});

afterAll(async () => {
  await owner.end();
});

describe("⑦ カタログ検査(絶対原則5の恒久ガード)", () => {
  it("public の全テーブルで RLS が有効かつ FORCE されている", async () => {
    const rows = await owner`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname NOT LIKE '\\_\\_drizzle%'
    `;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.relrowsecurity, `${row.relname}: RLS が無効`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname}: FORCE RLS が無効`).toBe(
        true,
      );
    }
  });

  it("teams 以外の全テーブルに NOT NULL の team_id 列がある", async () => {
    const rows = await owner`
      SELECT t.tablename,
        (SELECT is_nullable FROM information_schema.columns col
         WHERE col.table_schema = 'public' AND col.table_name = t.tablename
           AND col.column_name = 'team_id') AS team_id_nullable
      FROM pg_tables t
      WHERE t.schemaname = 'public'
        AND t.tablename <> 'teams' AND t.tablename NOT LIKE '\\_\\_drizzle%'
    `;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(
        row.team_id_nullable,
        `${row.tablename}: team_id 列がない`,
      ).not.toBeNull();
      expect(
        row.team_id_nullable,
        `${row.tablename}: team_id が NULL 許可`,
      ).toBe("NO");
    }
  });

  it("全テーブルにポリシーが1本以上ある", async () => {
    const rows = await owner`
      SELECT t.tablename,
        (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = t.tablename)::int AS policies
      FROM pg_tables t
      WHERE t.schemaname = 'public' AND t.tablename NOT LIKE '\\_\\_drizzle%'
    `;
    for (const row of rows) {
      expect(
        row.policies,
        `${row.tablename}: ポリシーがない`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("アプリロールは BYPASSRLS / superuser を持たず、テーブル所有者でもない", async () => {
    const appRoleName = new URL(process.env.APP_DATABASE_URL as string)
      .username;
    const roles = await owner`
      SELECT rolname, rolsuper, rolbypassrls FROM pg_roles
      WHERE rolname IN ('hoopo_app', ${appRoleName})
    `;
    expect(roles.length).toBeGreaterThanOrEqual(2);
    for (const role of roles) {
      expect(role.rolsuper, `${role.rolname}: superuser になっている`).toBe(
        false,
      );
      expect(role.rolbypassrls, `${role.rolname}: BYPASSRLS を持っている`).toBe(
        false,
      );
    }
    const owners = await owner`
      SELECT tablename, tableowner FROM pg_tables
      WHERE schemaname = 'public' AND tableowner IN ('hoopo_app', ${appRoleName})
    `;
    expect(owners, "アプリロールがテーブル所有者になっている").toHaveLength(0);
  });

  it("anon / authenticated は public のテーブルに権限を持たない(存在する環境のみ)", async () => {
    const rows = await owner`
      SELECT r.rolname, t.tablename,
        has_table_privilege(r.rolname, format('public.%I', t.tablename),
          'SELECT, INSERT, UPDATE, DELETE') AS has_any
      FROM pg_roles r
      CROSS JOIN pg_tables t
      WHERE r.rolname IN ('anon', 'authenticated')
        AND t.schemaname = 'public' AND t.tablename NOT LIKE '\\_\\_drizzle%'
    `;
    for (const row of rows) {
      expect(
        row.has_any,
        `${row.rolname} が ${row.tablename} に権限を持っている`,
      ).toBe(false);
    }
  });

  it("SECURITY DEFINER 関数は許可された4本だけ(escape hatch の棚卸し)", async () => {
    const rows = await owner`
      SELECT p.proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef = true
      ORDER BY p.proname
    `;
    // 許可リスト(増やすときは plan.md に理由を残す):
    // - resolve_*: team 未確定導線の解決(#6)
    // - generate_*fee_records: 月次の月謝レコード生成ジョブ(0004、fees/plan.md 設計判断5)
    expect(rows.map((r) => r.proname)).toEqual([
      "generate_current_fee_records",
      "generate_fee_records",
      "resolve_guardian_by_lookup",
      "resolve_invite_code",
    ]);
  });
});
