import { type ApiDeps, createApi } from "@hoopo/api";
import {
  createFakeIdTokenVerifier,
  createLineIdTokenVerifier,
} from "@hoopo/line";
import { Hono } from "hono";
import { handle } from "hono/vercel";

// Hono を Route Handler にマウントする(CLAUDE.md 技術スタック)。
// env の読み取りはここ(アプリ側)の責務。ビルド時に env が無くても落ちないよう遅延初期化する

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません(.env を確認)`);
  }
  return value;
}

function buildDeps(): ApiDeps {
  return {
    // フェイク認証はローカル/E2E 専用(plan.md 設計判断6。本番はファクトリ側で拒否)
    verifyIdToken:
      process.env.AUTH_FAKE === "1"
        ? createFakeIdTokenVerifier()
        : createLineIdTokenVerifier(requireEnv("LINE_CHANNEL_ID")),
    teamId: requireEnv("TEAM_ID"),
    sessionSecret: requireEnv("SESSION_SECRET"),
    encryptionKey: requireEnv("LINE_ID_ENCRYPTION_KEY"),
    hmacKey: requireEnv("LINE_ID_HMAC_KEY"),
    secureCookie: process.env.VERCEL === "1",
  };
}

let app: Hono | undefined;

function getApp(): Hono {
  if (!app) {
    app = new Hono().basePath("/api").route("/", createApi(buildDeps()));
  }
  return app;
}

const handler = (req: Request) => handle(getApp())(req);

export const GET = handler;
export const POST = handler;
