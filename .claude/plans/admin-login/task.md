# Task: 管理者ログイン(縦切り1b)

Issue: [#24](https://github.com/kchan-lab/hoopo/issues/24) / Plan: [plan.md](plan.md)

実装は2トラック並列(A: DB→API、B: admin UI 基盤)+統合。

## トラックA: DB・API

- [x] docs 先行更新: DESIGN_GUIDELINES §2.1 に `--aon` を追記、REQUIREMENTS §7 の
      coaches 注記を実装後の姿に更新
- [x] スキーマ: coaches に `password_hash`(NULL可)+ CHECK(email 認証はハッシュ必須)
      → `db:generate` で 0003 生成(コーチ検索は withTeam で足りるため関数追加なし。
      plan.md 設計判断3)
- [x] packages/api `password.ts`: PBKDF2 ハッシュ生成/照合(`pbkdf2:v1:` 形式)+ Unit
- [x] セッション一般化: ペイロード `{sub, role, teamId, exp}`、Cookie 名を役割別に分離。
      1a の呼び出し側(/auth/line, /me, portal page)を追随 + Unit 更新
- [x] 管理ルート: `POST /auth/login`(email+password)/ `POST /auth/logout` /
      `GET /me`(coach)。失敗は資格情報を区別しない 401
- [x] seed: SKC コーチにパスワードハッシュを投入(平文は .env のローカル用値)
- [x] Integration: ログイン成功/失敗・role 分離(guardian セッションで coach API 不可)・
      RLS 越境不可・logout

## トラックB: admin UI 基盤

- [x] `globals.css`: モノトーントークン(`[data-theme]`)+ `--afs`(`data-fs`)+
      基本要素(カード・ボタン・フィールド)をワイヤーフレーム準拠で定義
- [x] layout: Cookie からテーマ/文字サイズを読み `<html data-theme data-fs>` に反映。
      ヘッダーに切替トグル(月/太陽)+文字サイズセグメント(選択は Cookie 保存)
- [x] /login ページ: ワイヤーフレーム PC-1/SP-1 準拠(LINE ボタンは disabled「準備中」)
- [x] 管理トップ: ログイン済み表示+ログアウトボタンのみ(ダッシュボードは #30)
- [x] Hono を admin の Route Handler にマウント

## 統合・検証・PR

- [x] 権限ガード: 未ログイン → /login リダイレクト、保護者セッション拒否
- [x] E2E: /login → ログイン → 管理トップ → ログアウトの導線1本(admin:8001)
- [x] e2e-check Skill(フロント+バックエンド)— E2E 12 passed(desktop/mobile)
- [x] フォローアップ Issue 起票: 管理者の LINE ログイン
- [ ] PR 作成 → CI グリーン → development へ squash マージ(`Closes #24`)
- [ ] マージ後: stg へ 0003 適用(`db:migrate:stg`)+ stg コーチアカウント作成 → 実機確認
