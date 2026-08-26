# Plan: 管理者ログイン(縦切り1b)

Issue: [#24](https://github.com/kchan-lab/hoopo/issues/24)
設計の正: docs/REQUIREMENTS.md §3・§5・§7 / docs/DESIGN_GUIDELINES.md §2 / CLAUDE.md 絶対原則6
視覚の正: docs/wireframes/wireframes-v6.html の admin ログイン画面(PC-1 / SP-1)

## 目的

コーチが管理画面(apps/admin)にメール+パスワードでログインできるようにし、
管理画面全体のセッション・権限ガードと、管理UIの土台(モノトーンテーマ・
ダークモード・文字サイズ3段階)を確立する。以降の管理系縦切り(#13 日程管理ほか)の前提。

## 方針

```
[admin browser]                    [apps/admin (Next.js)]         [packages/api (Hono)]
/login フォーム ──POST /api/auth/login {email,password}──▶ resolve_coach_by_email(SECURITY DEFINER)
                                                            → PBKDF2 ハッシュ照合
                                                            → 管理セッション Cookie 発行
◀────────── Set-Cookie: hoopo_admin_session ─────────────┘
以降の管理ページはサーバー側でセッション検証。なければ /login へリダイレクト
```

### 設計判断

1. **1b はメール+パスワードのみ実装し、管理者の LINE ログインは別 Issue に分離**:
   §3 は「LINE **または** メール+パスワードを選択可」であり、片方で受入条件
   「管理者がログインできる」は満たせる。管理側 LINE ログインは LIFF ではなく
   LINE ログイン(Web)の別フローが必要で、1b に同居させると PR が肥大する。
   画面には規範どおり「LINEでログイン」ボタンを置くが disabled(準備中)とし、
   フォローアップ Issue を起票する。
2. **パスワードハッシュは PBKDF2-HMAC-SHA256(60万回、Web Crypto)**:
   保存形式 `pbkdf2:v1:<iterations>:<salt b64url>:<hash b64url>`(バージョン+
   反復回数を自己記述しローテーション可能に)。bcrypt/argon2 はネイティブ依存か
   純JS依存の追加になり、Web標準APIのみの方針(CLAUDE.md)に反するため退けた。
   反復回数は OWASP 推奨値。実装は packages/api の `password.ts`。
3. **ログイン時のコーチ検索は withTeam(env の TEAM_ID)で行う**: coaches は
   fail-closed の team RLS 配下だが、現行は単一チーム(TEAM_ID が env で確定)のため
   通常の RLS 配下 SELECT で足りる。テナント未確定になるマルチテナント化の際に、
   招待コードと同じ SECURITY DEFINER 関数(resolve_coach_by_email)を導入する
   (今つくるのは YAGNI かつ RLS バイパス面の追加になるため退けた)。
4. **マイグレーション 0003**: coaches に `password_hash text`(NULL可)を追加+
   CHECK `auth_type <> 'email' OR password_hash IS NOT NULL`(email 認証なのに
   ハッシュなしのデータ不整合を DB で拒否。stg/prod の coaches は空なので安全)。
   GRANT・RLS ポリシーは既存のテーブル単位付与のため変更不要(調査済み)。
5. **セッションは 1a の署名 Cookie 基盤を一般化して共用**: ペイロードを
   `{sub, role: "guardian"|"coach", teamId, exp}` に拡張し、Cookie 名は
   保護者 `hoopo_session` / 管理 `hoopo_admin_session` で分離(絶対原則6の別世界を
   セッションレベルでも守り、role 混同による権限昇格を型と検証の両方で防ぐ)。
   1a のペイロード形式変更になるが、稼働前のため互換対応はしない。
   管理セッションは 7 日(保護者30日より短く。共有PCを想定)。ログアウトを実装する。
6. **権限ガードはサーバーコンポーネントの共通チェック**: 管理ページの layout で
   セッション検証+coach 行の存在確認(withTeam)を行い、未認証は /login へ
   redirect。Middleware 方式は Cookie 検証だけで DB 確認ができず二重実装になるため退けた。
7. **admin テーマ基盤は素の CSS 変数で新設**(`apps/admin/app/globals.css`):
   ワイヤーフレームのトークン(--abg/--acard/--aink/--asub/--ahair/--afield/--aacc/--aon)を
   `[data-theme]` で定義、`data-fs` で --afs 切替。Tailwind 等の導入はワイヤーフレーム
   (素のCSS変数+em)との整合と依存最小化のため見送り。テーマ/文字サイズの選択は
   **Cookie に保存**(SSR で <html> に属性を出せて hydration mismatch がなく、
   localStorage 状態管理の禁止にも抵触しない)。初期値は OS 設定
   (prefers-color-scheme を no-JS フォールバックとして併用)。
8. **--aon トークンを DESIGN_GUIDELINES §2.1 に追記**(ドキュメント先行の原則):
   fill ボタン前景色がガイドラインの表に漏れており、ワイヤーフレームにのみ存在するため。
9. **レート制限・パスワードリセットはスコープ外**: リセットは §10 未決(メール送信手段
   未選定)のまま。失敗応答は email 不明/パスワード不一致を区別しない同一メッセージ+
   照合は constant-time(Web Crypto verify)とし、総当たり対策の本格実装は
   公開運用前(#21 周辺)に判断する。初期アカウントはローカルは seed、stg は
   owner 接続で手動 INSERT(ハッシュはスクリプトで生成)。

## スコープ外

- 管理者の LINE ログイン(フォローアップ Issue を起票)
- パスワードリセット(§10 未決のまま)
- ダッシュボード等の中身(#13 以降)。ログイン後は最小のプレースホルダ+ログアウトのみ

## 完了条件

- seed のコーチ(email+パスワード)で /login からログイン → 管理トップ表示 → ログアウトできる
- 未ログインで管理ページを開くと /login へリダイレクト
- 保護者セッション Cookie では管理ページに入れない(role 分離)
- 管理画面がモノトーンテーマ(ライト/ダーク切替・文字サイズ3段階)で表示され、オレンジ不使用
- Unit(ハッシュ・セッション role)/ Integration(login API・RLS・不正資格情報)/
  E2E(ログイン導線1本)がグリーン。マイグレーションが local に適用できる
