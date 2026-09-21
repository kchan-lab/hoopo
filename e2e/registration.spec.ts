import { randomBytes } from "node:crypto";
import { type BrowserContext, expect, test } from "@playwright/test";
import {
  birthDateForGrade,
  childNameInput,
  heightForGrade,
} from "./child-input";
import { expectNoAutoZoom } from "./form-font-size";
import { gotoReady } from "./hydration";
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
  await gotoReady(page, urls.portal);
  await expect(page.locator("h1")).toContainText("はじめての方");

  await page.getByRole("link", { name: /お子さんを新しく登録する/ }).click();
  await expect(page.locator("h1")).toContainText("お子さんの登録");

  // フォーム部品はどれも 16px 以上で描かれる(iOS の自動ズーム対策。Issue #205)
  await expectNoAutoZoom(page);
  // ①子ども情報(兄弟を追加)。学年は選ばず、生年月日から決まる
  // 姓・名とそれぞれのよみは別の欄(child-name-split/plan.md 設計判断6)。
  // 「姓」は「姓のよみ」にも部分一致するので exact で絞る
  await page.getByLabel("姓", { exact: true }).fill("粉浜");
  await page.getByLabel("姓のよみ").fill("こはま");
  await page.getByLabel("名", { exact: true }).fill("太郎");
  await page.getByLabel("名のよみ").fill("たろう");
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
  await second.getByLabel("姓", { exact: true }).fill("粉浜");
  await second.getByLabel("姓のよみ").fill("こはま");
  await second.getByLabel("名", { exact: true }).fill("花子");
  await second.getByLabel("名のよみ").fill("はなこ");
  await second.getByLabel("生年月日").fill(birthDateForGrade(2));
  await second
    .getByRole("spinbutton", { name: "身長", exact: true })
    .fill(String(heightForGrade(2)));
  await expect(second).toContainText("小学2年生");
  await second.getByRole("button", { name: "女子" }).click();
  await page.getByRole("button", { name: "次へ" }).click();

  // ②参加情報(全員に同一適用)
  await expect(page.locator("h1")).toContainText("参加について");
  // 曜日を選ぶ前から時間の欄が出ていて、既定は 09:00〜12:00。曜日が0件のあいだは
  // 「すべての曜日に同じ時間を使う」を出さない
  // (Issue #179 / availability-common-time/plan.md 設計判断1・2)
  const sameTimeBox = page.getByRole("checkbox", {
    name: "すべての曜日に同じ時間を使う",
  });
  await expect(page.getByLabel("開始時刻", { exact: true })).toHaveValue(
    "09:00",
  );
  await expect(page.getByLabel("終了時刻", { exact: true })).toHaveValue(
    "12:00",
  );
  await expect(sameTimeBox).toHaveCount(0);
  await page.getByRole("button", { name: "日", exact: true }).click();
  // 曜日が1つのときは「同じ」と言わない(sameTimeNote)
  await expect(page.locator("form")).toContainText("日 にこの時間を使います");
  await page.getByRole("button", { name: "土", exact: true }).click();
  await expect(sameTimeBox).toBeChecked();
  await expect(page.locator("form")).toContainText(
    "日・土 に同じ時間を使います",
  );
  // チェックが入っているあいだは曜日ごとの行を出さない(設計判断3)
  await expect(page.getByLabel("日曜日の開始時刻")).toHaveCount(0);
  // 外すと曜日ごとの行が出て、各行は直前の共通の時間から始まる(設計判断5)。土だけ午後にする
  await sameTimeBox.uncheck();
  await expect(page.getByLabel("日曜日の開始時刻")).toHaveValue("09:00");
  await expect(page.getByLabel("土曜日の終了時刻")).toHaveValue("12:00");
  await page.getByLabel("土曜日の開始時刻").fill("13:00");
  await page.getByLabel("土曜日の終了時刻").fill("15:00");
  await expect(page.getByLabel("日曜日の開始時刻")).toHaveValue("09:00");
  // 入れ直すと、曜日ごとで直した時間のうち先頭の曜日のものが共通の時間に残る
  // (何も言わずに既定値へ戻さない。#180 のレビュー指摘)
  await page.getByLabel("日曜日の開始時刻").fill("10:30");
  await sameTimeBox.check();
  await expect(page.getByLabel("開始時刻", { exact: true })).toHaveValue(
    "10:30",
  );
  await sameTimeBox.uncheck();
  await expect(page.getByLabel("土曜日の開始時刻")).toHaveValue("10:30");
  // 土をもう一度午後に戻して、以降の確認画面の期待値にそろえる
  await page.getByLabel("日曜日の開始時刻").fill("09:00");
  await page.getByLabel("日曜日の終了時刻").fill("12:00");
  await page.getByLabel("土曜日の開始時刻").fill("13:00");
  await page.getByLabel("土曜日の終了時刻").fill("15:00");
  await page.getByRole("button", { name: "父", exact: true }).click();
  await page
    .getByLabel("コーチへの伝達事項(任意)")
    .fill("送迎は祖父母が行います");
  await page.getByRole("button", { name: "確認へ進む" }).click();

  // ③入力内容の確認(registration-confirm/plan.md)。①②で入れた値がそのまま出る
  await expect(page.locator("h1")).toContainText("入力内容の確認");
  const firstConfirm = page.locator("section.child-block").first();
  await expect(firstConfirm).toContainText("粉浜 太郎");
  await expect(firstConfirm).toContainText("こはま たろう");
  await expect(firstConfirm).toContainText(birthDateForGrade(4));
  await expect(firstConfirm).toContainText("小学4年生");
  await expect(firstConfirm).toContainText(`${heightForGrade(4)} cm`);
  await expect(firstConfirm).toContainText("男子");
  const secondConfirm = page.locator("section.child-block").nth(1);
  await expect(secondConfirm).toContainText("粉浜 花子");
  await expect(secondConfirm).toContainText("小学2年生");
  await expect(secondConfirm).toContainText("女子");
  // 呼び名を入れていない2人目は「未入力」と分かる
  await expect(secondConfirm).toContainText("未入力");
  const confirmForm = page.locator("form");
  await expect(confirmForm).toContainText("日 09:00 〜 12:00");
  await expect(confirmForm).toContainText("土 13:00 〜 15:00");
  await expect(confirmForm).toContainText("送迎は祖父母が行います");
  await page.getByRole("button", { name: "この内容で登録する" }).click();

  // 自動認定で即時ホームへ
  await expect(page.locator("main")).toContainText("粉浜 太郎", {
    timeout: 15000,
  });
  await expect(page.locator("main")).toContainText("粉浜 花子");
  await expect(page.locator("main")).toContainText("4年");

  // 家族の設定に招待コード(5-5 区切り)と、生年月日から決まった学年・身長が出る
  await page
    .locator("main")
    .getByRole("link", { name: /家族の設定/ })
    .click();
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

