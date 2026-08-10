#!/usr/bin/env bash
# ローカル開発環境の起動ヘルパー(Makefile から呼ばれる。make が無い環境では直接実行できる)
# 手順・トラブルシュートは docs/LOCAL_DEV.md
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -t 1 ]; then
  B=$'\033[1m'; D=$'\033[2m'; R=$'\033[0m'
  C=$'\033[36m'; G=$'\033[32m'; Y=$'\033[33m'
else
  B=""; D=""; R=""; C=""; G=""; Y=""
fi

step() { printf '\n%s▸ %s%s\n' "$B" "$1" "$R"; }
info() { printf '  %s%s%s\n' "$D" "$1" "$R"; }
warn() { printf '  %s! %s%s\n' "$Y" "$1" "$R"; }

# ---- 依存コマンドの確認 ----------------------------------------------

os_kind() {
  case "$(uname -s)" in
    Darwin) echo mac ;;
    *) if grep -qi microsoft /proc/version 2>/dev/null; then echo wsl; else echo linux; fi ;;
  esac
}

install_hint() {
  case "$1:$(os_kind)" in
    make:mac) echo "xcode-select --install" ;;
    make:*) echo "sudo apt-get install -y make" ;;
    tmux:mac) echo "brew install tmux" ;;
    tmux:*) echo "sudo apt-get install -y tmux" ;;
    curl:mac) echo "brew install curl" ;;
    curl:*) echo "sudo apt-get install -y curl" ;;
    pnpm:*) echo "npm install -g pnpm@11.18.0" ;;
    node:mac) echo "brew install node(または volta / nvm)" ;;
    node:*) echo "volta install node(または nvm)" ;;
    docker:mac) echo "Docker Desktop を導入する https://docs.docker.com/desktop/" ;;
    docker:wsl) echo "Docker Desktop を導入し WSL 統合を有効にする https://docs.docker.com/desktop/features/wsl/" ;;
    docker:*) echo "https://docs.docker.com/engine/install/" ;;
    *) echo "各公式ドキュメントを参照してください" ;;
  esac
}

require_cmd() {
  local cmd=$1 why=${2:-}
  command -v "$cmd" >/dev/null 2>&1 && return 0
  printf '  %s✗ %s が見つかりません%s%s\n' "$Y" "$cmd" "${why:+ — $why}" "$R"
  printf '    導入: %s%s%s\n' "$B" "$(install_hint "$cmd")" "$R"
  return 1
}

preflight() {
  local want_supabase=$1 missing=0
  step "必要なコマンドを確認します"
  require_cmd docker "コンテナの起動に必要" || missing=1
  if command -v docker >/dev/null 2>&1; then
    if ! docker compose version >/dev/null 2>&1; then
      printf '  %s✗ docker compose (V2) が使えません%s\n' "$Y" "$R"
      printf '    導入: %sDocker Desktop を更新する / docker-compose-plugin を入れる%s\n' "$B" "$R"
      missing=1
    elif ! docker info >/dev/null 2>&1; then
      printf '  %s✗ Docker デーモンに接続できません%s\n' "$Y" "$R"
      printf '    %sDocker Desktop を起動してください(WSL2 は WSL 統合の有効化も確認)%s\n' "$B" "$R"
      missing=1
    fi
  fi
  require_cmd curl "起動確認(HTTP 応答待ち)に必要" || missing=1
  if [ "$want_supabase" -eq 1 ]; then
    require_cmd pnpm "Supabase CLI の実行に必要" || missing=1
  fi

  if [ "$missing" -ne 0 ]; then
    printf '\n  %s上記を導入してから実行してください%s\n\n' "$Y" "$R"
    exit 1
  fi
  info "OK"
  command -v make >/dev/null 2>&1 ||
    info "make を入れると make up / make dev が使えます: $(install_hint make)"
}

# ---- 選択(make up) ------------------------------------------------

parse_selection() {
  local raw=$1 tok out="" name ordered=""
  raw=${raw//,/ }
  for tok in $raw; do
    # macOS 標準の bash 3.2 には ${var,,} が無いため tr で小文字化する
    tok=$(printf '%s' "$tok" | tr '[:upper:]' '[:lower:]')
    case "$tok" in
      1 | portal) out+=" portal" ;;
      2 | admin) out+=" admin" ;;
      3 | supabase | db) out+=" supabase" ;;
      a | all) out=" portal admin supabase" ;;
      *) return 1 ;;
    esac
  done
  for name in portal admin supabase; do
    case " $out " in *" $name "*) ordered+=" $name" ;; esac
  done
  echo "${ordered# }"
}

