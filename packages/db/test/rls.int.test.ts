import { sql } from "drizzle-orm";
import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeAppDb, withTeam } from "../src/client";
import { children } from "../src/schema";
import {
  appClient,
  ownerClient,
  resetAndSeedTwoTeams,
  type TwoTeamsFixture,
} from "./helpers";

// RLS 越境テスト(plan.md 設計判断11 の必須ケース①〜⑥)。
// docs/DEVELOPMENT.md テスト戦略「RLS の越境テストを必須ケースにする」の実装

let owner: postgres.Sql;
let app: postgres.Sql;
let fx: TwoTeamsFixture;

// drizzle はクエリ失敗を「Failed query: ...」でラップし、Postgres のエラーは cause に入る。
// message と cause の両方からエラー理由を検証する
async function expectDbReject(
  p: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  await expect(p).rejects.toSatisfy((e: unknown) => {
    const err = e as Error & { cause?: unknown };
    return pattern.test(`${err.message} ${String(err.cause ?? "")}`);
  }, `エラー理由が ${pattern} にマッチしない`);
}

beforeAll(() => {
  owner = ownerClient();
  app = appClient();
});

afterAll(async () => {
  await owner.end();
  await app.end();
  await closeAppDb();
});

beforeEach(async () => {
  fx = await resetAndSeedTwoTeams(owner);
});

describe("① 越境の遮断(SELECT/INSERT/UPDATE/DELETE)", () => {
  it("SELECT: 自チームの行だけが見える", async () => {
    const rows = await withTeam(fx.teamA, (tx) => tx.select().from(children));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("A子");
  });

  it("INSERT: 他チームの team_id を指定した行は作れない(WITH CHECK)", async () => {
    await expectDbReject(
      withTeam(fx.teamA, (tx) =>
        tx.insert(children).values({
          teamId: fx.teamB,
          name: "越境 太郎",
          grade: 1,
          gender: "male",
          inviteCode: "XBORDER001",
        }),
      ),
      /row-level security/,
    );
  });

  it("UPDATE: 他チームの行は更新できない(0件)", async () => {
    await withTeam(fx.teamA, async (tx) => {
      await tx.execute(
        sql`UPDATE children SET name = '書き換え' WHERE id = ${fx.childB}`,
      );
    });
    const [row] =
      await owner`SELECT name FROM children WHERE id = ${fx.childB}`;
    expect(row?.name).toBe("B男");
  });

  it("DELETE: 他チームの行は削除できない(0件)", async () => {
    await withTeam(fx.teamA, async (tx) => {
      await tx.execute(sql`DELETE FROM children WHERE id = ${fx.childB}`);
    });
    const [row] = await owner`SELECT count(*)::int AS count FROM children`;
    expect(row?.count).toBe(2);
  });
});

describe("② team_id の書き換えによる脱出の遮断", () => {
  it("自チームの行を他チームへ付け替える UPDATE は拒否される(WITH CHECK)", async () => {
    await expectDbReject(
      withTeam(fx.teamA, (tx) =>
        tx.execute(
          sql`UPDATE children SET team_id = ${fx.teamB} WHERE id = ${fx.childA}`,
        ),
      ),
      /row-level security/,
    );
  });
});

describe("③ コンテキスト未設定時は全遮断(fail-closed)", () => {
  it("set_config なしでは 1 行も見えない", async () => {
    const rows = await app`SELECT * FROM children`;
    expect(rows).toHaveLength(0);
    const teams = await app`SELECT * FROM teams`;
    expect(teams).toHaveLength(0);
  });

  it("set_config なしでは INSERT も拒否される", async () => {
    await expect(
      app`INSERT INTO children (team_id, name, grade, gender, invite_code)
          VALUES (${fx.teamA}, 'X', 1, 'male', 'XNOCTX0001')`,
    ).rejects.toThrow(/row-level security/);
  });
});

