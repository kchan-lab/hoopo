import { describe, expect, it } from "vitest";

// CI パイプラインが動くことを示すためだけのサンプル。
// packages/line に実ロジック(LINE 通数計算・署名検証など)を実装したら、
// このファイルはその実ロジックのテストに差し替える(docs/DEVELOPMENT.md テスト戦略)。
describe("vitest セットアップ", () => {
  it("テストが実行され結果が判定される", () => {
    expect(1 + 1).toBe(2);
  });
});
