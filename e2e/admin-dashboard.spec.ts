import { randomBytes } from "node:crypto";
import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { urls } from "./urls";

// 管理ダッシュボードの導線(Issue #30 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み(coach@example.com / hoopo-dev-login)。
// ダッシュボードは「Tokyo の今日」基準の集計なので、練習は当日で作る。
// 同じ DB をシード・他テスト・desktop/mobile の並行実行が共有するため、
// 件数の厳密比較はせず「その月の全練習に提出した部員が未提出一覧に出ない」ことを見る

function todayInTokyo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "2026-09-06" → "9/6"(カードの日付表記) */
function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
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

/** コーチとしてログイン済みの API コンテキストを作る(セットアップ用) */
async function coachRequest(page: Page): Promise<APIRequestContext> {
  const ctx = await page.context().browser()?.newContext();
  if (!ctx) throw new Error("browser context を作成できません");
  const login = await ctx.request.post(`${urls.admin}/api/auth/login`, {
    data: { email: "coach@example.com", password: "hoopo-dev-login" },
  });
  expect(login.ok()).toBe(true);
  return ctx.request;
}

async function createPractice(
  api: APIRequestContext,
  heldOn: string,
  location: string,
): Promise<string> {
  const res = await api.post(`${urls.admin}/api/practices`, {
    data: {
      heldOn,
      startTime: "09:00",
      endTime: "12:00",
      location,
      note: null,
      menus: [],
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { practice: { id: string } }).practice.id;
}

/** その月の練習 id(未提出一覧は月全体の集計なので、全件に提出しないと消えない) */
async function listPracticeIds(
  api: APIRequestContext,
  month: string,
): Promise<string[]> {
  const res = await api.get(`${urls.admin}/api/practices?month=${month}`);
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { practices: { id: string }[] };
  return body.practices.map((p) => p.id);
}

/** 保護者を1人作り、子ども1人を登録する(提出は後段でまとめて行う) */
async function registerChild(
  page: Page,
  name: string,
): Promise<{ ctx: BrowserContext; childId: string }> {
  const ctx = await page.context().browser()?.newContext();
  if (!ctx) throw new Error("browser context を作成できません");
  const userId = `U${randomBytes(16).toString("hex")}`;
  const login = await ctx.request.post(`${urls.portal}/api/auth/line`, {
    data: { idToken: `fake:${userId}` },
  });
  expect(login.ok()).toBe(true);
  const created = await ctx.request.post(`${urls.portal}/api/children`, {
    data: {
      children: [{ name, nicknameKana: "てすと", grade: 4, gender: "male" }],
      relation: "father",
      weekdays: [6],
      startTime: "09:00",
      endTime: "12:00",
      coachNote: null,
    },
  });
  expect(created.status()).toBe(201);
  const body = (await created.json()) as { children: { id: string }[] };
  return { ctx, childId: body.children[0]?.id as string };
}

test("提出した参加予定がダッシュボードの提出率・次回参加人数・未提出一覧に反映される", async ({
  page,
}) => {
  const tag = randomBytes(2).toString("hex");
  const today = todayInTokyo();
  const month = today.slice(0, 7);
  const name = `E2E ダッシュ ${tag}`;

  const api = await coachRequest(page);
  await createPractice(api, today, `体育館 ${tag}`);
  const { ctx, childId } = await registerChild(page, name);

  await loginAsCoach(page);

  // 提出はコーチのログイン(数秒かかる)より後に回し、並行するテストが作った
  // 当日の練習も取りこぼさないようにする
  const practiceIds = await listPracticeIds(api, month);
  expect(practiceIds.length).toBeGreaterThan(0);
  const submitted = await ctx.request.put(`${urls.portal}/api/attendance`, {
    data: {
      childId,
      answers: practiceIds.map((practiceId) => ({
        practiceId,
        status: "full",
        comment: null,
      })),
    },
  });
  expect(submitted.ok()).toBe(true);
  await ctx.close();

  await page.goto(urls.admin);
  await expect(page.locator(".ah b")).toContainText("ダッシュボード");

  // 提出率: 割合が出ていること(分母は他テストの練習・部員で変わるので比較しない)
  const rateCard = page.locator(".acard", { hasText: "提出率" });
  await expect(rateCard.locator(".v")).toContainText(/\d+%/);

  // 次回参加人数: 当日の練習が選ばれ、○(全参加)が1人以上いる
  const nextCard = page.locator(".acard", { hasText: "次回参加人数" });
  await expect(nextCard).toContainText(shortDate(today));
  await expect(nextCard.locator(".brk")).toContainText(/○[1-9]/);

  // 月謝 未提出: 人数が出ていること
  const feeCard = page.locator(".acard", { hasText: "月謝 未提出" });
  await expect(feeCard.locator(".v")).toContainText(/\d+人/);

  // 今月の全練習に提出したので、未提出一覧には出ない
  const pending = page.locator(".acard", { hasText: "未提出の保護者" });
  await expect(pending).not.toContainText(name);

  // LINE通数は 6c までプレースホルダ
  await expect(
    page.locator(".acard", { hasText: "今月のLINE通数" }),
  ).toContainText("/ 200通(無料枠)");

  // カードから該当画面へ移動できる
  await page.getByRole("link", { name: "出欠管理へ" }).click();
  await expect(page.locator(".ah b")).toContainText("出欠管理");
});
