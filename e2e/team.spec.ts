import { randomBytes } from "node:crypto";
import { type BrowserContext, expect, test } from "@playwright/test";
import { urls } from "./urls";

// 保護者のチーム名簿(Issue #28 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み。毎回新しい保護者としてログインし、
// 自分で登録した部員が名簿(学年降順→名前)に出ることを確認する

async function loginAsNewGuardian(context: BrowserContext) {
  const res = await context.request.post(`${urls.portal}/api/auth/line`, {
    data: { idToken: `fake:U${randomBytes(16).toString("hex")}` },
  });
  expect(res.ok()).toBe(true);
}

test("タブバーの「チーム」から名簿を開くと、登録した部員が学年順で出る", async ({
  context,
  page,
}) => {
  await loginAsNewGuardian(context);
  // 6年で登録するので、学年降順の名簿では必ず先頭グループに並ぶ
  const name = `名簿 ${randomBytes(2).toString("hex")}`;
  const reg = await context.request.post(`${urls.portal}/api/children`, {
    data: {
      children: [
        { name, nicknameKana: "ろすたー", grade: 6, gender: "female" },
      ],
      relation: "mother",
      weekdays: [0],
      startTime: "09:00",
      endTime: "12:00",
    },
  });
  expect(reg.status()).toBe(201);

  await page.goto(urls.portal);
  await page.getByRole("link", { name: "チーム", exact: true }).click();
  await expect(page.locator("h1")).toContainText("チーム");

  // 名簿行: 氏名・呼び名(ひらがな)・学年ピル
  const row = page.locator(".rrow", { hasText: name });
  await expect(row).toContainText("ろすたー");
  await expect(row.locator(".pill")).toHaveText("6年");
  // 学年降順なので先頭行は6年
  await expect(page.locator(".rrow").first().locator(".pill")).toHaveText(
    "6年",
  );
});
