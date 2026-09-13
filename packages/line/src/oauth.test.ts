import { describe, expect, it, vi } from "vitest";
import { exchangeAuthorizationCode } from "./oauth";

const PARAMS = {
  code: "the-code",
  redirectUri: "http://localhost:8001/api/auth/line/callback",
  channelId: "2000000001",
  channelSecret: "channel-secret",
};

function fetchStub(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe("exchangeAuthorizationCode", () => {
  it("token API の id_token を返す", async () => {
    const result = await exchangeAuthorizationCode(
      PARAMS,
      fetchStub(200, { access_token: "at", id_token: "the-id-token" }),
    );
    expect(result).toEqual({ ok: true, idToken: "the-id-token" });
  });

  it("token API へ認可コードフローの必須項目をフォームで送る", async () => {
    const fetchFn = fetchStub(200, { id_token: "t" });
    await exchangeAuthorizationCode(PARAMS, fetchFn);
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.line.me/oauth2/v2.1/token");
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      redirect_uri: "http://localhost:8001/api/auth/line/callback",
      client_id: "2000000001",
      client_secret: "channel-secret",
    });
  });

  it("400(コードの期限切れ・使い回し)は ok: false", async () => {
    const result = await exchangeAuthorizationCode(
      PARAMS,
      fetchStub(400, { error: "invalid_grant" }),
    );
    expect(result.ok).toBe(false);
  });

  it("id_token を含まない応答は ok: false", async () => {
    const result = await exchangeAuthorizationCode(
      PARAMS,
      fetchStub(200, { access_token: "at" }),
    );
    expect(result.ok).toBe(false);
  });
});
