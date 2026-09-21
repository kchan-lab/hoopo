import { randomBytes } from "node:crypto";
import { type BrowserContext, expect, test } from "@playwright/test";
import {
  birthDateForGrade,
  childNameInput,
  fullName,
  heightForGrade,
} from "./child-input";
import { expectNoAutoZoom } from "./form-font-size";
import { gotoReady } from "./hydration";
import { urls } from "./urls";

// 家族連携の解除(family-links/plan.md。Issue #31 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み。
// registration.spec.ts と同じく、毎回別の保護者としてフェイク ID トークンでログインする

async function loginAsNewGuardian(context: BrowserContext): Promise<string> {
  const userId = `U${randomBytes(16).toString("hex")}`;
  const res = await context.request.post(`${urls.portal}/api/auth/line`, {
    data: { idToken: `fake:${userId}` },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { guardianId: string };
  return body.guardianId;
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

  // 受け付ける学年(小学1年生〜中学1年生)の外はサーバーが断る(400 の文言をそのまま出す)
  await block.getByRole("button", { name: "編集" }).click();
  // フォーム部品はどれも 16px 以上で描かれる(iOS の自動ズーム対策。Issue #205)
  await expectNoAutoZoom(block);
  await block.getByLabel("生年月日").fill(birthDateForGrade(0));
  await expect(block).toContainText(
    "生年月日は小学1年生〜中学1年生の範囲で入力してください",
  );
  await block.getByRole("button", { name: "保存" }).click();
  await expect(block.getByRole("alert")).toContainText(
    "生年月日は小学1年生〜中学1年生の範囲で入力してください",
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

test("ホーム右上のメニューから家族の設定とログアウトに行ける(Issue #186)", async ({
  context,
  page,
}) => {
  // family-settings-entry/plan.md 設計判断0: 右上の丸は家族の設定へ直行せず、
  // 「家族の設定 / プライバシーポリシー / ログアウト」を選べるメニューを開く。
  // 読み上げ用の名前が付いている(aria-hidden ではない)ので名前で引ける。
  // 家族の設定へはホームのカードからも行ける(設計判断5: 導線は2つ残す)
  const guardianId = await loginAsNewGuardian(context);
  const childName = `粉浜 導線${randomBytes(3).toString("hex")}`;
  const created = await context.request.post(`${urls.portal}/api/children`, {
    data: {
      children: [
        {
          ...childNameInput(childName),
          nicknameKana: "どうせん",
          birthDate: birthDateForGrade(2),
          heightCm: heightForGrade(2),
          gender: "female",
        },
      ],
      relation: "mother",
      availabilities: [{ weekday: 6, startTime: "09:00", endTime: "12:00" }],
    },
  });
  expect(created.status()).toBe(201);

  // メニューはクリックで開くので、React が受け持つまで待つ
  await gotoReady(page, urls.portal, "header .avatar");
  await expect(page.locator("main")).toContainText(childName, {
    timeout: 15000,
  });
  const trigger = page
    .locator("header")
    .getByRole("button", { name: "メニュー", exact: true });
  const menu = page.locator(".acct-menu");

  // Esc で閉じる
  await trigger.click();
  await expect(menu).toContainText("プライバシーポリシー");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // 外側をタップしても閉じる
  await trigger.click();
  await page.getByRole("button", { name: "メニューを閉じる" }).click();
  await expect(menu).toHaveCount(0);

  // ログアウトは確認を挟み、LINEから開き直せることを添える
  await trigger.click();
  await menu.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(menu).toContainText("ログアウトしますか?");
  await expect(menu).toContainText(
    "LINEのトークからこのアプリを開き直すと、また入れます",
  );
  await menu.getByRole("button", { name: "キャンセル" }).click();
  await expect(menu).not.toContainText("ログアウトしますか?");

  // メニューから家族の設定へ行ける
  await menu.getByRole("link", { name: /家族の設定/ }).click();
  await expect(page.locator("h1")).toContainText("家族の設定", {
    timeout: 15000,
  });
  await expect(page.locator("main")).toContainText(childName);

  // ホームのカードからも行ける(導線は2つ残す)
  await page.goto(urls.portal);
  await page
    .locator("main")
    .getByRole("link", { name: /家族の設定/ })
    .click();
  await expect(page.locator("h1")).toContainText("家族の設定", {
    timeout: 15000,
  });

  // ログアウトするとセッションが消え、自分の子は見えなくなる。
  // フェイク認証の E2E では未ログインのホームが既定のユーザーとして入り直すので
  // (LIFF から開き直したときと同じ挙動)、「元の保護者ではなくなること」で確かめる
  await gotoReady(page, urls.portal, "header .avatar");
  await trigger.click();
  await menu.getByRole("button", { name: "ログアウト", exact: true }).click();
  await menu.getByRole("button", { name: "ログアウトする" }).click();
  await expect(page.locator("body")).not.toContainText(childName, {
    timeout: 15000,
  });
  const me = await context.request.get(`${urls.portal}/api/me`);
  const current =
    me.status() === 200
      ? ((await me.json()) as { guardianId: string }).guardianId
      : null;
  expect(current).not.toBe(guardianId);
});

test("チームのマークとアカウントのメニューが全画面のヘッダーに出る(privacy と register には出ない)", async ({
  context,
  page,
}) => {
  // family-settings-entry/plan.md 設計判断6・7: 保護者がログインして見る全画面の
  // ヘッダーを「チームのマーク / 画面名 / アカウントの丸」で揃える。
  // 右上の丸はホームに戻ってから押す、を強いない。左上のマークは押すとホームへ戻る
  // (見出しの中の戻る矢印は「1つ前」で役割が違うので、別に残っている)。
  // 対象外は /privacy(未ログインでも開く)と /register(登録の途中)
  await loginAsNewGuardian(context);
  const childName = `粉浜 全画面${randomBytes(3).toString("hex")}`;
  const created = await context.request.post(`${urls.portal}/api/children`, {
    data: {
      children: [
        {
          ...childNameInput(childName),
          nicknameKana: "ぜんがめん",
          birthDate: birthDateForGrade(4),
          heightCm: heightForGrade(4),
          gender: "male",
        },
      ],
      relation: "father",
      availabilities: [{ weekday: 0, startTime: "09:00", endTime: "12:00" }],
    },
  });
  expect(created.status()).toBe(201);

  // 見出しに別のものが入っている画面(日程=表示切替・チーム=人数・月謝=年ナビ)も含める。
  // 丸は見出しの中ではなくヘッダー直下にあり、見出しとは場所を取り合わない
  const screens: { path: string; title: string }[] = [
    { path: "/schedule", title: "練習日程" },
    { path: "/attendance", title: "参加予定の提出" },
    { path: "/team", title: "チーム" },
    { path: "/fees", title: "月謝確認" },
    { path: "/announcements", title: "お知らせ" },
    { path: "/family", title: "家族の設定" },
  ];
  for (const { path, title } of screens) {
    await gotoReady(page, `${urls.portal}${path}`, "header .avatar");
    await expect(page.locator("h1.sc-title")).toContainText(title);
    const trigger = page
      .locator("header")
      .getByRole("button", { name: "メニュー", exact: true });
    await expect(trigger).toBeVisible();
    // 頭文字は先頭のお子さんの姓の1文字(どの画面でも同じ)
    await expect(trigger).toHaveText("粉");
    // 左上のチームのマーク。読み上げ用の名前が付いていて、ホームへのリンクになっている。
    // チーム名は添えない(モバイル幅で見出しと並べると窮屈になるため)
    const mark = page
      .locator("header")
      .getByRole("link", { name: "ホーム", exact: true });
    await expect(mark).toBeVisible();
    await expect(mark).toHaveText("SKC");
    // 見出しは1行に収まる(iPhone 15 = 393px。マークを足しても折り返さない)。
    // 折り返しても .sc-title は溢れないので幅では分からない。画面名そのものの
    // 描画矩形が2つ以上に割れていないかで見る
    const wraps = await page.locator("h1.sc-title").evaluate((el) => {
      for (const node of el.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        if (range.getClientRects().length > 1) return true;
      }
      return false;
    });
    expect(wraps, `${path} の見出しが折り返している`).toBe(false);
  }

  // マークを押すとホームへ戻る(どの画面からでも同じ)
  await gotoReady(page, `${urls.portal}/fees`, "header .avatar");
  await page
    .locator("header")
    .getByRole("link", { name: "ホーム", exact: true })
    .click();
  await expect(page.locator(".team-head .name")).toContainText("SKC粉浜", {
    timeout: 15000,
  });
  await expect(page.locator("main")).toContainText(childName);

  // 見出しの中の戻る矢印は残っている(マークと役割が違う。1つ前へ戻る)
  await gotoReady(page, `${urls.portal}/announcements`, "header .avatar");
  await expect(
    page.locator("h1.sc-title").getByRole("link", { name: "ホームへ戻る" }),
  ).toBeVisible();

  // ホーム以外(チーム)からでもメニューで家族の設定へ行ける
  await gotoReady(page, `${urls.portal}/team`, "header .avatar");
  await page
    .locator("header")
    .getByRole("button", { name: "メニュー", exact: true })
    .click();
  await page
    .locator(".acct-menu")
    .getByRole("link", { name: /家族の設定/ })
    .click();
  await expect(page.locator("h1")).toContainText("家族の設定", {
    timeout: 15000,
  });

  // 対象外の2画面には、マークもアカウントの丸も出ない
  await page.goto(`${urls.portal}/privacy`);
  await expect(page.locator("h1")).toContainText("プライバシーポリシー");
  await expect(page.locator("header .avatar")).toHaveCount(0);
  await expect(page.locator("header .logo")).toHaveCount(0);

  await gotoReady(page, `${urls.portal}/register`);
  await expect(page.locator("h1")).toContainText("お子さんの登録");
  await expect(page.locator("header .avatar")).toHaveCount(0);
  await expect(page.locator("header .logo")).toHaveCount(0);
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
  await pageB
    .locator("main")
    .getByRole("link", { name: /家族の設定/ })
    .click();
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
