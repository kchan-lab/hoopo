import { createFakeIdTokenVerifier } from "@hoopo/line";
import type { AdminApiDeps } from "../src/admin-app";

// LINE ログイン以外の管理 API テストが共有する deps。
// admin-line-login/plan.md で AdminApiDeps に LINE 連携の依存が加わったため、
// 各テストが同じ定型を並べずに済むよう既定値をここに集約する
// (LINE の経路そのものは admin-line-login.int.test.ts が検証する)

export function adminDeps(teamId: string, sessionSecret: string): AdminApiDeps {
  return {
    teamId,
    sessionSecret,
    secureCookie: false,
    encryptionKey: "5".repeat(64),
    hmacKey: "6".repeat(64),
    lineLogin: {
      channelId: "2000000001",
      channelSecret: "channel-secret",
      verifyIdToken: createFakeIdTokenVerifier(),
      exchangeCode: async () => ({ ok: false, reason: "未使用" }),
      fake: true,
    },
  };
}
