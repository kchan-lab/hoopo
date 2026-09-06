import { randomBytes } from "node:crypto";
import { type BrowserContext, expect, test } from "@playwright/test";
import { urls } from "./urls";

// 家族連携の解除(family-links/plan.md。Issue #31 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み。
// registration.spec.ts と同じく、毎回別の保護者としてフェイク ID トークンでログインする

async function loginAsNewGuardian(context: BrowserContext) {
  const userId = `U${randomBytes(16).toString("hex")}`;
  const res = await context.request.post(`${urls.portal}/api/auth/line`, {
    data: { idToken: `fake:${userId}` },
  });
  expect(res.ok()).toBe(true);
}

test("第二保護者は自分の連携を解除でき、最後の保護者は解除できない", async ({
  browser,
}) => {
  // 保護者A(父): API で登録し、家族の設定から招待コードを読む
  const contextA = await browser.newContext();
  await loginAsNewGuardian(contextA);
  const childName = `粉浜 解除${randomBytes(3).toString("hex")}`;
  const created = await contextA.request.post(`${urls.portal}/api/children`, {
    data: {
      children: [{ name: childName, grade: 3, gender: "male" }],
      relation: "father",
      weekdays: [6],
      startTime: "09:00",
      endTime: "12:00",
    },
  });
  expect(created.status()).toBe(201);
  const family = await contextA.request.get(`${urls.portal}/api/family`);
  expect(family.ok()).toBe(true);
  const { children } = (await family.json()) as {
    children: { name: string; inviteCode: string }[];
  };
  const code = children.find((c) => c.name === childName)?.inviteCode ?? "";
  expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);

  // 保護者B(母): 分岐画面で連携する(重複登録の注記が出ている)
  const contextB = await browser.newContext();
  await loginAsNewGuardian(contextB);
  const pageB = await contextB.newPage();
  await pageB.goto(urls.portal);
  await expect(pageB.locator("h1")).toContainText("はじめての方");
  await expect(pageB.locator("main")).toContainText("二重登録を防ぐため");
  await pageB.getByLabel("招待コード").fill(code);
  await pageB.getByRole("button", { name: "母", exact: true }).click();
  await pageB.getByRole("button", { name: "コードで連携する" }).click();
  await expect(pageB.locator("main")).toContainText(childName, {
    timeout: 15000,
  });

  // 家族の設定から二段階確認で解除 → 連携が無くなるので分岐画面に戻る
  await pageB.getByRole("link", { name: /家族の設定/ }).click();
  await expect(pageB.locator("main")).toContainText("あなた(母)");
  await pageB.getByRole("button", { name: "連携を解除" }).click();
  await expect(pageB.locator("main")).toContainText(
    `${childName}さんとの連携を解除しますか?`,
  );
  await pageB.getByRole("button", { name: "解除する" }).click();
  await expect(pageB.locator("h1")).toContainText("はじめての方", {
    timeout: 15000,
  });
  await contextB.close();

  // 保護者A: 最後の保護者になったので解除できない
  const pageA = await contextA.newPage();
  await pageA.goto(`${urls.portal}/family`);
  await expect(pageA.locator("main")).toContainText("あなた(父)");
  await pageA.getByRole("button", { name: "連携を解除" }).click();
  await pageA.getByRole("button", { name: "解除する" }).click();
  await expect(pageA.locator("main").getByRole("alert")).toContainText(
    "最後の保護者は解除できません",
  );

  // 連携は残ったまま(ホームにお子さんが出る)
  await pageA.goto(urls.portal);
  await expect(pageA.locator("main")).toContainText(childName);
  await contextA.close();
});
