import { randomBytes, randomInt } from "node:crypto";
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { urls } from "./urls";

// チーム編成の導線(Issue #101 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み(coach@example.com / hoopo-dev-login)。
// シードや他テストの練習と衝突しないよう、テストごとにランダムな月(2031〜2090年)で行う

const POSITIONS = [
  ["PG", "ポイントガード"],
  ["SG", "シューティングガード"],
  ["SF", "スモールフォワード"],
  ["PF", "パワーフォワード"],
  ["C", "センター"],
] as const;

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
) {
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
  const body = (await res.json()) as { practice: { id: string } };
  return body.practice.id;
}

/** 保護者1人がまとめて6人の子どもを登録する(編成に使う部員を作るだけ) */
async function registerChildren(page: Page, names: string[]) {
  const ctx = await page.context().browser()?.newContext();
  if (!ctx) throw new Error("browser context を作成できません");
  const userId = `U${randomBytes(16).toString("hex")}`;
  const login = await ctx.request.post(`${urls.portal}/api/auth/line`, {
    data: { idToken: `fake:${userId}` },
  });
  expect(login.ok()).toBe(true);
  const created = await ctx.request.post(`${urls.portal}/api/children`, {
    data: {
      children: names.map((name) => ({
        name,
        nicknameKana: null,
        grade: 4,
        gender: "male",
      })),
      relation: "father",
      weekdays: [6],
      startTime: "09:00",
      endTime: "12:00",
      coachNote: null,
    },
  });
  expect(created.status()).toBe(201);
  await ctx.close();
}

test("練習の編成でスターター5人とベンチを保存できる", async ({ page }) => {
  const tag = randomBytes(3).toString("hex");
  const MONTH = uniqueMonth();
  const DAY = `${MONTH}-05`;
  const place = `体育館 ${tag}`;
  const api = await coachRequest(page);
  await createPractice(api, DAY, place);

  // 編成に使う部員6人(スターター5人+ベンチ1人)。名前はテスト間で衝突しないよう tag 付き
  const names = ["A", "B", "C", "D", "E", "F"].map(
    (s) => `E2E 編成${s} ${tag}`,
  );
  await registerChildren(page, names);
  const label = (name: string) => `${name}(4年)`;

  await loginAsCoach(page);
  await page.goto(`${urls.admin}/schedule?month=${MONTH}`);
  const row = page.locator(".prow", { hasText: place });
  await row.getByRole("link", { name: "編成" }).click();

  await expect(page.locator(".ah b")).toContainText("チーム編成");
  await expect(page.locator(".ah .cap")).toContainText(place);

  // スターター5枠(ポジションごとに1人)+ ベンチ1人
  for (const [i, [pos, jp]] of POSITIONS.entries()) {
    await page
      .getByLabel(`${pos}(${jp})`)
      .selectOption({ label: label(names[i] as string) });
  }
  await page
    .getByRole("checkbox", { name: label(names[5] as string), exact: true })
    .check();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("保存しました")).toBeVisible();

  // 再読み込みしても選択が残る(サーバーから読み直した状態)
  await page.reload();
  for (const [i, [pos, jp]] of POSITIONS.entries()) {
    await expect(page.getByLabel(`${pos}(${jp})`)).toHaveValue(/./);
    await expect(
      page.getByLabel(`${pos}(${jp})`).locator("option:checked"),
    ).toHaveText(label(names[i] as string));
  }
  await expect(
    page.getByRole("checkbox", {
      name: label(names[5] as string),
      exact: true,
    }),
  ).toBeChecked();

  // PG を「−」に戻すと4人で保存できる(編成途中)
  const pg = page.getByLabel("PG(ポイントガード)");
  await pg.selectOption("");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("保存しました")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("PG(ポイントガード)")).toHaveValue("");
  await expect(
    page.getByLabel("SG(シューティングガード)").locator("option:checked"),
  ).toHaveText(label(names[1] as string));
  // 外した部員はベンチの候補に戻る(チェックは付かない)
  await expect(
    page.getByRole("checkbox", {
      name: label(names[0] as string),
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", {
      name: label(names[5] as string),
      exact: true,
    }),
  ).toBeChecked();
});
