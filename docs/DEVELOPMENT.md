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
- [ ] main / dev ブランチを保護(直push禁止・CI必須)。1人開発でも feat/xxx → dev → main のPRフローで統一(Vercelプレビュー確認とAIレビューを挟むため。詳細は「ブランチ戦略・リリースフロー」)
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
3. PR作成(dev宛て) — CIグリーン + Claude Code Action のAIレビュー
4. Vercelプレビューを**スマホ実機**で確認
5. マージ(仕様との差分に気づいたら、コードではなく先に REQUIREMENTS.md を直す)

### Issueテンプレート(例)

```
## 目的
参加予定の提出をプルダウン3値+コメントに対応する

## 参照
docs/REQUIREMENTS.md §4.2-6 / docs/DESIGN_GUIDELINES.md §1.3(提出行・カレンダー)

## 受入条件
- [ ] リスト/カレンダーの選択状態が同期する
- [ ] 「途中参加・早退」選択時のみコメント欄が表示される
- [ ] 管理側の出欠マトリクスに ○/△/×/− が反映される
```

## テスト戦略(Unit / Integration / E2E の3層で全網羅)

| 層 | ツール | このプロジェクトで担保すること |
|---|---|---|
| Unit | Vitest | 純ロジック: LINE通数計算、年度更新(学年+1/卒団)、日付・曜日処理(Asia/Tokyo)、提出3値のバリデーション、招待コード生成。DB不要で高速、各パッケージ隣接の `*.test.ts` |
| Integration | Vitest + ローカルSupabase(Docker) | HonoのAPIを `app.request()` で直接叩き、実Postgresに対して検証。**RLSの越境テスト(他team_idのデータが見えない/書けないこと)を必須ケースにする**。LINE APIはモック。マイグレーション適用後、テストごとにDBをリセット |
| E2E | Playwright | docker compose起動済みの portal(:8000)/admin(:8001) に対して主要導線を通す: 登録→自動認定通知、日程入力→発行(LINE送信はスタブ)→保護者で確認、提出3値→出欠/欠席者反映、月謝の済⇄未。スマホ(iPhoneビューポート)とPCの両方。LIFF認証はテスト用セッションCookie注入でバイパス |

- 実行: `pnpm test`(unit)/ `pnpm test:int`(integration)/ `pnpm test:e2e`(E2E)
- CI: **PRごとに Unit + Integration のみ**を実行(E2EはPRのCIに含めない)
- E2E: フロント系の実装をしたら、**コミット前にローカルでE2Eを回して確認する専用Skill(`e2e-check`)**で担保する(docker compose起動→対象導線のPlaywright実行→結果要約までをSkill化)。フルE2Eは **dev→mainのリリースPR** と nightly のCIで実行
- カバレッジ方針: `packages/api` `packages/db` のロジックは80%を目安に計測。UIは数値を追わず、主要導線がE2Eで通ることを基準にする
- 新機能の縦切り1本 = Unit(ロジック)+ Integration(API+RLS)+ E2E(導線1本)をセットでIssueの受入条件に含める

## ブランチ戦略・リリースフロー

```
feat/xxx ──PR──▶ dev(=ステージング) ──リリースPR──▶ main(=本番) ──直後──▶ vX.Y.Z タグ + Release
hotfix/xxx ─────────────────────────────────────────▶ main(緊急時のみ。devへback-merge)
```

- **feat/xxx**: Issue単位で作成し dev へPR。CIは Unit + Integration、Vercelの使い捨てプレビューURLで確認
- **dev(ステージング)**: マージで固定のstgドメインへ自動デプロイ。DBは**2つ目のSupabase Freeプロジェクト(stg用)**を使い本番と完全分離(無料枠内)。`e2e-check` Skill・家族テストはここに対して実施
- **main(本番)**: リリースしたいタイミングで dev→main の**リリースPR**を作成(Actionsで週次自動起票も可)。**このPRでのみフルE2EをCI実行**し、グリーンでマージ → 本番Supabaseへマイグレーション適用 → Vercel本番デプロイ
- **タグ・リリースノート(release-please)**: Conventional Commits(`feat:`=minor / `fix:`=patch / `BREAKING CHANGE`=major)からバージョンを自動計算し、CHANGELOG込みの「release: vX.Y.Z」PRを常時維持。マージした瞬間にタグ打ち+GitHub Release発行+CHANGELOG更新が完了する。**タグはデプロイのトリガーではなく版の記録とロールバックの目印**(ロールバック自体はVercelの過去デプロイ再昇格で即時)
- **保護者向けお知らせは別物**: GitHub Releaseは開発者向け文面。`release-notes` Skillが `git log 前タグ..HEAD` と関連Issueを読み、保護者向けお知らせの下書き(です・ます調・専門用語なし)まで生成 → コーチが確認して掲載
- リリース完了・CI失敗は Discord へWebhook通知

## フェーズ3: 実戦投入

- [ ] ステージングを自分+家族のLINEアカウントで1〜2週運用
- [ ] LINEグループにはまず2〜3家庭で試験導入 → 問題なければ全体展開
- [ ] 運用ジョブを有効化(GitHub Actions schedule): 未提出リマインド、日次バックアップ(pg_dump→R2+自宅Proxmox)、Supabase停止対策ping
- [ ] プライバシーポリシー掲示・卒団時の削除フロー確認

## Claude Code の回し方のコツ

- 指示には**ドキュメント参照を明示**する: 「`docs/REQUIREMENTS.md` §4.2-6 を読んでから Issue #12 を実装して」(CLAUDE.md は自動で読まれる)
- 大きめのタスクは Plan モードで計画→承認→実装。計画は `docs/plans/` に残すと後から追える
- **同じ作業を2回やったらSkill化**: マイグレーション作成、画面追加、LINE送信テストなどを skill-creator で `.claude/skills/` に作成しコミット
- PRレビューは Claude Code GitHub Action で自動化。指摘の採否は自分で判断
- 仕様に迷いが出たら、実装前に REQUIREMENTS.md を更新 → その差分をIssueに貼ってから実装させる。この順序だけ崩さなければドメイン知識はブレない
- CLAUDE.md の「絶対原則」と衝突する要望をClaude Codeが受けたら、実装せず選択肢を提示させる(CLAUDE.mdに明記済み)
