// LINE ログイン(Web)の認可コード交換(admin-line-login/plan.md 設計判断1・4)。
// 管理画面は PC ブラウザ利用が主で LIFF の前提が成り立たないため、認可コードフローを使う。
// 受け取るのは id_token だけ(access_token は要求もしないが返ってきても捨てる。絶対原則4)。
// fetch を注入できるようにして、実チャネルなしでもユニットテストできるようにする

export interface ExchangeCodeParams {
  /** callback に付いてくる認可コード */
  code: string;
  /** authorize 時に送ったものと完全一致する必要がある */
  redirectUri: string;
  channelId: string;
  channelSecret: string;
}

export type ExchangeCodeResult =
  | { ok: true; idToken: string }
  | { ok: false; reason: string };

/** deps 注入用(packages/api の AdminApiDeps.lineLogin.exchangeCode) */
export type AuthorizationCodeExchanger = (
  params: ExchangeCodeParams,
) => Promise<ExchangeCodeResult>;

const LINE_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";

export async function exchangeAuthorizationCode(
  { code, redirectUri, channelId, channelSecret }: ExchangeCodeParams,
  fetchFn: typeof fetch = fetch,
): Promise<ExchangeCodeResult> {
  const res = await fetchFn(LINE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: channelId,
      client_secret: channelSecret,
    }),
  });
  if (!res.ok) {
    // 400(コードの使い回し・期限切れ)も 5xx もログイン失敗として同じ扱いにし、詳細は外へ出さない
    return {
      ok: false,
      reason: `LINE token API が ${res.status} を返しました`,
    };
  }
  const payload = (await res.json().catch(() => null)) as {
    id_token?: unknown;
  } | null;
  if (typeof payload?.id_token !== "string" || !payload.id_token) {
    return { ok: false, reason: "token 応答に id_token がありません" };
  }
  // access_token / refresh_token は受け取っても保持しない(絶対原則4)
  return { ok: true, idToken: payload.id_token };
}
