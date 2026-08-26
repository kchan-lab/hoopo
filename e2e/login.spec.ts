import { expect, test } from "@playwright/test";
import { urls } from "./urls";

// 保護者の自動ログイン導線(Issue #23 受入条件)。
// フェイク認証(AUTH_FAKE=1 / NEXT_PUBLIC_AUTH_FAKE=1)前提 — 実 LIFF はブラウザ自動化
// できないため、LIFF 层だけをフェイクにして「タップ→自動ログイン→ホーム」を検証する
// (.claude/plans/liff-login/plan.md 設計判断6)。
// 前提: pnpm db:seed 済み(TEAM_ID がシードの SKC 固定 id と一致していること)

test("LIFF リンクを開くと自動ログインしてホームが表示される", async ({
  page,
}) => {
  await page.goto(urls.portal);
  // メール・パスワード入力なしでセッションが張られる(絶対原則2)
  await expect(page.locator("main")).toContainText("ログインしました", {
    timeout: 15000,
  });

  // セッション Cookie は httpOnly(JS から読めない)
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === "hoopo_session");
  expect(session?.httpOnly).toBe(true);

  // リロードしてもログイン状態が維持される(Cookie セッション)
  await page.reload();
  await expect(page.locator("main")).toContainText("ログインしました");
});
