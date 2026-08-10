---
name: e2e-check
description: コミット前のローカル動作検証ルール。フロントエンド変更は Playwright E2E が必須、バックエンド変更は Docker ローカル環境での実動作確認が必須。commit Skill の前提条件。「動作検証」「E2E」「コミット前チェック」で発動。
---

# e2e-check: コミット前のローカル動作検証

## 原則

- **「型チェックが通った」「ビルドが通った」は動作検証ではない。** 実際に動かして確認するまで
  commit Skill の案の提示に進まない
- **「名前が解決できた」「設定が読めた」も動作検証ではない。** 実際に通信・実行して結果を見る
- 検証は実装した本人(AI)がコミット前にローカルで行う。CI は安全網であって代替ではない
- 検証結果(何をどう確認したか・実行コマンド・結果)は **commit Skill の案の提示に必ず含める**。
  承認者は検証結果を見てコミットを判断する
- 検証が不十分なまま報告しない。試していないことは「試していない」と書く

## 変更種別ごとの必須検証

変更が複数種別に跨る場合は、該当するすべての手順を実施する。
環境の起動・停止は `make up` / `make dev` / `make down`(手順は docs/LOCAL_DEV.md)。

### フロントエンド(apps/portal・apps/admin・packages/ui)

1. 対象アプリを起動する: `make dev SERVICES="portal admin"`
2. **Playwright E2E を必ず実行する**: `pnpm exec playwright test`(対象を絞る場合は spec / project を指定)
   - 変更した画面・導線に対応する spec が存在しなければ、**先に spec を追加してから**検証する
     (「実装 PR には対象層のテストを必ず含める」— docs/DEVELOPMENT.md テスト戦略)
3. 判定: E2E グリーン + 変更した画面が期待どおり表示・操作できること

### バックエンド(packages/api・db・line、Route Handler)

1. ローカル環境を起動する: `make dev SERVICES="portal admin supabase"`(DB を使わないなら supabase は不要)
2. 実装した API・処理を**実際に呼んで**確認する:
   - Vitest の Integration テストを実行(API + RLS 境界)
   - 主要ケースは実応答も確認する(ステータスコード・レスポンス内容)
   - DB を触る変更は Drizzle Kit のマイグレーション適用 → シード投入 → 実データで確認
   - LINE 連携は署名検証・通数計算を Unit + 送信 API モックの Integration で確認(**実送信はしない**)
3. 判定: Integration グリーン + 主要ケースの実応答が期待どおりであること

### 開発環境・インフラ設定(compose.yaml・Dockerfile・scripts・Makefile)

1. 設定として妥当か: `docker compose config --quiet`、シェルは `bash -n`
2. **実際に起動して使う**: `make up` → 各サービスが応答するか、`make down` で後片付けできるか
3. 到達性を変える変更(ネットワーク・ホスト名・ポート)は、**その経路で実際に通信して確認する**

## 実行時のメモ

- **開発コンテナに `curl` は入っていない**(node:24-slim)。コンテナ内から HTTP を叩くときは
  `docker compose exec -T portal node -e "fetch('...').then(r=>console.log(r.status))"` を使う。
  ホストから叩くときは `curl` でよい
- コンテナからホスト側のサービス(Supabase 等)へは `host.docker.internal` を使う
- **検証が終わったら `make down` で停止する**(ポート占有と無駄なリソース消費を避ける)

## 検証結果の報告フォーマット(commit 案に含める)

| 確認項目 | 結果 |
|---|---|
| (何を確認したか) | ✅ / ❌ + 具体的な結果(ステータスコード・件数など) |

- 起動した環境(どのサービスを立てたか)も添える
- 未検証の項目がある場合は、その理由と、いつ検証するかを明記する

## 例外(動作検証を省略してよい変更)

- ドキュメント・plan/task・Skill 等の運用ファイルのみの変更
- CI・ワークフロー設定のみの変更(ただしマージ後に実際のワークフロー実行結果を確認して報告する)
- ※ Playwright 基盤の導入前(Issue #3 完了まで)は、フロントエンドの E2E を
  「ブラウザ / curl での手動確認」で代替してよい。その場合は代替した旨を検証結果に明記する
