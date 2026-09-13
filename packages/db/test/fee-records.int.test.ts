import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appClient, ownerClient, resetAndSeedTwoTeams } from "./helpers";

// 月次 fee_record 生成関数(0004)。全チームの有効な部員に当月の「未」を冪等に作る。
// アプリロール(hoopo_app 系)から SECURITY DEFINER で呼べることも確認する

const owner = ownerClient();
const app = appClient();

beforeEach(async () => {
  await resetAndSeedTwoTeams(owner);
});

afterAll(async () => {
  await owner.end();
  await app.end();
});

describe("generate_fee_records", () => {
  it("全チームの有効な部員に指定年月の未レコードを作り、再実行では増えない", async () => {
    const [first] = await owner`SELECT generate_fee_records(2030, 4) AS n`;
    expect(first?.n).toBe(2); // チーム A・B に1人ずつ
    const [second] = await owner`SELECT generate_fee_records(2030, 4) AS n`;
    expect(second?.n).toBe(0);
    const rows =
      await owner`SELECT status, received_at FROM fee_records WHERE year = 2030 AND month = 4`;
    expect(rows).toHaveLength(2);
    expect(
      rows.every((r) => r.status === "unpaid" && r.received_at === null),
    ).toBe(true);
  });

  it("無効化・アーカイブ済みの部員は対象外、月の範囲外はエラー", async () => {
    await owner`UPDATE children SET archived = true WHERE invite_code = 'CODEB00001'`;
    const [n] = await owner`SELECT generate_fee_records(2030, 5) AS n`;
    expect(n?.n).toBe(1);
    await expect(owner`SELECT generate_fee_records(2030, 13)`).rejects.toThrow(
      /month out of range/,
    );
  });

  it("アプリロールから今月分を生成できる(SECURITY DEFINER)", async () => {
    const [n] = await app`SELECT generate_current_fee_records() AS n`;
    expect(n?.n).toBe(2);
    const [row] = await owner`
      SELECT count(*)::int AS c FROM fee_records
      WHERE year = EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Tokyo'))
        AND month = EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Tokyo'))`;
    expect(row?.c).toBe(2);
  });
});
