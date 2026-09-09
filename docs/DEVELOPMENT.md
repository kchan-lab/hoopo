# DEVELOPMENT.md — 開発プロセスと Claude Code 運用ガイド

個人開発 × Claude Code 前提で「手が止まりにくい順序」に組んだ進行ガイド。
リポジトリでは `docs/DEVELOPMENT.md` に置き、CLAUDE.md から参照する。
仕様の正は `docs/REQUIREMENTS.md`、UI規範は `docs/DESIGN_GUIDELINES.md`。

## フェーズ0: リポジトリの立ち上げ(初日)

コードより先に「憲法・仕様・安全網」を作る。

- [ ] Organization配下にプライベートリポジトリ `hoopo` を作成。既存の minihoop-frontend / minihoop-backend はアーカイブ
- [ ] **最初のコミットはドキュメント**: ルートに `CLAUDE.md`、`docs/` に REQUIREMENTS.md / DESIGN_GUIDELINES.md / DEVELOPMENT.md / wireframes-v6.html
- [ ] pnpm workspaces でモノレポ骨格を作成: `apps/portal` `apps/admin` `packages/{api,db,ui,line}`
- [ ] **docker compose でローカル環境を定義**: `portal`(localhost:8000)/`admin`(localhost:8001)の2サービス+共通devイメージ。DBは `supabase start`(Supabase CLIのローカルスタック=Dockerで起動、Postgres:54322 / Studio:54323)。LIFFの実機確認はhttpsが必要なため cloudflared 等のトンネルを併用
- [ ] CIを先に通す(空プロジェクトでグリーンにする): Biome / tsc / Vitest / Playwright最小 + Renovate + CodeQL + secret scanning
- [x] main / development ブランチを保護(直push禁止・CI必須)。1人開発でも feat/xxx → development → main のPRフローで統一(Vercelプレビュー確認とAIレビューを挟むため。詳細は「ブランチ戦略・リリースフロー」)
- [ ] タスク管理は GitHub Projects。定型作業は `.claude/skills/` にSkillとしてコミット(gh CLIと組み合わせて運用)

ポイント: 機能を書き始める前にCIが通る状態を作ると、以後Claude Codeの生成物すべてに自動の安全網がかかる。

## フェーズ1: 外部サービスの接続(週1つ目)

コードより詰まりやすい外部設定を先に片付ける。

- [ ] Supabase プロジェクト作成 → Drizzle でスキーマ(確定ER図の通り)+ RLSポリシー + シードデータ
- [ ] Vercel に portal / admin の2プロジェクトを接続(モノレポの Root Directory 設定)
- [ ] Cloudflare でドメイン取得 → Vercel へ CNAME
- [ ] LINE Developers: チャネル開設 → LIFF登録 → Botをテスト用グループに招待し Webhook で groupId 取得(詳細は別紙手順書)
- [ ] Sentry / UptimeRobot / Discord Webhook(アラート用)を接続

## フェーズ2: 縦切りで機能実装(数週間)

機能は「画面単位」ではなく **DB→API→画面まで貫通する縦切り** で1本ずつ。依存が少なく早く"使える"順:

1. LINEログイン(LIFF)+セッション、管理ログイン — すべての土台
2. 子ども登録フロー(自動認定+コーチ通知)と部員管理・認定管理
3. 日程管理(admin)→ 日程リスト/カレンダー(portal)
4. 参加予定の提出(3値+コメント)→ 出欠管理・欠席者管理
5. 月謝(封筒グリッド両面)
6. お知らせ + 予定表画像の自動生成 + LINE送信(通数カウンター)
7. チーム名簿 → 出場メンバー2D、ダッシュボード仕上げ、家族連携

### 1本の実装サイクル(必ずこの型で)

1. Issue起票 — 受入条件を REQUIREMENTS.md の節番号つきで書く
2. Claude Code に Plan モードで実装計画を立てさせ、承認してから実装
3. PR作成(development宛て) — CIグリーン + Claude Code Action のAIレビュー
4. Vercelプレビューを**スマホ実機**で確認
5. マージ(仕様との差分に気づいたら、コードではなく先に REQUIREMENTS.md を直す)

