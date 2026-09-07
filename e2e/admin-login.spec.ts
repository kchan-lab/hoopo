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

// 試行回数制限(Issue #65)。専用の lockout@example.com を使い、他のテストのコーチをロックしない。
// 15 分の経過は E2E では待てないので「5 回失敗すると正しいパスワードでも同じ文言で入れない」だけを確かめる
// (解除・リセットは Integration で担保)。再実行時は既にロック中でも同じ結果になる
test("5回続けて間違えると、正しいパスワードでも同じ文言で入れない", async ({
  page,
}) => {
  await page.goto(`${urls.admin}/login`);
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("メールアドレス").fill("lockout@example.com");
    await page.getByLabel("パスワード").fill(`wrong-password-${i}`);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "メールアドレスまたはパスワードが違います",
    );
  }
  await page.getByLabel("パスワード").fill("hoopo-dev-login");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "メールアドレスまたはパスワードが違います",
  );
  await expect(page).toHaveURL(/\/login$/);
});
