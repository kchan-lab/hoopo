// LIFF が発行する ID トークンのサーバー検証(REQUIREMENTS.md §3)。
// LINE の verify API に委譲することで JWKS 取得・JWT ライブラリへの依存を持たない
// (.claude/plans/liff-login/plan.md 設計判断1)。
// 検証結果からは userId(sub)だけを使う — 表示名・画像は取得しても捨てる(絶対原則4)

export type VerifyIdTokenResult =
  | { ok: true; lineUserId: string }
  | { ok: false; reason: string };

export interface VerifyIdTokenOptions {
  /** LINE ログイン(Web)の認可リクエストで送った nonce。verify API 側で突き合わせてもらう
   *  (admin-line-login/plan.md 設計判断4。LIFF 経由の検証では使わないので省略可) */
  nonce?: string;
}

export type IdTokenVerifier = (
  idToken: string,
  options?: VerifyIdTokenOptions,
) => Promise<VerifyIdTokenResult>;

const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const LINE_USER_ID_PATTERN = /^U[0-9a-f]{32}$/;

export function createLineIdTokenVerifier(
  channelId: string,
  fetchFn: typeof fetch = fetch,
): IdTokenVerifier {
  if (!channelId) {
    throw new Error("LINE_CHANNEL_ID が設定されていません");
  }
  return async (idToken, options) => {
    const form = new URLSearchParams({
      id_token: idToken,
      client_id: channelId,
    });
    // nonce 照合は verify API に委譲する(自前で JWT を開かない方針を維持)
    if (options?.nonce) form.set("nonce", options.nonce);
    const res = await fetchFn(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
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
  if (process.env.VERCEL_ENV) {
    // Vercel 上(production / preview / development のいずれも)でフェイク認証が
    // 有効になる設定事故を起動時に止める。preview も公開 URL のため素通りさせない
    throw new Error("フェイク認証(AUTH_FAKE)は Vercel 環境では使用できません");
  }
  // nonce は本物の verify API に委ねる検証なのでフェイクでは無視する
  return async (idToken) => {
    const userId = idToken.startsWith("fake:") ? idToken.slice(5) : "";
    if (!LINE_USER_ID_PATTERN.test(userId)) {
      return { ok: false, reason: "フェイクトークンの形式が不正です" };
    }
    return { ok: true, lineUserId: userId };
  };
}
