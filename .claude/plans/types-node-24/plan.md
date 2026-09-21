# Plan: @types/node を Node 24 系にそろえる

Issue: [#209](https://github.com/kchan-lab/hoopo/issues/209)
設計の正: CLAUDE.md(技術スタック)/ `.github/workflows/ci.yml`・`e2e.yml`(`node-version: 24`)/ `docker/dev.Dockerfile`(`node:24-slim`)

## 目的

`@types/node` の指定がワークスペース内で 24 系(ルート・db・portal・admin)と 26 系(api・line)に分かれており、
Renovate が両系統の更新を 1 本の PR(#197)にまとめた際にロックファイルを全部 26.6.2 に解決して壊した。
型定義を実行環境の Node 24 にそろえて 1 系統にし、Renovate の更新が壊れ続ける状態を解消する。

## 方針

- ワークスペース全体の `@types/node` を `^24.13.6` に統一する(api・line は `^26.3.0` から、他は `^24.0.0` / `^24.13.3` から)
- api の `session.ts` は `CryptoKey` を型名として使っていた(26 系でのみ型として公開)。戻り値型を `crypto.subtle.importKey` から推論させ、Web 標準 API のみの方針を保つ
- `renovate.json` に `@types/node` の `allowedVersions: "<25"` を追加し、Node 本体を上げるまで 25 以上を提案させない
- `pnpm install` でロックファイルを作り直し、全 importer が 24 系の同一バージョンに解決されることを確認する

### 設計判断

1. **26 系ではなく 24 系にそろえる**: 実行環境(CI・Vercel・Docker)は Node 24。26 系の型だと Node 24 に無い API を
   型エラーなしで書けてしまい、実行時に初めて落ちる。api/line の `^26` は #60 で当時の最新を入れただけで、
   26 固有 API への依存はない(使っているのは fs / path / url / events 等の基本モジュールのみ)
2. **Renovate はメジャーを制限する(グループ分けではなく)**: `@types/node` だけ別グループにする案もあるが、
   2 系統が残る限り同種の衝突は再発し得る。系統を 1 つにし、実行環境と揃わないメジャーはそもそも提案させない。
   Node 本体を上げるときに `allowedVersions` も一緒に上げる

## 完了条件

- ワークスペース内の `@types/node` の指定とロックファイルの解決バージョンがすべて 24 系で一致
- lint / typecheck / test / test-int がグリーン
