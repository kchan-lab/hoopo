# Task: docker compose でローカル開発環境を定義

Issue: [#2](https://github.com/kchan-lab/hoopo/issues/2) / Plan: [plan.md](plan.md)

- [x] docker/dev.Dockerfile(node:24-slim + pnpm)と docker-compose.yml(portal:8000 / admin:8001)
- [x] Supabase CLI を devDependency で導入し `supabase init`(config.toml をコミット)
- [x] .env.example(SUPABASE_URL / DATABASE_URL 等の接続情報)
- [x] docs/LOCAL_DEV.md(セットアップ手順・cloudflared トンネル手順)
- [x] 検証: `docker compose up` → :8000 / :8001 応答、`supabase start` → スタック起動(API 200・コンテナ12個)
- [ ] PR 作成 → CI グリーン → development へ squash マージ(`Closes #2`)
