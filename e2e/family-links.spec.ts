import { randomBytes } from "node:crypto";
import { type BrowserContext, expect, test } from "@playwright/test";
import {
  birthDateForGrade,
  childNameInput,
  fullName,
  heightForGrade,
} from "./child-input";
import { gotoReady } from "./hydration";
import { urls } from "./urls";

// 家族連携の解除(family-links/plan.md。Issue #31 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み。
// registration.spec.ts と同じく、毎回別の保護者としてフェイク ID トークンでログインする

async function loginAsNewGuardian(context: BrowserContext) {
  const userId = `U${randomBytes(16).toString("hex")}`;
  const res = await context.request.post(`${urls.portal}/api/auth/line`, {
    data: { idToken: `fake:${userId}` },
  });
  expect(res.ok()).toBe(true);
}

test("家族の設定からお子さんの生年月日・身長を直せる", async ({
  context,
  page,
}) => {
  // child-birthdate-height/plan.md 設計判断5: 登録は初回の1回だけなので、
  // 打ち間違いと身長の伸びを保護者が自分で直せる必要がある。学年は生年月日から再計算される
  await loginAsNewGuardian(context);
  const childName = `粉浜 編集${randomBytes(3).toString("hex")}`;
  const created = await context.request.post(`${urls.portal}/api/children`, {
    data: {
      children: [
        {
          ...childNameInput(childName),
          nicknameKana: "へんしゅう",
          birthDate: birthDateForGrade(3),
          heightCm: heightForGrade(3),
          gender: "male",
        },
      ],
      relation: "mother",
      availabilities: [{ weekday: 6, startTime: "09:00", endTime: "12:00" }],
    },
  });
  expect(created.status()).toBe(201);

  await page.goto(`${urls.portal}/family`);
  const block = page.locator("section.child-block").first();
  await expect(block).toContainText("小学3年生");
  await expect(block).toContainText(`${heightForGrade(3)} cm`);

  // 小学生にならない生年月日はサーバーが断る(400 の文言をそのまま出す)
  await block.getByRole("button", { name: "編集" }).click();
  await block.getByLabel("生年月日").fill(birthDateForGrade(0));
  await expect(block).toContainText("小学生の生年月日を入力してください");
  await block.getByRole("button", { name: "保存" }).click();
  await expect(block.getByRole("alert")).toContainText(
    "小学生の生年月日を入力してください",
  );

  // 生年月日と身長を直すと、学年が再計算されて表示が変わる
  await block.getByLabel("生年月日").fill(birthDateForGrade(5));
  await block
    .getByRole("spinbutton", { name: "身長", exact: true })
    .fill("152");
  await expect(block).toContainText("小学5年生");
  await block.getByRole("button", { name: "保存" }).click();
  await expect(block).toContainText("152 cm", { timeout: 15000 });
  await expect(block).toContainText("小学5年生");
  await expect(block).toContainText(birthDateForGrade(5));

  // 再読み込みしても残っている(DB に保存されている)
  await page.reload();
  const reloaded = page.locator("section.child-block").first();
  await expect(reloaded).toContainText("152 cm");
  await expect(reloaded).toContainText("小学5年生");

  // ホームの学年ピルも再計算後の学年になる
  await page.goto(urls.portal);
  await expect(page.locator("main")).toContainText("5年");
});

