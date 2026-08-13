# Plan: pnpm workspaces でモノレポ骨格を作成

Issue: [#1](https://github.com/kchan-lab/hoopo/issues/1)
設計の正: CLAUDE.md「モノレポ構成」「技術スタック」 / docs/DEVELOPMENT.md フェーズ0

## 目的

apps/portal・apps/admin・packages/{api,db,ui,line} のモノレポ骨格を作り、
以後の実装の置き場所を確定する。空の状態でも `pnpm build` / `pnpm typecheck` が通ること。

## 方針

- pnpm workspaces(`apps/*` + `packages/*`)。ルートに TypeScript strict の共通 tsconfig と Biome
- apps は Next.js (App Router) の最小構成(layout + page のみ、スタイルなし)。
  dev サーバーは CLAUDE.md のポート分岐に合わせ portal=8000 / admin=8001
- packages は `src/index.ts` だけのプレースホルダ。apps から `workspace:*` で参照し、
  依存グラフの置き場所を今のうちに確定する

### 設計判断

1. **packages はビルドせず TS ソースを直接 export**(`exports` → `./src/index.ts`、
   apps 側 `transpilePackages` で取り込み): 骨格段階で dist 生成の tsconfig 二重管理を避ける。
   退けた案は各パッケージで dist を emit する構成。packages/api を SDK として配布する段階で切り替える
2. **TypeScript は 7 系(ネイティブコンパイラ)を採用**(`^7.0.2`): 脆弱性対応と今後の
   バージョンアップを見据え極力最新版を使う方針(承認者の指示)。Next.js 16 は TS7 の
   コンパイラ API に未対応のため `experimental.useTypeScriptCli` を有効化して TS CLI 経由で
   型チェックする(実測で build/typecheck/lint 全グリーン、型チェックは約6倍高速)。
   後続で入れる Drizzle / Hono 等で peerDeps 競合が出た場合はその時点で相談
3. **Next.js 16 / React 19 / Biome 2 は現行最新のメジャーを採用**: 新規リポジトリのため
   旧メジャーを選ぶ理由がない

## 完了条件

- `pnpm install` → `pnpm build` / `pnpm typecheck` / `pnpm lint` がすべてグリーン
- `apps/portal` `apps/admin` `packages/api` `packages/db` `packages/ui` `packages/line` が存在し、
  ルートの strict tsconfig / Biome 設定が全ワークスペースに適用されている
