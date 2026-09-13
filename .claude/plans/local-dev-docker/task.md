# Task: docker compose でローカル開発環境を定義

Issue: [#2](https://github.com/kchan-lab/hoopo/issues/2) / Plan: [plan.md](plan.md)

- [x] docker/dev.Dockerfile(node:24-slim + pnpm)と compose.yaml(V2準拠、portal:8000 / admin:8001)
- [x] Supabase CLI を devDependency で導入し `supabase init`(config.toml をコミット)
- [x] .env.example(SUPABASE_URL / DATABASE_URL 等の接続情報)
- [x] docs/LOCAL_DEV.md(セットアップ手順・cloudflared トンネル手順)
- [x] Makefile + scripts/dev.sh(`make up` の対話選択・URL一覧表示・OS別のペイン分割案内)
- [x] 依存コマンドの事前チェック(未導入ならOS別の導入コマンドを表示して停止)
- [x] 検証: `docker compose up` → :8000 / :8001 応答、`supabase start` → スタック起動(API 200・コンテナ12個)
- [x] 検証: `make up` 相当(Enter=1,2 / 不正入力の再入力 / `1,3` の複数選択 / .env 自動生成+キー補完 / tmux 3ペイン)
- [ ] PR 作成 → CI グリーン → development へ squash マージ(`Closes #2`)
