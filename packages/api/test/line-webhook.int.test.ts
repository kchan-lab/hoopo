import { closeAppDb } from "@hoopo/db";
import { createFakeIdTokenVerifier } from "@hoopo/line";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/app";

// LINE Webhook(line-send/plan.md 6c-2)を RLS 配下で検証する。
// 署名検証・join/leave による teams.line_group_id の更新・他チームへの非干渉が対象

const SESSION_SECRET = "7".repeat(64);
const CHANNEL_SECRET = "test-channel-secret";
const GROUP_A = "Cgroup-a";
const GROUP_B = "Cgroup-b";

const owner = postgres(process.env.DATABASE_URL ?? "", {
  max: 1,
  prepare: false,
});
let teamId: string;
let otherTeamId: string;

const api = (team = teamId, channelSecret: string | null = CHANNEL_SECRET) =>
  createApi({
    verifyIdToken: createFakeIdTokenVerifier(),
    teamId: team,
    sessionSecret: SESSION_SECRET,
    encryptionKey: "1".repeat(64),
    hmacKey: "2".repeat(64),
    secureCookie: false,
    lineChannelSecret: channelSecret,
  });

// LINE と同じ手順(生ボディの HMAC-SHA256 → base64)で x-line-signature を作る
async function sign(rawBody: string, secret = CHANNEL_SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

function bodyOf(events: unknown[]): string {
  return JSON.stringify({ destination: "Ubot", events });
}

function groupEvent(type: string, groupId: string) {
  return { type, source: { type: "group", groupId } };
}

/**
 * Webhook を叩く。signature 省略で正しい署名を付ける。
 * 文字列を渡すと差し替え(不正署名)、null を渡すとヘッダ自体を付けない
 */
async function post(
  app: ReturnType<typeof api>,
  rawBody: string,
  signature?: string | null,
): Promise<Response> {
  const value = signature === undefined ? await sign(rawBody) : signature;
  return app.request("/line/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(value === null ? {} : { "x-line-signature": value }),
    },
    body: rawBody,
  });
}

async function groupIdOf(team: string): Promise<string | null> {
  const [row] = await owner<{ line_group_id: string | null }[]>`
    SELECT line_group_id FROM teams WHERE id = ${team}`;
  return row?.line_group_id ?? null;
}

beforeEach(async () => {
  await owner`
    TRUNCATE teams, coaches, guardians, guardian_children, children, child_availabilities,
      practices, practice_menus, attendances, fee_records, announcements, lineups
      RESTART IDENTITY CASCADE
  `;
  const [a] = await owner`INSERT INTO teams (name) VALUES ('SKC') RETURNING id`;
  const [b] =
    await owner`INSERT INTO teams (name) VALUES ('他チーム') RETURNING id`;
  if (!a || !b) throw new Error("チームの作成に失敗しました");
  teamId = a.id;
  otherTeamId = b.id;
});

afterAll(async () => {
  await owner.end();
  await closeAppDb();
});

describe("POST /line/webhook", () => {
  it("署名が正しい join でグループが連携される", async () => {
    const res = await post(api(), bodyOf([groupEvent("join", GROUP_A)]));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await groupIdOf(teamId)).toBe(GROUP_A);
  });

  it("別グループの join では上書きしない(最初のグループを守る)", async () => {
    await post(api(), bodyOf([groupEvent("join", GROUP_A)]));
    const res = await post(api(), bodyOf([groupEvent("join", GROUP_B)]));
    expect(res.status).toBe(200);
    expect(await groupIdOf(teamId)).toBe(GROUP_A);
  });

  it("leave は連携中のグループと一致するときだけ解除する", async () => {
    await post(api(), bodyOf([groupEvent("join", GROUP_A)]));
    // 別グループの leave では消えない
    await post(api(), bodyOf([groupEvent("leave", GROUP_B)]));
    expect(await groupIdOf(teamId)).toBe(GROUP_A);
    // 連携中のグループの leave で解除される
    const res = await post(api(), bodyOf([groupEvent("leave", GROUP_A)]));
    expect(res.status).toBe(200);
    expect(await groupIdOf(teamId)).toBeNull();
  });

  it("署名が不正なら 401 で何も変えない", async () => {
    const rawBody = bodyOf([groupEvent("join", GROUP_A)]);
    const res = await post(api(), rawBody, await sign(rawBody, "wrong-secret"));
    expect(res.status).toBe(401);
    expect(await groupIdOf(teamId)).toBeNull();
  });

  it("署名ヘッダが無ければ 401", async () => {
    const res = await post(api(), bodyOf([groupEvent("join", GROUP_A)]), null);
    expect(res.status).toBe(401);
    expect(await groupIdOf(teamId)).toBeNull();
  });

  it("ボディを改ざんした署名は 401(生ボディで検証している)", async () => {
    const signature = await sign(bodyOf([groupEvent("join", GROUP_A)]));
    const res = await post(
      api(),
      bodyOf([groupEvent("join", GROUP_B)]),
      signature,
    );
    expect(res.status).toBe(401);
    expect(await groupIdOf(teamId)).toBeNull();
  });

  it("チャネルシークレット未設定なら 503(検証を素通りさせない)", async () => {
    const rawBody = bodyOf([groupEvent("join", GROUP_A)]);
    const res = await api(teamId, null).request("/line/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-line-signature": await sign(rawBody),
      },
      body: rawBody,
    });
    expect(res.status).toBe(503);
    expect(await groupIdOf(teamId)).toBeNull();
  });

  it("メッセージイベントは 200 で無視する(本文・userId は扱わない)", async () => {
    const res = await post(
      api(),
      bodyOf([
        {
          type: "message",
          message: { type: "text", text: "今日の練習は何時ですか" },
          source: { type: "group", groupId: GROUP_A, userId: "Uuser1" },
        },
      ]),
    );
    expect(res.status).toBe(200);
    expect(await groupIdOf(teamId)).toBeNull();
  });

  it("ユーザー発の join(1:1 トーク)はグループを連携しない", async () => {
    const res = await post(
      api(),
      bodyOf([{ type: "join", source: { type: "user", userId: "Uuser1" } }]),
    );
    expect(res.status).toBe(200);
    expect(await groupIdOf(teamId)).toBeNull();
  });

  it("壊れた JSON でも 200(LINE の再送を招かない)", async () => {
    const res = await post(api(), "{");
    expect(res.status).toBe(200);
    expect(await groupIdOf(teamId)).toBeNull();
  });

  it("他チームの Webhook は自チームの連携に影響しない", async () => {
    await post(api(), bodyOf([groupEvent("join", GROUP_A)]));
    const res = await post(
      api(otherTeamId),
      bodyOf([groupEvent("join", GROUP_B)]),
    );
    expect(res.status).toBe(200);
    expect(await groupIdOf(teamId)).toBe(GROUP_A);
    expect(await groupIdOf(otherTeamId)).toBe(GROUP_B);
  });

  it("他チームが連携済みのグループを join しても 200 のまま(一意制約を握りつぶす)", async () => {
    await post(api(), bodyOf([groupEvent("join", GROUP_A)]));
    const res = await post(
      api(otherTeamId),
      bodyOf([groupEvent("join", GROUP_A)]),
    );
    expect(res.status).toBe(200);
    expect(await groupIdOf(teamId)).toBe(GROUP_A);
    expect(await groupIdOf(otherTeamId)).toBeNull();
  });
});
