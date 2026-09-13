import { randomBytes } from "node:crypto";
import { type BrowserContext, expect, test } from "@playwright/test";
import { urls } from "./urls";

// 保護者の月謝確認(Issue #81 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み。保護者は毎回新しいフェイク ID トークン
// (fake:U<32hex>)でログインし、月謝の行を1つも持たない状態から始める。
//
// 依存: 「済」を付けるのは 5b(#82)の管理 API `PUT /api/fee-records`
// (body: { childId, year, month, status })。5b がマージされるまでこのテストは赤になる

/** 新しいフェイク保護者でログインし、お子さんを1人登録して child id を返す */
async function registerChildAsNewGuardian(
  context: BrowserContext,
  name: string,
): Promise<string> {
  const login = await context.request.post(`${urls.portal}/api/auth/line`, {
    data: { idToken: `fake:U${randomBytes(16).toString("hex")}` },
  });
  expect(login.ok()).toBe(true);
  const res = await context.request.post(`${urls.portal}/api/children`, {
    data: {
      children: [{ name, grade: 3, gender: "male" }],
      relation: "father",
      weekdays: [0, 6],
      startTime: "09:00",
      endTime: "12:00",
    },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { children: { id: string }[] };
  const child = body.children[0];
  if (!child) throw new Error("お子さんの登録に失敗しました");
  return child.id;
}

/** コーチの管理 API(5b)で1セルを 済/未 にする */
async function setFeeStatusAsCoach(
  context: BrowserContext,
  childId: string,
  year: number,
  month: number,
  status: "paid" | "unpaid",
) {
  const login = await context.request.post(`${urls.admin}/api/auth/login`, {
    data: { email: "coach@example.com", password: "hoopo-dev-login" },
  });
  expect(login.ok()).toBe(true);
  const res = await context.request.put(`${urls.admin}/api/fee-records`, {
    data: { childId, year, month, status },
  });
  expect(res.ok()).toBe(true);
}

/** Asia/Tokyo の今日("YYYY-MM-DD")。日付は東京固定で決める */
function todayInTokyo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const TODAY = todayInTokyo();
const YEAR = Number(TODAY.slice(0, 4));
const MONTH = Number(TODAY.slice(5, 7));

test("コーチが「済」にした月が封筒グリッドに反映される", async ({
  browser,
  page,
}) => {
  const tag = randomBytes(2).toString("hex");
  const childId = await registerChildAsNewGuardian(
    page.context(),
    `月謝 太郎 ${tag}`,
  );

  // 1月(今月が1月なら2月=前払い)を「済」にする。今月は行を作らないので「未」のまま
  const paidMonth = MONTH === 1 ? 2 : 1;
  const coach = await browser.newContext();
  await setFeeStatusAsCoach(coach, childId, YEAR, paidMonth, "paid");
  await coach.close();

  await page.goto(`${urls.portal}/fees?year=${YEAR}`);
  await expect(page.locator("h1")).toContainText("月謝確認");
  await expect(page.locator(".year-nav")).toContainText(`${YEAR}年`);

  const cells = page.locator(".fee");
  await expect(cells).toHaveCount(12);
  // 済は前払いでも常に「済」(fees/plan.md 設計判断1)
  await expect(cells.nth(paidMonth - 1)).toHaveAttribute("data-state", "paid");
  await expect(cells.nth(paidMonth - 1)).toContainText("済");
  // 行を持たない今月以前は「未」
  await expect(cells.nth(MONTH - 1)).toHaveAttribute("data-state", "unpaid");
  await expect(cells.nth(MONTH - 1)).toContainText("未");
  // 来月以降は「–」(今月が12月の年は同じ年に未来の月が無いので 2099 年のテストで見る)
  if (MONTH < 12) {
    await expect(cells.nth(11)).toHaveAttribute("data-state", "future");
  }

  // 金額・運用注記のカード(env の FEE_NOTE。未設定なら既定の文言)
  await expect(page.locator(".fee-note")).toContainText("封筒");

  // タブバーの「月謝」が現在地になっている
  await expect(page.locator('.tabbar a[aria-current="page"]')).toContainText(
    "月謝",
  );
});

test("先の年は12か月すべて「–」で表示される", async ({ page }) => {
  const tag = randomBytes(2).toString("hex");
  await registerChildAsNewGuardian(page.context(), `月謝 花子 ${tag}`);

  await page.goto(`${urls.portal}/fees?year=2099`);
  await expect(page.locator(".year-nav")).toContainText("2099年");
  await expect(page.locator('.fee[data-state="future"]')).toHaveCount(12);
});