cmd_select() {
  local input selected
  printf '\n%shoopo ローカル開発環境%s  %s起動するサービスを選んでください%s\n\n' "$B" "$R" "$D" "$R"
  printf '  %s1%s) portal     保護者向けアプリ    %shttp://localhost:8000%s\n' "$C" "$R" "$D" "$R"
  printf '  %s2%s) admin      管理者向けアプリ    %shttp://localhost:8001%s\n' "$C" "$R" "$D" "$R"
  printf '  %s3%s) supabase   DB スタック         %sStudio :54323 / API :54321 / Postgres :54322%s\n' "$C" "$R" "$D" "$R"
  printf '  %sa%s) すべて (1,2,3)\n\n' "$C" "$R"

  while :; do
    printf '選択 [複数可・カンマ区切り / Enter で %s1,2%s] > ' "$B" "$R"
    read -r input || input=""
    if selected=$(parse_selection "${input:-1,2}"); then break; fi
    warn "1〜3 または a で指定してください(例: 1,3)"
  done

  printf '\n%s→ make dev SERVICES="%s"%s\n' "$D" "$selected" "$R"
  if command -v make >/dev/null 2>&1; then
    exec make --no-print-directory dev SERVICES="$selected"
  fi
  # make 未インストール環境でも動くようにフォールバック
  exec "${BASH_SOURCE[0]}" up $selected
}

# ---- 起動(make dev) -----------------------------------------------

wait_for_http() {
  local url=$1 name=$2 timeout=${3:-300} elapsed=0
  printf '  %s の応答を待っています' "$name"
  until curl -sf -o /dev/null "$url"; do
    if [ "$elapsed" -ge "$timeout" ]; then
      printf ' %sタイムアウト%s\n' "$Y" "$R"
      warn "docker compose logs $name で確認してください"
      return 1
    fi
    sleep 3
    elapsed=$((elapsed + 3))
    printf '.'
  done
  printf ' %s✓%s\n' "$G" "$R"
}

fill_env() {
  local key=$1 val=$2
  [ -n "$val" ] || return 0
  if grep -q "^${key}=$" .env 2>/dev/null; then
    # sed -i は GNU と BSD(macOS)で引数が異なるため、一時ファイル経由で書き換える
    sed "s|^${key}=$|${key}=${val}|" .env > .env.tmp && mv .env.tmp .env
    info ".env の ${key} を設定しました"
  fi
}

bootstrap_env() {
  local status anon service
  if [ ! -f .env ]; then
    cp .env.example .env
    info ".env を .env.example から作成しました"
  fi
  status=$(pnpm exec supabase status -o json 2>/dev/null) || return 0
  # supabase status は整形済み JSON を返すため、コロン前後の空白を許容して取り出す
  anon=$(printf '%s' "$status" | sed -n 's/.*"ANON_KEY"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  service=$(printf '%s' "$status" | sed -n 's/.*"SERVICE_ROLE_KEY"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  fill_env SUPABASE_ANON_KEY "$anon"
  fill_env SUPABASE_SERVICE_ROLE_KEY "$service"
}

start_supabase() {
  step "Supabase ローカルスタックを起動します(初回はイメージ取得で数分かかります)"
  # 完了時に接続情報の JSON を吐くが、URL はこの後の表で出すので抑制する
  pnpm exec supabase start 2>&1 | grep -v '^{"DB_URL"' || true
  # 起動済みかどうかの判定は status を正とする(start は起動済みでも非0で終わるため)
  if ! pnpm exec supabase status >/dev/null 2>&1; then
    warn "Supabase の起動に失敗しました"
    return 1
  fi
  bootstrap_env
}

print_urls() {
  local services=" $* "
  printf '\n%s起動したサービスの接続先%s\n' "$B" "$R"
  printf '  %s────────────────────────────────────────────────────────────%s\n' "$D" "$R"
  case "$services" in *" portal "*)
    printf '  portal     保護者向け     %shttp://localhost:8000%s\n' "$C" "$R" ;;
  esac
  case "$services" in *" admin "*)
    printf '  admin      管理者向け     %shttp://localhost:8001%s\n' "$C" "$R" ;;
  esac
  case "$services" in *" supabase "*)
    printf '  Studio     DB管理UI       %shttp://localhost:54323%s\n' "$C" "$R"
    printf '  API        REST/Auth      %shttp://localhost:54321%s\n' "$C" "$R"
    printf '  Postgres   DB             %spostgresql://postgres:postgres@localhost:54322/postgres%s\n' "$C" "$R"
    printf '  Mailpit    メール確認     %shttp://localhost:54324%s\n' "$C" "$R"
    printf '\n  %sコンテナ内(portal/admin)から Supabase を参照するときは%s\n' "$D" "$R"
    printf '  %slocalhost ではなく host.docker.internal を使う(.env は設定済み)%s\n' "$D" "$R" ;;
  esac
  printf '\n  %s停止: make down   ログ: make logs%s\n\n' "$D" "$R"
}

