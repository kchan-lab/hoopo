import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFakeIdTokenVerifier,
  createLineIdTokenVerifier,
} from "./id-token";

const USER_ID = `U${"0123456789abcdef".repeat(2)}`;

function fetchStub(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe("createLineIdTokenVerifier", () => {
  it("verify API の sub を lineUserId として返す", async () => {
    const verify = createLineIdTokenVerifier(
      "123",
      fetchStub(200, { sub: USER_ID }),
    );
    expect(await verify("token")).toEqual({ ok: true, lineUserId: USER_ID });
  });

  it("verify API へ id_token と client_id をフォームで送る", async () => {
    const fetchFn = fetchStub(200, { sub: USER_ID });
    await createLineIdTokenVerifier("123", fetchFn)("the-token");
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.line.me/oauth2/v2.1/verify");
    expect(String(init.body)).toBe("id_token=the-token&client_id=123");
  });

  it("400(無効トークン)は ok: false を返す", async () => {
    const verify = createLineIdTokenVerifier(
      "123",
      fetchStub(400, { error: "x" }),
    );
    expect((await verify("bad")).ok).toBe(false);
  });

  it("sub が LINE userId 形式でなければ拒否する", async () => {
    const verify = createLineIdTokenVerifier(
      "123",
      fetchStub(200, { sub: "not-a-user" }),
    );
    expect((await verify("token")).ok).toBe(false);
  });

  it("channelId 未設定は生成時に fail-fast する", () => {
    expect(() => createLineIdTokenVerifier("")).toThrow(/LINE_CHANNEL_ID/);
  });
});

describe("createFakeIdTokenVerifier", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fake:<userId> 形式のみ受理する", async () => {
    const verify = createFakeIdTokenVerifier();
    expect(await verify(`fake:${USER_ID}`)).toEqual({
      ok: true,
      lineUserId: USER_ID,
    });
    expect((await verify(USER_ID)).ok).toBe(false);
    expect((await verify("fake:invalid")).ok).toBe(false);
  });

  it("本番(VERCEL_ENV=production)では生成時に拒否する", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => createFakeIdTokenVerifier()).toThrow(/本番では使用できません/);
  });
});
