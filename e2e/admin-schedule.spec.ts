import { randomBytes, randomInt } from "node:crypto";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { gotoReady } from "./hydration";
import { urls } from "./urls";

// 日程管理の導線(Issue #71 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み(coach@example.com / hoopo-dev-login)。
// シードの練習(2026-09)と衝突しないよう、テストは 2027-01 の月で行う

async function loginAsCoach(page: Page) {
  await gotoReady(page, `${urls.admin}/login`);
  await page.getByLabel("メールアドレス").fill("coach@example.com");
  await page.getByLabel("パスワード").fill("hoopo-dev-login");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator("main")).toContainText("ダッシュボード");
}

test("練習を登録・編集・削除できる(メニュー付き)", async ({ page }) => {
  const place = `体育館 ${randomBytes(2).toString("hex")}`;
  await loginAsCoach(page);
  await page.goto(`${urls.admin}/schedule?month=2027-01`);
  await expect(page.locator(".ah b")).toContainText("日程管理");
  await expect(page.locator(".month-nav .pill")).toHaveText("2027年1月");

  // 追加
  await page.getByRole("button", { name: "行を追加" }).click();
  await page.getByLabel("日付").fill("2027-01-10");
  await page.getByLabel("開始").fill("09:00");
  await page.getByLabel("終了").fill("12:00");
  await page.getByLabel("場所").fill(place);
  await page.getByLabel("備考").fill("水筒持参");
  await page.getByRole("button", { name: "メニューを追加" }).click();
  await page.getByLabel("メニュー1の所要時間(分)").fill("15");
  await page.getByLabel("メニュー1の内容").fill("アップ");
  await page.getByRole("button", { name: "保存", exact: true }).click();

  const row = page.locator(".prow", { hasText: place });
  await expect(row).toContainText("1/10 (日) 09:00–12:00");
  await expect(row).toContainText("備考: 水筒持参");
  await expect(row).toContainText("メニュー 1件");

  // 編集(場所を変更、メニューを1件追加)
  await row.getByRole("button", { name: "編集" }).click();
  await page.getByLabel("場所").fill(`${place} 第2`);
  await page.getByRole("button", { name: "メニューを追加" }).click();
  await page.getByLabel("メニュー2の内容").fill("ゲーム形式");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const edited = page.locator(".prow", { hasText: `${place} 第2` });
  await expect(edited).toContainText("メニュー 2件");

  // 削除(二段階確認)
  await edited.getByRole("button", { name: "削除", exact: true }).click();
  await expect(edited).toContainText("この練習を削除しますか?");
  await edited.getByRole("button", { name: "削除する" }).click();
  await expect(page.locator(".prow", { hasText: place })).toHaveCount(0);
});

test("月の切替と入力エラー表示", async ({ page }) => {
  await loginAsCoach(page);
  await page.goto(`${urls.admin}/schedule?month=2027-01`);
  await page.getByRole("link", { name: "次の月" }).click();
  await expect(page.locator(".month-nav .pill")).toHaveText("2027年2月");

  await page.getByRole("button", { name: "行を追加" }).click();
  await page.getByLabel("開始").fill("13:00");
  await page.getByLabel("終了").fill("09:00");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".pform").getByRole("alert")).toContainText(
    "終了時刻は開始時刻より後",
  );
});

// ---- カレンダーからのまとめ登録(Issue #142 / schedule-bulk-entry/plan.md 設計判断1・4・6) ----
// 月に練習が溜まると件数の検証がずれるので、テストごとに別の月を使う
// (admin-schedule-publish と同じ流儀)

/** 2031〜2090 年のランダムな月 */
function uniqueMonth(): string {
  const y = 2031 + randomInt(60);
  const m = String(1 + randomInt(12)).padStart(2, "0");
  return `${y}-${m}`;
}

/** その月の土曜("YYYY-MM-DD")。UTC の Date で数えるので実行環境の TZ に左右されない */
function saturdaysOf(month: string): string[] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= days; d++) {
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 6) {
      out.push(`${month}-${String(d).padStart(2, "0")}`);
    }
  }
  return out;
}

/** 下ごしらえの練習はフォームではなく API で作る(ログイン済み context の Cookie を使う) */
async function createPractice(
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
      note: null,
      menus: [],
    },
  });
  expect(res.status()).toBe(201);
}

test("曜日見出しで土曜をまとめて選び、一括で登録できる", async ({ page }) => {
  const month = uniqueMonth();
  const saturdays = saturdaysOf(month);
  const place = `体育館 ${randomBytes(2).toString("hex")}`;
  await loginAsCoach(page);
  await page.goto(`${urls.admin}/schedule?month=${month}`);

  await page
    .getByRole("button", { name: "土曜をまとめて選ぶ", exact: true })
    .click();
  const bar = page.locator(".calbar");
  await expect(bar).toContainText(`${saturdays.length} 日を選択中`);

  // 選択バーの入力(行編集フォームにも同じラベルがあるのでバー内に絞る)
  await bar.getByLabel("開始", { exact: true }).fill("10:00");
  await bar.getByLabel("終了", { exact: true }).fill("11:30");
  await bar.getByLabel("場所", { exact: true }).fill(place);
  await bar.getByLabel("備考", { exact: true }).fill("まとめ登録");
  await page.getByRole("button", { name: "まとめて追加", exact: true }).click();

  await expect(page.locator(".calcard")).toContainText(
    `${saturdays.length} 件を追加しました`,
  );
  // 登録すると選択は解除される
  await expect(bar).toHaveCount(0);

  const rows = page.locator(".prow", { hasText: place });
  await expect(rows).toHaveCount(saturdays.length);
  await expect(rows.first()).toContainText("10:00–11:30");
  await expect(rows.first()).toContainText("備考: まとめ登録");

  // リロードしても残る(サーバーに保存されている)
  await page.reload();
  await expect(page.locator(".prow", { hasText: place })).toHaveCount(
    saturdays.length,
  );
  // 登録済みの日はカレンダーで ● が付く
  await expect(page.locator(".calday", { hasText: "●" })).toHaveCount(
    saturdays.length,
  );
});

test("すでに練習がある日を含めて選ぶと注意が出る", async ({ page }) => {
  const month = uniqueMonth();
  const firstSaturday = saturdaysOf(month)[0] as string;
  await loginAsCoach(page);
  await createPractice(
    page.context(),
    firstSaturday,
    `体育館 ${randomBytes(2).toString("hex")}`,
  );
  await page.goto(`${urls.admin}/schedule?month=${month}`);
  await expect(page.locator(".calday", { hasText: "●" })).toHaveCount(1);

  await page
    .getByRole("button", { name: "土曜をまとめて選ぶ", exact: true })
    .click();
  // 禁止はしない(午前・午後の2コマがあり得る。設計判断4)。注意だけ出す
  await expect(page.locator(".calbar")).toContainText(
    "うち 1 日はすでに練習があります",
  );
  await expect(
    page.getByRole("button", { name: "まとめて追加", exact: true }),
  ).toBeEnabled();

  // もう一度押すと選択が解除され、選択バーが消える
  await page
    .getByRole("button", { name: "土曜をまとめて選ぶ", exact: true })
    .click();
  await expect(page.locator(".calbar")).toHaveCount(0);
});
