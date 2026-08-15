# Task: CIを先に通す(Biome / tsc / Vitest / Playwright最小)

Issue: [#3](https://github.com/kchan-lab/hoopo/issues/3) / Plan: [plan.md](plan.md)

## CI ワークフロー

- [x] `.github/workflows/ci.yml` を作成(lint / typecheck / test の3ジョブ + concurrency)
- [x] 共通4ステップの順序を守る(`pnpm/action-setup` → `setup-node` with `cache: pnpm`)
- [x] lint / typecheck は既存の root スクリプトをそのまま呼ぶ(CI 専用コマンドを作らない)
- [ ] pnpm キャッシュ + `--frozen-lockfile` で install が再現可能なことを確認(PR の初回実行で確認する)

## Unit テスト基盤

- [x] Vitest を導入し `vitest.config.ts` で対象範囲を定義(`e2e/` を除外し Playwright と二重実行しない)
- [x] root `package.json` に `test` スクリプトを追加
- [x] サンプルテスト1本を追加(`packages/line/src/index.test.ts`。差し替える旨をコメントで明記)
- [x] ローカルで `pnpm test` がグリーンになることを確認

## E2E 雛形(PR の CI には含めない)

- [x] Playwright を導入し `playwright.config.ts` を作成(`webServer` 不使用、desktop / mobile の2プロジェクト)
- [x] `e2e/smoke.spec.ts`(portal / admin のトップページ表示)と `e2e/urls.ts`(接続先の切り替え)を追加
- [x] `compose.yaml` に `e2e` プロファイルで playwright サービスを追加(+ portal / admin に healthcheck)
- [x] root `package.json` に `test:e2e` スクリプトを追加
- [x] `make dev SERVICES="portal admin"` → `pnpm test:e2e` を実際に回して通ることを確認 → `make down`
      (healthcheck が効いて Healthy 待ちの後に実行され、**4 tests passed** = smoke 2本 × desktop/mobile)

## 供給網・セキュリティ

- [x] `renovate.json` を追加(Asia/Tokyo、lockFileMaintenance、脆弱性は即時 PR)
- [x] `.github/workflows/codeql.yml` を追加(javascript-typescript + 週次スケジュール)
- [ ] **【承認者の作業】** Renovate GitHub App をリポジトリにインストールする(画面操作。AI からは実行不可)
      https://github.com/apps/renovate → Install → kchan-lab/hoopo を選択
- [ ] **【要承認】** secret scanning + push protection を有効化する(リポジトリ設定の変更のため事前に確認を取る)

## 仕上げ

- [x] docs/DEVELOPMENT.md のテスト戦略と、実際のコマンド・CI 構成に食い違いがないか確認
      (`pnpm test` / `pnpm test:e2e` は一致。`pnpm test:int` は Issue #6 で追加する未実装コマンド)
- [ ] PR 作成 → CI グリーン → development へ squash マージ(`Closes #3`)
- [ ] マージ後、`development` で CodeQL / CI が想定どおり動いたことを確認

## 途中で入れた計画外の変更(レビュー時に見るところ)

- **root `package.json` に `"type": "module"`**: 無いと Vite が
  「ESM syntax in a file loaded as CommonJS」の警告を出し、将来の Vite で破壊的変更になる。
  各アプリ・パッケージは自前の `package.json` を持つため影響は root 直下のファイルのみに閉じる
- **root `tsconfig.json` を新規追加 + `typecheck` を `tsc --noEmit && pnpm -r typecheck` に変更**:
  `pnpm -r typecheck` はワークスペースだけが対象で、`e2e/` と `*.config.ts` が
  型検査から漏れていた。E2E コードを無検査にしないため root 分を足した
- **`@types/node` を root に追加**: 上記 root tsconfig で `process.env` を解決するため

## この Issue でやらないこと(意図的な非対象)

- Integration テスト(ローカル Supabase)… Issue #6 でスキーマと同時に追加する
- E2E の nightly / リリース PR 実行 … Issue #4 のリリースフロー整備と合わせて入れる
- 実ロジックのテスト充実 … 各縦切り Issue の受入条件に含まれる
