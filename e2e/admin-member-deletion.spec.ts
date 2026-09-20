import { randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import {
  birthDateForGrade,
  childNameInput,
  heightForGrade,
} from "./child-input";
import { gotoReady } from "./hydration";
import { urls } from "./urls";

// 手動の卒団(grade-junior-high/plan.md 設計判断3)と、卒団後のデータ削除(Issue #21 受入条件。
// member-deletion/plan.md):
// 部員の行詳細から「卒団させる」→「卒団した部員」に出る → 二段階確認で削除 → 一覧から消えて実行ログが残る。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み(coach@example.com / hoopo-dev-login)。
//
// 卒団は1人ずつの操作になったので(#187 で年度更新から自動アーカイブを外した)、
// このスペックは自分で登録した部員しか触らない = 他のスペックと並行して走れる

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
      children: [
        {
          ...childNameInput(name),
          nicknameKana: "てすと",
          birthDate: birthDateForGrade(grade),
          heightCm: heightForGrade(grade),
          gender: "male",
        },
      ],
      relation: "father",
      availabilities: [{ weekday: 6, startTime: "09:00", endTime: "12:00" }],
    },
  });
  expect(created.status()).toBe(201);
  await ctx.close();
}

async function loginAsCoach(page: Page) {
  await gotoReady(page, `${urls.admin}/login`);
  await page.getByLabel("メールアドレス").fill("coach@example.com");
  await page.getByLabel("パスワード").fill("hoopo-dev-login");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator("main")).toContainText("ダッシュボード", {
    timeout: 15000,
  });
}

test("部員を1人ずつ卒団させ、そのデータを削除でき、実行ログに残る", async ({
  page,
}) => {
  const name = `E2E 卒団 ${randomBytes(2).toString("hex")}`;
  await registerChildViaPortal(page, name, 6);

  await loginAsCoach(page);
  await page.goto(`${urls.admin}/members`);

  // 行詳細を開いて「卒団させる」(二段階確認)
  const memberRow = page.getByRole("row", { name: new RegExp(name) });
  await expect(memberRow).toBeVisible();
  await expect(memberRow).toContainText("6年");
  await memberRow.click();
  const detail = page.locator("tr.detail");
  await detail.getByRole("button", { name: "卒団させる" }).click();
  await expect(detail).toContainText("在籍に戻せません");
  await detail.getByRole("button", { name: "卒団にする" }).click();

  // 在籍の一覧からは消え、「卒団した部員」に出る
  await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(
    0,
    { timeout: 15000 },
  );
  const row = page.locator(".arow", { hasText: name });
  await expect(row).toContainText("6年");
  await expect(row).toContainText("卒団");

  // 卒団も実行ログに残る(名前は出さず学年だけ)
  const logs = page.locator("section.acard", { hasText: "実行ログ" });
  await expect(logs).toContainText("部員を卒団(6年)");
  await expect(logs).not.toContainText(name);

  // 二段階確認で削除
  await row.getByRole("button", { name: "データを削除" }).click();
  await expect(row).toContainText("削除すると元に戻せません");
  await row.getByRole("button", { name: "削除する" }).click();

  // 一覧から消えて「削除しました」、実行ログに1行増える
  await expect(page.locator(".arow", { hasText: name })).toHaveCount(0, {
    timeout: 15000,
  });
  await expect(page.locator(".anotice")).toContainText("削除しました");
  await expect(logs).toContainText(/部員データを削除\(保護者 \d+ 人分も削除\)/);
});
