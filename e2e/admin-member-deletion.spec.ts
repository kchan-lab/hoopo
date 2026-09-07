import { randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { urls } from "./urls";

// 卒団後のデータ削除(Issue #21 受入条件。member-deletion/plan.md):
// 年度更新で卒団 → 「卒団した部員」に出る → 二段階確認で削除 → 一覧から消えて実行ログが残る。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み(coach@example.com / hoopo-dev-login)。
//
// 注意: 卒団させる手段が年度更新しかなく、これはチーム全体(= ローカル共有 DB の全部員)に効く。
// そのため admin-year-rollover と同じ rollover プロジェクト(workers: 1・他プロジェクトの後)で回し、
// 検証が終わったら afterEach で必ず取り消して seed の状態に戻す
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

// 年度更新の取り消し(猶予中でなければ 409 が返るだけなので、そのまま無視してよい)
async function undoRollover(page: Page) {
  await page.request
    .post(`${urls.admin}/api/members/year-rollover/undo`)
    .catch(() => undefined);
}

test.afterEach(async ({ page }) => {
  // 共有 DB の全部員の学年を戻す。削除した部員は snapshot にいても復活しない(物理削除)
  await undoRollover(page);
});

test("年度更新で卒団した部員のデータを削除でき、実行ログに残る", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "共有 DB 全体に影響するため desktop のみで実行する");

  const name = `E2E 卒団 ${randomBytes(2).toString("hex")}`;
  await registerChildViaPortal(page, name, 6);

  await loginAsCoach(page);
  // 前回の実行が猶予中のまま残っていると年度更新を実行できない
  await undoRollover(page);

  // 卒団させる手段は年度更新だけ(設計判断1)。UI の二段階確認は admin-year-rollover が見ているので、
  // ここは管理 API を直接叩いて前提だけ作る
  const rollover = await page.request.post(
    `${urls.admin}/api/members/year-rollover`,
  );
  expect(rollover.status()).toBe(201);

  await page.goto(`${urls.admin}/members`);

  // 在籍の一覧からは消え、「卒団した部員」に出る
  await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(
    0,
  );
  const row = page.locator(".arow", { hasText: name });
  await expect(row).toContainText("6年");
  await expect(row).toContainText("卒団");

  // 二段階確認で削除
  await row.getByRole("button", { name: "データを削除" }).click();
  await expect(row).toContainText("削除すると元に戻せません");
  await row.getByRole("button", { name: "削除する" }).click();

  // 一覧から消えて「削除しました」、実行ログに1行増える
  await expect(page.locator(".arow", { hasText: name })).toHaveCount(0, {
    timeout: 15000,
  });
  await expect(page.locator(".anotice")).toContainText("削除しました");
  const logs = page.locator("section.acard", { hasText: "実行ログ" });
  await expect(logs).toContainText(/部員データを削除\(保護者 \d+ 人分も削除\)/);
});
