import { closeAppDb } from "@hoopo/db";
import {
  createFakeLineMessagingClient,
  FAKE_GROUP_MEMBER_COUNT,
  type FakeLineMessagingClient,
} from "@hoopo/line";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminApi } from "../src/admin-app";
import type { LineMessageLogEntry } from "../src/line-shared";
import { hashPassword } from "../src/password";
import { ADMIN_SESSION_COOKIE_NAME } from "../src/session";
import { adminDeps } from "./admin-deps";

// LINE グループ送信 API(line-send/plan.md 6c-1)を RLS 配下で検証する。
// 送信そのものはフェイククライアント(参加人数 12 固定)で、
// 「宛先はチームのグループ 1 件だけ」「1 送信 = ログ 1 行」「枠超過は送らない」を確かめる

const SESSION_SECRET = "8".repeat(64);
const GROUP_ID = `C${"1".repeat(32)}`;
const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});
let teamId: string;
let otherTeamId: string;
let coachHash: string;

const MONTH = "2026-09";

interface Usage {
  month: string;
  used: number;
  quota: number;
  remaining: number;
  groupLinked: boolean;
  memberCount: number | null;
}

const adminApi = (client: FakeLineMessagingClient, team = teamId) =>
  createAdminApi(adminDeps(team, SESSION_SECRET, { line: { client } }));

async function coachClient(
  app: ReturnType<typeof adminApi>,
  email = "coach@example.com",
) {
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "coach-pass-1" }),
  });
  const value = (res.headers.get("set-cookie") ?? "").match(
    new RegExp(`${ADMIN_SESSION_COOKIE_NAME}=([^;]+)`),
  )?.[1];
  if (!value) throw new Error("管理者セッション Cookie が発行されていません");
  const cookie = `${ADMIN_SESSION_COOKIE_NAME}=${value}`;
  return (path: string, method: "GET" | "POST", body?: unknown) =>
    app.request(path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}

type CoachClient = Awaited<ReturnType<typeof coachClient>>;

/** 発行済みの練習を1件用意する(送信の前提) */
async function publishedPractice(c: CoachClient, month = MONTH) {
  const created = await c("/practices", "POST", {
    heldOn: `${month}-10`,
    startTime: "09:00",
    endTime: "12:00",
    location: "粉浜小学校 体育館",
    note: null,
    menus: [],
  });
  expect(created.status).toBe(201);
  expect((await c("/schedule/publish", "POST", { month })).status).toBe(200);
}