describe("④ 不正なコンテキスト値は拒否側に倒れる", () => {
  it("uuid でない値を設定するとクエリはエラーになる(開かない)", async () => {
    await expect(
      app.begin(async (tx) => {
        await tx`SELECT set_config('app.team_id', 'not-a-uuid', true)`;
        return tx`SELECT * FROM children`;
      }),
    ).rejects.toThrow(/invalid input syntax/);
  });

  it("空文字は NULL 扱いで 0 行(nullif による fail-closed)", async () => {
    const rows = await app.begin(async (tx) => {
      await tx`SELECT set_config('app.team_id', '', true)`;
      return tx`SELECT * FROM children`;
    });
    expect(rows).toHaveLength(0);
  });
});

describe("⑤ 接続再利用でコンテキストが残留しない(is_local=true の検証)", () => {
  it("トランザクション終了後、同一物理接続でも app.team_id は消えている", async () => {
    // max: 1 の接続はプーラの接続再利用と同じ状況を再現する
    const inside = await app.begin(async (tx) => {
      await tx`SELECT set_config('app.team_id', ${fx.teamA}, true)`;
      const rows = await tx`SELECT current_setting('app.team_id', true) AS v`;
      return rows[0]?.v;
    });
    expect(inside).toBe(fx.teamA);

    const [after] = await app`SELECT current_setting('app.team_id', true) AS v`;
    expect(after?.v ?? "").toBe("");

    const rows = await app`SELECT * FROM children`;
    expect(rows).toHaveLength(0);
  });

  // Supavisor 経由の残留検証。ローカルでプーラを有効化して APP_POOLER_DATABASE_URL を
  // 設定した場合のみ実行(CI は素の Postgres のためプーラなし。上のケースが同等の検証を担う)
  it.skipIf(!process.env.APP_POOLER_DATABASE_URL)(
    "プーラ経由でも app.team_id は残留しない",
    async () => {
      const { default: postgresLib } = await import("postgres");
      const pooled = postgresLib(
        process.env.APP_POOLER_DATABASE_URL as string,
        {
          max: 1,
          prepare: false,
        },
      );
      try {
        await pooled.begin(async (tx) => {
          await tx`SELECT set_config('app.team_id', ${fx.teamA}, true)`;
          await tx`SELECT 1`;
        });
        const [after] =
          await pooled`SELECT current_setting('app.team_id', true) AS v`;
        expect(after?.v ?? "").toBe("");
      } finally {
        await pooled.end();
      }
    },
  );
});

describe("⑥ 平文 line_user_id の拒否", () => {
  it("平文形式(U+32桁hex)は RLS 配下でも CHECK で拒否される", async () => {
    await expectDbReject(
      withTeam(fx.teamA, (tx) =>
        tx.execute(
          sql`INSERT INTO guardians (team_id, line_user_id, line_user_id_lookup)
           VALUES (${fx.teamA}, ${`U${"a".repeat(32)}`}, ${"b".repeat(64)})`,
        ),
      ),
      /guardians_line_user_id_not_plaintext/,
    );
  });
});

describe("SECURITY DEFINER 関数(team 未確定導線)", () => {
  it("resolve_invite_code はコンテキストなしで child と team を引ける", async () => {
    const rows = await app`SELECT * FROM resolve_invite_code('CODEA00001')`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.child_id).toBe(fx.childA);
    expect(rows[0]?.team_id).toBe(fx.teamA);
  });

  it("resolve_guardian_by_lookup はコンテキストなしで guardian と team を引ける", async () => {
    const rows =
      await app`SELECT * FROM resolve_guardian_by_lookup(${"a".repeat(64)})`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.guardian_id).toBe(fx.guardianA);
    expect(rows[0]?.team_id).toBe(fx.teamA);
  });

  it("存在しない招待コードは 0 行(存在推測に情報を漏らさない)", async () => {
    const rows = await app`SELECT * FROM resolve_invite_code('ZZZZZZZZZZ')`;
    expect(rows).toHaveLength(0);
  });
});
