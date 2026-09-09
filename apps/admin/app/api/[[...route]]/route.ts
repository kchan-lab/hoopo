import {
  type AdminApiDeps,
  type AdminLineLoginDeps,
  createAdminApi,
  createJobsApi,
  type JobsApiDeps,
} from "@hoopo/api";
import {
  createFakeIdTokenVerifier,
  createLineIdTokenVerifier,
  exchangeAuthorizationCode,
} from "@hoopo/line";
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { liffUrl, lineClient, portalUrl } from "../../../lib/line";

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

// LINE ログイン(admin-line-login/plan.md)。フェイクはローカル/E2E 専用で、
// 実チャネル(#9)未取得でも導線を貫通させる(本番は verifier のファクトリ側が拒否する)
function buildLineLoginDeps(): AdminLineLoginDeps {
  if (process.env.AUTH_FAKE === "1") {
    return {
      channelId: "",
      channelSecret: "",
      verifyIdToken: createFakeIdTokenVerifier(),
      exchangeCode: exchangeAuthorizationCode,
      fake: true,
    };
  }
  // ID トークンの verify も認可コードの交換も LINE ログインチャネル宛て(LIFF とは別チャネル)。
  // 未設定(#9 取得前)でも管理画面は起動させ、LINE ログイン開始時に「準備中」で案内する
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID ?? "";
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET ?? "";
  return {
    channelId,
    channelSecret,
    verifyIdToken: channelId
      ? createLineIdTokenVerifier(channelId)
      : async () => ({
          ok: false,
          reason: "LINE ログインチャネルが未設定です",
        }),
    exchangeCode: exchangeAuthorizationCode,
    fake: false,
  };
}

function buildDeps(): AdminApiDeps {
  return {
    teamId: requireEnv("TEAM_ID"),
    sessionSecret: requireEnv("SESSION_SECRET"),
    secureCookie: process.env.VERCEL === "1",
    // LINE userId の暗号化・検索キーは portal と共通の鍵を使う
    encryptionKey: requireEnv("LINE_ID_ENCRYPTION_KEY"),
    hmacKey: requireEnv("LINE_ID_HMAC_KEY"),
    lineLogin: buildLineLoginDeps(),
    // LINE グループ送信(line-send/plan.md 6c-1)。組み立ては lib/line.ts に集約し、
    // 通数メーターを描くサーバーコンポーネントと同じクライアントを使う
    line: { client: lineClient() },
    portalUrl: portalUrl(),
    liffUrl: liffUrl(),
  };
}

// 定期ジョブ(#20。attendance-reminder/plan.md 設計判断2)。GitHub Actions が
// Authorization: Bearer <CRON_SECRET> で叩く。CRON_SECRET 未設定なら 503 を返して無効化する
function buildJobsDeps(): JobsApiDeps {
  return {
    teamId: requireEnv("TEAM_ID"),
    cronSecret: process.env.CRON_SECRET || null,
    line: {
      client: lineClient(),
      portalUrl: portalUrl(),
      liffUrl: liffUrl(),
    },
  };
}

let app: Hono | undefined;

function getApp(): Hono {
  if (!app) {
    app = new Hono()
      .basePath("/api")
      // Cookie 認証の管理 API より先に、Bearer 認証のジョブ API を /api/jobs に載せる
      .route("/jobs", createJobsApi(buildJobsDeps()))
      .route("/", createAdminApi(buildDeps()));
  }
  return app;
}

const handler = (req: Request) => handle(getApp())(req);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
