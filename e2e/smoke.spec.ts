import { expect, test } from "@playwright/test";
import { urls } from "./urls";

// Playwright の雛形が実際に動くことの確認。導線のテスト(登録→発行→提出→月謝)は
// 各縦切り Issue の受入条件として追加していく(docs/DEVELOPMENT.md テスト戦略)。
test("portal のトップページが表示される", async ({ page }) => {
  await page.goto(urls.portal);
  await expect(page.locator("main")).toContainText("ミニバスれんらくポータル");
});

test("admin のトップページが表示される", async ({ page }) => {
  await page.goto(urls.admin);
  await expect(page.locator("main")).toContainText("hoopo 管理");
});
