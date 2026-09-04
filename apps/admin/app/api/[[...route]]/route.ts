import { type AdminApiDeps, createAdminApi } from "@hoopo/api";
import { Hono } from "hono";
import { handle } from "hono/vercel";

// Hono を Route Handler にマウントする(apps/portal と同パターン)。
// 管理 API は Cookie・role を保護者 API と分離した createAdminApi を使う(絶対原則6)。
// env の読み取りはアプリ側の責務。ビルド時に env が無くても落ちないよう遅延初期化する

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません(.env を確認)`);
  }
  return value;
}

function buildDeps(): AdminApiDeps {
  return {
    teamId: requireEnv("TEAM_ID"),
    sessionSecret: requireEnv("SESSION_SECRET"),
    secureCookie: process.env.VERCEL === "1",
  };
}

let app: Hono | undefined;

function getApp(): Hono {
  if (!app) {
    app = new Hono().basePath("/api").route("/", createAdminApi(buildDeps()));
  }
  return app;
}

const handler = (req: Request) => handle(getApp())(req);

export const GET = handler;
export const POST = handler;
