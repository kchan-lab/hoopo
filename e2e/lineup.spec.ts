import { randomBytes } from "node:crypto";
import { type BrowserContext, expect, test } from "@playwright/test";
import { urls } from "./urls";

// 保護者の出場メンバー 2D(Issue #102 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み。編成の保存には 7b-1(#101)の管理 API
// `PUT ${urls.admin}/api/lineups/:practiceId` を使うため、#101 のマージ後に通る。
// 練習はコーチの API で作り(2027-07)、部員は保護者の新規登録で用意する

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;

async function loginAsCoach(context: BrowserContext) {
  const res = await context.request.post(`${urls.admin}/api/auth/login`, {
    data: { email: "coach@example.com", password: "hoopo-dev-login" },
  });
  expect(res.ok()).toBe(true);
}

async function createPracticeAsCoach(
  context: BrowserContext,
  heldOn: string,
  location: string,
) {
  const res = await context.request.post(`${urls.admin}/api/practices`, {
    data: {
      heldOn,
      startTime: "09:00",
      endTime: "12:00",
      location,
      note: "練習試合",
      menus: [],
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { practice: { id: string } }).practice.id;
}

async function loginAsNewGuardian(context: BrowserContext) {
  const res = await context.request.post(`${urls.portal}/api/auth/line`, {
    data: { idToken: `fake:U${randomBytes(16).toString("hex")}` },
  });
  expect(res.ok()).toBe(true);
}

/** 保護者の新規登録で部員を6人つくる(スターター5人+ベンチ1人) */
async function registerChildren(context: BrowserContext, names: string[]) {
  const res = await context.request.post(`${urls.portal}/api/children`, {
    data: {
      children: names.map((name) => ({
        name,
        nicknameKana: "らいん",
        grade: 6,
        gender: "male",
      })),
      relation: "mother",
      weekdays: [0],
      startTime: "09:00",
      endTime: "12:00",
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { children: { id: string; name: string }[] })
    .children;
}

test("編成のある練習だけ「出場メンバーはこちら →」が出て、コートに5人とベンチが並ぶ", async ({
  browser,
  page,
}) => {
  const tag = randomBytes(2).toString("hex");
  const place = `編成体育館 ${tag}`;
  const otherPlace = `編成なし体育館 ${tag}`;
  const names = POSITIONS.map((p) => `編成 ${p}${tag}`);
  const benchName = `編成 BN${tag}`;

  await loginAsNewGuardian(page.context());
  const children = await registerChildren(page.context(), [
    ...names,
    benchName,
  ]);
  expect(children).toHaveLength(6);
  const idOf = (name: string) => {
    const child = children.find((c) => c.name === name);
    if (!child) throw new Error(`部員が見つかりません: ${name}`);
    return child.id;
  };

  const coach = await browser.newContext();
  await loginAsCoach(coach);
  const practiceId = await createPracticeAsCoach(coach, "2027-07-11", place);
  const emptyPracticeId = await createPracticeAsCoach(
    coach,
    "2027-07-18",
    otherPlace,
  );
  const saved = await coach.request.put(
    `${urls.admin}/api/lineups/${practiceId}`,
    {
      data: {
        starters: POSITIONS.map((position, i) => ({
          childId: idOf(names[i] as string),
          position,
        })),
        bench: [idOf(benchName)],
      },
    },
  );
  expect(saved.ok()).toBe(true);
  await coach.close();

  // 編成のある練習: 詳細 → 出場メンバー
  await page.goto(`${urls.portal}/practices/${practiceId}`);
  await expect(page.locator("main")).toContainText(place);
  await page.getByRole("link", { name: "出場メンバーはこちら →" }).click();
  await expect(page.locator("h1")).toContainText("出場メンバー");
  await expect(page.locator(".court-cap")).toContainText("練習試合");

  // コート上のチップ5人(ポジションバッジと氏名)
  await expect(page.locator(".court-wrap .pl")).toHaveCount(5);
  for (const [i, position] of POSITIONS.entries()) {
    const chip = page.locator(".pl", { hasText: names[i] as string });
    await expect(chip.locator(".pos")).toHaveText(position);
    await expect(chip.locator(".nm")).toHaveText(names[i] as string);
  }

  // ベンチは1人
  await expect(page.locator(".bench .bp")).toHaveCount(1);
  await expect(page.locator(".bench .bp .nm")).toHaveText(benchName);

  // 3D は後日(無効なタブ)
  await expect(page.getByRole("tab", { name: "3D" })).toBeDisabled();

  // 戻ると練習の詳細
  await page.getByRole("link", { name: "練習の詳細へ戻る" }).click();
  await expect(page.locator("h1")).toContainText("練習の詳細");

  // 編成の無い練習ではボタンを出さない
  await page.goto(`${urls.portal}/practices/${emptyPracticeId}`);
  await expect(page.locator("main")).toContainText(otherPlace);
  await expect(
    page.getByRole("link", { name: "出場メンバーはこちら →" }),
  ).toHaveCount(0);
});
