import { randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { urls } from "./urls";

// 月謝管理の導線(Issue #82 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み(coach@example.com / hoopo-dev-login)。
// 部員は毎回別のフェイク保護者が portal の API で登録し(名前で行を特定する)、
// 管理側をブラウザで操作する。年は Tokyo の今年、列は Tokyo の今月を使う

/** Tokyo の今年・今月(未来セルにならない列を選ぶため) */
function tokyoNow(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { year: Number(get("year")), month: Number(get("month")) };
}

const { year: YEAR, month: MONTH } = tokyoNow();

async function registerChildViaPortal(page: Page, name: string) {
  const ctx = await page.context().browser()?.newContext();
  if (!ctx) throw new Error("browser context を作成できません");
  const userId = `U${randomBytes(16).toString("hex")}`;
  const login = await ctx.request.post(`${urls.portal}/api/auth/line`, {
    data: { idToken: `fake:${userId}` },
  });
  expect(login.ok()).toBe(true);
  const created = await ctx.request.post(`${urls.portal}/api/children`, {
    data: {
      children: [{ name, nicknameKana: "てすと", grade: 5, gender: "female" }],
      relation: "mother",
      weekdays: [6],
      startTime: "09:00",
      endTime: "12:00",
      coachNote: null,
    },
  });
  expect(created.status()).toBe(201);
  await ctx.close();
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

/** PC の表で、その部員の今月のセル(1月始まりなので月 − 1 番目のボタン) */
function pcCell(page: Page, name: string) {
  return page
    .locator(".fee-pc .afee tbody tr", { hasText: name })
    .locator("button")
    .nth(MONTH - 1);
}

test("セルを押すと済になり、再表示しても保持され、もう一度押すと未に戻る", async ({
  page,
  isMobile,
}) => {
  test.skip(!!isMobile, "PC の表レイアウトのみ(モバイルは封筒グリッド)");
  const name = `E2E 月謝 ${randomBytes(2).toString("hex")}`;
  await registerChildViaPortal(page, name);
  await loginAsCoach(page);

  await page.goto(`${urls.admin}/fees?year=${YEAR}`);
  await expect(page.locator(".ah b")).toContainText("月謝管理");
  await expect(page.locator(".month-nav .pill")).toHaveText(`${YEAR}年`);

  // 登録直後は行が無いので「未」に導出される
  await expect(pcCell(page, name)).toHaveText("未");
  await pcCell(page, name).click();
  await expect(pcCell(page, name)).toHaveText("済");

  // 再表示しても保持される(サーバーに保存されている)
  await page.reload();
  await expect(pcCell(page, name)).toHaveText("済");

  // もう一度押すと未に戻る
  await pcCell(page, name).click();
  await expect(pcCell(page, name)).toHaveText("未");
  await page.reload();
  await expect(pcCell(page, name)).toHaveText("未");
});

test("年の前後リンクで表示年が切り替わる", async ({ page }) => {
  await loginAsCoach(page);
  await page.goto(`${urls.admin}/fees?year=${YEAR}`);
  const pill = page.locator(".month-nav .pill");
  await expect(pill).toHaveText(`${YEAR}年`);
  await page.getByRole("link", { name: "前の年" }).click();
  await expect(pill).toHaveText(`${YEAR - 1}年`);
  await page.getByRole("link", { name: "次の年" }).click();
  await expect(pill).toHaveText(`${YEAR}年`);
});

test("モバイルは部員を選んで封筒グリッドで済にできる", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "モバイルのみ");
  const name = `E2E 月謝SP ${randomBytes(2).toString("hex")}`;
  await registerChildViaPortal(page, name);
  await loginAsCoach(page);

  await page.goto(`${urls.admin}/fees?year=${YEAR}`);
  await page.locator("#fee-child").selectOption({ label: `${name}(5年)` });
  const card = page.locator(".fee-sp .mfee button").nth(MONTH - 1);
  await expect(card).toContainText("未");
  await card.click();
  await expect(card).toContainText("済");
  await page.reload();
  await page.locator("#fee-child").selectOption({ label: `${name}(5年)` });
  await expect(
    page.locator(".fee-sp .mfee button").nth(MONTH - 1),
  ).toContainText("済");
});
