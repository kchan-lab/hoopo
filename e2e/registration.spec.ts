import { randomBytes } from "node:crypto";
import { type BrowserContext, expect, test } from "@playwright/test";
import { birthDateForGrade, heightForGrade } from "./child-input";
import { urls } from "./urls";

// 子ども登録・家族連携の導線(Issue #66 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み。
// 毎回別の保護者として振る舞えるよう、AutoLogin の固定ユーザーは使わず
// フェイク ID トークン(fake:U<32hex>)で直接ログインしてセッション Cookie を張る
// (同じ DB で繰り返し実行しても「未連携の保護者」から始められる)

async function loginAsNewGuardian(context: BrowserContext) {
  const userId = `U${randomBytes(16).toString("hex")}`;
  const res = await context.request.post(`${urls.portal}/api/auth/line`, {
    data: { idToken: `fake:${userId}` },
  });
  expect(res.ok()).toBe(true);
}

test("はじめての保護者が兄弟2人を登録するとホームに表示される", async ({
  context,
  page,
}) => {
  await loginAsNewGuardian(context);
  await page.goto(urls.portal);
  await expect(page.locator("h1")).toContainText("はじめての方");

  await page.getByRole("link", { name: /お子さんを新しく登録する/ }).click();
  await expect(page.locator("h1")).toContainText("お子さんの登録");

  // ①子ども情報(兄弟を追加)。学年は選ばず、生年月日から決まる
  await page.getByLabel("お名前").fill("粉浜 太郎");
  await page.getByLabel("呼び名(ひらがな)").fill("たろう");
  await page.getByLabel("生年月日").fill(birthDateForGrade(4));
  await page
    .getByRole("spinbutton", { name: "身長", exact: true })
    .fill(String(heightForGrade(4)));
  // 入力したその場で「小学4年生」が出る(child-birthdate-height/plan.md 設計判断4)
  const first = page.locator("fieldset.child-block").first();
  await expect(first).toContainText("小学4年生");
  await page.getByRole("button", { name: "男子" }).click();
  await page.getByRole("button", { name: "兄弟・姉妹を追加" }).click();
  const second = page.locator("fieldset.child-block").nth(1);
  await second.getByLabel("お名前").fill("粉浜 花子");
  await second.getByLabel("生年月日").fill(birthDateForGrade(2));
  await second
    .getByRole("spinbutton", { name: "身長", exact: true })
    .fill(String(heightForGrade(2)));
  await expect(second).toContainText("小学2年生");
  await second.getByRole("button", { name: "女子" }).click();
  await page.getByRole("button", { name: "次へ" }).click();

  // ②参加情報(全員に同一適用)
  await expect(page.locator("h1")).toContainText("参加について");
  await page.getByRole("button", { name: "日", exact: true }).click();
  await page.getByRole("button", { name: "土", exact: true }).click();
  await page.getByLabel("参加可能な時間帯").fill("09:00");
  await page.getByLabel("終了時刻").fill("12:00");
  await page.getByRole("button", { name: "父", exact: true }).click();
  await page.getByLabel("コーチへの伝達事項(任意)").fill("ぜん息があります");
  await page.getByRole("button", { name: "登録を完了する" }).click();

  // 自動認定で即時ホームへ
  await expect(page.locator("main")).toContainText("粉浜 太郎", {
    timeout: 15000,
  });
  await expect(page.locator("main")).toContainText("粉浜 花子");
  await expect(page.locator("main")).toContainText("4年");

  // 家族の設定に招待コード(5-5 区切り)と、生年月日から決まった学年・身長が出る
  await page.getByRole("link", { name: /家族の設定/ }).click();
  await expect(page.locator("h1")).toContainText("家族の設定");
  await expect(page.locator(".invite-code").first()).toHaveText(
    /^[0-9A-Z]{5}-[0-9A-Z]{5}$/,
  );
  await expect(page.locator("main")).toContainText("あなた(父)");
  const taro = page.locator("section.child-block").first();
  await expect(taro).toContainText("小学4年生");
  await expect(taro).toContainText(birthDateForGrade(4));
  await expect(taro).toContainText(`${heightForGrade(4)} cm`);
});

test("小学生にならない生年月日では次へ進めない", async ({ context, page }) => {
  // 学年が 1〜6 に入らない生年月日は登録できない(REQUIREMENTS §3)。
  // クライアントの検証はサーバー(parseBirthDate)と同じ純関数なので文言もそろう
  await loginAsNewGuardian(context);
  await page.goto(`${urls.portal}/register`);
  await page.getByLabel("お名前").fill("粉浜 未就学");
  // 小学1年生より1学年下 = まだ入学していない
  await page.getByLabel("生年月日").fill(birthDateForGrade(0));
  await page
    .getByRole("spinbutton", { name: "身長", exact: true })
    .fill(String(heightForGrade(1)));
  await expect(page.locator("fieldset.child-block").first()).toContainText(
    "小学生の生年月日を入力してください",
  );
  await page.getByRole("button", { name: "男子" }).click();
  await page.getByRole("button", { name: "次へ" }).click();

  // ①に留まり、エラーが出る
  // Next.js のルートアナウンサー(空の role="alert")と衝突するので form に絞る
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "1人目の小学生の生年月日を入力してください",
  );
  await expect(page.locator("h1")).toContainText("お子さんの登録");
});

test("第二保護者が招待コードで連携すると同じ子どもが見える", async ({
  browser,
}) => {
  // 保護者A: API で登録して招待コードを得る
  const contextA = await browser.newContext();
  await loginAsNewGuardian(contextA);
  const created = await contextA.request.post(`${urls.portal}/api/children`, {
    data: {
      children: [
        {
          name: "北粉浜 次郎",
          birthDate: birthDateForGrade(3),
          heightCm: heightForGrade(3),
          gender: "male",
        },
      ],
      relation: "mother",
      weekdays: [6],
      startTime: "09:00",
      endTime: "12:00",
    },
  });
  expect(created.status()).toBe(201);
  const { children } = (await created.json()) as {
    children: { inviteCode: string }[];
  };
  const code = children[0]?.inviteCode ?? "";
  await contextA.close();

  // 保護者B: 分岐画面でコードを入力(小文字・ハイフン混じりでも通る)
  const contextB = await browser.newContext();
  await loginAsNewGuardian(contextB);
  const page = await contextB.newPage();
  await page.goto(urls.portal);
  await expect(page.locator("h1")).toContainText("はじめての方");
  await page
    .getByLabel("招待コード")
    .fill(`${code.slice(0, 5).toLowerCase()}-${code.slice(5)}`);
  await page.getByRole("button", { name: "父", exact: true }).click();
  await page.getByRole("button", { name: "コードで連携する" }).click();

  await expect(page.locator("main")).toContainText("北粉浜 次郎", {
    timeout: 15000,
  });
  await page.getByRole("link", { name: /家族の設定/ }).click();
  await expect(page.locator("main")).toContainText("あなた(父)");
  await expect(page.locator("main")).toContainText("母");
  await expect(page.locator("main")).toContainText("連携済み");
  await contextB.close();
});
