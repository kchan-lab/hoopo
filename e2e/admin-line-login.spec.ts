import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { urls } from "./urls";

// 管理者の LINE ログイン(Issue #61 受入条件、admin-line-login/plan.md 完了条件)。
// 前提: pnpm db:seed 済み(coach@example.com / hoopo-dev-login)+ AUTH_FAKE=1。
// フェイクは /api/auth/line/start を callback へ短絡させるので、認可画面なしで導線を通せる
// (設計判断5)。既定の fake_user とは別の userId をこの実行専用に作り、
// 途中で落ちた過去の実行が残した行と衝突しないようにする

const LINK_LABEL = "LINE を連携";
const UNLINK_LABEL = "連携を解除";

// U + 32桁hex(LINE userId と同じ形式)。実行ごとに一意
const fakeUser = `U${randomUUID().replaceAll("-", "")}`;

test("メールでログイン → LINE を連携 → LINE でログイン → 解除できる", async ({
  page,
}) => {
  await page.goto(`${urls.admin}/login`);
  await page.getByLabel("メールアドレス").fill("coach@example.com");
  await page.getByLabel("パスワード").fill("hoopo-dev-login");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator("main")).toContainText("ダッシュボード", {
    timeout: 15000,
  });

  // ナビの「アカウント」からアカウント画面へ
  await page.getByRole("link", { name: "アカウント" }).first().click();
  await expect(page.locator("main")).toContainText("coach@example.com");

  // 前回の実行が途中で落ちて連携が残っていても、未連携から始められるようにする
  if (await page.getByRole("button", { name: UNLINK_LABEL }).isVisible()) {
    await page.getByRole("button", { name: UNLINK_LABEL }).click();
    await page.getByRole("button", { name: "解除する" }).click();
  }
  await expect(page.locator("main")).toContainText("未連携");

  // 連携(リンクを実際にクリックする。fake_user 省略時は既定の userId が連携される)
  await page.getByRole("link", { name: LINK_LABEL }).click();
  await expect(page).toHaveURL(/\/account\?linked=1$/);
  await expect(page.locator("main")).toContainText("LINE を連携しました");
  await expect(page.locator("main")).toContainText("連携済み");

  // この実行専用の userId に張り替える(同じコーチ行の更新なので一意制約に触れない)
  await page.goto(
    `${urls.admin}/api/auth/line/start?mode=link&fake_user=${fakeUser}`,
  );
  await expect(page).toHaveURL(/\/account\?linked=1$/);
  await expect(page.locator("main")).toContainText("連携済み");

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // 未連携の LINE アカウント(既定の fake_user はもう連携されていない)は案内つきで戻される
  await page.getByRole("link", { name: "LINEでログイン" }).click();
  await expect(page).toHaveURL(/\/login\?error=line_unlinked$/);
  // Next.js のルートアナウンサーも role="alert" を持つため、カード内に限定する
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "このLINEアカウントは管理者として登録されていません",
  );

  // 連携済みの LINE アカウントならログインできる
  await page.goto(`${urls.admin}/api/auth/line/start?fake_user=${fakeUser}`);
  await expect(page.locator("main")).toContainText("ダッシュボード", {
    timeout: 15000,
  });
  const session = (await page.context().cookies()).find(
    (c) => c.name === "hoopo_admin_session",
  );
  expect(session?.httpOnly).toBe(true);

  // 解除すると未連携に戻る(以後はメールとパスワードでログインする)
  await page.getByRole("link", { name: "アカウント" }).first().click();
  await expect(page.locator("main")).toContainText("連携済み");
  await page.getByRole("button", { name: UNLINK_LABEL }).click();
  await page.getByRole("button", { name: "解除する" }).click();
  await expect(page.locator("main")).toContainText("未連携");
});
