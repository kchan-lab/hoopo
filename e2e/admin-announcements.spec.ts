import { randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { urls } from "./urls";

// お知らせ管理の導線(Issue #86 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み(coach@example.com / hoopo-dev-login)。
// シードのお知らせと衝突しないよう、タイトルは実行ごとにユニークにする

async function loginAsCoach(page: Page) {
  await page.goto(`${urls.admin}/login`);
  await page.getByLabel("メールアドレス").fill("coach@example.com");
  await page.getByLabel("パスワード").fill("hoopo-dev-login");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator("main")).toContainText("ログインしました");
}

test("お知らせを下書き保存・公開・下書きに戻す・削除できる", async ({
  page,
}) => {
  const title = `体育館の変更 ${randomBytes(2).toString("hex")}`;
  await loginAsCoach(page);
  await page.goto(`${urls.admin}/announcements`);
  await expect(page.locator(".ah b")).toContainText("お知らせ");

  // 下書き保存
  await page.getByRole("button", { name: "お知らせを作成" }).click();
  await page.getByLabel("タイトル").fill(title);
  await page
    .getByLabel("本文")
    .fill("9月の練習は粉浜小学校の体育館で行います。");
  await page.getByRole("button", { name: "下書き保存" }).click();

  const card = page.locator(".acard", { hasText: title });
  await expect(card.locator(".pill").first()).toHaveText("下書き");
  await expect(card).toContainText("粉浜小学校の体育館");

  // 公開する(LINE 通知フラグも保存だけされる)
  await card.getByRole("button", { name: "編集" }).click();
  await page
    .getByLabel("公開時に LINE へ通知する(6c で有効化・現在は保存のみ)")
    .check();
  // 下書きを編集中なので主ボタンは「公開する」(公開済みの編集時は「更新して公開」)
  await page.getByRole("button", { name: "公開する", exact: true }).click();
  await expect(card.locator(".pill").first()).toHaveText("公開");
  await expect(card).toContainText("LINE 通知あり");

  // タイトルを編集しても公開のまま
  await card.getByRole("button", { name: "編集" }).click();
  await page.getByLabel("タイトル").fill(`${title} 改`);
  await page.getByRole("button", { name: "更新して公開" }).click();
  const edited = page.locator(".acard", { hasText: `${title} 改` });
  await expect(edited.locator(".pill").first()).toHaveText("公開");

  // 下書きに戻す
  await edited.getByRole("button", { name: "編集" }).click();
  await page.getByRole("button", { name: "下書きに戻す" }).click();
  await expect(edited.locator(".pill").first()).toHaveText("下書き");

  // 削除(二段階確認)
  await edited.getByRole("button", { name: "削除", exact: true }).click();
  await expect(edited).toContainText("このお知らせを削除しますか?");
  await edited.getByRole("button", { name: "削除する" }).click();
  await expect(page.locator(".acard", { hasText: title })).toHaveCount(0);
});

test("タイトル未入力は保存できずエラーを表示する", async ({ page }) => {
  await loginAsCoach(page);
  await page.goto(`${urls.admin}/announcements`);
  await page.getByRole("button", { name: "お知らせを作成" }).click();
  await page.getByLabel("本文").fill("本文だけ入力した状態");
  await page.getByRole("button", { name: "下書き保存" }).click();
  await expect(page.locator(".pform").getByRole("alert")).toContainText(
    "タイトルは1〜100文字",
  );
});
