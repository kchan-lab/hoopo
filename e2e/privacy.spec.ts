import { randomBytes } from "node:crypto";
import { type BrowserContext, expect, test } from "@playwright/test";
import { urls } from "./urls";

// プライバシーポリシーの掲示(Issue #21 前半の受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み。
// ページはログイン不要の公開ページ(privacy-policy/plan.md 設計判断1)なので、
// セッションを張らずに開けることをまず確かめる

const LAST_UPDATED = "2026-09-07";

/** ホーム最下部の powered by hoopo はお子さん連携済みのときだけ出るので、team.spec と同じ手順で作る */
async function loginAndRegisterChild(context: BrowserContext) {
  const login = await context.request.post(`${urls.portal}/api/auth/line`, {
    data: { idToken: `fake:U${randomBytes(16).toString("hex")}` },
  });
  expect(login.ok()).toBe(true);
  const reg = await context.request.post(`${urls.portal}/api/children`, {
    data: {
      children: [
        {
          name: `規約 ${randomBytes(2).toString("hex")}`,
          nicknameKana: "きやく",
          grade: 3,
          gender: "male",
        },
      ],
      relation: "father",
      weekdays: [0],
      startTime: "09:00",
      endTime: "12:00",
    },
  });
  expect(reg.status()).toBe(201);
}

test("ログインなしで /privacy が開き、見出しと最終更新日が出る", async ({
  page,
}) => {
  await page.goto(`${urls.portal}/privacy`);
  await expect(page.locator("h1")).toContainText("プライバシーポリシー");
  await expect(page.locator("main")).toContainText(
    `最終更新日: ${LAST_UPDATED}`,
  );
  // ログイン画面へ飛ばされていないこと(公開ページ)
  await expect(page).toHaveURL(/\/privacy$/);
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "hoopo_session")).toBeUndefined();
});

test("ホーム最下部のリンクからプライバシーポリシーへ遷移できる", async ({
  context,
  page,
}) => {
  await loginAndRegisterChild(context);
  await page.goto(urls.portal);
  await page
    .locator(".powered")
    .getByRole("link", { name: "プライバシーポリシー" })
    .click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator("h1")).toContainText("プライバシーポリシー");
  // 「ホームへ」で元の画面に戻れる
  await page.getByRole("link", { name: "ホームへ" }).click();
  await expect(page).toHaveURL(`${urls.portal}/`);
});

test("チーム画面の末尾からもプライバシーポリシーへ遷移できる", async ({
  context,
  page,
}) => {
  await loginAndRegisterChild(context);
  await page.goto(`${urls.portal}/team`);
  await page
    .locator(".legal-link")
    .getByRole("link", { name: "プライバシーポリシー" })
    .click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator("h1")).toContainText("プライバシーポリシー");
});

test("管理ログイン画面にプライバシーポリシーのリンクがある", async ({
  page,
}) => {
  await page.goto(`${urls.admin}/login`);
  const link = page.getByRole("link", { name: "プライバシーポリシー" });
  await expect(link).toBeVisible();
  // 保護者アプリ側の公開ページ(NEXT_PUBLIC_PORTAL_URL)を指す
  await expect(link).toHaveAttribute("href", /\/privacy$/);
});

test("登録前(はじめての方)と登録画面からもプライバシーポリシーへ行ける", async ({
  page,
  context,
}) => {
  // ログインだけ済ませ、お子さん未登録の状態でホームを開く
  const login = await context.request.post(`${urls.portal}/api/auth/line`, {
    data: { idToken: `fake:U${randomBytes(16).toString("hex")}` },
  });
  expect(login.ok()).toBe(true);
  await page.goto(urls.portal);
  await expect(page.locator("h1")).toContainText("はじめての方");
  await page.getByRole("link", { name: "プライバシーポリシー" }).click();
  await expect(page).toHaveURL(/\/privacy$/);

  await page.goto(`${urls.portal}/register`);
  await expect(
    page.getByRole("link", { name: "プライバシーポリシー" }),
  ).toBeVisible();
});
