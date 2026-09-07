import { closeAppDb } from "@hoopo/db";
import {
  createFakeLineMessagingClient,
  FAKE_GROUP_MEMBER_COUNT,
  type FakeLineMessagingClient,
} from "@hoopo/line";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminApi } from "../src/admin-app";
import { createJobsApi } from "../src/jobs-app";
import type { LineSendDeps } from "../src/line-send";
import type { LineMessageLogEntry } from "../src/line-shared";
import { hashPassword } from "../src/password";
import { ADMIN_SESSION_COOKIE_NAME } from "../src/session";
import { addDays, formatDateLabel, todayInTokyo } from "../src/tokyo-date";
import { adminDeps } from "./admin-deps";

// 出欠リマインド(#20。attendance-reminder/plan.md)を RLS 配下で検証する。
// - 手動送信 POST /line/send/reminder: 未来 かつ 未回答 1 人以上のときだけ 201
// - 定期ジョブ POST /jobs/attendance-reminder: Bearer 認証・2 日後・1 日 1 通
// 送信はフェイククライアント(参加人数 12 固定)。ジョブの「今日」は固定時刻で決める

const SESSION_SECRET = "9".repeat(64);
const CRON_SECRET = "cron-secret-abcdefghijklmnop";
const GROUP_ID = `C${"3".repeat(32)}`;
const PORTAL_URL = "http://portal.test";
const LIFF_URL = "https://liff.line.me/1234567890-abcdefgh";

/** 2026-09-15 12:00 JST。ジョブの対象日は今日+2 = 2026-09-17 */
const NOW = new Date("2026-09-15T03:00:00Z");
const JOB_TARGET = "2026-09-17";

// 手動送信は admin API(固定時刻を注入しない)なので、実行日を基準に前後の日付を作る
const TODAY = todayInTokyo();
const FUTURE = addDays(TODAY, 3);
const PAST = addDays(TODAY, -3);

const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});
let teamId: string;
let coachHash: string;

const adminApi = (client: FakeLineMessagingClient) =>
  createAdminApi(adminDeps(teamId, SESSION_SECRET, { line: { client } }));

const jobsApi = (
  client: FakeLineMessagingClient,
  cronSecret: string | null = CRON_SECRET,
) => {
  const line: LineSendDeps = {
    client,
    portalUrl: PORTAL_URL,
    liffUrl: LIFF_URL,
    now: NOW,
  };
  return createJobsApi({ teamId, cronSecret, line });
};

const runJob = (
  app: ReturnType<typeof jobsApi>,
  token: string | null = CRON_SECRET,
) =>
  app.request("/attendance-reminder", {
    method: "POST",
    headers: token === null ? {} : { Authorization: `Bearer ${token}` },
  });

interface JobResult {
  sent: boolean;
  dates: string[];
  unanswered: number;
  skipped?: string;
}

async function coachClient(app: ReturnType<typeof adminApi>) {
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "coach@example.com",
      password: "coach-pass-1",
    }),
  });
  const value = (res.headers.get("set-cookie") ?? "").match(
    new RegExp(`${ADMIN_SESSION_COOKIE_NAME}=([^;]+)`),
  )?.[1];
  if (!value) throw new Error("管理者セッション Cookie が発行されていません");
  const cookie = `${ADMIN_SESSION_COOKIE_NAME}=${value}`;
  return (path: string, body?: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}

async function insertChild(name: string, code: string): Promise<string> {
  const [row] = await owner`
    INSERT INTO children (team_id, name, nickname_kana, grade, gender, invite_code)
    VALUES (${teamId}, ${name}, 'たろう', 5, 'male', ${code})
    RETURNING id`;
  if (!row) throw new Error(`部員の作成に失敗しました: ${name}`);
  return row.id as string;
}

async function insertPractice(heldOn: string): Promise<string> {
  const [row] = await owner`
    INSERT INTO practices (team_id, held_on, start_time, end_time, location)
    VALUES (${teamId}, ${heldOn}, '09:00', '12:00', '粉浜小学校 体育館')
    RETURNING id`;
  if (!row) throw new Error(`練習の作成に失敗しました: ${heldOn}`);
  return row.id as string;
}

