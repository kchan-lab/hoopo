# CLAUDE.md — hoopo(フーポ)

ミニバスケットボールチームの保護者連絡(練習日程・出欠・月謝・お知らせ)を、LINEグループ運用から
1つのWebアプリ(LIFF)へ移行するプロジェクト。コーチ個人が無償で運営する。
将来的には他チームへ横展開するヘッドレス型プラットフォーム(API一元提供+UI SDK配布)を目指す。
正式名称(暫定)は **hoopo(フーポ)**(英字は小文字表記で統一、リポジトリ名 `hoopo`)。他チームへの横展開時にはバスケットボール全体のプラットフォーム名を別途策定して改名する前提。対外表記はロックアップ「hoopo − ミニバスれんらくポータル」を用い、画面の主役はチーム(SKC粉浜・北粉浜ミニバスケットボール)とする二層ブランディングに従う。

このファイルは実装時に必ず前提となる「憲法」。詳細仕様は `docs/REQUIREMENTS.md`、
UI規範は `docs/DESIGN_GUIDELINES.md` を正とする。仕様変更はまずドキュメントを更新してから実装する。

## 絶対原則(違反する実装は提案しない)

1. **ランニングコスト原則ゼロ。** Vercel Hobby + Supabase Free + Cloudflare(ドメイン/R2)の無料枠内で動かす。
   有料化が必要な設計変更は必ず事前に相談として提示する。月5,000円は明確に予算オーバー。
2. **保護者の操作負担を最小に。** LINEグループのLIFFリンクをタップ→自動ログインが基本導線。
   メール登録・パスワード・重複入力を保護者に求めない。入力は初回登録の1回だけ。
3. **LINE通数を常に意識する。** 通知は「グループ宛て1通」のみ。通数 = 送信回数 × グループ人数。
   無料枠は月200通。個別push・全員broadcastの実装を新設しない。管理画面に通数カウンターを常設。
4. **個人情報は最小保持。** 保持するのは LINEユーザーID(暗号化)/子どもの名前・学年・性別/伝達事項/参加可能曜日・時間帯 のみ。
   LINE表示名・プロフィール画像・電話番号・住所・生年月日は保存しない。アクセストークンは永続化しない。
5. **全テーブルに `team_id`。** 例外なし。RLSは「team_id = 自分のチーム」を基本ポリシーとする。
   これが将来のマルチテナントAPI化の土台。
6. **保護者UIと管理UIは別世界。** 保護者=薄いオレンジ・iOSネイティブ調。管理=モノトーン・ダークモード対応・
   文字サイズ3段階。オレンジを管理画面に持ち込まない。
7. **月謝は現金運用の可視化のみ。** 決済機能は実装しない(封筒+済ハンコのデジタル再現)。

## 技術スタック(確定)

- フロント/バック: **Next.js (App Router) + Hono**(Route Handlerにマウント。将来Workers等へ切り出し可能に、Web標準APIのみ使用)
- 言語: **TypeScript一本**(strict)。フォーマット/リント: **Biome**
- DB: **Supabase (PostgreSQL)** + **Drizzle ORM**(マイグレーションはDrizzle Kitで管理、`supabase db push` 禁止run手動SQL禁止)
- 認証: **LIFF / LINEログイン**(保護者)、LINEまたはメール+パスワード(管理者)。セッションはhttpOnly Cookie
- ホスティング: **Vercel**(Hobby)。ドメインはCloudflare Registrar、DNSはCloudflare
- 画像: 予定表はDBから**動的生成**(satori / @vercel/og)。保存が必要な場合のみ Supabase Storage → 将来R2
- 監視/運用: Sentry、UptimeRobot(死活)、アラートはDiscord Webhook(**LINE Notifyは終了済みのため使用不可**)
- CI/CD: GitHub Actions(型/リント/テスト/E2E/マイグレーション整合)、Renovate、デプロイはVercel連携
- 定期ジョブ: GitHub Actions schedule(リマインド、月謝レコード生成、バックアップ、Supabase停止対策ping)
- ローカル開発: **Docker(docker compose)で統一**。portal=`localhost:8000` / admin=`localhost:8001` にポート分岐。DBは Supabase CLI のローカルスタック(これ自体もDockerコンテナ群)を使用

## モノレポ構成(想定)

```
apps/portal        … 保護者向け (Next.js, LIFF)
apps/admin         … 管理者向け (Next.js)
packages/api       … Hono ルート定義(将来SDK/横展開の中核)
packages/db        … Drizzle スキーマ・マイグレーション・RLSポリシー
packages/ui        … 共有UIプリミティブ(テーマはアプリ側で注入)
packages/line      … LINE/LIFF クライアント(署名検証・通数計算含む)
docs/              … REQUIREMENTS.md / DESIGN_GUIDELINES.md ほか
.github/workflows  … CI/CD・定期ジョブ
```

## 開発ルール

- コミットは Conventional Commits。PRは小さく、CIグリーンが必須
- ブランチは feat/xxx → dev(=stg) → main(=prod)。リリースは release-please によるタグ+ノート自動生成(詳細は `docs/DEVELOPMENT.md`)
- テストは**3層で全網羅**(Unit / Integration / E2E)。実装PRには対象層のテストを必ず含める。戦略の詳細は `docs/DEVELOPMENT.md` のテスト戦略に従う
- LINEのチャネルシークレット等は必ずサーバー側のみ。Webhookは署名検証を必ず通す
- 日付・曜日は `Asia/Tokyo` 固定で扱う(練習日は「日付+曜日」で保持)
- 画面文言は sentence case 相当の平易な日本語。用語は統一: 「提出」(出欠)、「発行」(予定表)、「済」(月謝)
- 破壊的操作(年度更新・卒団アーカイブ・LINE送信)は確認ダイアログ+実行ログを残す

## ドメイン用語

| 用語 | 意味 |
|---|---|
| guardian | 保護者。LINEアカウント1つにつき1レコード |
| child | 部員(子ども)。招待コードを持ち、複数guardianと紐づく |
| practice | 練習・試合の1コマ(日付/開始/終了/場所/備考/メニュー) |
| 発行 (publish) | その月のpracticesを確定し、予定表画像を生成してLINEグループへ送信すること |
| attendance | 子ども×練習の参加回答(提出) |
| fee_record | 子ども×年月の月謝ステータス(済/未) |
| 年度更新 | 4月に全部員の学年を+1し、6年生を卒団アーカイブする一括処理 |

## してはいけないこと

- LINEへの個別push機能・自動全件通知の追加(通数原則に反する)
- 保護者アプリへのパスワード/メール認証の導入
- localStorage 依存の状態管理(セッションはCookie、状態はDB)
- `team_id` なしのテーブル追加、RLSなしのテーブル公開
- お名前.com の利用、Fly.io 等の常時課金インフラの追加
- 決済機能・キャッシュレス連携の実装

## 実装フェーズの進め方(Claude Code)

1. 着手前に本ファイルと `docs/REQUIREMENTS.md` の該当セクションを読む
2. 画面実装時は `docs/DESIGN_GUIDELINES.md` のトークン・コンポーネント規約に従う
3. 進行順序・実装サイクル・Skill化の方針は `docs/DEVELOPMENT.md` に従う
4. 迷ったら「絶対原則」に照らす。原則と衝突する要望は実装せず、選択肢を提示して相談する
