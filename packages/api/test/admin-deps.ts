import {
  createFakeIdTokenVerifier,
  createFakeLineMessagingClient,
} from "@hoopo/line";
import type { AdminApiDeps } from "../src/admin-app";

// LINE ログイン以外の管理 API テストが共有する deps。
// admin-line-login/plan.md で AdminApiDeps に LINE 連携の依存が加わったため、
// 各テストが同じ定型を並べずに済むよう既定値をここに集約する
// (LINE ログインの経路は admin-line-login.int.test.ts、
//  グループ送信は line-send.int.test.ts が overrides でクライアントを差し替えて検証する)

export function adminDeps(
  teamId: string,
  sessionSecret: string,
  overrides: Partial<AdminApiDeps> = {},
): AdminApiDeps {
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
    line: { client: createFakeLineMessagingClient() },
    portalUrl: "http://portal.test",
    liffUrl: "https://liff.line.me/1234567890-abcdefgh",
    ...overrides,
  };
}
