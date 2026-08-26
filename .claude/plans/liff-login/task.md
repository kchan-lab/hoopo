# Task: 保護者LIFFログイン+セッション(縦切り1a)

Issue: [#23](https://github.com/kchan-lab/hoopo/issues/23) / Plan: [plan.md](plan.md)

## packages/line(暗号化・検証)

- [x] AES-256-GCM 暗号化/復号(`enc:v1:` 形式、Web Crypto)+ Unit テスト
- [x] HMAC-SHA256 lookup 生成 + Unit テスト(決定性・鍵分離)
- [x] IDトークン検証 interface + LINE verify API 実装 + フェイク実装(`AUTH_FAKE` ガード)+ Unit テスト

## packages/api(Hono)

- [x] セッション署名Cookie(発行/検証、httpOnly/Secure/SameSite=Lax、30日)+ Unit テスト
- [x] `POST /auth/line`: IDトークン検証 → guardian find-or-create(withTeam)→ Cookie 発行
- [x] `GET /me`: セッションから guardian 解決(未ログインは 401)
- [x] Integration テスト: find-or-create の冪等性・暗号文保存・RLS 配下動作・不正トークン拒否
      (vitest.int.config.ts の対象を packages/{db,api} に拡張)

## apps/portal

- [x] Hono を Route Handler にマウント(`app/api/[[...route]]/route.ts`)
- [x] LIFF 初期化+自動ログイン(liff スタブ切替、外部ブラウザは liff.login() フォールバック)
- [x] ログイン後のホーム(最小: ログイン済み表示)と未ログイン時の導線
- [x] `.env.example` に `TEAM_ID` / `SESSION_SECRET` / `LINE_ID_ENCRYPTION_KEY` /
      `LINE_ID_HMAC_KEY` / `LINE_CHANNEL_ID` / `AUTH_FAKE` 系を追記。
      シードの SKC チーム id を固定(TEAM_ID と一致させるため)
- [x] next.config.ts に `allowedDevOrigins`(compose の E2E がサービス名でアクセスするため。
      これがないと dev リソースが遮断されクライアント JS が実行されない)

## 検証・PR

- [x] E2E: フェイク LIFF でタップ→自動ログイン→ホーム表示の導線1本(e2e/login.spec.ts)
- [x] e2e-check Skill(フロント変更のため必須)— 6 passed(desktop/mobile)
- [ ] PR 作成 → CI グリーン → development へ squash マージ(`Closes #23`)
- [ ] (#9 完了後)実 LIFF ID・実チャネルで stg 疎通確認 → 結果を #23 か #9 に記録
