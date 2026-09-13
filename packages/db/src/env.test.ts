import { describe, expect, it } from "vitest";
import { resolveMigrateTarget } from "./env";

const LOCAL_URL = "postgresql://postgres:postgres@localhost:54322/postgres";
const CLOUD_URL =
  "postgresql://hoopo_app_stg:x@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";

describe("resolveMigrateTarget(prod 誤爆防止ガード)", () => {
  it("local は DATABASE_URL を使い、確認は不要", () => {
    expect(resolveMigrateTarget("local", { DATABASE_URL: LOCAL_URL })).toEqual({
      url: LOCAL_URL,
      requiresConfirmation: false,
    });
  });

  it("local はコンテナ用ホスト名を localhost に読み替える", () => {
    const result = resolveMigrateTarget("local", {
      DATABASE_URL:
        "postgresql://postgres:postgres@host.docker.internal:54322/postgres",
    });
    expect(new URL(result.url).hostname).toBe("localhost");
  });

  it("local でクラウド URL が渡されたら接続前に拒否する", () => {
    expect(() =>
      resolveMigrateTarget("local", { DATABASE_URL: CLOUD_URL }),
    ).toThrow("ローカルではありません");
  });

  it("stg は STG_DATABASE_URL を使い、確認は不要", () => {
    expect(
      resolveMigrateTarget("stg", { STG_DATABASE_URL: CLOUD_URL }),
    ).toEqual({ url: CLOUD_URL, requiresConfirmation: false });
  });

  it("prod は PROD_DATABASE_URL を使い、実行前の確認を要求する", () => {
    expect(
      resolveMigrateTarget("prod", { PROD_DATABASE_URL: CLOUD_URL }),
    ).toEqual({ url: CLOUD_URL, requiresConfirmation: true });
  });

  it("接続先の環境変数が未設定なら fail-fast する", () => {
    expect(() => resolveMigrateTarget("stg", {})).toThrow("STG_DATABASE_URL");
    expect(() => resolveMigrateTarget("prod", {})).toThrow("PROD_DATABASE_URL");
  });

  it("不明なターゲットは拒否する", () => {
    expect(() =>
      resolveMigrateTarget("production", { PROD_DATABASE_URL: CLOUD_URL }),
    ).toThrow("不明なターゲット");
  });
});