### Issueテンプレート

**Issue は What/Why に絞り、How(実装方針)は着手時の plan.md に書く。** 起票フォーマットは
`.github/ISSUE_TEMPLATE/task.md` を正とする(目的 / 参照 / 作業内容 / 受入条件)。

```
## 目的
参加予定の提出をプルダウン3値+コメントに対応する

## 参照
docs/REQUIREMENTS.md §4.2-6 / docs/DESIGN_GUIDELINES.md §1.3(提出行・カレンダー)

## 作業内容
- [ ] 提出UI(リスト/カレンダー)の3値+コメント対応
- [ ] 管理側の出欠マトリクス反映

## 受入条件
- [ ] リスト/カレンダーの選択状態が同期する
- [ ] 「途中参加・早退」選択時のみコメント欄が表示される
- [ ] 管理側の出欠マトリクスに ○/△/×/− が反映される
```

### PR本文の書き方(5要素)

`.github/PULL_REQUEST_TEMPLATE.md` を正とする。本文は**コードを読まない読み手(未来の自分)が
一目で挙動の差分を理解できる**ことを最優先し、次の5要素を見出しとして立てる:

1. **ひとことで言うと** — 何がどう変わるかを利用者の言葉で1〜2文(必須)
2. **早見表** — 挙動が変わる/問題になるケースを1つの表で。変化が起きる条件を1行で言い切る
3. **なぜ(仕組み)** — 原因・動作を平易な言葉で
4. **旧仕様との違い** — 「これまで → 今回」。LINE通知・通数・画面表示への対外影響は必ず触れる
5. **変更内容・影響範囲** — 具体的な変更点と影響する画面・ジョブ・マイグレーション

変数名・関数名・条件式だけで挙動を説明しない。技術的詳細は末尾の「技術的詳細」に分離する。
該当しない見出しは削ってよいが「ひとことで言うと」は必須。Issue作業のPRは `Closes #N` を含める。

## テスト戦略(Unit / Integration / E2E の3層で全網羅)

| 層 | ツール | このプロジェクトで担保すること |
|---|---|---|
| Unit | Vitest | 純ロジック: LINE通数計算、年度更新(学年+1/卒団)、日付・曜日処理(Asia/Tokyo)、提出3値のバリデーション、招待コード生成。DB不要で高速、各パッケージ隣接の `*.test.ts`。CLI スクリプトの起動検証(子プロセス spawn)も、DB・外部サービスに依存せず高速(1秒未満/件)なものはここに含める(例: `db:migrate:prod` の確認プロンプト) |
| Integration | Vitest + ローカルSupabase(Docker) | HonoのAPIを `app.request()` で直接叩き、実Postgresに対して検証。**RLSの越境テスト(他team_idのデータが見えない/書けないこと)を必須ケースにする**。LINE APIはモック。マイグレーション適用後、テストごとにDBをリセット |
| E2E | Playwright | docker compose起動済みの portal(:8000)/admin(:8001) に対して主要導線を通す: 登録→自動認定通知、日程入力→発行(LINE送信はスタブ)→保護者で確認、提出3値→出欠/欠席者反映、月謝の済⇄未。スマホ(iPhoneビューポート)とPCの両方。LIFF認証はテスト用セッションCookie注入でバイパス |

