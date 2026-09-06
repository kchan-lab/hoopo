import { randomBytes, randomInt } from "node:crypto";
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { urls } from "./urls";

// 出欠管理・欠席者管理の導線(Issue #77 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み(coach@example.com / hoopo-dev-login)。
// 提出は保護者 API(4a の PUT /api/attendance)で行い、管理側をブラウザで確認する。
// シードや他テストの練習と衝突しないよう、テストごとにランダムな月(2031〜2090年)で行う
// (同じ DB で desktop / mobile が並行し、同月に練習が蓄積すると列がずれるため)

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

function uniqueMonth(): string {
  const y = 2031 + randomInt(60);
  const m = String(1 + randomInt(12)).padStart(2, "0");
  return `${y}-${m}`;
}

/** "2031-04-05" → "4/5"、withWeekday なら "4/5(土)" */
function label(date: string, withWeekday = false): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const wd = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}${withWeekday ? `(${wd})` : ""}`;
}

async function loginAsCoach(page: Page) {
  await page.goto(`${urls.admin}/login`);
  await page.getByLabel("メールアドレス").fill("coach@example.com");
  await page.getByLabel("パスワード").fill("hoopo-dev-login");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator("main")).toContainText("ログインしました", {
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

/** 保護者を1人作り、子ども1人を登録して、参加予定を提出する */
async function registerAndSubmit(
  page: Page,
  name: string,
  answers: { practiceId: string; status: string; comment: string | null }[],
) {
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
  const childId = body.children[0]?.id as string;

  // 提出 API は 4a。未マージのうちはこのテストは実行できない
  const submitted = await ctx.request.put(`${urls.portal}/api/attendance`, {
    data: { childId, answers },
  });
  expect(
    submitted.ok(),
    "保護者の提出 API(PUT /api/attendance)は 4a で実装される",
  ).toBe(true);
  await ctx.close();
  return childId;
}

test("提出した参加予定が出欠マトリクスと欠席者管理に反映される", async ({
  page,
}) => {
  const tag = randomBytes(2).toString("hex");
  const MONTH = uniqueMonth();
  const DAY1 = `${MONTH}-05`;
  const DAY2 = `${MONTH}-12`;
  const api = await coachRequest(page);
  const p1 = await createPractice(api, DAY1, `体育館A ${tag}`);
  const p2 = await createPractice(api, DAY2, `体育館B ${tag}`);

  const nameA = `E2E 出欠A ${tag}`;
  const nameB = `E2E 出欠B ${tag}`;
  const comment = `10:00から参加します ${tag}`;
  // A は p1 に全参加、B は p1 に途中参加(コメント付き)。p2 は2人とも未回答
  await registerAndSubmit(page, nameA, [
    { practiceId: p1, status: "full", comment: null },
  ]);
  await registerAndSubmit(page, nameB, [
    { practiceId: p1, status: "partial", comment },
  ]);

  await loginAsCoach(page);

  // 出欠管理: 列は 5日 と 12日
  await page.goto(`${urls.admin}/attendance?month=${MONTH}`);
  await expect(page.locator(".ah b")).toContainText("出欠管理");
  await expect(page.locator(".month-nav .pill")).toHaveText(
    `${Number(MONTH.slice(0, 4))}年${Number(MONTH.slice(5))}月`,
  );
  const head = page.locator(".amatrix tr.hd");
  await expect(head).toContainText(label(DAY1));
  await expect(head).toContainText(label(DAY2));

  const rowA = page.locator(".amatrix tbody tr", { hasText: nameA });
  const rowB = page.locator(".amatrix tbody tr", { hasText: nameB });
  // 列の並びは日付順なので、1列目=5日、2列目=12日(0列目は部員名)
  await expect(rowA.locator("td").nth(1)).toHaveText("○");
  await expect(rowA.locator("td").nth(2)).toHaveText("−");
  await expect(rowB.locator("td").nth(1)).toContainText("△");
  await expect(rowB.locator("td").nth(2)).toHaveText("−");

  // △ をタップするとコメントが読める(ネイティブの details。開くまでは隠れている)
  await expect(rowB.locator("details")).not.toHaveAttribute("open", "");
  await rowB.locator("summary").scrollIntoViewIfNeeded();
  await rowB.locator("summary").click();
  // モバイルでは横スクロール領域の外に出て「可視」判定が揺れるため、open 属性と本文で確認する
  await expect(rowB.locator("details")).toHaveAttribute("open", "");
  await expect(rowB.locator(".cmt")).toHaveText(comment);

  // 欠席者管理: 5日は B が「途中参加・早退」、A・B とも「不参加」には出ない
  await page.goto(`${urls.admin}/absentees?month=${MONTH}&practiceId=${p1}`);
  await expect(page.locator(".ah b")).toContainText("欠席者管理");
  await expect(page.locator(".pill.fill")).toHaveText(label(DAY1, true));
  const absent = page.locator(".acard", { hasText: "不参加 —" });
  const partial = page.locator(".acard", { hasText: "途中参加・早退 —" });
  await expect(partial).toContainText(`${nameB}(4年)`);
  await expect(partial).toContainText(comment);
  await expect(absent).not.toContainText(nameA);
  await expect(absent).not.toContainText(nameB);

  // 12日は2人とも未回答。リマインドは #27 まで無効表示
  const nextPill = page.getByRole("link", { name: label(DAY2), exact: true });
  await expect(nextPill).toHaveAttribute("href", new RegExp(p2));
  await nextPill.click();
  await expect(page.locator(".pill.fill")).toHaveText(label(DAY2, true));
  const unanswered = page.locator(".acard", { hasText: "未回答 —" });
  await expect(unanswered).toContainText(`${nameA}(4年)`);
  await expect(unanswered).toContainText(`${nameB}(4年)`);
  await expect(
    unanswered.getByRole("button", { name: "リマインド対象に含める" }).first(),
  ).toBeDisabled();
});

test("モバイルではドロワーから出欠管理へ移動できる", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "モバイルのみ");
  await loginAsCoach(page);
  await page.getByRole("button", { name: "メニューを開く" }).click();
  await page.getByRole("link", { name: "出欠管理" }).click();
  await expect(page.locator(".ah b")).toContainText("出欠管理");
});
