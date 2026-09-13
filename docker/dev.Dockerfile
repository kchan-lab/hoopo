# ローカル開発専用イメージ(本番ビルドは Vercel が行うため、本番用 Dockerfile は存在しない)
FROM node:24-slim

# corepack は Node 25 以降同梱廃止の流れのため、pnpm を明示インストールする
RUN npm install -g pnpm@11.18.0

WORKDIR /app

# ソースは docker-compose.yml で bind mount する(COPY しない)
CMD ["bash"]