async function answerAll(practiceId: string) {
  await owner`
    INSERT INTO attendances (team_id, child_id, practice_id, status)
    SELECT ${teamId}, id, ${practiceId}, 'full' FROM children WHERE team_id = ${teamId}`;
}

const logRows = () =>
  owner`SELECT kind, ref, recipient_count, status FROM line_messages
        WHERE team_id = ${teamId} ORDER BY sent_at`;

beforeAll(async () => {
  coachHash = await hashPassword("coach-pass-1");
});

beforeEach(async () => {
  await owner`
    TRUNCATE teams, coaches, guardians, guardian_children, children, child_availabilities,
      practices, practice_menus, attendances, fee_records, announcements, lineups,
      line_messages
      RESTART IDENTITY CASCADE
  `;
  const [a] = await owner`
    INSERT INTO teams (name, line_group_id) VALUES ('SKC', ${GROUP_ID}) RETURNING id`;
  if (!a) throw new Error("チームの作成に失敗しました");
  teamId = a.id;
  await owner`INSERT INTO coaches (team_id, email, auth_type, password_hash)
    VALUES (${teamId}, 'coach@example.com', 'email', ${coachHash})`;
  await insertChild("粉浜 太郎", "RRRRR0001");
  await insertChild("粉浜 二郎", "RRRRR0002");
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

describe("出欠リマインドの手動送信", () => {
  it("未回答がいる未来の練習は 201 で、本文に日付と未提出人数が入る", async () => {
    const client = createFakeLineMessagingClient();
    const c = await coachClient(adminApi(client));
    const practiceId = await insertPractice(FUTURE);

    const res = await c("/line/send/reminder", { practiceId });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { message: LineMessageLogEntry };
    // ref は held_on(ジョブとの重複判定にも使う)
    expect(body.message).toMatchObject({
      kind: "reminder",
      ref: FUTURE,
      recipientCount: FAKE_GROUP_MEMBER_COUNT,
      status: "sent",
    });

    // グループ宛て 1 push・テキスト 1 通だけ(絶対原則3)。個人名は載せない(絶対原則4)
    expect(client.pushes).toHaveLength(1);
    expect(client.pushes[0]?.groupId).toBe(GROUP_ID);
    const text = client.pushes[0]?.messages[0];
    expect(client.pushes[0]?.messages).toHaveLength(1);
    expect(text?.type === "text" && text.text).toContain(
      formatDateLabel(FUTURE),
    );
    expect(text?.type === "text" && text.text).toContain("未提出 2 人");
    expect(text?.type === "text" && text.text).toContain(
      `${LIFF_URL}/attendance`,
    );
    expect(text?.type === "text" && text.text).not.toContain("粉浜 太郎");

    const rows = await logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "reminder", ref: FUTURE });
  });

  it("終了した練習は 400 で送らない", async () => {
    const client = createFakeLineMessagingClient();
    const c = await coachClient(adminApi(client));
    const practiceId = await insertPractice(PAST);

    const res = await c("/line/send/reminder", { practiceId });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("終了");
    expect(client.pushes).toHaveLength(0);
    expect(await logRows()).toHaveLength(0);
  });

  it("未回答が 0 人なら 400 で送らない(通数の無駄打ちをしない。設計判断3)", async () => {
    const client = createFakeLineMessagingClient();
    const c = await coachClient(adminApi(client));
    const practiceId = await insertPractice(FUTURE);
    await answerAll(practiceId);

    const res = await c("/line/send/reminder", { practiceId });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain(
      "未回答の部員はいません",
    );
    expect(client.pushes).toHaveLength(0);
    expect(await logRows()).toHaveLength(0);
  });

  it("存在しない練習・非 UUID は 404", async () => {
    const client = createFakeLineMessagingClient();
    const c = await coachClient(adminApi(client));
    expect((await c("/line/send/reminder", { practiceId: "x" })).status).toBe(
      404,
    );
    expect(
      (
        await c("/line/send/reminder", {
          practiceId: "00000000-0000-4000-8000-00000000dead",
        })
      ).status,
    ).toBe(404);
    expect(client.pushes).toHaveLength(0);
  });
});