async function createAnnouncement(
  c: CoachClient,
  input: { publish: boolean; notifyLine: boolean },
) {
  const res = await c("/announcements", "POST", {
    title: "体育館の変更について",
    body: "9月の練習は粉浜小学校の体育館で行います。",
    ...input,
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { announcement: { id: string } }).announcement
    .id;
}

const logRows = (team: string) =>
  owner`SELECT kind, ref, recipient_count, status, error FROM line_messages
        WHERE team_id = ${team} ORDER BY sent_at`;

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
  const [b] = await owner`
    INSERT INTO teams (name, line_group_id) VALUES ('他チーム', ${`C${"2".repeat(32)}`})
    RETURNING id`;
  if (!a || !b) throw new Error("チームの作成に失敗しました");
  teamId = a.id;
  otherTeamId = b.id;
  await owner`INSERT INTO coaches (team_id, email, auth_type, password_hash)
    VALUES (${teamId}, 'coach@example.com', 'email', ${coachHash}),
           (${otherTeamId}, 'other@example.com', 'email', ${coachHash})`;
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

describe("LINE 送信 API", () => {
  it("未ログインは 401", async () => {
    const app = adminApi(createFakeLineMessagingClient());
    expect((await app.request("/line/usage")).status).toBe(401);
    expect(
      (
        await app.request("/line/send/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month: MONTH }),
        })
      ).status,
    ).toBe(401);
  });

  it("送信前の通数は 0/200 で、参加人数と連携状態を返す", async () => {
    const c = await coachClient(adminApi(createFakeLineMessagingClient()));
    const usage = (await (await c("/line/usage", "GET")).json()) as Usage;
    expect(usage).toMatchObject({
      used: 0,
      quota: 200,
      remaining: 200,
      groupLinked: true,
      memberCount: FAKE_GROUP_MEMBER_COUNT,
    });
    const { messages } = (await (await c("/line/messages", "GET")).json()) as {
      messages: LineMessageLogEntry[];
    };
    expect(messages).toEqual([]);
  });

  it("発行済みの月を送信するとグループへ 1 push し、sent のログと通数が残る", async () => {
    const client = createFakeLineMessagingClient();
    const c = await coachClient(adminApi(client));
    await publishedPractice(c);

    const res = await c("/line/send/schedule", "POST", { month: MONTH });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      message: LineMessageLogEntry;
      usage: Usage;
    };
    expect(body.message).toMatchObject({
      kind: "schedule",
      ref: MONTH,
      recipientCount: FAKE_GROUP_MEMBER_COUNT,
      status: "sent",
      error: null,
    });
    expect(body.usage).toMatchObject({ used: 12, remaining: 188 });

    // 宛先は自チームのグループだけ。本文は画像+短文の 1 push(§6)
    expect(client.pushes).toHaveLength(1);
    const push = client.pushes[0];
    expect(push?.groupId).toBe(GROUP_ID);
    expect(push?.messages.map((m) => m.type)).toEqual(["image", "text"]);
    const image = push?.messages[0];
    expect(image?.type === "image" && image.originalContentUrl).toContain(
      `/api/schedule/${MONTH}.png`,
    );
    const text = push?.messages[1];
    expect(text?.type === "text" && text.text).toContain("2026年9月");

    const rows = await logRows(teamId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "schedule",
      ref: MONTH,
      recipient_count: FAKE_GROUP_MEMBER_COUNT,
      status: "sent",
    });
    const usage = (await (await c("/line/usage", "GET")).json()) as Usage;
    expect(usage.used).toBe(FAKE_GROUP_MEMBER_COUNT);
  });

  it("未発行の月は 400 で、push もログも起きない", async () => {
    const client = createFakeLineMessagingClient();
    const c = await coachClient(adminApi(client));
    const res = await c("/line/send/schedule", "POST", { month: MONTH });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("発行");
    expect(client.pushes).toHaveLength(0);
    expect(await logRows(teamId)).toHaveLength(0);
    // month の形式不正も 400
    expect(
      (await c("/line/send/schedule", "POST", { month: "2026" })).status,
    ).toBe(400);
  });

  it("グループ未連携は 409 で送信しない", async () => {
    const client = createFakeLineMessagingClient();
    const c = await coachClient(adminApi(client));
    await publishedPractice(c);
    await owner`UPDATE teams SET line_group_id = NULL WHERE id = ${teamId}`;

    const res = await c("/line/send/schedule", "POST", { month: MONTH });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("未連携");
    expect(client.pushes).toHaveLength(0);
    expect(await logRows(teamId)).toHaveLength(0);
    const usage = (await (await c("/line/usage", "GET")).json()) as Usage;
    expect(usage).toMatchObject({ groupLinked: false, memberCount: null });
  });

  it("今月の残り通数が足りなければ 409 で送信しない(plan.md 設計判断3)", async () => {
    const client = createFakeLineMessagingClient();
    const c = await coachClient(adminApi(client));
    await publishedPractice(c);
    // 190 通消費済み = 残り 10 通 < 12 人
    await owner`INSERT INTO line_messages (team_id, kind, ref, recipient_count, status)
      VALUES (${teamId}, 'schedule', '2026-08', 95, 'sent'),
             (${teamId}, 'announcement', 'x', 95, 'sent')`;

    const res = await c("/line/send/schedule", "POST", { month: MONTH });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain(
      "通数が足りません",
    );
    expect(client.pushes).toHaveLength(0);
    expect(await logRows(teamId)).toHaveLength(2);
  });

  it("push が失敗すると failed のログを残して 502", async () => {
    const client = createFakeLineMessagingClient({ failNext: true });
    const c = await coachClient(adminApi(client));
    await publishedPractice(c);

    const res = await c("/line/send/schedule", "POST", { month: MONTH });
    expect(res.status).toBe(502);
    expect(client.pushes).toHaveLength(0);
    const rows = await logRows(teamId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "failed" });
    expect(rows[0]?.error).toBeTruthy();
    // failed は通数に数えない(§7: sent の合計が使用済み)
    const usage = (await (await c("/line/usage", "GET")).json()) as Usage;
    expect(usage.used).toBe(0);
  });

  it("公開済み かつ 通知ありのお知らせだけ送信できる", async () => {
    const client = createFakeLineMessagingClient();
    const c = await coachClient(adminApi(client));

    const draft = await createAnnouncement(c, {
      publish: false,
      notifyLine: true,
    });
    expect(
      (await c("/line/send/announcement", "POST", { id: draft })).status,
    ).toBe(400);

    const silent = await createAnnouncement(c, {
      publish: true,
      notifyLine: false,
    });
    expect(
      (await c("/line/send/announcement", "POST", { id: silent })).status,
    ).toBe(400);

    // 存在しない id は 404(他チームのお知らせも同じ扱い)
    expect(
      (
        await c("/line/send/announcement", "POST", {
          id: "00000000-0000-4000-8000-00000000dead",
        })
      ).status,
    ).toBe(404);
    expect(client.pushes).toHaveLength(0);

    const ok = await createAnnouncement(c, { publish: true, notifyLine: true });
    const res = await c("/line/send/announcement", "POST", { id: ok });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { message: LineMessageLogEntry };
    expect(body.message).toMatchObject({
      kind: "announcement",
      ref: ok,
      recipientCount: FAKE_GROUP_MEMBER_COUNT,
      status: "sent",
    });
    // 本文は送らずタイトル+リンクだけ(§6)
    expect(client.pushes).toHaveLength(1);
    const text = client.pushes[0]?.messages[0];
    expect(text?.type === "text" && text.text).toContain(
      "体育館の変更について",
    );
    expect(text?.type === "text" && text.text).not.toContain("粉浜小学校");
  });

  it("他チームの送信ログ・通数は見えない(RLS)", async () => {
    const client = createFakeLineMessagingClient();
    const mine = await coachClient(adminApi(client));
    await publishedPractice(mine);
    expect(
      (await mine("/line/send/schedule", "POST", { month: MONTH })).status,
    ).toBe(201);

    const other = await coachClient(
      adminApi(createFakeLineMessagingClient(), otherTeamId),
      "other@example.com",
    );
    const { messages } = (await (
      await other("/line/messages", "GET")
    ).json()) as { messages: LineMessageLogEntry[] };
    expect(messages).toEqual([]);
    const usage = (await (await other("/line/usage", "GET")).json()) as Usage;
    expect(usage.used).toBe(0);
    // 自チームぶんは残っている
    expect(await logRows(teamId)).toHaveLength(1);
  });
});
