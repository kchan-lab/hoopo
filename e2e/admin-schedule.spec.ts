import { randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { urls } from "./urls";

// 日程管理の導線(Issue #71 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み(coach@example.com / hoopo-dev-login)。
// シードの練習(2026-09)と衝突しないよう、テストは 2027-01 の月で行う

async function loginAsCoach(page: Page) {
  await page.goto(`${urls.admin}/login`);
  await page.getByLabel("メールアドレス").fill("coach@example.com");
  await page.getByLabel("パスワード").fill("hoopo-dev-login");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator("main")).toContainText("ダッシュボード");
}

test("練習を登録・編集・削除できる(メニュー付き)", async ({ page }) => {
  const place = `体育館 ${randomBytes(2).toString("hex")}`;
  await loginAsCoach(page);
  await page.goto(`${urls.admin}/schedule?month=2027-01`);
  await expect(page.locator(".ah b")).toContainText("日程管理");
  await expect(page.locator(".month-nav .pill")).toHaveText("2027年1月");

  // 追加
  await page.getByRole("button", { name: "行を追加" }).click();
  await page.getByLabel("日付").fill("2027-01-10");
  await page.getByLabel("開始").fill("09:00");
  await page.getByLabel("終了").fill("12:00");
  await page.getByLabel("場所").fill(place);
  await page.getByLabel("備考").fill("水筒持参");
  await page.getByRole("button", { name: "メニューを追加" }).click();
  await page.getByLabel("メニュー1の所要時間(分)").fill("15");
  await page.getByLabel("メニュー1の内容").fill("アップ");
  await page.getByRole("button", { name: "保存", exact: true }).click();

  const row = page.locator(".prow", { hasText: place });
  await expect(row).toContainText("1/10 (日) 09:00–12:00");
  await expect(row).toContainText("備考: 水筒持参");
  await expect(row).toContainText("メニュー 1件");

  // 編集(場所を変更、メニューを1件追加)
  await row.getByRole("button", { name: "編集" }).click();
  await page.getByLabel("場所").fill(`${place} 第2`);
  await page.getByRole("button", { name: "メニューを追加" }).click();
  await page.getByLabel("メニュー2の内容").fill("ゲーム形式");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const edited = page.locator(".prow", { hasText: `${place} 第2` });
  await expect(edited).toContainText("メニュー 2件");

  // 削除(二段階確認)
  await edited.getByRole("button", { name: "削除", exact: true }).click();
  await expect(edited).toContainText("この練習を削除しますか?");
  await edited.getByRole("button", { name: "削除する" }).click();
  await expect(page.locator(".prow", { hasText: place })).toHaveCount(0);
});

test("月の切替と入力エラー表示", async ({ page }) => {
  await loginAsCoach(page);
  await page.goto(`${urls.admin}/schedule?month=2027-01`);
  await page.getByRole("link", { name: "次の月" }).click();
  await expect(page.locator(".month-nav .pill")).toHaveText("2027年2月");

  await page.getByRole("button", { name: "行を追加" }).click();
  await page.getByLabel("開始").fill("13:00");
  await page.getByLabel("終了").fill("09:00");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".pform").getByRole("alert")).toContainText(
    "終了時刻は開始時刻より後",
  );
});
