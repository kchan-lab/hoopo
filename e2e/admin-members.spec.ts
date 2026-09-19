import { randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import {
  birthDateForGrade,
  childNameInput,
  heightForGrade,
} from "./child-input";
import { gotoReady } from "./hydration";
import { urls } from "./urls";

// 認定管理・部員管理の導線(Issue #67 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み(coach@example.com / hoopo-dev-login)。
// 保護者側の登録は portal の API で行い(毎回別のフェイク保護者)、管理側をブラウザで操作する

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
      children: [
        {
          ...childNameInput(name),
          nicknameKana: "てすと",
          birthDate: birthDateForGrade(5),
          heightCm: heightForGrade(5),
          gender: "female",
        },
      ],
      relation: "mother",
      // 曜日ごとに違う時間(Issue #170)。部員詳細に両方が並ぶことを見る
      availabilities: [
        { weekday: 0, startTime: "09:00", endTime: "12:00" },
        { weekday: 6, startTime: "13:00", endTime: "15:00" },
      ],
      coachNote: "E2E の伝達事項",
    },
  });
  expect(created.status()).toBe(201);
  const body = (await created.json()) as {
    children: { id: string; inviteCode: string }[];
  };
  await ctx.close();
  return body.children[0] as { id: string; inviteCode: string };
}

async function loginAsCoach(page: Page) {
  await gotoReady(page, `${urls.admin}/login`);
  await page.getByLabel("メールアドレス").fill("coach@example.com");
  await page.getByLabel("パスワード").fill("hoopo-dev-login");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator("main")).toContainText("ダッシュボード", {
    timeout: 15000,
  });
}

test("登録が認定管理に新着で表示され、無効化すると部員一覧から消える", async ({
  page,
}) => {
  const name = `E2E 部員 ${randomBytes(2).toString("hex")}`;
  const child = await registerChildViaPortal(page, name);
  await loginAsCoach(page);

  // 部員管理: 一覧に出て、行タップで詳細(伝達事項・曜日/時間・招待コード)が開く
  await page.goto(`${urls.admin}/members`);
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator("tr.detail")).toContainText("E2E の伝達事項");
  await expect(page.locator("tr.detail")).toContainText("日 09:00〜12:00");
  await expect(page.locator("tr.detail")).toContainText("土 13:00〜15:00");
  await expect(page.locator("tr.detail")).toContainText(
    `${child.inviteCode.slice(0, 5)}-${child.inviteCode.slice(5)}`,
  );

  // 認定管理: 新着順に出る(他のテストと並行して登録されるため、名前でカードを特定する)。
  // 無効化は二段階確認
  await page.goto(`${urls.admin}/registrations`);
  const card = page.locator("article.acard", { hasText: name });
  await expect(card).toContainText(`${name}(5年)`);
  await expect(card).toContainText("新規登録 / 登録用URL経由 / 続柄: 母");
  await expect(card).toContainText("認定済(自動)");
  await card.getByRole("button", { name: "無効化", exact: true }).click();
  await expect(card).toContainText("無効化しますか?");
  await card.getByRole("button", { name: "無効化する" }).click();
  await expect(card).toContainText("無効化済み", { timeout: 15000 });

  // 部員一覧から消える
  await page.goto(`${urls.admin}/members`);
  await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(
    0,
  );
});

test("モバイルではハンバーガーからドロワーで画面を切り替えられる", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "モバイルのみ");
  await loginAsCoach(page);
  await page.getByRole("button", { name: "メニューを開く" }).click();
  await page.getByRole("link", { name: "認定管理", exact: true }).click();
  await expect(page.locator(".ah b")).toContainText("認定管理");
});

// 生年月日・身長の表示と編集(child-birthdate-height/plan.md 128c)。
// 学年は生年月日から決まる(設計判断2)ので、フィクスチャは child-input.ts で
// 「今日」から逆算し、実行日に依存しないようにする

/** 一覧・行詳細の表示("2019-06-01" → "2019/6/1") */
function birthLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}/${Number(m)}/${Number(d)}`;
}

test("部員の生年月日・身長が見え、行詳細から直すと学年が再計算される", async ({
  page,
  isMobile,
}) => {
  const name = `E2E 編集 ${randomBytes(2).toString("hex")}`;
  await registerChildViaPortal(page, name);
  await loginAsCoach(page);
  await page.goto(`${urls.admin}/members`);

  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await expect(row).toContainText("5年");

  // PC は列、モバイルは行を詰めるので列を隠して行詳細側で見せる
  const birthCell = row.locator("td.c-birth");
  const heightCell = row.locator("td.c-height");
  if (isMobile) {
    await expect(birthCell).toBeHidden();
    await expect(heightCell).toBeHidden();
  } else {
    await expect(birthCell).toHaveText(birthLabel(birthDateForGrade(5)));
    await expect(heightCell).toHaveText(`${heightForGrade(5)}cm`);
  }

  // 行詳細の編集フォームには現在値が入っている(どちらの幅でも見える)
  await row.click();
  const detail = page.locator("tr.detail");
  await expect(detail.getByLabel("生年月日")).toHaveValue(birthDateForGrade(5));
  await expect(detail.getByLabel("身長")).toHaveValue(
    String(heightForGrade(5)),
  );

  // 身長と生年月日を直す。保存前に「この生年月日なら n年」が出る(設計判断4)
  await detail.getByLabel("身長").fill("150");
  await detail.getByLabel("生年月日").fill(birthDateForGrade(3));
  await expect(detail).toContainText("この生年月日なら 3年 になります");
  await detail.getByRole("button", { name: "保存", exact: true }).click();
  await expect(detail).toContainText("保存しました");

  // リロードしても残り、学年は生年月日から再計算されている
  await page.reload();
  const saved = page.getByRole("row", { name: new RegExp(name) });
  await expect(saved).toContainText("3年");
  if (!isMobile) {
    await expect(saved.locator("td.c-birth")).toHaveText(
      birthLabel(birthDateForGrade(3)),
    );
    await expect(saved.locator("td.c-height")).toHaveText("150cm");
  }
  await saved.click();
  const reopened = page.locator("tr.detail");
  await expect(reopened.getByLabel("生年月日")).toHaveValue(
    birthDateForGrade(3),
  );
  await expect(reopened.getByLabel("身長")).toHaveValue("150");
});

test("生年月日が小学生の範囲外だと保存できず、サーバーの文言が出る", async ({
  page,
}) => {
  const name = `E2E 範囲外 ${randomBytes(2).toString("hex")}`;
  await registerChildViaPortal(page, name);
  await loginAsCoach(page);
  await page.goto(`${urls.admin}/members`);

  await page.getByRole("row", { name: new RegExp(name) }).click();
  const detail = page.locator("tr.detail");
  // 入学前(0歳)。クライアントの目安表示と、保存時のサーバーの 400 の両方を確認する
  await detail.getByLabel("生年月日").fill(birthDateForGrade(0));
  await expect(detail).toContainText("この生年月日は小学生の学年になりません");
  await detail.getByRole("button", { name: "保存", exact: true }).click();
  await expect(detail).toContainText("小学生の生年月日を入力してください");
  await expect(detail).not.toContainText("保存しました");
});
