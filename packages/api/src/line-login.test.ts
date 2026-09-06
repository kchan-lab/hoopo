import { describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  callbackUrlFromStart,
  createLineOAuthState,
  createLineOAuthToken,
  FAKE_COACH_LINE_USER_ID,
  fakeCallbackPath,
  LINE_OAUTH_TTL_SECONDS,
  parseFakeUser,
  redirectUriFromCallback,
  verifyLineOAuthToken,
} from "./line-login";

const SECRET = "7".repeat(64);
const NOW = new Date("2026-09-07T00:00:00Z");
const START_URL = "http://localhost:8001/api/auth/line/start?mode=link";

describe("buildAuthorizeUrl", () => {
  it("認可コードフローの必須項目を並べる(scope は openid のみ)", () => {
    const url = new URL(
      buildAuthorizeUrl({
        channelId: "2000000001",
        redirectUri: "http://localhost:8001/api/auth/line/callback",
        state: "st",
        nonce: "no",
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://access.line.me/oauth2/v2.1/authorize",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "2000000001",
      redirect_uri: "http://localhost:8001/api/auth/line/callback",
      state: "st",
      scope: "openid",
      nonce: "no",
    });
    // 表示名・画像は取らない(絶対原則4)。公式アカウント追加も促さない
    expect(url.searchParams.get("scope")).not.toContain("profile");
    expect(url.searchParams.has("bot_prompt")).toBe(false);
  });
});

describe("state Cookie(署名ペイロード)", () => {
  it("発行したトークンを検証するとペイロードが戻る", async () => {
    const payload = createLineOAuthState("link", "coach-1", NOW);
    const token = await createLineOAuthToken(payload, SECRET);
    expect(await verifyLineOAuthToken(token, SECRET, { now: NOW })).toEqual(
      payload,
    );
  });

  it("state と nonce は毎回異なるランダム値", () => {
    const a = createLineOAuthState("login", undefined, NOW);
    const b = createLineOAuthState("login", undefined, NOW);
    expect(a.state).not.toBe(b.state);
    expect(a.state).not.toBe(a.nonce);
    expect(a.coachId).toBeUndefined();
  });

  it("別の鍵で署名されたトークンは null", async () => {
    const token = await createLineOAuthToken(
      createLineOAuthState("login", undefined, NOW),
      "8".repeat(64),
    );
    expect(await verifyLineOAuthToken(token, SECRET, { now: NOW })).toBeNull();
  });

  it("改ざん・形式不正は null", async () => {
    const token = await createLineOAuthToken(
      createLineOAuthState("login", undefined, NOW),
      SECRET,
    );
    const [v, body, sig] = token.split(".") as [string, string, string];
    expect(
      await verifyLineOAuthToken(`${v}.${body}x.${sig}`, SECRET, { now: NOW }),
    ).toBeNull();
    expect(await verifyLineOAuthToken("not-a-token", SECRET)).toBeNull();
  });

  it("期限切れ(10分)は null", async () => {
    const token = await createLineOAuthToken(
      createLineOAuthState("login", undefined, NOW),
      SECRET,
    );
    const later = new Date(NOW.getTime() + (LINE_OAUTH_TTL_SECONDS + 1) * 1000);
    expect(
      await verifyLineOAuthToken(token, SECRET, { now: later }),
    ).toBeNull();
  });
});

describe("URL の導出", () => {
  it("start の URL から callback の絶対 URL を作る", () => {
    expect(callbackUrlFromStart(START_URL)).toBe(
      "http://localhost:8001/api/auth/line/callback",
    );
  });

  it("callback の URL からクエリを落として redirect_uri を作る", () => {
    expect(
      redirectUriFromCallback(
        "http://localhost:8001/api/auth/line/callback?code=x&state=y",
      ),
    ).toBe("http://localhost:8001/api/auth/line/callback");
  });

  it("フェイクの短絡先は同じ階層の callback への相対パス", () => {
    expect(fakeCallbackPath(START_URL, `U${"a".repeat(32)}`, "st")).toBe(
      `/api/auth/line/callback?code=fake%3AU${"a".repeat(32)}&state=st`,
    );
  });
});

describe("parseFakeUser", () => {
  it("LINE userId 形式ならそのまま、そうでなければ既定値", () => {
    const valid = `U${"b".repeat(32)}`;
    expect(parseFakeUser(valid)).toBe(valid);
    expect(parseFakeUser(undefined)).toBe(FAKE_COACH_LINE_USER_ID);
    expect(parseFakeUser("nope")).toBe(FAKE_COACH_LINE_USER_ID);
    expect(parseFakeUser(`U${"B".repeat(32)}`)).toBe(FAKE_COACH_LINE_USER_ID);
  });
});
