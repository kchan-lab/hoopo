import { randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { urls } from "./urls";

// 認定管理・部員管理の導線(Issue #67 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み(coach@example.com / hoopo-dev-login)。
// 保護者側の登録は portal の API で行い(毎回別のフェイク保護者)、管理側をブラウザで操作する

async function registerChildViaPortal(page: Page, name: string) {
  const ctx = await page.context().browser()?.newContext();
  if (!ctx) throw new Error("browser context を作成できません");
  const userId = `U${randomBytes(16).toString("hex")}`;
  const login = await ctx.request.post(`${urls.portal}/api/auth/line`, {
    data: { idToken: `fake:${userId}` },
  });
  expect(login.ok()).toBe(true);
  const created = await ctx.request.post(`${urls.portal}/api/children`, {
    data: {
      children: [{ name, nicknameKana: "てすと", grade: 5, gender: "female" }],
      relation: "mother",
      weekdays: [0, 6],
      startTime: "09:00",
      endTime: "12:00",
      coachNote: "E2E の伝達事項",
    },
  });
  expect(created.status()).toBe(201);
  const body = (await created.json()) as {
    children: { id: string; inviteCode: string }[];
  };
  await ctx.close();
  return body.children[0] as { id: string; inviteCode: string };
}

async function loginAsCoach(page: Page) {
  await page.goto(`${urls.admin}/login`);
  await page.getByLabel("メールアドレス").fill("coach@example.com");
  await page.getByLabel("パスワード").fill("hoopo-dev-login");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator("main")).toContainText("ダッシュボード", {
    timeout: 15000,
  });
}

test("登録が認定管理に新着で表示され、無効化すると部員一覧から消える", async ({
  page,
}) => {
  const name = `E2E 部員 ${randomBytes(2).toString("hex")}`;
  const child = await registerChildViaPortal(page, name);
  await loginAsCoach(page);

  // 部員管理: 一覧に出て、行タップで詳細(伝達事項・曜日/時間・招待コード)が開く
  await page.goto(`${urls.admin}/members`);
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator("tr.detail")).toContainText("E2E の伝達事項");
  await expect(page.locator("tr.detail")).toContainText("日 09:00〜12:00");
  await expect(page.locator("tr.detail")).toContainText(
    `${child.inviteCode.slice(0, 5)}-${child.inviteCode.slice(5)}`,
  );

  // 認定管理: 新着順に出る(他のテストと並行して登録されるため、名前でカードを特定する)。
  // 無効化は二段階確認
  await page.goto(`${urls.admin}/registrations`);
  const card = page.locator("article.acard", { hasText: name });
  await expect(card).toContainText(`${name}(5年)`);
  await expect(card).toContainText("新規登録 / 登録用URL経由 / 続柄: 母");
  await expect(card).toContainText("認定済(自動)");
  await card.getByRole("button", { name: "無効化", exact: true }).click();
  await expect(card).toContainText("無効化しますか?");
  await card.getByRole("button", { name: "無効化する" }).click();
  await expect(card).toContainText("無効化済み", { timeout: 15000 });

  // 部員一覧から消える
  await page.goto(`${urls.admin}/members`);
  await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(
    0,
  );
});

test("モバイルではハンバーガーからドロワーで画面を切り替えられる", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "モバイルのみ");
  await loginAsCoach(page);
  await page.getByRole("button", { name: "メニューを開く" }).click();
  await page.getByRole("link", { name: "認定管理", exact: true }).click();
  await expect(page.locator(".ah b")).toContainText("認定管理");
});
