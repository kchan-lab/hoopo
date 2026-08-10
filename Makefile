# hoopo ローカル開発環境の操作。詳細は docs/LOCAL_DEV.md
# 起動するサービスは SERVICES で指定する(既定: portal admin)
#   make up                       … 対話で選んでから起動
#   make dev                      … portal + admin を起動
#   make dev SERVICES="portal supabase"
#   make dev SPLIT=tmux           … tmux セッションを作ってログをペイン分割

SERVICES ?= portal admin
SPLIT ?= auto
export SPLIT

.DEFAULT_GOAL := help
.PHONY: help up dev down logs urls

help: ## このヘルプを表示
	@printf '\n  \033[1mhoopo ローカル開発環境\033[0m\n\n'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36mmake %-6s\033[0m %s\n", $$1, $$2}'
	@printf '\n  \033[2m起動するサービス: 1) portal :8000  2) admin :8001  3) supabase :54321-54324\033[0m\n\n'

up: ## 起動するサービスを選んでから起動する(Enter で portal + admin)
	@bash scripts/dev.sh select

dev: ## SERVICES を起動する(既定: portal admin)
	@bash scripts/dev.sh up $(SERVICES)

down: ## すべて停止する(アプリ + Supabase)
	@bash scripts/dev.sh down

logs: ## ログを追う(既定: portal admin)
	@bash scripts/dev.sh logs $(SERVICES)

urls: ## 接続先の一覧を表示する
	@bash scripts/dev.sh urls
