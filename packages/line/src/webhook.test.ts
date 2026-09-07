import { describe, expect, it } from "vitest";
import { parseWebhookEvents, verifyLineSignature } from "./webhook";

const SECRET = "channel-secret";

// LINE 側と同じ手順(生ボディの HMAC-SHA256 → base64)で署名を作る
async function sign(rawBody: string, secret = SECRET): Promise<string> {
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

const JOIN_BODY = JSON.stringify({
  destination: "Uabc",
  events: [{ type: "join", source: { type: "group", groupId: "Cgroup1" } }],
});

describe("verifyLineSignature", () => {
  it("正しい署名は true", async () => {
    expect(
      await verifyLineSignature(JOIN_BODY, await sign(JOIN_BODY), SECRET),
    ).toBe(true);
  });

  it("別のシークレットで作った署名は false", async () => {
    expect(
      await verifyLineSignature(
        JOIN_BODY,
        await sign(JOIN_BODY, "another-secret"),
        SECRET,
      ),
    ).toBe(false);
  });

  it("ボディが 1 文字でも違えば false(改ざん検知)", async () => {
    const signature = await sign(JOIN_BODY);
    expect(await verifyLineSignature(`${JOIN_BODY} `, signature, SECRET)).toBe(
      false,
    );
  });

  it("署名ヘッダが無い(null / 空)は false", async () => {
    expect(await verifyLineSignature(JOIN_BODY, null, SECRET)).toBe(false);
    expect(await verifyLineSignature(JOIN_BODY, undefined, SECRET)).toBe(false);
    expect(await verifyLineSignature(JOIN_BODY, "", SECRET)).toBe(false);
  });

  it("base64 として壊れた署名でも例外にせず false", async () => {
    expect(await verifyLineSignature(JOIN_BODY, "not base64!!", SECRET)).toBe(
      false,
    );
  });

  it("長さの違う署名(切り詰め)は false", async () => {
    const signature = await sign(JOIN_BODY);
    expect(
      await verifyLineSignature(JOIN_BODY, signature.slice(0, 20), SECRET),
    ).toBe(false);
  });

  it("チャネルシークレットが空なら常に false", async () => {
    expect(
      await verifyLineSignature(JOIN_BODY, await sign(JOIN_BODY), ""),
    ).toBe(false);
  });
});

describe("parseWebhookEvents", () => {
  it("グループの join / leave は groupId 付きで返る", () => {
    const body = JSON.stringify({
      events: [
        { type: "join", source: { type: "group", groupId: "Cgroup1" } },
        { type: "leave", source: { type: "group", groupId: "Cgroup1" } },
      ],
    });
    expect(parseWebhookEvents(body)).toEqual([
      { type: "join", groupId: "Cgroup1" },
      { type: "leave", groupId: "Cgroup1" },
    ]);
  });

  it("メッセージイベントは other 扱いで、本文・userId は取り出さない", () => {
    const body = JSON.stringify({
      events: [
        {
          type: "message",
          message: { type: "text", text: "今日の練習は何時ですか" },
          source: { type: "group", groupId: "Cgroup1", userId: "Uuser1" },
        },
      ],
    });
    const events = parseWebhookEvents(body);
    expect(events).toEqual([{ type: "other", groupId: "Cgroup1" }]);
    expect(JSON.stringify(events)).not.toContain("Uuser1");
    expect(JSON.stringify(events)).not.toContain("練習");
  });

  it("user / room 発のイベントは groupId を持たない", () => {
    const body = JSON.stringify({
      events: [
        { type: "join", source: { type: "user", userId: "Uuser1" } },
        { type: "leave", source: { type: "room", roomId: "Rroom1" } },
      ],
    });
    expect(parseWebhookEvents(body)).toEqual([
      { type: "join" },
      { type: "leave" },
    ]);
  });

  it("壊れた JSON・events が無い/配列でないボディは空配列", () => {
    expect(parseWebhookEvents("{")).toEqual([]);
    expect(parseWebhookEvents("null")).toEqual([]);
    expect(parseWebhookEvents(JSON.stringify({}))).toEqual([]);
    expect(parseWebhookEvents(JSON.stringify({ events: "join" }))).toEqual([]);
  });

  it("疎通確認(events が空配列)も空配列", () => {
    expect(parseWebhookEvents(JSON.stringify({ events: [] }))).toEqual([]);
  });
});