test("家族の設定から参加できる曜日と時間を直せる(Issue #170)", async ({
  context,
  page,
}) => {
  // availability-slots/plan.md 設計判断1・6: 曜日ごとに時間を持てるようにしたぶん、
  // 間違えたときに直せる必要がある。保存はその子の枠をまるごと差し替える
  await loginAsNewGuardian(context);
  const childName = `粉浜 時間${randomBytes(3).toString("hex")}`;
  const created = await context.request.post(`${urls.portal}/api/children`, {
    data: {
      children: [
        {
          ...childNameInput(childName),
          nicknameKana: "じかん",
          birthDate: birthDateForGrade(4),
          heightCm: heightForGrade(4),
          gender: "female",
        },
      ],
      relation: "mother",
      availabilities: [
        { weekday: 0, startTime: "09:00", endTime: "12:00" },
        { weekday: 6, startTime: "09:00", endTime: "12:00" },
      ],
      coachNote: null,
    },
  });
  expect(created.status()).toBe(201);

  // /family は編集を開くまで form が無いので、お子さんのブロックを目印にする
  await gotoReady(page, `${urls.portal}/family`, "section.child-block");
  const block = page.locator("section.child-block").first();
  await expect(block).toContainText("日 09:00 〜 12:00");
  await expect(block).toContainText("土 09:00 〜 12:00");

  await block.getByRole("button", { name: "編集" }).click();
  // 既存の値が全曜日で同じなので、チェックが入った状態で開く。共通の1組だけが出て、
  // 曜日ごとの行は出ない(Issue #179 / availability-common-time/plan.md 設計判断3・7)
  const sameTimeBox = block.getByRole("checkbox", {
    name: "すべての曜日に同じ時間を使う",
  });
  await expect(sameTimeBox).toBeChecked();
  await expect(block.getByLabel("開始時刻", { exact: true })).toHaveValue(
    "09:00",
  );
  await expect(block.getByLabel("日曜日の開始時刻")).toHaveCount(0);
  // 日を外し、水を足す(枠は差し替えなので日の行は消える)
  await block.getByRole("button", { name: "日", exact: true }).click();
  await block.getByRole("button", { name: "水", exact: true }).click();
  await expect(block).toContainText("水・土 に同じ時間を使います");
  // 曜日ごとに違う時間にする。外した直後の各行は直前の共通の時間(設計判断5)
  await sameTimeBox.uncheck();
  await expect(block.getByLabel("水曜日の開始時刻")).toHaveValue("09:00");
  await block.getByLabel("水曜日の開始時刻").fill("18:00");
  await block.getByLabel("水曜日の終了時刻").fill("20:00");
  await expect(block.getByLabel("土曜日の開始時刻")).toHaveValue("09:00");
  await block.getByRole("button", { name: "保存" }).click();

  await expect(block).toContainText("水 18:00 〜 20:00", { timeout: 15000 });
  await expect(block).toContainText("土 09:00 〜 12:00");
  await expect(block).not.toContainText("日 09:00 〜 12:00");

  // 再読み込みしても残っている
  await page.reload();
  const reloaded = page.locator("section.child-block").first();
  await expect(reloaded).toContainText("水 18:00 〜 20:00");
  await expect(reloaded).toContainText("土 09:00 〜 12:00");
  await expect(reloaded).not.toContainText("日 09:00 〜 12:00");

  // 終了が開始より前だと保存できず、サーバーと同じ文言が出る
  await reloaded.getByRole("button", { name: "編集" }).click();
  // 曜日ごとに時間が違うので、チェックが外れた状態(=曜日ごとの行)で開く(設計判断7)
  await expect(
    reloaded.getByRole("checkbox", { name: "すべての曜日に同じ時間を使う" }),
  ).not.toBeChecked();
  await reloaded.getByLabel("水曜日の終了時刻").fill("17:00");
  await reloaded.getByRole("button", { name: "保存" }).click();
  await expect(reloaded.getByRole("alert")).toContainText(
    "水曜日の終了時刻は開始時刻より後にしてください",
  );
});

test("第二保護者は自分の連携を解除でき、最後の保護者は解除できない", async ({
  browser,
}) => {
  // 保護者A(父): API で登録し、家族の設定から招待コードを読む
  const contextA = await browser.newContext();
  await loginAsNewGuardian(contextA);
  const childName = `粉浜 解除${randomBytes(3).toString("hex")}`;
  const created = await contextA.request.post(`${urls.portal}/api/children`, {
    data: {
      children: [
        {
          ...childNameInput(childName),
          birthDate: birthDateForGrade(3),
          heightCm: heightForGrade(3),
          gender: "male",
        },
      ],
      relation: "father",
      availabilities: [{ weekday: 6, startTime: "09:00", endTime: "12:00" }],
    },
  });
  expect(created.status()).toBe(201);
  const family = await contextA.request.get(`${urls.portal}/api/family`);
  expect(family.ok()).toBe(true);
  const { children } = (await family.json()) as {
    children: { familyName: string; givenName: string; inviteCode: string }[];
  };
  const code =
    children.find((c) => fullName(c) === childName)?.inviteCode ?? "";
  expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);

  // 保護者B(母): 分岐画面で連携する(重複登録の注記が出ている)
  const contextB = await browser.newContext();
  await loginAsNewGuardian(contextB);
  const pageB = await contextB.newPage();
  await gotoReady(pageB, urls.portal);
  await expect(pageB.locator("h1")).toContainText("はじめての方");
  await expect(pageB.locator("main")).toContainText("二重登録を防ぐため");
  await pageB.getByLabel("招待コード").fill(code);
  await pageB.getByRole("button", { name: "母", exact: true }).click();
  await pageB.getByRole("button", { name: "コードで連携する" }).click();
  await expect(pageB.locator("main")).toContainText(childName, {
    timeout: 15000,
  });

  // 家族の設定から二段階確認で解除 → 連携が無くなるので分岐画面に戻る
  await pageB.getByRole("link", { name: /家族の設定/ }).click();
  await expect(pageB.locator("main")).toContainText("あなた(母)");
  await pageB.getByRole("button", { name: "連携を解除" }).click();
  await expect(pageB.locator("main")).toContainText(
    `${childName}さんとの連携を解除しますか?`,
  );
  await pageB.getByRole("button", { name: "解除する" }).click();
  await expect(pageB.locator("h1")).toContainText("はじめての方", {
    timeout: 15000,
  });
  await contextB.close();

  // 保護者A: 最後の保護者になったので解除できない
  const pageA = await contextA.newPage();
  await pageA.goto(`${urls.portal}/family`);
  await expect(pageA.locator("main")).toContainText("あなた(父)");
  await pageA.getByRole("button", { name: "連携を解除" }).click();
  await pageA.getByRole("button", { name: "解除する" }).click();
  await expect(pageA.locator("main").getByRole("alert")).toContainText(
    "最後の保護者は解除できません",
  );

  // 連携は残ったまま(ホームにお子さんが出る)
  await pageA.goto(urls.portal);
  await expect(pageA.locator("main")).toContainText(childName);
  await contextA.close();
});
