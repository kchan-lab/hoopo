import { randomBytes, randomInt } from "node:crypto";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { urls } from "./urls";

// 予定表の発行(Issue #90 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み(coach@example.com / hoopo-dev-login)。
// 練習は月に蓄積すると「n/total 件」がずれるため、テストごとに別の月を使う

/** 2031〜2090 年のランダムな月(admin-attendance / attendance と同じ流儀) */
function uniqueMonth(): string {
  const y = 2031 + randomInt(60);
  const m = String(1 + randomInt(12)).padStart(2, "0");
  return `${y}-${m}`;
}

async function loginAsCoach(page: Page) {
  await page.goto(`${urls.admin}/login`);
  await page.getByLabel("メールアドレス").fill("coach@example.com");
  await page.getByLabel("パスワード").fill("hoopo-dev-login");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator("main")).toContainText("ログインしました");
}

// フォームでログインした context の Cookie を共有するので、練習の作成は API で済ませる
async function createPractice(
  context: BrowserContext,
  heldOn: string,
  location: string,
) {
  const res = await context.request.post(`${urls.admin}/api/practices`, {
    data: {
      heldOn,
      startTime: "09:00",
      endTime: "12:00",
      location,
      note: null,
      menus: [],
    },
  });
  expect(res.status()).toBe(201);
}

test("月の予定表を発行し、追加分を再発行できる", async ({ page }) => {
  const month = uniqueMonth();
  const place = `体育館 ${randomBytes(2).toString("hex")}`;
  await loginAsCoach(page);
  await createPractice(page.context(), `${month}-10`, place);

  await page.goto(`${urls.admin}/schedule?month=${month}`);
  const card = page.locator(".pubcard");
  await expect(card.locator(".pubstat .pill")).toHaveText("未発行");

  // 発行(二段階確認)
  await card.getByRole("button", { name: "予定表を発行する" }).click();
  await expect(card).toContainText("の予定表を発行します。よろしいですか?");
  await card.getByRole("button", { name: "発行する", exact: true }).click();

  await expect(card.locator(".pubstat .pill")).toContainText("発行済み");
  const preview = card.getByRole("link", { name: "予定表画像を確認する" });
  await expect(preview).toHaveAttribute(
    "href",
    new RegExp(`/api/schedule/${month}\\.png`),
  );

  // 発行後に足した練習は未発行として残る
  await createPractice(page.context(), `${month}-20`, `${place} 第2`);
  await page.reload();
  await expect(card).toContainText("未発行の練習が 1 件あります");
  await expect(card.locator(".pubstat .pill")).toContainText("(1/2 件)");

  // 再発行で解消する
  await card.getByRole("button", { name: "予定表を再発行する" }).click();
  await card.getByRole("button", { name: "発行する", exact: true }).click();
  await expect(card).not.toContainText("未発行の練習が");
  await expect(card.locator(".pubstat .pill")).toContainText("発行済み");
});

test("練習が無い月は発行できない", async ({ page }) => {
  await loginAsCoach(page);
  await page.goto(`${urls.admin}/schedule?month=${uniqueMonth()}`);
  const card = page.locator(".pubcard");
  await expect(card.locator(".pubstat .pill")).toHaveText("未発行");
  const button = card.getByRole("button", { name: "予定表を発行する" });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute("title", "この月には練習がありません");
});
