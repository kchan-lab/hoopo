import { describe, expect, it, vi } from "vitest";
import type { LineMessage } from "./messaging";
import { createLineMessagingClient } from "./messaging-http";

const TOKEN = "channel-access-token";
const GROUP_ID = "Cgroup1";
const MESSAGES: LineMessage[] = [
  { type: "text", text: "予定表を発行しました" },
];

function fetchStub(status: number, body: unknown = {}): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

function callOf(fetchFn: typeof fetch, index = 0) {
  return (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[index] as [
    string,
    RequestInit,
  ];
}

describe("pushToGroup", () => {
  it("グループ宛て push を Bearer 付きで送る", async () => {
    const fetchFn = fetchStub(200);
    const client = createLineMessagingClient({
      channelAccessToken: TOKEN,
      fetchFn,
    });
    expect(await client.pushToGroup(GROUP_ID, MESSAGES)).toEqual({ ok: true });
    const [url, init] = callOf(fetchFn);
    expect(url).toBe("https://api.line.me/v2/bot/message/push");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      to: GROUP_ID,
      messages: MESSAGES,
    });
  });

  it("6 通以上は API を叩かずに拒否する(1 push の上限)", async () => {
    const fetchFn = fetchStub(200);
    const client = createLineMessagingClient({
      channelAccessToken: TOKEN,
      fetchFn,
    });
    const many: LineMessage[] = Array.from({ length: 6 }, () => ({
      type: "text" as const,
      text: "x",
    }));
    expect(await client.pushToGroup(GROUP_ID, many)).toEqual({
      ok: false,
      reason: "メッセージ数が不正です",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("空のメッセージも API を叩かずに拒否する", async () => {
    const fetchFn = fetchStub(200);
    const client = createLineMessagingClient({
      channelAccessToken: TOKEN,
      fetchFn,
    });
    expect((await client.pushToGroup(GROUP_ID, [])).ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("非 2xx は status だけを理由にする(応答本文は含めない)", async () => {
    const client = createLineMessagingClient({
      channelAccessToken: TOKEN,
      fetchFn: fetchStub(429, {
        message: "You have reached your monthly limit",
      }),
    });
    expect(await client.pushToGroup(GROUP_ID, MESSAGES)).toEqual({
      ok: false,
      reason: "LINE API が 429 を返しました",
    });
  });
});

describe("getGroupMemberCount", () => {
  it("参加人数を返す", async () => {
    const fetchFn = fetchStub(200, { count: 12 });
    const client = createLineMessagingClient({
      channelAccessToken: TOKEN,
      fetchFn,
    });
    expect(await client.getGroupMemberCount(GROUP_ID)).toEqual({
      ok: true,
      count: 12,
    });
    const [url, init] = callOf(fetchFn);
    expect(url).toBe(
      `https://api.line.me/v2/bot/group/${GROUP_ID}/members/count`,
    );
    expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });

  it("404(Bot が居ないグループ)は ok: false", async () => {
    const client = createLineMessagingClient({
      channelAccessToken: TOKEN,
      fetchFn: fetchStub(404, { message: "not found" }),
    });
    expect(await client.getGroupMemberCount(GROUP_ID)).toEqual({
      ok: false,
      reason: "LINE API が 404 を返しました",
    });
  });

  it("count を含まない応答は ok: false", async () => {
    const client = createLineMessagingClient({
      channelAccessToken: TOKEN,
      fetchFn: fetchStub(200, { members: 3 }),
    });
    expect((await client.getGroupMemberCount(GROUP_ID)).ok).toBe(false);
  });
});