test("確認画面から修正して戻ると、直した内容で登録される", async ({
  context,
  page,
}) => {
  // ③で気づいた間違いを①②に戻って直せること。戻っても入力は消えない
  // (registration-confirm/plan.md 設計判断2・3)
  await loginAsNewGuardian(context);
  await gotoReady(page, `${urls.portal}/register`);

  // ①わざと違う名前で入力する
  await page.getByLabel("姓", { exact: true }).fill("粉浜");
  await page.getByLabel("姓のよみ").fill("こはま");
  await page.getByLabel("名", { exact: true }).fill("次郎");
  await page.getByLabel("名のよみ").fill("じろう");
  await page.getByLabel("生年月日").fill(birthDateForGrade(5));
  await page
    .getByRole("spinbutton", { name: "身長", exact: true })
    .fill(String(heightForGrade(5)));
  // 入力がちゃんと React 側に入ったことを、生年月日から出る学年で確かめてから進む
  await expect(page.locator("fieldset.child-block").first()).toContainText(
    "小学5年生",
  );
  await page.getByRole("button", { name: "男子" }).click();
  await page.getByRole("button", { name: "次へ" }).click();

  // ②(伝達事項は入れずに進む)。画面が切り替わる前に曜日を押すと取りこぼすので、
  // ②の見出しが出るのを待ってから操作する
  await expect(page.locator("h1")).toContainText("参加について");
  await page.getByRole("button", { name: "土", exact: true }).click();
  await page.getByRole("button", { name: "母", exact: true }).click();
  await page.getByRole("button", { name: "確認へ進む" }).click();
  await expect(page.locator("h1")).toContainText("入力内容の確認");
  await expect(page.locator("form")).toContainText("粉浜 次郎");
  // 呼び名・伝達事項は任意。空欄は「未入力」と分かる
  await expect(page.locator("form")).toContainText("未入力");

  // ③ → ①(お子さんの欄の「①を修正」)。入力は残っていて、名前だけ直す
  await page.getByRole("button", { name: "①を修正" }).click();
  await expect(page.locator("h1")).toContainText("お子さんの登録");
  await expect(page.getByLabel("姓", { exact: true })).toHaveValue("粉浜");
  await expect(page.getByLabel("生年月日")).toHaveValue(birthDateForGrade(5));
  await page.getByLabel("名", { exact: true }).fill("太郎");
  await page.getByLabel("名のよみ").fill("たろう");
  await page.getByRole("button", { name: "次へ" }).click();

  // ②の選択も残っている
  await expect(page.locator("h1")).toContainText("参加について");
  await expect(
    page.getByRole("button", { name: "土", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "母", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "確認へ進む" }).click();

  // ③ → ②(「修正する」)。伝達事項を足してから戻る
  await page.getByRole("button", { name: "修正する" }).click();
  await expect(page.locator("h1")).toContainText("参加について");
  await page
    .getByLabel("コーチへの伝達事項(任意)")
    .fill("送迎は祖母が行います");
  await page.getByRole("button", { name: "確認へ進む" }).click();

  const confirm = page.locator("form");
  await expect(confirm).toContainText("粉浜 太郎");
  await expect(confirm).toContainText("こはま たろう");
  await expect(confirm).toContainText("小学5年生");
  await expect(confirm).toContainText("送迎は祖母が行います");
  await page.getByRole("button", { name: "この内容で登録する" }).click();

  // 直した名前で登録されている
  await expect(page.locator("main")).toContainText("粉浜 太郎", {
    timeout: 15000,
  });
});

test("中学1年生の生年月日で登録でき、学年が中学1年生になる(#187)", async ({
  context,
  page,
}) => {
  // このチームには例外として中学1年生が在籍している(REQUIREMENTS §3。学年 7)。
  // 生年月日を入れた時点で弾かれず、確認画面・ホームまで「中学1年生」で通ることを見る
  await loginAsNewGuardian(context);
  await gotoReady(page, `${urls.portal}/register`);
  // 同じ DB で繰り返し実行するので、名前は毎回変える
  const givenName = `一年${randomBytes(2).toString("hex")}`;
  const name = `中学 ${givenName}`;
  await page.getByLabel("姓", { exact: true }).fill("中学");
  await page.getByLabel("姓のよみ").fill("ちゅうがく");
  await page.getByLabel("名", { exact: true }).fill(givenName);
  await page.getByLabel("名のよみ").fill("いちねん");
  await page.getByLabel("生年月日").fill(birthDateForGrade(7));
  await page
    .getByRole("spinbutton", { name: "身長", exact: true })
    .fill(String(heightForGrade(7)));
  // 入力したその場で「中学1年生」が出る(gradeLabel)
  await expect(page.locator("fieldset.child-block").first()).toContainText(
    "中学1年生",
  );
  await page.getByRole("button", { name: "男子" }).click();
  await page.getByRole("button", { name: "次へ" }).click();

  // ②参加情報は最小限だけ入れて進む
  await expect(page.locator("h1")).toContainText("参加について");
  await page.getByRole("button", { name: "土", exact: true }).click();
  await page.getByRole("button", { name: "父", exact: true }).click();
  await page.getByRole("button", { name: "確認へ進む" }).click();

  // ③確認画面でも「中学1年生」
  await expect(page.locator("h1")).toContainText("入力内容の確認");
  await expect(page.locator("section.child-block").first()).toContainText(
    "中学1年生",
  );
  await page.getByRole("button", { name: "この内容で登録する" }).click();

  // ホームの学年ピルは短い形(中1)
  await expect(page.locator("main")).toContainText(name, { timeout: 15000 });
  await expect(page.locator("main")).toContainText("中1");

  // 家族の設定では「中学1年生」
  await page
    .locator("main")
    .getByRole("link", { name: /家族の設定/ })
    .click();
  await expect(page.locator("h1")).toContainText("家族の設定");
  await expect(page.locator("section.child-block").first()).toContainText(
    "中学1年生",
  );
});

test("受け付ける学年にならない生年月日では次へ進めない", async ({
  context,
  page,
}) => {
  // 学年が 1〜7 に入らない生年月日は登録できない(REQUIREMENTS §3)。
  // クライアントの検証はサーバー(parseBirthDate)と同じ純関数なので文言もそろう
  await loginAsNewGuardian(context);
  await gotoReady(page, `${urls.portal}/register`);
  await page.getByLabel("姓", { exact: true }).fill("粉浜");
  await page.getByLabel("姓のよみ").fill("こはま");
  await page.getByLabel("名", { exact: true }).fill("未就学");
  await page.getByLabel("名のよみ").fill("みしゅうがく");
  // 小学1年生より1学年下 = まだ入学していない
  await page.getByLabel("生年月日").fill(birthDateForGrade(0));
  await page
    .getByRole("spinbutton", { name: "身長", exact: true })
    .fill(String(heightForGrade(1)));
  await expect(page.locator("fieldset.child-block").first()).toContainText(
    "生年月日は小学1年生〜中学1年生の範囲で入力してください",
  );
  await page.getByRole("button", { name: "男子" }).click();
  await page.getByRole("button", { name: "次へ" }).click();

  // ①に留まり、エラーが出る
  // Next.js のルートアナウンサー(空の role="alert")と衝突するので form に絞る
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "1人目の生年月日は小学1年生〜中学1年生の範囲で入力してください",
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
          ...childNameInput("北粉浜 次郎", "きたこはま じろう"),
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
  const { children } = (await created.json()) as {
    children: { inviteCode: string }[];
  };
  const code = children[0]?.inviteCode ?? "";
  await contextA.close();

  // 保護者B: 分岐画面でコードを入力(小文字・ハイフン混じりでも通る)
  const contextB = await browser.newContext();
  await loginAsNewGuardian(contextB);
  const page = await contextB.newPage();
  await gotoReady(page, urls.portal);
  await expect(page.locator("h1")).toContainText("はじめての方");
  // フォーム部品はどれも 16px 以上で描かれる(iOS の自動ズーム対策。Issue #205)
  await expectNoAutoZoom(page);
  await page
    .getByLabel("招待コード")
    .fill(`${code.slice(0, 5).toLowerCase()}-${code.slice(5)}`);
  await page.getByRole("button", { name: "父", exact: true }).click();
  await page.getByRole("button", { name: "コードで連携する" }).click();

  await expect(page.locator("main")).toContainText("北粉浜 次郎", {
    timeout: 15000,
  });
  await page
    .locator("main")
    .getByRole("link", { name: /家族の設定/ })
    .click();
  await expect(page.locator("main")).toContainText("あなた(父)");
  await expect(page.locator("main")).toContainText("母");
  await expect(page.locator("main")).toContainText("連携済み");
  await contextB.close();
});
