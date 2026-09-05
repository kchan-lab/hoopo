import { randomBytes } from "node:crypto";
import { type BrowserContext, expect, test } from "@playwright/test";
import { urls } from "./urls";

// 保護者の日程(リスト/カレンダー/詳細)とホームの次回練習(Issue #72 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み。練習はコーチの API で作り(2027-03)、保護者で確認する

async function createPracticeAsCoach(
  context: BrowserContext,
  heldOn: string,
  location: string,
) {
  const login = await context.request.post(`${urls.admin}/api/auth/login`, {
    data: { email: "coach@example.com", password: "hoopo-dev-login" },
  });
  expect(login.ok()).toBe(true);
  const res = await context.request.post(`${urls.admin}/api/practices`, {
    data: {
      heldOn,
      startTime: "09:00",
      endTime: "12:00",
      location,
      note: "練習試合",
      menus: [
        { durationMin: 15, content: "アップ" },
        { durationMin: 45, content: "ゲーム形式(5対5)" },
      ],
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { practice: { id: string } }).practice.id;
}

async function loginAsGuardian(context: BrowserContext) {
  const res = await context.request.post(`${urls.portal}/api/auth/line`, {
    data: { idToken: `fake:U${randomBytes(16).toString("hex")}` },
  });
  expect(res.ok()).toBe(true);
}

test("リスト → カレンダー → 詳細(メニュー)と表示形式の記憶", async ({
  browser,
  page,
}) => {
  const place = `体育館 ${randomBytes(2).toString("hex")}`;
  const coach = await browser.newContext();
  await createPracticeAsCoach(coach, "2027-03-14", place);
  await coach.close();

  await loginAsGuardian(page.context());
  await page.goto(`${urls.portal}/schedule?month=2027-03`);
  await expect(page.locator("h1")).toContainText("練習日程");
  await expect(page.locator(".month-nav")).toContainText("2027年3月");

  // リスト
  const row = page.locator(".sr", { hasText: place });
  await expect(row).toContainText("9:00–12:00");
  await expect(row).toContainText("練習試合");

  // カレンダー(14日が練習日としてアクティブ)
  await page.getByRole("tab", { name: "カレンダー" }).click();
  await expect(page.locator(".cell.prac")).toHaveCount(1);
  await page.getByRole("link", { name: "3/14 (日)の練習" }).click();
  const card = page.locator(".day-detail", { hasText: place });
  await expect(card).toContainText("3/14 (日) 9:00–12:00");

  // 詳細ページ
  await card.click();
  await expect(page.locator("h1")).toContainText("練習の詳細");
  await expect(page.locator("main")).toContainText("3/14 (日)");
  await expect(page.locator("main")).toContainText(place);
  await expect(page.locator("main")).toContainText("練習試合");
  await expect(page.locator(".menu-row").first()).toContainText("15分");
  await expect(page.locator(".menu-row").nth(1)).toContainText(
    "ゲーム形式(5対5)",
  );

  // 戻ると、表示形式(カレンダー)が記憶されている
  await page.getByRole("link", { name: "日程へ戻る" }).click();
  await expect(page.getByRole("tab", { name: "カレンダー" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("link", { name: "次の月" }).click();
  await expect(page.locator(".month-nav")).toContainText("2027年4月");
});

test("ホームに次回の練習が出て、タブバーから日程へ移動できる", async ({
  page,
}) => {
  await loginAsGuardian(page.context());
  // 子ども未連携だと分岐画面になるため、先に登録しておく
  const reg = await page.context().request.post(`${urls.portal}/api/children`, {
    data: {
      children: [{ name: "日程 太郎", grade: 3, gender: "male" }],
      relation: "father",
      weekdays: [6],
      startTime: "09:00",
      endTime: "12:00",
    },
  });
  expect(reg.status()).toBe(201);
  await page.goto(urls.portal);
  // 「次回の練習」は実データ(日付・時間)と詳細ページへのリンクまで確認する
  // (シードとテストで作った練習のどちらが次回かは実行日に依存するため、形式で検証)
  const hero = page.locator("a.hero");
  await expect(hero).toContainText("次回の練習");
  await expect(hero).toContainText(
    /\d{1,2}\/\d{1,2} \([日月火水木金土]\) \d{1,2}:\d{2}–\d{1,2}:\d{2}/,
  );
  await expect(hero).toHaveAttribute("href", /^\/practices\/[0-9a-f-]{36}$/);
  await hero.click();
  await expect(page.locator("h1")).toContainText("練習の詳細");
  await page.goBack();
  await page.getByRole("link", { name: "日程" }).click();
  await expect(page.locator("h1")).toContainText("練習日程");
});
