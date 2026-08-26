# Plan: 保護者LIFFログイン+セッション(縦切り1a)

Issue: [#23](https://github.com/kchan-lab/hoopo/issues/23)
設計の正: docs/REQUIREMENTS.md §2・§3 / CLAUDE.md 絶対原則2・4 / docs/DEVELOPMENT.md テスト戦略

## 目的

LINEグループのLIFFリンクをタップ → 自動ログイン → httpOnly Cookieセッション確立までの
保護者認証を貫通させる。メール・パスワード・重複入力を一切求めない(絶対原則2)。

## 方針

```
[LIFF browser]                       [apps/portal (Next.js)]        [packages/api (Hono)]
liff.init → liff.getIDToken() ──POST /api/auth/line {idToken}──▶ IDトークン検証(LINE verify API)
                                                                  → lookup(HMAC)で guardian 検索
                                                                  → なければ作成(暗号文+lookup保存)
                                                                  → セッション Cookie 発行(httpOnly)
◀─────────────── Set-Cookie: hoopo_session ────────────────────┘
以降のAPIは Cookie のセッションから guardian_id / team_id を解決(withTeam で RLS 配下接続)
```

- Hono ルートは `packages/api` に定義し、portal の Route Handler(`app/api/[[...route]]/route.ts`)
  にマウント(Web標準APIのみ。CLAUDE.md 技術スタック)
- 暗号化(AES-256-GCM)・HMAC lookup・IDトークン検証は `packages/line` の責務
  (guardians スキーマのコメントどおり)。鍵は env(`LINE_ID_ENCRYPTION_KEY` / `LINE_ID_HMAC_KEY`)
- セッション実装(署名Cookie)は `packages/api` に置く(将来 admin=縦切り1b でも共用)

### 設計判断

1. **IDトークン検証は LINE の verify API(`POST https://api.line.me/oauth2/v2.1/verify`)**:
   公式エンドポイントに委譲すれば JWKS 取得・JWT 検証ライブラリが不要(Web標準 fetch のみ)。
   代替の jose によるローカル検証は依存とキーローテーション追従が増えるため退けた。
   検証層は interface に切り、E2E/ローカルではフェイク実装に差し替える(判断6)。
2. **セッションはステートレス署名Cookie(HMAC-SHA256、Web Crypto)**: ペイロードは
   `{guardianId, teamId, exp}`。セッションテーブル追加(=マイグレーション+失効管理)は
   現段階では過剰なため退けた。無効化要件(卒団アーカイブ等)が出た時点でDBセッションへ移行。
   有効期限30日・アクセストークンは検証後に破棄し永続化しない(絶対原則4)。
3. **guardian レコードは初回ログイン時に find-or-create**: Issue の受入条件
   「LINEユーザーIDは暗号化して保存される」を1aで満たす。部外者がLIFFを開いた場合も
   guardian 行はできるが子ども連携(招待コード)がなければ何も見えず、§3の
   「自動認定+事後確認」方式(コーチが後から無効化)と整合する。
   代替(#12の初回登録まで保存を遅延)は受入条件を満たせないため退けた。
4. **team_id の解決は当面 env(`TEAM_ID`)の単一チーム**: LIFF アプリはチームごとに
   1つ(LIFF ID がテナントを一意に決める)。マルチテナント化時に LIFF ID→team のマップへ
   置き換える。DBに「デフォルトチーム」フラグを持つ案はスキーマ変更を要するため退けた。
5. **暗号化は AES-256-GCM(Web Crypto)+ HMAC-SHA256 lookup**: 暗号文は
   `enc:v1:<iv>:<ciphertext>` 形式(バージョン接頭辞でローテーション余地、
   平文拒否 CHECK `^U[0-9a-f]{32}$` に確実に非マッチ)。検索は決定的な
   HMAC hex(スキーマコメントどおり)。可逆暗号にするのは LINE 送信等で userId の
   復元が必要になるため(lookup ハッシュのみでは不可逆で退けた)。
6. **LIFF/LINE のフェイクは環境フラグで注入**: `AUTH_FAKE=1`(かつ本番ビルドでは
   強制無効)のときだけ、①クライアントの liff を localStorage 不使用のスタブに、
   ②サーバーの verify をフェイク(`fake:<userId>` トークンを受理)に差し替える。
   実チャネル(#9)未取得でもローカル/E2E で導線を貫通させるため。
   liff-mock 系 OSS への依存は動作が LIFF SDK バージョンに強く結合するため退けた。
7. **外部ブラウザのフォールバック(§2)は liff.login() リダイレクトに委譲**:
   LIFF SDK が LINE ログインへ誘導する標準挙動をそのまま使い、独自実装しない。

## スコープ外

- 初回登録①②(子ども情報・参加情報)と招待コード連携 → #12
- 管理者ログイン → #24(縦切り1b)
- 実 LINE チャネル・LIFF ID の取得と stg での実機疎通 → #9 完了後の確認タスク

## 完了条件

- LIFF(フェイク)起動 → 自動ログイン → セッション確立 → `GET /api/me` が guardian を返す
- セッションは httpOnly / Secure / SameSite=Lax Cookie。IDトークン・アクセストークンは保存しない
- guardians に暗号文+lookup のみ保存(平文 CHECK が通る)。表示名・画像は取得すらしない
- Unit(暗号化・HMAC・Cookie署名・トークン検証の入力検証)/
  Integration(auth API を RLS 配下で実行、find-or-create・越境不可)/
  E2E(フェイク LIFF でログイン導線1本)がグリーン