- 実行: `pnpm test`(unit)/ `pnpm test:int`(integration)/ `pnpm test:e2e`(E2E)
- CI: **PRごとに Unit + Integration のみ**を実行(E2EはPRのCIに含めない)。**ただしIntegrationは検証対象のRLS・スキーマがIssue #6で実装されるまで暫定的にCIジョブ自体を作らない**(空のIntegrationジョブは作らない方針)。Issue #6でスキーマ・RLSが揃い次第 `ci.yml` にIntegrationジョブを追加する
- E2E: フロント系の実装をしたら、**コミット前にローカルでE2Eを回して確認する専用Skill(`e2e-check`)**で担保する(docker compose起動→対象導線のPlaywright実行→結果要約までをSkill化)。フルE2Eは **development→mainのリリースPR** と nightly のCIで実行
- カバレッジ方針: `packages/api` `packages/db` のロジックは80%を目安に計測。UIは数値を追わず、主要導線がE2Eで通ることを基準にする
- 新機能の縦切り1本 = Unit(ロジック)+ Integration(API+RLS)+ E2E(導線1本)をセットでIssueの受入条件に含める

## ブランチ戦略・リリースフロー

```
feat/xxx ──PR──▶ development(=ステージング) ──リリースPR──▶ main(=本番) ──直後──▶ vX.Y.Z タグ + Release
hotfix/xxx ─────────────────────────────────────────────────▶ main(緊急時のみ。developmentへback-merge)
```

