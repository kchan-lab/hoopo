# Task: pnpm workspaces でモノレポ骨格を作成

Issue: [#1](https://github.com/kchan-lab/hoopo/issues/1) / Plan: [plan.md](plan.md)

- [x] ルート: package.json / pnpm-workspace.yaml / tsconfig.base.json / biome.json / .gitignore
- [x] apps/portal・apps/admin(Next.js 最小構成、ポート 8000 / 8001)
- [x] packages/api・db・ui・line(src/index.ts プレースホルダ、apps から workspace:* 参照)
- [x] `pnpm install` → `pnpm build` / `pnpm typecheck` / `pnpm lint` がグリーン
- [ ] PR 作成 → CI グリーン → development へ squash マージ(`Closes #1`)
