# Plan: リリース PR でのフル E2E 実行(+nightly)

Issue: [#4](https://github.com/kchan-lab/hoopo/issues/4)
設計の正: docs/DEVELOPMENT.md「ブランチ戦略・リリースフロー」「テスト戦略」

## 目的

main へ向かう PR(リリース PR / hotfix / release-please PR)で Playwright のフル E2E を CI 実行し、
グリーンでないと本番へマージできない状態にする。あわせて development に対する nightly 実行を入れ、
E2E の腐り(アプリ変更で落ちるようになったのに気づかない状態)を毎日検知する。
これで Issue #4 が完了し、フェーズ0(リポジトリ立ち上げ)を締める。

## 方針

`.github/workflows/e2e.yml` を新設し、実行方法はローカルと同一の compose 構成を再利用する:

```
docker compose --profile e2e run --rm playwright
  └─ depends_on(service_healthy)で portal / admin が自動起動・ヘルスチェック待ち
  └─ 既存の pnpm test:e2e と同じコマンド = ローカルで再現可能
```

トリガーは3つ:

| トリガー | 対象 | 意図 |
|---|---|---|
| `pull_request`(base: main) | リリース PR / hotfix / release-please PR | 本番マージの品質ゲート |
| `schedule`(毎日 03:00 JST) | development(デフォルトブランチ) | E2E の腐り検知(nightly) |
| `workflow_dispatch` | 任意ブランチ | 手動確認・マージ後の初回検証用 |

マージ後、`workflow_dispatch` で実動作を確認してから、protect-main ルールセットの必須チェックに
`e2e` を追加して再適用する(`.github/rulesets/main.json` も更新)。

### 設計判断

1. **CI でも compose 構成を再利用する(ランナー直実行にしない)**: `pnpm test:e2e` がローカルと
   CI で完全に同一になり、メンテ箇所が compose.yaml の1箇所に閉じる。ランナー直実行
   (pnpm install + next build + next start)の方が本番ビルドに近く速いが、起動手順の二重管理になる。
   実行頻度はリリース PR + nightly のみで Actions 分数も public 無料のため、速度より一貫性を取る
2. **必須チェック `e2e` は main のみに追加(development には追加しない)**: development への
   feat PR ごとにフル E2E を回すと待ち時間が増え、E2E が薄い現段階では見合わない
   (docs/DEVELOPMENT.md「feat PR は Unit + Integration、フル E2E はリリース PR」)。
   feat 開発時のフロントエンド検証は e2e-check Skill のローカル実行が担保する
3. **release-please PR でも E2E を回す**: 変更は CHANGELOG / version.txt のみだが、
   必須チェックにする以上すべての main 向け PR で実行が必要。1回数分の追加で済み、
   「本番に入る直前の状態で必ず E2E が通っている」という保証がシンプルになる
4. **nightly は development のデフォルトブランチ実行**: `schedule` はデフォルトブランチで
   動く GitHub の仕様をそのまま使う。失敗時の通知は GitHub の実行失敗メール
   (Discord Webhook 通知は別 Issue に切り出す)
5. **失敗時は Playwright のトレース・レポートを artifact に保存**: CI 上の E2E 失敗は
   ローカル再現が面倒なので、`playwright-report` / `test-results` を失敗時のみアップロードする
6. **ルールセットへの `e2e` 追加はマージ後・実動作確認後に行う**: 動作未確認のチェックを
   必須化すると、万一動かなかった場合に main 向け PR が全部詰まるため、
   workflow_dispatch での成功を確認してから適用する
7. **アプリの前提環境(DB・.env)は CI 側でローカルと同じものを用意する**(2026-09-04 追記):
   縦切り1a(#60)でログイン導線の E2E が入った時点から nightly が毎回落ちていた。
   原因は CI に `.env` が無く(`env_file` は `required: false`)、フェイク認証・`TEAM_ID`・
   DB 接続のいずれも満たされないこと。修正は ci.yml の test-int と同じ postgres:17 サービスを
   54322 で起動し、`cp .env.example .env` → `db:migrate` → `db:seed` を流してから compose を
   起動する。`.env.example` の既定値がそのまま E2E 前提(AUTH_FAKE=1 / シード固定 TEAM_ID)に
   なっているので、前提が増えたら `.env.example` を更新すれば CI にも同時に反映される。
   あわせて失敗時に `docker compose logs portal admin` を出し、コンテナ起動失敗
   (2026-08-20/21 の `dependency failed to start`)の原因を追えるようにした

## この Issue でやらないこと(意図的な非対象)

- E2E テストケースの拡充(導線テストは各縦切り Issue の受入条件で追加)
- nightly 失敗の Discord Webhook 通知(別 Issue)
- Integration テスト(ローカル Supabase)の CI 組み込み(Issue #6)

## 完了条件

- main 向けの PR で `e2e` チェックが自動実行される
- workflow_dispatch での手動実行が成功する(4 tests passed = smoke 2本 × desktop / mobile)
- protect-main ルールセットの必須チェックに `e2e` が入り、E2E グリーンなしでは main へマージ不可
- nightly のスケジュール定義が入っている(初回実行は翌日 03:00 JST に確認)
- Issue #4 の受入条件がすべて満たされ、クローズできる
