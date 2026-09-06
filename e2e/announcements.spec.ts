import { randomBytes } from "node:crypto";
import { type BrowserContext, expect, test } from "@playwright/test";
import { urls } from "./urls";

// 保護者のお知らせ(Issue #87 受入条件): 管理で公開したものがホーム → 詳細 → 一覧で読める。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み。
//
// 依存: お知らせを作るのは 6a-1(#86)の管理 API `POST /api/announcements`
// (body: { title, body, notifyLine, publish })。6a-1 がマージされるまでこのテストは赤になる

/** 今日(Asia/Tokyo)の "M/D"。お知らせは作成した瞬間が公開日時になる */
function todayShort(): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).format(new Date());
}

/** コーチの管理 API(6a-1)でお知らせを作り、id を返す */
async function createAnnouncementAsCoach(
  context: BrowserContext,
  title: string,
  body: string,
  publish: boolean,
): Promise<string> {
  const res = await context.request.post(`${urls.admin}/api/announcements`, {
    data: { title, body, notifyLine: false, publish },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { announcement: { id: string } }).announcement
    .id;
}

test("公開したお知らせがホーム → 詳細 → 一覧で読め、下書きは見えない", async ({
  browser,
  page,
}) => {
  const tag = randomBytes(3).toString("hex");
  const title = `体育館の駐車場について ${tag}`;
  const draftTitle = `下書きのお知らせ ${tag}`;
  const body = `路上駐車はしないでください。\n近隣の迷惑になります(${tag})`;

  const coach = await browser.newContext();
  const login = await coach.request.post(`${urls.admin}/api/auth/login`, {
    data: { email: "coach@example.com", password: "hoopo-dev-login" },
  });
  expect(login.ok()).toBe(true);
  await createAnnouncementAsCoach(coach, title, body, true);
  const draftId = await createAnnouncementAsCoach(
    coach,
    draftTitle,
    "まだ公開していない",
    false,
  );
  await coach.close();

  // 保護者(新しいフェイク ID)。子ども未連携だとホームが分岐画面になるので先に登録する
  const guardian = await page
    .context()
    .request.post(`${urls.portal}/api/auth/line`, {
      data: { idToken: `fake:U${randomBytes(16).toString("hex")}` },
    });
  expect(guardian.ok()).toBe(true);
  const reg = await page.context().request.post(`${urls.portal}/api/children`, {
    data: {
      children: [{ name: `お知らせ 花子 ${tag}`, grade: 4, gender: "female" }],
      relation: "mother",
      weekdays: [0],
      startTime: "09:00",
      endTime: "12:00",
    },
  });
  expect(reg.status()).toBe(201);

  // ホームのお知らせ(公開済みのみ。行は詳細へのリンク)
  await page.goto(urls.portal);
  const row = page.locator("a.row", { hasText: title });
  await expect(row).toBeVisible();
  await expect(row.locator("time")).toHaveText(todayShort());
  await expect(page.locator("a.row", { hasText: draftTitle })).toHaveCount(0);

  // 詳細(本文は改行を保って表示)
  await row.click();
  await expect(page.locator("h1")).toContainText("お知らせ");
  await expect(page.locator(".article .ttl")).toHaveText(title);
  await expect(page.locator(".article .body")).toContainText(
    "路上駐車はしないでください。",
  );
  await expect(page.locator(".article .body")).toContainText(
    `近隣の迷惑になります(${tag})`,
  );

  // 一覧ページ(ホームの「すべて見る」から)
  await page.goBack();
  await page.getByRole("link", { name: "すべて見る →" }).click();
  await expect(page).toHaveURL(/\/announcements$/);
  await expect(page.locator("a.row", { hasText: title })).toBeVisible();
  await expect(page.locator("a.row", { hasText: draftTitle })).toHaveCount(0);

  // 下書きの詳細は URL を直接叩いても 404
  const res = await page.goto(`${urls.portal}/announcements/${draftId}`);
  expect(res?.status()).toBe(404);
  await expect(page.locator("body")).not.toContainText(draftTitle);
});
