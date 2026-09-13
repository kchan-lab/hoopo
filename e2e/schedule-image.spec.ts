import { expect, test } from "@playwright/test";
import { urls } from "./urls";

// 予定表画像の公開エンドポイント(Issue #91)。認証なしで PNG が返ることを確認する。
// フォントは Google Fonts から実行時にサブセット取得するため、取得できないと 503 になる。
// ここで 200 を期待するのは「フォントが壊れたら気づく」ため(plan.md 6b-2)

test("練習の無い月でも PNG とキャッシュヘッダを返す", async ({ page }) => {
  const res = await page.request.get(`${urls.portal}/api/schedule/2027-04.png`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
  expect(res.headers()["cache-control"]).toContain("s-maxage=600");
  expect((await res.body()).length).toBeGreaterThan(2000);
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
