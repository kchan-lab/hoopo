import { expect, test } from "@playwright/test";
import { urls } from "./urls";

// 管理者ログイン導線(Issue #24 受入条件)。
// 前提: pnpm db:seed 済み(coach@example.com / hoopo-dev-login が投入される)

test("未ログインで管理画面を開くとログイン画面へリダイレクトされる", async ({
  page,
}) => {
  await page.goto(urls.admin);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("h1")).toContainText("hoopo 管理コンソール");
});

test("メール+パスワードでログインし、ログアウトできる", async ({ page }) => {
  await page.goto(`${urls.admin}/login`);
  await page.getByLabel("メールアドレス").fill("coach@example.com");
  await page.getByLabel("パスワード").fill("hoopo-dev-login");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();

  // 管理トップへ遷移し、セッションが確立される
  await expect(page.locator("main")).toContainText("ダッシュボード", {
    timeout: 15000,
  });
  const session = (await page.context().cookies()).find(
    (c) => c.name === "hoopo_admin_session",
  );
  expect(session?.httpOnly).toBe(true);

  // リロードしてもログイン状態が維持される
  await page.reload();
  await expect(page.locator("main")).toContainText("ダッシュボード");

  // ログアウトでログイン画面へ戻り、以後トップは開けない
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(urls.admin);
  await expect(page).toHaveURL(/\/login$/);
});

test("誤ったパスワードではエラーが表示されログインできない", async ({
  page,
}) => {
  await page.goto(`${urls.admin}/login`);
  await page.getByLabel("メールアドレス").fill("coach@example.com");
  await page.getByLabel("パスワード").fill("wrong-password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  // Next.js のルートアナウンサーも role="alert" を持つため、フォーム内に限定する
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "メールアドレスまたはパスワードが違います",
  );
  await expect(page).toHaveURL(/\/login$/);
});