describe("出欠リマインドの定期ジョブ", () => {
  it("秘密が違う・付いていなければ 401", async () => {
    const client = createFakeLineMessagingClient();
    const app = jobsApi(client);
    await insertPractice(JOB_TARGET);

    expect((await runJob(app, "wrong-secret")).status).toBe(401);
    expect((await runJob(app, null)).status).toBe(401);
    // Bearer 以外のスキームも通さない
    expect(
      (
        await app.request("/attendance-reminder", {
          method: "POST",
          headers: { Authorization: CRON_SECRET },
        })
      ).status,
    ).toBe(401);
    expect(client.pushes).toHaveLength(0);
  });

  it("CRON_SECRET 未設定なら 503(ジョブは無効)", async () => {
    const client = createFakeLineMessagingClient();
    const res = await runJob(jobsApi(client, null));
    expect(res.status).toBe(503);
    expect(client.pushes).toHaveLength(0);
  });

  it("2 日後に未回答のある練習があれば 1 通だけ送る(ref = 開催日)", async () => {
    const client = createFakeLineMessagingClient();
    const app = jobsApi(client);
    // 同じ日に 2 コマあってもまとめて 1 通(設計判断1)。1 日ずれた練習は対象外
    await insertPractice(JOB_TARGET);
    await insertPractice(JOB_TARGET);
    await insertPractice(addDays(JOB_TARGET, 1));

    const res = await runJob(app);
    expect(res.status).toBe(200);
    expect((await res.json()) as JobResult).toEqual({
      sent: true,
      dates: [JOB_TARGET],
      unanswered: 2,
    });

    expect(client.pushes).toHaveLength(1);
    const text = client.pushes[0]?.messages[0];
    expect(text?.type === "text" && text.text).toContain(
      formatDateLabel(JOB_TARGET),
    );
    const rows = await logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "reminder",
      ref: JOB_TARGET,
      recipient_count: FAKE_GROUP_MEMBER_COUNT,
      status: "sent",
    });
  });

  it("同じ日に 2 回実行しても 2 通目は送らない(1 日 1 通。設計判断1)", async () => {
    const client = createFakeLineMessagingClient();
    const app = jobsApi(client);
    await insertPractice(JOB_TARGET);

    expect((await runJob(app)).status).toBe(200);
    const second = (await (await runJob(app)).json()) as JobResult;
    expect(second).toEqual({
      sent: false,
      dates: [JOB_TARGET],
      unanswered: 2,
      skipped: "already_sent",
    });
    expect(client.pushes).toHaveLength(1);
    expect(await logRows()).toHaveLength(1);
  });

  it("2 日後に練習が無い・全員回答済みなら送らない", async () => {
    const client = createFakeLineMessagingClient();
    const app = jobsApi(client);

    expect((await (await runJob(app)).json()) as JobResult).toEqual({
      sent: false,
      dates: [],
      unanswered: 0,
      skipped: "no_target",
    });

    const practiceId = await insertPractice(JOB_TARGET);
    await answerAll(practiceId);
    expect((await (await runJob(app)).json()) as JobResult).toMatchObject({
      sent: false,
      skipped: "no_target",
    });
    expect(client.pushes).toHaveLength(0);
    expect(await logRows()).toHaveLength(0);
  });

  it("今月の残り通数が足りなければ送らず、ログも残さない(絶対原則3)", async () => {
    const client = createFakeLineMessagingClient();
    const app = jobsApi(client);
    await insertPractice(JOB_TARGET);
    // 2026-09 に 190 通消費済み = 残り 10 通 < 12 人
    await owner`INSERT INTO line_messages (team_id, kind, ref, recipient_count, status, sent_at)
      VALUES (${teamId}, 'schedule', '2026-09', 190, 'sent', '2026-09-02T00:00:00+09:00')`;

    expect((await (await runJob(app)).json()) as JobResult).toEqual({
      sent: false,
      dates: [JOB_TARGET],
      unanswered: 2,
      skipped: "quota",
    });
    expect(client.pushes).toHaveLength(0);
    // 事前の 1 行だけ(リマインドのログは増えない)
    expect(await logRows()).toHaveLength(1);
  });
});
