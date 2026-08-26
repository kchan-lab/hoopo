import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  type SessionPayload,
  verifySessionToken,
} from "./session";

const SECRET = "a".repeat(64);
const NOW = new Date("2026-08-27T00:00:00Z");

function payload(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    sub: "11111111-1111-4111-8111-111111111111",
    role: "guardian",
    teamId: "22222222-2222-4222-8222-222222222222",
    exp: Math.floor(NOW.getTime() / 1000) + 3600,
    ...overrides,
  };
}

describe("createSessionToken / verifySessionToken", () => {
  it("発行したトークンを検証するとペイロードが取り出せる", async () => {
    const token = await createSessionToken(payload(), SECRET);
    expect(await verifySessionToken(token, SECRET, { now: NOW })).toEqual(
      payload(),
    );
  });

  it("期限切れは null を返す", async () => {
    const token = await createSessionToken(
      payload({ exp: Math.floor(NOW.getTime() / 1000) - 1 }),
      SECRET,
    );
    expect(await verifySessionToken(token, SECRET, { now: NOW })).toBeNull();
  });

  it("別の鍵で署名されたトークンは null を返す", async () => {
    const token = await createSessionToken(payload(), "b".repeat(64));
    expect(await verifySessionToken(token, SECRET, { now: NOW })).toBeNull();
  });

  it("expectedRole と異なる role のトークンは null を返す(保護者⇔管理者の分離)", async () => {
    const guardianToken = await createSessionToken(payload(), SECRET);
    const coachToken = await createSessionToken(
      payload({ role: "coach" }),
      SECRET,
    );
    expect(
      await verifySessionToken(guardianToken, SECRET, {
        expectedRole: "coach",
        now: NOW,
      }),
    ).toBeNull();
    expect(
      await verifySessionToken(coachToken, SECRET, {
        expectedRole: "guardian",
        now: NOW,
      }),
    ).toBeNull();
    expect(
      await verifySessionToken(coachToken, SECRET, {
        expectedRole: "coach",
        now: NOW,
      }),
    ).toEqual(payload({ role: "coach" }));
  });

  it("未知の role は expectedRole なしでも null を返す", async () => {
    const token = await createSessionToken(
      payload({ role: "admin" as SessionPayload["role"] }),
      SECRET,
    );
    expect(await verifySessionToken(token, SECRET, { now: NOW })).toBeNull();
  });

  it("ペイロード改ざんは null を返す", async () => {
    const token = await createSessionToken(payload(), SECRET);
    const [v, body, sig] = token.split(".") as [string, string, string];
    const forged = btoa(
      JSON.stringify(payload({ sub: "33333333-3333-4333-8333-333333333333" })),
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    expect(
      await verifySessionToken(`${v}.${forged}.${sig}`, SECRET, { now: NOW }),
    ).toBeNull();
    expect(
      await verifySessionToken(`${v}.${body}.`, SECRET, { now: NOW }),
    ).toBeNull();
  });

  it("形式不正・空文字は null を返す(例外にしない)", async () => {
    expect(await verifySessionToken("", SECRET, { now: NOW })).toBeNull();
    expect(await verifySessionToken("v2.a.b", SECRET, { now: NOW })).toBeNull();
    expect(
      await verifySessionToken("v1.!!!.###", SECRET, { now: NOW }),
    ).toBeNull();
  });

  it("鍵が 64 桁 hex でなければ発行時に拒否する", async () => {
    await expect(createSessionToken(payload(), "short")).rejects.toThrow(
      /64 桁の hex/,
    );
  });
});
