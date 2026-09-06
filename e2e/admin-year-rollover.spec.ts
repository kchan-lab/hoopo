import { randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { urls } from "./urls";

// 年度更新(Issue #83 受入条件): 実行 → 一覧の学年が +1・6年生が卒団で消える → 取り消しで戻る。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み(coach@example.com / hoopo-dev-login)。
//
// 注意: 年度更新はチーム全体(= ローカル共有 DB の全部員)に効くため、他の spec が
// 並行して登録した部員の学年も一時的に +1 される。影響時間を最小にするため
// 1本のテストで「実行 → 検証 → 即取り消し」まで行い、desktop プロジェクトだけで直列に走らせる。
// それでも他 spec と同時に走ると学年の期待値がずれる可能性は残る(#83 の申し送り)
test.describe.configure({ mode: "serial" });

async function registerChildViaPortal(
  page: Page,
  name: string,
  grade: number,
): Promise<void> {
  const ctx = await page.context().browser()?.newContext();
  if (!ctx) throw new Error("browser context を作成できません");
  const userId = `U${randomBytes(16).toString("hex")}`;
  const login = await ctx.request.post(`${urls.portal}/api/auth/line`, {
    data: { idToken: `fake:${userId}` },
  });
  expect(login.ok()).toBe(true);
  const created = await ctx.request.post(`${urls.portal}/api/children`, {
    data: {
      children: [{ name, nicknameKana: "てすと", grade, gender: "male" }],
      relation: "father",
      weekdays: [6],
      startTime: "09:00",
      endTime: "12:00",
    },
  });
  expect(created.status()).toBe(201);
  await ctx.close();
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

/** 前回の実行が猶予中のまま残っていると再実行できないので、先に取り消しておく */
async function undoIfPending(page: Page) {
  const undo = page.getByRole("button", { name: "取り消す", exact: true });
  if ((await undo.count()) === 0) return;
  await undo.click();
  await page.getByRole("button", { name: "取り消しを実行する" }).click();
  await expect(undo).toHaveCount(0);
}

test("年度更新を実行すると学年が +1 され6年生が卒団し、取り消すと元に戻る", async ({
  page,
  isMobile,
}) => {
  // 共有 DB の全部員に影響するので、プロジェクトをまたいだ同時実行を避ける
  test.skip(isMobile, "共有 DB 全体に影響するため desktop のみで実行する");

  const suffix = randomBytes(2).toString("hex");
  const name5 = `E2E 五年 ${suffix}`;
  const name6 = `E2E 六年 ${suffix}`;
  await registerChildViaPortal(page, name5, 5);
  await registerChildViaPortal(page, name6, 6);

  await loginAsCoach(page);
  await page.goto(`${urls.admin}/members`);
  await undoIfPending(page);

  const row5 = page.getByRole("row", { name: new RegExp(name5) });
  const row6 = page.getByRole("row", { name: new RegExp(name6) });
  await expect(row5).toContainText("5年");
  await expect(row6).toContainText("6年");

  // 二段階確認で実行
  await page.getByRole("button", { name: "年度更新を実行" }).click();
  await expect(page.locator(".ah")).toContainText("実行しますか?");
  await page.getByRole("button", { name: "実行する" }).click();
  await expect(page.locator(".yrcard")).toContainText(
    "年度更新を実行しました",
    {
      timeout: 15000,
    },
  );

  // 5年 → 6年、6年 → 卒団アーカイブで一覧から消える
  await expect(row5).toContainText("6年");
  await expect(row6).toHaveCount(0);

  // 二段階確認で取り消し(猶予 24 時間・1回)
  await page.getByRole("button", { name: "取り消す", exact: true }).click();
  await expect(page.locator(".yrcard")).toContainText("取り消しますか?");
  await page.getByRole("button", { name: "取り消しを実行する" }).click();
  await expect(page.locator(".yrcard")).toHaveCount(0, { timeout: 15000 });

  await expect(row5).toContainText("5年");
  await expect(row6).toContainText("6年");
});