open_panes() {
  local services=("$@") s
  [ ${#services[@]} -gt 0 ] || return 0
  case "${SPLIT:-auto}" in 0 | no | off) return 0 ;; esac

  if [ -n "${TMUX:-}" ]; then
    for s in "${services[@]}"; do
      tmux split-window -d -c "$PWD" "docker compose logs -f $s"
    done
    tmux select-layout tiled >/dev/null
    info "tmux のペインに各サービスのログを表示しました"
  elif [ "${SPLIT:-auto}" = "tmux" ]; then
    if require_cmd tmux "ペイン分割に必要"; then
      attach_tmux "${services[@]}"
    fi
  elif [ "${TERM_PROGRAM:-}" = "ghostty" ]; then
    # Ghostty の分割はターミナル側のキーバインドで行う(外部プロセスからは操作できない)
    info "Ghostty なら Cmd+D / Cmd+Shift+D で分割し、各ペインで次を実行:"
    for s in "${services[@]}"; do
      info "  make logs SERVICES=$s"
    done
    info "tmux で自動分割するなら make dev SPLIT=tmux"
  else
    info "ログをペイン分割で見るには tmux 内で実行するか make dev SPLIT=tmux"
  fi
}

attach_tmux() {
  local session=hoopo first=$1 s
  shift
  tmux kill-session -t "$session" 2>/dev/null || true
  tmux new-session -d -s "$session" -c "$PWD" "docker compose logs -f $first"
  for s in "$@"; do
    tmux split-window -t "$session" -c "$PWD" "docker compose logs -f $s"
  done
  tmux select-layout -t "$session" tiled >/dev/null
  info "tmux セッション '$session' にアタッチします(抜けるには Ctrl-b d)"
  exec tmux attach -t "$session"
}

cmd_up() {
  local services=("$@") compose_targets=() want_supabase=0 s
  [ ${#services[@]} -gt 0 ] || services=(portal admin)

  for s in "${services[@]}"; do
    case "$s" in
      portal | admin) compose_targets+=("$s") ;;
      supabase) want_supabase=1 ;;
      *)
        warn "不明なサービス: $s(portal / admin / supabase のいずれか)"
        exit 1
        ;;
    esac
  done

  preflight "$want_supabase"

  [ "$want_supabase" -eq 1 ] && start_supabase

  if [ ${#compose_targets[@]} -gt 0 ]; then
    step "アプリコンテナを起動します: ${compose_targets[*]}"
    docker compose up -d "${compose_targets[@]}"
    for s in "${compose_targets[@]}"; do
      case "$s" in
        portal) wait_for_http http://localhost:8000 portal || true ;;
        admin) wait_for_http http://localhost:8001 admin || true ;;
      esac
    done
  fi

  print_urls "${services[@]}"
  open_panes "${compose_targets[@]}"
}

# ---- その他 ---------------------------------------------------------

cmd_down() {
  step "アプリコンテナを停止します"
  docker compose down
  if pnpm exec supabase status >/dev/null 2>&1; then
    step "Supabase を停止します"
    pnpm exec supabase stop
  fi
}

cmd_logs() {
  local services=("$@")
  [ ${#services[@]} -gt 0 ] || services=(portal admin)
  docker compose logs -f "${services[@]}"
}

cmd_urls() { print_urls portal admin supabase; }

case "${1:-select}" in
  select) cmd_select ;;
  up)
    shift
    cmd_up "$@"
    ;;
  down) cmd_down ;;
  logs)
    shift
    cmd_logs "$@"
    ;;
  urls) cmd_urls ;;
  *)
    warn "不明なコマンド: $1"
    exit 1
    ;;
esac
