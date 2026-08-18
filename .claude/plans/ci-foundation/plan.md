# Plan: CIを先に通す(Biome / tsc / Vitest / Playwright最小)

Issue: [#3](https://github.com/kchan-lab/hoopo/issues/3)
設計の正: docs/DEVELOPMENT.md「フェーズ0」「テスト戦略」/ CLAUDE.md 絶対原則1(ランニングコスト原則ゼロ)

## 目的

機能実装より先に PR ごとの自動チェックをグリーンにし、以後 Claude Code が生成するコードすべてに
安全網がかかる状態を作る。**この Issue の争点は「CI が PR ごとに動き、グリーンになること」**であり、
テストの中身の充実は対象外(実ロジックのテストは各縦切り Issue で追加する)。

## 方針

### 対象と非対象

| | 内容 | この Issue で |
|---|---|---|
| Lint | Biome `check` | ✅ CI に入れる |
| 型 | TypeScript 7 `tsc --noEmit`(全ワークスペース) | ✅ CI に入れる |
| Unit | Vitest。**サンプルテスト1本のみ** | ✅ CI に入れる |
| Integration | Vitest + ローカル Supabase | ❌ Issue #6(DBスキーマ)待ち。対象が存在しない |
| E2E | Playwright 最小の雛形 | ⚠️ コミットするが **PR の CI には入れない** |
| 供給網 | Renovate / CodeQL / secret scanning | ✅ 有効化する |

### ワークフロー構成

`.github/workflows/ci.yml` 1本に、独立した3ジョブを並列で置く:

```
ci.yml
├─ lint       … biome check .
├─ typecheck  … pnpm -r typecheck
└─ test       … vitest run
```

- 共通セットアップ: pnpm 11.18.0(`packageManager` 準拠)→ Node 24 + pnpm キャッシュ → `pnpm install --frozen-lockfile`
- トリガーは `pull_request`(development / main 宛て)。同一 PR への再 push で古い実行を止める `concurrency` を設定
- ローカルとコマンドを一致させる(`pnpm lint` / `pnpm typecheck` / `pnpm test`)。CI 専用のコマンドを作らない

各ジョブ共通の4ステップ(順序に依存関係がある):

```yaml
- uses: actions/checkout@v5
- uses: pnpm/action-setup@v4      # ← setup-node より前。逆だと cache: pnpm が pnpm を見つけられない
- uses: actions/setup-node@v5     #   バージョンは書かない(root の packageManager から解決される)
  with: { node-version: 24, cache: pnpm }
- run: pnpm install --frozen-lockfile
```

### 既存資産と新規追加の切り分け

| 対象 | 現状 | この Issue で |
|---|---|---|
| `pnpm lint`(`biome check .`)| root `package.json` に既存、`biome.json` あり | CI から呼ぶ配線のみ |
| `pnpm typecheck`(`pnpm -r typecheck`)| root + 全6ワークスペースに `tsc --noEmit` 既存 | CI から呼ぶ配線のみ |
| `pnpm test`(Vitest)| **存在しない** | 依存・設定・スクリプト・サンプルテストをゼロから |
| `pnpm test:e2e`(Playwright)| **存在しない** | 同上 + compose の `e2e` プロファイル |

実質の新規作業はテスト基盤と供給網まわりで、lint / typecheck は既存スクリプトを CI から叩くだけ。

### 設計判断

1. **テストの中身はサンプル1本に留める**: この Issue の目的は CI パイプラインの確立であり、
   テスト対象の実ロジックはまだ存在しない(packages は空の `src/index.ts` のみ)。
   退けた案は「LINE 通数計算を先に実装してテストする」— 動く題材にはなるが CI の Issue に
   機能実装が混ざり、1 Issue = 1 関心事に反する。実ロジックのテストは縦切り実装の受入条件に含まれる
2. **3ジョブ並列(1ジョブ直列にしない)**: install が3回走るが pnpm キャッシュで吸収できる。
   分けることで失敗箇所が PR のチェック一覧で一目で分かり、**Issue #4 のブランチ保護で
   「必須チェック」を個別に指定できる**。public リポジトリのため Actions 分数は無料(絶対原則1)
3. **Integration テストは含めない**: ローカル Supabase を CI で起動する仕組みは作れるが、
   検証すべき RLS もスキーマも Issue #6 まで存在しない。空の Integration ジョブは
   「動いているつもり」を生むだけなので、#6 で実物と同時に追加する
4. **Playwright は PR の CI に含めない**: docs/DEVELOPMENT.md の定め(フル E2E は
   リリース PR と nightly)。この Issue では**雛形が動く状態でコミットされていること**までを担保し、
   nightly / リリース PR での実行は Issue #4 のリリースフロー整備と合わせて入れる
5. **Playwright は compose の `e2e` プロファイルで動かす**: CLAUDE.md「ローカル開発は Docker で統一」に
   従い、WSL2 ホストにブラウザ依存を入れない。プロファイルを分けるので通常の `make dev` では
   起動せず、約2GB の公式イメージは E2E を実際に回すときだけ取得される。
   退けた案はホストへの `playwright install --with-deps` — 軽いが Docker 統一から外れる
6. **CodeQL はワークフローファイルで入れる**(UI の default setup を使わない): 設定が差分として
   レビューでき、再現性がある。public リポジトリなので CodeQL は無料
7. **Node 24 / pnpm 11.18.0 で Docker 環境と揃える**: `docker/dev.Dockerfile` が node:24-slim、
   root `package.json` が `packageManager: pnpm@11.18.0`。CI だけ別バージョンにすると
   「ローカルで通るのに CI で落ちる」を生む
8. **Renovate は GitHub App を使う**: 標準構成で無料。self-hosted(Actions + PAT)は
   Secrets の管理対象が増えるため退けた。`renovate.json` はこの PR で入れるが、
   **App のインストールは GitHub 画面での承認者の操作が必要**(task.md に明記)
9. **typecheck ジョブに `next build` を入れない**: `apps/portal` の tsconfig は
   `next-env.d.ts`(`.gitignore:8` で除外)と `.next/types/**/*.ts` を include しているため
   「CI のクリーンチェックアウトではビルドが要るのでは」を検証した。両方を退避して
   `tsc --noEmit` を実行し **exit=0** を確認したので不要と判断。ビルドを挟む案は
   typecheck の所要時間を数倍にするため退けた。
   ただし現状の app は雛形(`layout.tsx` / `page.tsx` のみ)であり、typed routes や
   `next/image` の型を実際に使い始めた縦切り実装で崩れる可能性がある。
   その時点で typecheck ジョブに `pnpm build` を足す

### 追加するファイル

| パス | 役割 |
|---|---|
| `.github/workflows/ci.yml` | lint / typecheck / test の3ジョブ |
| `.github/workflows/codeql.yml` | CodeQL(javascript-typescript) |
| `renovate.json` | Renovate 設定(Asia/Tokyo、lockFileMaintenance) |
| `vitest.config.ts` | Unit テストの対象範囲 |
| `packages/line/src/index.test.ts` | サンプルテスト1本(実ロジック実装時に差し替える旨をコメント) |
| `playwright.config.ts` | portal(:8000)/ admin(:8001)を対象。`webServer` は使わない |
| `e2e/smoke.spec.ts` | トップページが表示されることの確認 |
| `compose.yaml` | `e2e` プロファイルで playwright サービスを追加 |
| `package.json` | `test` / `test:e2e` スクリプトを追加 |

## 完了条件

- PR で `lint` / `typecheck` / `test` の3チェックが実行され、すべてグリーンになる
- ローカルで `pnpm lint` / `pnpm typecheck` / `pnpm test` が通る
- `pnpm test:e2e` で最小 E2E が実際に動く(起動済みの portal / admin に対して実行し、結果を確認する)
- `renovate.json` がコミットされ、App 導入手順が task.md に残っている
- CodeQL が PR で実行されグリーン
- secret scanning + push protection が有効になっている
