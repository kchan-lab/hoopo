// LIFF が発行する ID トークンのサーバー検証(REQUIREMENTS.md §3)。
// LINE の verify API に委譲することで JWKS 取得・JWT ライブラリへの依存を持たない
// (.claude/plans/liff-login/plan.md 設計判断1)。
// 検証結果からは userId(sub)だけを使う — 表示名・画像は取得しても捨てる(絶対原則4)

export type VerifyIdTokenResult =
  | { ok: true; lineUserId: string }
  | { ok: false; reason: string };

export type IdTokenVerifier = (idToken: string) => Promise<VerifyIdTokenResult>;

const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const LINE_USER_ID_PATTERN = /^U[0-9a-f]{32}$/;

export function createLineIdTokenVerifier(
  channelId: string,
  fetchFn: typeof fetch = fetch,
): IdTokenVerifier {
  if (!channelId) {
    throw new Error("LINE_CHANNEL_ID が設定されていません");
  }
  return async (idToken) => {
    const res = await fetchFn(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    });
    if (!res.ok) {
      // 400 は無効・期限切れトークン。5xx も含めログイン失敗として扱い、詳細は返さない
      return {
        ok: false,
        reason: `LINE verify API が ${res.status} を返しました`,
      };
    }
    const payload = (await res.json()) as { sub?: string };
    if (!payload.sub || !LINE_USER_ID_PATTERN.test(payload.sub)) {
      return { ok: false, reason: "verify 応答に有効な sub がありません" };
    }
    return { ok: true, lineUserId: payload.sub };
  };
}

// ローカル/E2E 用フェイク(plan.md 設計判断6)。`fake:<LINE userId>` 形式のみ受理する。
// 実チャネル(#9)なしで導線を貫通させるための開発専用実装
export function createFakeIdTokenVerifier(): IdTokenVerifier {
  if (process.env.VERCEL_ENV === "production") {
    // 本番でフェイク認証が有効になる設定事故を起動時に止める
    throw new Error("フェイク認証(AUTH_FAKE)は本番では使用できません");
  }
  return async (idToken) => {
    const userId = idToken.startsWith("fake:") ? idToken.slice(5) : "";
    if (!LINE_USER_ID_PATTERN.test(userId)) {
      return { ok: false, reason: "フェイクトークンの形式が不正です" };
    }
    return { ok: true, lineUserId: userId };
  };
}
