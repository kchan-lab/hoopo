import { randomBytes, randomInt } from "node:crypto";
import { type BrowserContext, expect, test } from "@playwright/test";
import {
  birthDateForGrade,
  childNameInput,
  heightForGrade,
} from "./child-input";
import { urls } from "./urls";

// 保護者の参加予定の提出(Issue #76 受入条件)。
// 前提: AUTH_FAKE=1 + pnpm db:seed 済み。練習はコーチの API で作り、保護者は
// 毎回新しいフェイク ID トークン(fake:U<32hex>)でログインして未回答の状態から始める

async function createPracticeAsCoach(
  context: BrowserContext,
  heldOn: string,
  location: string,
) {
  const login = await context.request.post(`${urls.admin}/api/auth/login`, {
    data: { email: "coach@example.com", password: "hoopo-dev-login" },
  });
  expect(login.ok()).toBe(true);
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

async function registerChildAsNewGuardian(
  context: BrowserContext,
  name: string,
) {
  const login = await context.request.post(`${urls.portal}/api/auth/line`, {
    data: { idToken: `fake:U${randomBytes(16).toString("hex")}` },
  });
  expect(login.ok()).toBe(true);
  const res = await context.request.post(`${urls.portal}/api/children`, {
    data: {
      children: [
        {
          ...childNameInput(name),
          birthDate: birthDateForGrade(3),
          heightCm: heightForGrade(3),
          gender: "male",
        },
      ],
      relation: "father",
      weekdays: [0, 6],
      startTime: "09:00",
      endTime: "12:00",
    },
  });
  expect(res.status()).toBe(201);
}

/**
 * テストごとに別の月を使う(同じ DB で desktop / mobile が並行し、練習が月に蓄積すると
 * 行数や「回答 n / m 件」の分母がずれるため)。2031〜2090 年のランダムな月
 */
function uniqueMonth(): string {
  const y = 2031 + randomInt(60);
  const m = String(1 + randomInt(12)).padStart(2, "0");
  return `${y}-${m}`;
}

/** Asia/Tokyo の今日("YYYY-MM-DD")。テスト側でも日付は東京固定で決める */
function todayInTokyo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

test("リストで提出 → 再表示で保持され、カレンダーと同期する", async ({
  browser,
  page,
}) => {
  const tag = randomBytes(2).toString("hex");
  const month = uniqueMonth();
  const coach = await browser.newContext();
  await createPracticeAsCoach(coach, `${month}-08`, `体育館A ${tag}`);
  await createPracticeAsCoach(coach, `${month}-09`, `体育館B ${tag}`);
  await coach.close();

  await registerChildAsNewGuardian(page.context(), `提出 太郎 ${tag}`);
  await page.goto(`${urls.portal}/attendance?month=${month}`);
  await expect(page.locator("h1")).toContainText("参加予定の提出");
  await expect(page.locator(".month-nav")).toContainText(
    `${Number(month.slice(0, 4))}年${Number(month.slice(5))}月`,
  );

  const rows = page.locator(".sbr");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(`体育館A ${tag}`);
  await expect(page.locator(".cta")).toContainText("( 回答 0 / 2 件 )");

  // 1件目は参加、2件目は途中参加・早退(コメント欄は2件目にだけ出る)
  await rows.first().locator("select").selectOption({ label: "参加(全時間)" });
  await rows.nth(1).locator("select").selectOption({ label: "途中参加・早退" });
  await expect(page.locator(".sbr input")).toHaveCount(1);
  await expect(rows.first().locator("input")).toHaveCount(0);
  await rows.nth(1).locator("input").fill("11:00ごろ早退します");
  await expect(page.locator(".cta")).toContainText("( 回答 2 / 2 件 )");

  await page.getByRole("button", { name: "この内容で提出する" }).click();
  await expect(page.locator("main")).toContainText("提出しました");

  // 再表示しても選択とコメントが残る
  await page.reload();
  await expect(rows.first().locator("select")).toHaveValue("full");
  await expect(rows.nth(1).locator("select")).toHaveValue("partial");
  await expect(rows.nth(1).locator("input")).toHaveValue("11:00ごろ早退します");
  await expect(page.locator(".cta")).toContainText("( 回答 2 / 2 件 )");

  // カレンダーへ切り替えると同じ状態が4値の色分けで出る
  await page.getByRole("tab", { name: "カレンダー" }).click();
  await expect(page.locator(".cell.s-full")).toHaveCount(1);
  await expect(page.locator(".cell.s-part")).toHaveCount(1);

  // タップで 参加 → 途中参加・早退 に巡回する
  await page.locator(".cell.s-full button").click();
  await expect(page.locator(".cell.s-full")).toHaveCount(0);
  await expect(page.locator(".cell.s-part")).toHaveCount(2);

  // リストに戻り、一括チップで未回答に戻す(まだ保存はしない)
  await page.getByRole("tab", { name: "リスト" }).click();
  await page.getByRole("button", { name: "未回答に戻す" }).click();
  await expect(page.locator(".cta")).toContainText("( 回答 0 / 2 件 )");
  await expect(rows.first().locator("select")).toHaveValue("none");
});

test("提出の状態が画面上部に常時出て、変更・提出で切り替わる(Issue #145)", async ({
  browser,
  page,
}) => {
  const tag = randomBytes(2).toString("hex");
  const month = uniqueMonth();
  const monthNo = Number(month.slice(5));
  const coach = await browser.newContext();
  await createPracticeAsCoach(coach, `${month}-10`, `体育館C ${tag}`);
  await coach.close();

  await registerChildAsNewGuardian(page.context(), `状態 太郎 ${tag}`);
  await page.goto(`${urls.portal}/attendance?month=${month}`);

  // 未提出(記号つき。色だけに頼らない)
  const state = page.locator(".sub-state");
  await expect(state).toHaveClass(/unsubmitted/);
  await expect(state).toContainText(`${monthNo}月分 未提出`);

  // 回答を触っただけでは「未提出の変更があります」
  await page
    .locator(".sbr")
    .first()
    .locator("select")
    .selectOption({ label: "参加(全時間)" });
  await expect(state).toHaveClass(/changed/);
  await expect(state).toContainText(`${monthNo}月分 未提出の変更があります`);

  // 提出すると成功表示(role="status")が出て、上部は「提出済み(日時)」になる
  await page.getByRole("button", { name: "この内容で提出する" }).click();
  const flash = page.getByRole("status");
  await expect(flash).toContainText("提出しました");
  await expect(state).toHaveClass(/submitted/);
  await expect(state).toContainText(`${monthNo}月分 提出済み(`);
  // 成功表示は数秒で消え、以降は上部の常時表示が状態を伝える
  await expect(flash).toBeHidden({ timeout: 15000 });
  await expect(state).toContainText(`${monthNo}月分 提出済み(`);

  // 再訪しても「提出済み(日時)」が残る
  await page.reload();
  const reloaded = page.locator(".sub-state");
  await expect(reloaded).toHaveClass(/submitted/);
  await expect(reloaded).toContainText(`${monthNo}月分 提出済み(`);

  // 提出後に回答を変えると、また「未提出の変更があります」に戻る
  await page
    .locator(".sbr")
    .first()
    .locator("select")
    .selectOption({ label: "不参加" });
  await expect(reloaded).toHaveClass(/changed/);
  await expect(reloaded).toContainText(`${monthNo}月分 未提出の変更があります`);

  // 月を移ると、その月の状態を出す(練習が無い月は状態表示ごと出ない)
  await page.getByRole("link", { name: "前の月" }).click();
  await expect(page.locator("main")).toContainText(
    "の練習はまだ登録されていません",
  );
  await expect(page.locator(".sub-state")).toHaveCount(0);

  // 戻ると、提出済みのまま(未提出の変更は保存していないので残らない)
  await page.getByRole("link", { name: "次の月" }).click();
  await expect(page.locator(".sub-state")).toHaveClass(/submitted/);
  await expect(page.locator(".sbr").first().locator("select")).toHaveValue(
    "full",
  );
});

test("提出後にコーチが練習日を足すと、未回答があると分かる(Issue #154)", async ({
  browser,
  page,
}) => {
  const tag = randomBytes(2).toString("hex");
  const month = uniqueMonth();
  const monthNo = Number(month.slice(5));
  const coach = await browser.newContext();
  await createPracticeAsCoach(coach, `${month}-10`, `体育館D ${tag}`);

  await registerChildAsNewGuardian(page.context(), `追加 太郎 ${tag}`);
  await page.goto(`${urls.portal}/attendance?month=${month}`);
  await page
    .locator(".sbr")
    .first()
    .locator("select")
    .selectOption({ label: "参加(全時間)" });
  await page.getByRole("button", { name: "この内容で提出する" }).click();
  await expect(page.locator(".sub-state")).toHaveClass(/submitted/);

  // コーチが同じ月に練習日を足す(保護者はまだ答えていない)
  await createPracticeAsCoach(coach, `${month}-20`, `体育館E ${tag}`);
  await coach.close();

  // 開き直すと「提出済み」ではなく、未回答が残っていると分かる
  await page.reload();
  const state = page.locator(".sub-state");
  await expect(state).toHaveClass(/partial/);
  await expect(state).toContainText(`${monthNo}月分 未回答が1件あります`);
  await expect(state).toContainText("提出済み");

  // 追加分に答えて提出すると「提出済み(日時)」に戻る
  await page
    .locator(".sbr")
    .nth(1)
    .locator("select")
    .selectOption({ label: "不参加" });
  await expect(state).toHaveClass(/changed/);
  await page.getByRole("button", { name: "この内容で提出する" }).click();
  await expect(state).toHaveClass(/submitted/);
  await expect(state).toContainText(`${monthNo}月分 提出済み(`);
});

test("ホームに今月の未提出アラートが出て、提出画面へ移動できる", async ({
  browser,
  page,
}) => {
  const tag = randomBytes(2).toString("hex");
  const today = todayInTokyo();
  const coach = await browser.newContext();
  await createPracticeAsCoach(coach, today, `今月の練習 ${tag}`);
  await coach.close();

  await registerChildAsNewGuardian(page.context(), `未提出 花子 ${tag}`);
  await page.goto(urls.portal);
  const notice = page.locator("a.notice");
  await expect(notice).toContainText(
    `${Number(today.slice(5, 7))}月分の参加予定が未提出です`,
  );
  await notice.click();
  await expect(page.locator("h1")).toContainText("参加予定の提出");
  // タブバーの「提出」も有効になっている
  await page.goto(urls.portal);
  await page.getByRole("link", { name: "提出", exact: true }).click();
  await expect(page.locator("h1")).toContainText("参加予定の提出");
});
