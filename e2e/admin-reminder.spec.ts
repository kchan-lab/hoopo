import { randomBytes, randomInt } from "node:crypto";
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { urls } from "./urls";

// 出欠リマインドの手動送信(Issue #20 受入条件。attendance-reminder/plan.md)。
// 前提: AUTH_FAKE=1 + LINE_FAKE=1 + pnpm db:seed 済み
// (フェイクのグループ参加人数は 12 固定。シードの SKC には line_group_id が入っている)。
// 未回答の部員を作るため、保護者を1人作って子どもだけ登録し、出欠は提出しない。
// 同じ DB を desktop / mobile が共有するので、テストごとにランダムな未来の月を使う

/** フェイククライアントが返すグループ参加人数(packages/line の FAKE_GROUP_MEMBER_COUNT) */
const MEMBER_COUNT = 12;

/** 2031〜2090 年のランダムな月(admin-line-send と同じ流儀) */
function uniqueMonth(): string {
  const y = 2031 + randomInt(60);
  const m = String(1 + randomInt(12)).padStart(2, "0");
  return `${y}-${m}`;
}

async function loginAsCoach(page: Page) {
  await page.goto(`${urls.admin}/login`);
  await page.getByLabel("メールアドレス").fill("coach@example.com");
  await page.getByLabel("パスワード").fill("hoopo-dev-login");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page.locator("main")).toContainText("ダッシュボード", {
    timeout: 15000,
  });
}

/** コーチとしてログイン済みの API コンテキスト(セットアップ用) */
async function coachRequest(page: Page): Promise<APIRequestContext> {
  const ctx = await page.context().browser()?.newContext();
  if (!ctx) throw new Error("browser context を作成できません");
  const login = await ctx.request.post(`${urls.admin}/api/auth/login`, {
    data: { email: "coach@example.com", password: "hoopo-dev-login" },
  });
  expect(login.ok()).toBe(true);
  return ctx.request;
}

async function createPractice(
  api: APIRequestContext,
  heldOn: string,
): Promise<string> {
  const res = await api.post(`${urls.admin}/api/practices`, {
    data: {
      heldOn,
      startTime: "09:00",
      endTime: "12:00",
      location: `体育館 ${randomBytes(2).toString("hex")}`,
      note: null,
      menus: [],
    },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { practice: { id: string } };
  return body.practice.id;
}

/** 未回答の部員を1人作る(登録だけして出欠は提出しない) */
async function registerChild(page: Page, name: string) {
  const ctx = await page.context().browser()?.newContext();
  if (!ctx) throw new Error("browser context を作成できません");
  const userId = `U${randomBytes(16).toString("hex")}`;
  const login = await ctx.request.post(`${urls.portal}/api/auth/line`, {
    data: { idToken: `fake:${userId}` },
  });
  expect(login.ok()).toBe(true);
  const created = await ctx.request.post(`${urls.portal}/api/children`, {
    data: {
      children: [{ name, nicknameKana: "てすと", grade: 4, gender: "male" }],
      relation: "father",
      weekdays: [6],
      startTime: "09:00",
      endTime: "12:00",
      coachNote: null,
    },
  });
  expect(created.status()).toBe(201);
  await ctx.close();
}

test("未回答のある練習から出欠リマインドをグループへ送ると送信ログに残る", async ({
  page,
}) => {
  const tag = randomBytes(2).toString("hex");
  const month = uniqueMonth();
  const heldOn = `${month}-12`;
  const api = await coachRequest(page);
  const practiceId = await createPractice(api, heldOn);
  await registerChild(page, `E2E リマインド ${tag}`);

  await loginAsCoach(page);
  await page.goto(
    `${urls.admin}/absentees?month=${month}&practiceId=${practiceId}`,
  );
  const card = page.locator(".acard", { hasText: "未回答 —" });
  await expect(card).toContainText(`E2E リマインド ${tag}`);

  // 二段階確認: 消費通数と残りを見せてから送る(CLAUDE.md 絶対原則3)
  await card.getByRole("button", { name: "リマインドを送る" }).click();
  await expect(card).toContainText(`グループ ${MEMBER_COUNT} 人に送信します`);
  await card.getByRole("button", { name: "送信する" }).click();

  await expect(card).toContainText("送信しました");
  // 送信ログに reminder(「出欠リマインド」)が載る
  await expect(
    page.locator(".acard", { hasText: "今月のLINE通数" }),
  ).toContainText("出欠リマインド");

  // API 側にも reminder のログが残っている(ref = held_on)
  const res = await api.get(`${urls.admin}/api/line/messages?limit=50`);
  expect(res.ok()).toBe(true);
  const { messages } = (await res.json()) as {
    messages: { kind: string; ref: string; status: string }[];
  };
  expect(
    messages.some(
      (m) => m.kind === "reminder" && m.ref === heldOn && m.status === "sent",
    ),
  ).toBe(true);
});

test("終了した練習にはリマインドを送れない", async ({ page }) => {
  // 過去の月(2001〜2020年)。他テストの未来の月とは衝突しない
  const month = `${2001 + randomInt(20)}-${String(1 + randomInt(12)).padStart(2, "0")}`;
  const api = await coachRequest(page);
  const practiceId = await createPractice(api, `${month}-20`);

  await loginAsCoach(page);
  await page.goto(
    `${urls.admin}/absentees?month=${month}&practiceId=${practiceId}`,
  );
  const card = page.locator(".acard", { hasText: "未回答 —" });
  const button = card.getByRole("button", { name: "リマインドを送る" });
  // 終了した練習は押せない。理由は title に出す(通数の無駄打ちをしない。設計判断3)
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute("title", "終了した練習には送れません");
});