- **feat/xxx**: Issue単位で作成し development へPR。CIは Unit + Integration(Integrationのジョブ追加はIssue #6以降)、Vercelの使い捨てプレビューURLで確認
- **Vercel の関数リージョンは東京(hnd1)に固定**(`apps/*/vercel.json` の `regions`)。既定の iad1(米国東部)だと東京の Supabase との DB 往復ごとに約150ms かかり、画面遷移が数秒になる。stg 用プロジェクトの Production Branch は `development`、本番用は `main`(Vercel の Settings → Environments → Production → Branch Tracking)
- **development(ステージング)**: マージで固定のstgドメインへ自動デプロイ。DBは**2つ目のSupabase Freeプロジェクト(stg用)**を使い本番と完全分離(無料枠内)。`e2e-check` Skill・家族テストはここに対して実施
- **main(本番)**: リリースしたいタイミングで development→main の**リリースPR**を作成(Actionsで週次自動起票も可)。**このPRでのみフルE2EをCI実行**し、グリーン確認 → 本番Supabaseへマイグレーション適用 → マージ(=Vercel本番デプロイ)。適用がマージより先(手順は「prod マイグレーション適用」)
- **タグ・リリースノート(release-please)**: Conventional Commits(`feat:`=minor / `fix:`=patch / `BREAKING CHANGE`=major)からバージョンを自動計算し、CHANGELOG込みの「release: vX.Y.Z」PRを常時維持。マージした瞬間にタグ打ち+GitHub Release発行+CHANGELOG更新が完了する。**タグはデプロイのトリガーではなく版の記録とロールバックの目印**(ロールバック自体はVercelの過去デプロイ再昇格で即時)
- **リリース手順の実際**: development→main のリリースPRは **merge commit** でマージする(squash すると個々の `feat:` / `fix:` が main の履歴から消え、release-please のバージョン計算が壊れる)。マージ後に release-please が「release: vX.Y.Z」PR を起票するのでそれをマージ → タグ+Release+CHANGELOG が完了。直後に main→development の back-merge PR を出して CHANGELOG / version.txt を development へ同期する
- **マージ方式は全 PR で merge commit に統一**(squash はリポジトリ設定で無効化、ルールセットでも不許可)。feat ブランチの各コミットがそのまま development / main の履歴に残り、release-please はその Conventional Commits を1件ずつ読んで CHANGELOG に載せる。したがって **ブランチ上のコミット件名がそのまま CHANGELOG の行になる**(`feat:` / `fix:` / `perf:` が載り、`docs:` / `chore:` / `ci:` / `refactor:` / `test:` は載らない)
- **保護者向けお知らせは別物**: GitHub Releaseは開発者向け文面。`release-notes` Skillが `git log 前タグ..HEAD` と関連Issueを読み、保護者向けお知らせの下書き(です・ます調・専門用語なし)まで生成 → コーチが確認して掲載
- リリース完了・CI失敗は Discord へWebhook通知

### prod マイグレーション適用(リリース手順)

リリースPR(development→main)の CI がグリーンになったら、**マージする前に**以下を実施する。
マージすると Vercel の本番デプロイが自動で走り、人間のマイグレーション実行より先に新コードが
本番に出うるため、「スキーマが先」を運用の速さではなく手順の順序で保証する。マイグレーションは
後方互換(additive)原則なので、先に適用しても旧コードは影響を受けない。

1. `.env.prod`(コミット禁止)に `PROD_DATABASE_URL` を設定する(所有者ロール・
   Supavisor transaction mode 6543 経由。直結 5432 は使わない)
2. `pnpm db:migrate:prod` を実行する。接続先ホスト名が表示され、`prod` と手入力しないと
   中断される(適用済みの正は `__drizzle_migrations` テーブル)
3. **初回のみ**: アプリ用ログインロールを作成する(`hoopo_app` はマイグレーションが作るため、
   必ずマイグレーション適用後に SQL Editor で実行。パスワードはコードに置かず、その場で生成して保管):

   ```sql
   CREATE ROLE hoopo_app_prod LOGIN PASSWORD '<生成したパスワード>'
     NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB IN ROLE hoopo_app;
   -- ロール別設定は GRANT では継承されないため、ログインロール自身にも設定する
   ALTER ROLE hoopo_app_prod SET search_path = public, extensions, pg_temp;
   ```

4. リリースPRをマージする(ここで Vercel の本番デプロイが走る)
5. 適用結果(実行日時・適用したマイグレーション)をリリースPRのコメントに記録する(実行ログ)

運用原則:

- マイグレーションは**後方互換(additive)を原則**とする。列の削除・リネーム等の非互換変更は
  expand → migrate → contract に分割し、複数リリースに分けて適用する
- **DB のロールバックはしない(forward-fix)**。障害時はアプリを Vercel の過去デプロイ再昇格で
  戻し、DB は前方修正のマイグレーションで対処する(Free プランは PITR なし・down migration 非管理)

## ステージング環境(stg)の準備

stg は `development` ブランチが自動デプロイされる(Vercel の Production Branch = development)。
新しい縦切りを stg で確かめる前に、次の 3 つが揃っているかを確認する。**環境変数が 1 つでも
欠けると管理画面の API が全滅する**ので、まず必須 5 つを入れてから任意を足す(2026-09-10 の事故から)。

### 1. DB マイグレーション

`.env` に `STG_DATABASE_URL`(所有者ロール `postgres.<project ref>`・Supavisor 6543)を置いて
`pnpm db:migrate:stg`。適用済みの正は `drizzle.__drizzle_migrations`。stg の SKC チーム行の id は
`TEAM_ID` と同じ値(`60ab8c74-7e06-4cf7-a615-c1c818f4c4fe`)。

### 2. Vercel の環境変数(Production)

| 変数 | portal-stg | admin-stg | 備考 |
|---|---|---|---|
| `TEAM_ID` | 必須 | 必須 | stg の teams.id |
| `SESSION_SECRET` | 必須 | 必須 | 64 桁 hex。portal と admin で別の値でよい(Cookie が別) |
| `APP_DATABASE_URL` | 必須 | 必須 | `hoopo_app_stg` ロールの接続文字列(6543)。両アプリで同じ |
| `LINE_ID_ENCRYPTION_KEY` / `LINE_ID_HMAC_KEY` | 必須 | 必須 | 64 桁 hex。portal(guardians)と admin(coaches)は別テーブルなので別の値でも動く |
| `LINE_CHANNEL_ID` / `NEXT_PUBLIC_LIFF_ID` | 必須 | − | LIFF・ID トークン検証(#9) |
| `LINE_CHANNEL_SECRET` | 任意 | − | Messaging API の Webhook 署名検証。無いと Webhook は 503 |
| `NEXT_PUBLIC_PORTAL_URL` / `LIFF_ID` | − | 必須 / 任意 | 予定表画像の URL・LINE メッセージのリンク |
| `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET` | − | 任意 | 管理者の LINE ログイン。無いと「準備中」表示 |
| `LINE_CHANNEL_ACCESS_TOKEN` | − | 任意 | Messaging API の push。無いと送信ボタンが押せない |
| `CRON_SECRET` | − | 任意 | 出欠リマインドの定期ジョブ(GitHub Secrets と同じ値) |

`AUTH_FAKE` / `LINE_FAKE` は **Vercel には置かない**(フェイクは Vercel 環境で起動時に拒否される)。
値の設定は Vercel CLI でもできる: `vercel link --project hoopo-admin-stg` のあと
`printf '%s' "<値>" | vercel env add <名前> production`。

### 3. 管理者アカウント

coaches は seed しないので stg では手で作る。メールアドレスはログイン ID としてしか使わない
(メール送信機能は無い)ので、実在しなくてもよい。小文字で保存する。

```bash
# ハッシュ生成(packages/api の password.ts。pbkdf2:v1 形式)
cd packages/api && pnpm exec tsx -e 'import("./src/password.ts").then(m=>m.hashPassword(process.argv[1]).then(console.log))' -- '<パスワード>'
```

```sql
insert into coaches (team_id, email, auth_type, password_hash)
values ('<TEAM_ID>', '<メール(小文字)>', 'email', '<生成したハッシュ>');
```

ログインできたら「アカウント」から LINE を連携する(LINE ログインチャネルの設定後)。

### 動作確認の順番

1. `GET https://<admin>/api/me` が **401**(500 なら環境変数か DB の問題。Vercel の Runtime Logs に
   `環境変数 X が設定されていません` と出る)
2. メール+パスワードでログイン → ダッシュボード
3. portal は LIFF から開く(外部ブラウザは LINE ログインへフォールバック)→ 子ども登録
4. 日程入力 → 発行 → 予定表画像(`/api/schedule/YYYY-MM.png`)
5. LINE 送信(Messaging API・Bot のグループ招待後)→ 通数メーター

## 運用ジョブ(GitHub Actions schedule)

定期ジョブはすべて GitHub Actions の schedule で回す(常時課金のインフラを増やさない。CLAUDE.md 絶対原則1)。
**シークレットが未設定の環境はスキップして成功で終わる**ので、stg/prod が揃う前でも CI はグリーンのままになる。

| ワークフロー | 実行時刻(JST) | 役割 | 必要なシークレット |
|---|---|---|---|
| `supabase-ping.yml` | 毎日 06:23 | Supabase Free の自動一時停止対策 | `<ENV>_PING_DATABASE_URL` |
| `fee-records.yml` | 毎月1日 09:10 | 当月の月謝レコードを生成 | `<ENV>_PING_DATABASE_URL` |
| `attendance-reminder.yml` | 毎日 19:00 | 2日後の練習に未提出があればLINEグループへ1通 | `<ENV>_ADMIN_URL` / `<ENV>_CRON_SECRET` |
| `backup.yml` | 毎日 04:00 | `pg_dump` → Cloudflare R2 へアップロード | `<ENV>_BACKUP_DATABASE_URL` / `R2_*` |

`<ENV>` は `STG` / `PROD`。共通で `DISCORD_WEBHOOK_URL`(失敗通知先。未設定なら Actions の失敗表示のみ)を使う。

### 出欠リマインド(attendance-reminder.yml)

`POST <admin>/api/jobs/attendance-reminder` を `Authorization: Bearer <CRON_SECRET>` で叩く。
DB 直ではなくアプリの API を通すのは、通数チェック(月200通)と送信ログを必ず経由させるため
(`.claude/plans/attendance-reminder/plan.md` 設計判断2)。応答は
`{ sent, dates, unanswered, skipped? }` で、`skipped` は `already_sent` / `no_target` / `quota`。

- **対象**: 今日(Asia/Tokyo)+2日 に開催で、未提出の部員が1人以上いる練習。同じ日に複数コマあっても
  まとめて **1通**(通数 = 送信回数 × グループ人数。絶対原則3)
- **1日1通まで**: 当日(JST)に同じ開催日の `reminder` ログが `sent` で残っていればスキップ
- **枠不足はスキップ**: 送らず、送信ログも残さない
- 手動送信はコーチが管理画面の欠席者管理から行う(二段階確認で消費通数と残りを表示)

設定する値:

1. `CRON_SECRET` を生成する(`openssl rand -hex 32`)
2. **Vercel** の admin プロジェクトの環境変数に `CRON_SECRET` を設定する(環境ごとに別の値)。
   未設定なら `/api/jobs/*` は 503 を返して無効のままになる
3. **GitHub Secrets** に同じ値を `STG_CRON_SECRET` / `PROD_CRON_SECRET` として設定し、
   `STG_ADMIN_URL` / `PROD_ADMIN_URL`(末尾スラッシュなしの origin)も入れる

### 日次バックアップ(backup.yml)

`pg_dump -Fc --no-owner --no-privileges` の結果を Cloudflare R2(S3互換・無料枠10GB)へ
`hoopo/<env>/<YYYY-MM-DD>.dump` として置く。

- 接続文字列は **セッションモード(5432)** を使う。Supavisor のトランザクションモード(6543)では
  `pg_dump` が動かない(plan.md 設計判断4)。読み取り専用ロールでよい
- シークレット: `STG_BACKUP_DATABASE_URL` / `PROD_BACKUP_DATABASE_URL`、
  `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET`
- **世代管理は R2 のライフサイクルルール(30日で削除)に任せる**。ワークフローは削除しない
  (Cloudflare ダッシュボード → R2 → バケット → Settings → Object lifecycle rules)
- **自宅 Proxmox への複製は R2 から rclone で引く**(Actions からは押し込まない)。
  Proxmox 側で `rclone config` に R2 を S3 互換(`provider = Cloudflare`,
  `endpoint = https://<account>.r2.cloudflarestorage.com`)として登録し、cron で
  `rclone sync r2:<bucket>/hoopo /var/backups/hoopo --max-age 40d` を回す
- 復元は `pg_restore --no-owner --no-privileges -d <接続文字列> <ファイル>`

## フェーズ3: 実戦投入

- [ ] ステージングを自分+家族のLINEアカウントで1〜2週運用
- [ ] LINEグループにはまず2〜3家庭で試験導入 → 問題なければ全体展開
- [x] 運用ジョブを実装(GitHub Actions schedule): 未提出リマインド、日次バックアップ(pg_dump→R2+自宅Proxmox)、Supabase停止対策ping
- [ ] 運用ジョブを有効化(上表のシークレットを stg/prod ぶん設定する。「運用ジョブ」節)
- [ ] プライバシーポリシー掲示・卒団時の削除フロー確認

## Claude Code の回し方のコツ

- 指示には**ドキュメント参照を明示**する: 「`docs/REQUIREMENTS.md` §4.2-6 を読んでから Issue #12 を実装して」(CLAUDE.md は自動で読まれる)
- 大きめのタスクは Plan モードで計画→承認→実装。計画は `.claude/plans/<スラグ>/` に plan.md / task.md として残すと後から追える(運用は `.claude/skills/issue-plan/SKILL.md`)
- **同じ作業を2回やったらSkill化**: マイグレーション作成、画面追加、LINE送信テストなどを skill-creator で `.claude/skills/` に作成しコミット
- PRレビューは Claude Code GitHub Action で自動化。指摘の採否は自分で判断
- 仕様に迷いが出たら、実装前に REQUIREMENTS.md を更新 → その差分をIssueに貼ってから実装させる。この順序だけ崩さなければドメイン知識はブレない
- CLAUDE.md の「絶対原則」と衝突する要望をClaude Codeが受けたら、実装せず選択肢を提示させる(CLAUDE.mdに明記済み)
