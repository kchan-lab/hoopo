import { randomBytes, randomInt } from "node:crypto";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { urls } from "./urls";

// LINE グループ送信の導線(Issue #107 受入条件。line-send/plan.md 6c-1)。
// 前提: AUTH_FAKE=1 + LINE_FAKE=1 + pnpm db:seed 済み
// (フェイクのグループ参加人数は 12 固定。シードの SKC には line_group_id が入っている)。
// 予定表は月ごとに発行状態が変わるので、テストごとに別の月を使う

/** フェイククライアントが返すグループ参加人数(packages/line の FAKE_GROUP_MEMBER_COUNT) */
const MEMBER_COUNT = 12;

/** 2031〜2090 年のランダムな月(admin-schedule-publish と同じ流儀) */
function uniqueMonth(): string {
  const y = 2031 + randomInt(60);
  const m = String(1 + randomInt(12)).padStart(2, "0");
  return `${y}-${m}`;
}

async function loginAsCoach(page: Page) {
  await page.goto(`${urls.admin}/login`);
  await page.getByLabel("メールアドレス").fill("coach@example.com");
  await page.getByLabel("パスワード").fill("hoopo-dev-login");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator("main")).toContainText("ダッシュボード");
}

async function createPractice(context: BrowserContext, heldOn: string) {
  const res = await context.request.post(`${urls.admin}/api/practices`, {
    data: {
      heldOn,
      startTime: "09:00",
      endTime: "12:00",
      location: `体育館 ${randomBytes(2).toString("hex")}`,
      note: null,
      menus: [],
    },
  });
  expect(res.status()).toBe(201);
}

/** 通数メーターの「使用済み」(v は "12 / 200通(無料枠)") */
async function usedCount(page: Page): Promise<number> {
  const meter = page.locator(".acard", { hasText: "今月のLINE通数" });
  // parseInt は先頭の数字だけを読むので "12 / 200通(無料枠)" から 12 が取れる
  return Number.parseInt((await meter.locator(".v").innerText()).trim(), 10);
}

test("発行した予定表を確認のうえ LINE へ送信し、通数と送信ログに残る", async ({
  page,
}) => {
  const month = uniqueMonth();
  await loginAsCoach(page);
  await createPractice(page.context(), `${month}-10`);

  await page.goto(`${urls.admin}/schedule?month=${month}`);
  const card = page.locator(".pubcard");
  // 未発行のうちは送信できない
  await expect(
    card.getByRole("button", { name: "LINE へ送信" }),
  ).toBeDisabled();

  await card.getByRole("button", { name: "予定表を発行する" }).click();
  await card.getByRole("button", { name: "発行する", exact: true }).click();
  await expect(card.locator(".pubstat .pill")).toContainText("発行済み");

  const before = await usedCount(page);

  // 二段階確認: 消費通数と残りを見せてから送る(CLAUDE.md 絶対原則3)
  await card.getByRole("button", { name: "LINE へ送信" }).click();
  await expect(card).toContainText(`グループ ${MEMBER_COUNT} 人に送信します`);
  await card.getByRole("button", { name: "送信する" }).click();

  await expect(card).toContainText("送信しました");
  await expect(
    page.locator(".acard", { hasText: "今月のLINE通数" }),
  ).toContainText(`予定表(${month})`);
  expect(await usedCount(page)).toBeGreaterThanOrEqual(before + MEMBER_COUNT);
});

test("通知ありのお知らせを公開して LINE へ送信すると送信済みになる", async ({
  page,
}) => {
  const title = `体育館の変更 ${randomBytes(2).toString("hex")}`;
  await loginAsCoach(page);
  await page.goto(`${urls.admin}/announcements`);

  await page.getByRole("button", { name: "お知らせを作成" }).click();
  await page.getByLabel("タイトル").fill(title);
  await page.getByLabel("本文").fill("9月の練習は粉浜小学校の体育館です。");
  await page
    .getByLabel("LINE へ通知する(公開後に「LINE へ送信」を押します)")
    .check();
  await page.getByRole("button", { name: "公開する", exact: true }).click();

  const card = page.locator(".acard", { hasText: title });
  await expect(card).toContainText("LINE 通知あり");

  await card.getByRole("button", { name: "LINE へ送信" }).click();
  await expect(card).toContainText(`グループ ${MEMBER_COUNT} 人に送信します`);
  await card.getByRole("button", { name: "送信する" }).click();

  await expect(card).toContainText("送信済み");
});
