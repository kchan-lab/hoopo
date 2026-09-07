# Plan: 管理者の LINE ログイン(#61)

Issue: [#61](https://github.com/kchan-lab/hoopo/issues/61)
設計の正: docs/REQUIREMENTS.md §3(管理者の認証)・§7(coaches)/ CLAUDE.md 絶対原則4・6 / admin-login/plan.md 設計判断1・10 / liff-login/plan.md 設計判断5・6・8

## 目的

縦切り1b でスコープ外にした管理者の LINE ログインを実装し、ログイン画面の「LINEでログイン」(準備中)を有効化する。
メール+パスワードでログイン済みのコーチが「LINE を連携」→ 以降は LINE だけで管理画面に入れる(主経路は LINE、メールは予備)。

## 方針

```
[admin browser]                                  [apps/admin]                                 [LINE]
/login「LINEでログイン」──GET /api/auth/line/start──▶ state+nonce を Cookie に保存 ──302──▶ access.line.me/oauth2/v2.1/authorize(scope=openid)
◀──302 /api/auth/line/callback?code&state ──────────────────────────────────────────────────┘
                                                  state 照合 → code を id_token に交換(channel secret)
                                                  → id_token を verify API で検証(nonce 付き)
                                                  → HMAC lookup で coaches を検索 → 管理セッション Cookie 発行 → 302 /
連携: メール+パスワードでログイン済み → /account「LINE を連携」→ 同フロー(mode=link)→ callback で coach 行に暗号文+lookup を保存
```

### DB(実装済み・マイグレーション 0006)

`coaches.line_user_id text`(暗号文 `enc:v1:…`、平文 CHECK で拒否)/ `coaches.line_user_id_lookup text`(HMAC hex、`(team_id, line_user_id_lookup)` 一意)。
どちらも NULL 可(未連携)。auth_type は変えない(既存 'email' コーチが連携しても 'email' のまま。'line' は将来、パスワードなしで作るコーチ用)。

### API 契約(admin。すべて `packages/api/src/admin-app.ts` に追加、ロジックは `line-login.ts`)

- `GET /auth/line/start?mode=login|link`(既定 login)→ 302
  - state(32 byte random, base64url)+ nonce を JSON で `hoopo_line_oauth` Cookie に保存(httpOnly / SameSite=Lax / path=/api/auth/line / maxAge 600)。
    Cookie 値は `createSessionToken` と同じ HMAC 署名付き(`session.ts` の署名関数を再利用、role は持たない別ペイロード `{ state, nonce, mode, coachId?, exp }`)
  - `mode=link` は coach セッション必須(なければ 401)。ペイロードに coachId を入れる
  - 遷移先: `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=<LINE_LOGIN_CHANNEL_ID>&redirect_uri=<origin>/api/auth/line/callback&state=…&scope=openid&nonce=…`
    (`origin` はリクエスト URL から導出。`bot_prompt` は付けない)
  - **フェイク(AUTH_FAKE=1)**: authorize へ飛ばさず、そのまま `…/callback?code=fake:<userId>&state=…` へ 302。
    userId は query `fake_user`(`U[0-9a-f]{32}`)、省略時は `FAKE_COACH_LINE_USER_ID = "U" + "c".repeat(32)`。
    Vercel 上では `createFakeIdTokenVerifier` と同じく起動時エラー
- `GET /auth/line/callback?code&state`(LINE 側の拒否は `error=access_denied` で来る)→ 302
  - Cookie の state と query の state が一致しなければ `/login?error=line_state`。検証後は Cookie を削除
  - `code` → `packages/line` の `exchangeAuthorizationCode({ code, redirectUri, channelId, channelSecret })` で `id_token` を取得
    (`POST https://api.line.me/oauth2/v2.1/token`、grant_type=authorization_code。アクセストークンは受け取っても捨てる)。
    フェイクでは `code` が `fake:` 始まりならそれをそのまま id_token として扱う
  - id_token を `IdTokenVerifier` で検証。**verifier に第2引数 `{ nonce }` を追加**し、本物は verify API へ `nonce` を渡す(フェイクは無視)
  - `mode=login`: `lineUserIdLookup(userId)` で `coaches` を検索(withTeam、`line_user_id_lookup` 一致)。
    あれば `createSessionToken({ sub: coach.id, role: "coach", … })` → `hoopo_admin_session`(既存 login と同じ属性)→ 302 `/`。
    なければ 302 `/login?error=line_unlinked`(このアカウントは管理者として登録されていない)
  - `mode=link`: ペイロードの coachId の行を `line_user_id = encryptLineUserId(userId)`, `line_user_id_lookup` で更新 → 302 `/account?linked=1`。
    一意制約違反(別コーチが同じ LINE を連携済み)は 302 `/account?error=line_taken`。coach セッションが切れていれば `/login`
  - 交換・検証の失敗は `/login?error=line_failed`(link 時は `/account?error=line_failed`)。LINE の `error=access_denied` は `line_denied`
- `DELETE /auth/line/link`(coach)→ 204。両列を NULL に戻す。`password_hash` が NULL のコーチ(LINE だけで入れる)は解除すると締め出されるので 409
- `GET /account`(SSR。API ではなく `getCoachAccount(teamId, coachId)` → `{ email, authType, lineLinked }`)を `packages/api/src/coach-account.ts` に置く
- deps 追加(`AdminApiDeps`): `lineLogin: { channelId, channelSecret, verifyIdToken, exchangeCode, fake: boolean }`, `encryptionKey`, `hmacKey`。
  env は `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET`(.env.example 済み。AUTH_FAKE=1 のときは未設定でよい)、`LINE_ID_ENCRYPTION_KEY` / `LINE_ID_HMAC_KEY`(portal と共通)

### 画面(apps/admin。モノトーン、DESIGN_GUIDELINES §2)

- `/login`: 「LINEでログイン」を `<a className="lgbtn" href="/api/auth/line/start">` に。`?error=` に応じてカード上部に文言
  (line_unlinked: 「このLINEアカウントは管理者として登録されていません。メールでログインして「LINE を連携」してください」、
  line_denied: 「LINEログインがキャンセルされました」、line_state / line_failed: 「LINEログインに失敗しました。もう一度お試しください」)
- `/account`(新規、Shell の nav 末尾に「アカウント」を追加。アイコンは既存 icons.tsx に person 系を1つ追加):
  メールアドレス、LINE 連携の状態(「連携済み」/「未連携」)、「LINE を連携」(`<a href="/api/auth/line/start?mode=link">`)または「連携を解除」(確認ダイアログ → DELETE)。
  `?linked=1` で「LINE を連携しました」、`?error=` で文言。ログアウトボタンもここに置いてよい(既存の配置は変えない)

### 設計判断

1. **LIFF ではなく Web の LINE ログイン(認可コード)**: 管理画面は PC ブラウザ利用が主で LIFF の前提(LINE アプリ内)が成り立たない。
   Implicit(id_token 直接返却)は LINE が非推奨。scope は openid のみ(profile を取らない=表示名・画像を受け取らない。絶対原則4)
2. **state/nonce は署名 Cookie**: DB テーブルを増やさない(セッションと同じ思想)。SameSite=Lax でも LINE からの戻り(トップレベル GET)で送られる。
   path を `/api/auth/line` に絞り他ルートに載せない
3. **連携は「ログイン済みのコーチが自分で」**: 招待コードのような LINE 側からの自己申告は、部外者が管理者になる経路になるので設けない。
   最初のコーチは seed / stg の手動 INSERT(メール)で作り、LINE は後から連携する
4. **ID トークン検証は既存の `IdTokenVerifier` を再利用し nonce だけ追加**(liff-login 設計判断1・8 の差し替え境界を維持)。
   コード交換も `packages/line` に閉じ、`fetch` 注入でユニットテスト可能にする
5. **フェイクは start→callback の短絡**: 認可画面の代替 UI を作らない。E2E は「メールでログイン → 連携(fake_user 指定)→ ログアウト → LINE でログイン → ダッシュボード」で
   連携・ログインの両方を1本で通す。未連携の fake_user でのログインは `line_unlinked` の文言を確認
6. **メール+パスワードは残す(予備)**: admin-login 設計判断10 のとおり、廃止判断は運用後。連携解除で締め出しになる場合だけ 409 で止める
7. **実行体制**: プラン・DB・docs はメイン、実装は Opus サブエージェント1本(admin 内で完結)。DB を使う検証と PR はメイン

## スコープ外

- パスワードなし('line' のみ)コーチの新規作成 UI(手動 INSERT で可能。必要になったら #21 周辺で)
- LINE ログインのボタン意匠(LINE 公式ガイドラインの緑ボタン)。モノトーン規範を優先し、テキストボタンのまま
- 実チャネルでの疎通(#9 の LINE ログインチャネル作成後に stg で確認。コールバック URL の登録が必要)

## 完了条件

- フェイクモードで: メールログイン → 連携 → ログアウト → 「LINEでログイン」→ ダッシュボード。未連携の LINE は文言つきで /login に戻る
- coaches に暗号文+lookup だけ保存(平文 CHECK、team 内一意)。id_token / access_token は保存しない
- Unit(authorize URL・state Cookie・code 交換の fetch モック・verifier の nonce)/ Integration(callback の login/link/未連携/一意違反/解除 409、RLS)/ E2E 1本がグリーン
