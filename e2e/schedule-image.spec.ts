import { expect, test } from "@playwright/test";
import { urls } from "./urls";

// 予定表画像の公開エンドポイント(Issue #91)。認証なしで PNG が返ることを確認する。
// フォントは Google Fonts から実行時にサブセット取得するため、取得できないと 503 になる。
// ここで 200 を期待するのは「フォントが壊れたら気づく」ため(plan.md 6b-2)。
// あわせて縦1列(#215)で REQUIREMENTS §6 どおりの寸法の PNG が出ていることを見る。
// ここでは実装の定数を import せず、仕様の数値(幅 1080 / 縦横比 1:2.0 以内 / 1MB 以内)で判定する

/** REQUIREMENTS §6: 予定表画像は幅 1080px */
const EXPECTED_WIDTH = 1080;
/** REQUIREMENTS §6: スマホの全画面表示に1か月が収まる縦横比(31日の月でも 1:2.0 以内) */
const MAX_ASPECT = 2.0;
/** 縦1列なので幅より十分に縦長になる(2カラムに戻っていたら下回る) */
const MIN_ASPECT = 1.6;
/** LINE は originalContentUrl と previewImageUrl に同じ URL を渡すので previewImageUrl の上限に合わせる */
const LINE_PREVIEW_MAX_BYTES = 1024 * 1024;

/** PNG の IHDR(シグネチャ8 + 長さ/型8 の直後)から寸法を読む */
function pngSize(body: Buffer): { width: number; height: number } {
  expect(body.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

test("練習の無い月でも PNG とキャッシュヘッダを返す", async ({ page }) => {
  const res = await page.request.get(`${urls.portal}/api/schedule/2027-04.png`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
  expect(res.headers()["cache-control"]).toContain("s-maxage=600");
  expect((await res.body()).length).toBeGreaterThan(2000);
});

test("縦1列でスマホ1画面に収まる寸法の PNG を返す(#215)", async ({ page }) => {
  // 31日の月と30日の月の両方で確認する
  for (const month of ["2027-05", "2027-06"]) {
    const res = await page.request.get(
      `${urls.portal}/api/schedule/${month}.png`,
    );
    expect(res.status()).toBe(200);
    const body = await res.body();
    const { width, height } = pngSize(body);
    expect(width).toBe(EXPECTED_WIDTH);
    expect(height / width).toBeGreaterThan(MIN_ASPECT);
    expect(height / width).toBeLessThanOrEqual(MAX_ASPECT);
    expect(body.length).toBeLessThan(LINE_PREVIEW_MAX_BYTES);
  }
});

test("月として不正なパスは 404", async ({ page }) => {
  expect(
    (
      await page.request.get(`${urls.portal}/api/schedule/2027-13.png`)
    ).status(),
  ).toBe(404);
  expect(
    (await page.request.get(`${urls.portal}/api/schedule/foo.png`)).status(),
  ).toBe(404);
});
