// Messaging API のグループ宛て送信(REQUIREMENTS §6・CLAUDE.md 絶対原則3)。
// 提供する操作は「グループ 1 件への push」と「グループ参加人数の取得」だけ。
// 個別 push(userId 宛て)・multicast・broadcast は API 面として存在させない(通数原則の土台)。
// 実装は messaging-http.ts(本物)とこのファイルのフェイク(ローカル/E2E)。
// 送信ログと通数の計算は packages/api(line-shared.ts / line-send.ts)の責務

export type LineMessage =
  | { type: "text"; text: string }
  | { type: "image"; originalContentUrl: string; previewImageUrl: string };

export type PushResult = { ok: true } | { ok: false; reason: string };

export type MemberCountResult =
  | { ok: true; count: number }
  | { ok: false; reason: string };

export interface LineMessagingClient {
  /** グループ宛てに 1 push(最大 5 メッセージ)。通数 = グループ参加人数 × 1 */
  pushToGroup(groupId: string, messages: LineMessage[]): Promise<PushResult>;
  /** グループの参加人数(Bot を除く)。通数の計上に使う */
  getGroupMemberCount(groupId: string): Promise<MemberCountResult>;
}

/** 1 回の push に載せられるメッセージ数(Messaging API の上限) */
export const MAX_MESSAGES_PER_PUSH = 5;

/** フェイクが返すグループ参加人数(E2E の通数表示が決まった値になるように固定) */
export const FAKE_GROUP_MEMBER_COUNT = 12;

export interface FakePush {
  groupId: string;
  messages: LineMessage[];
}

export interface FakeLineMessagingClient extends LineMessagingClient {
  /** 送った内容の記録(テストの検証用。本文は保存しない方針はログ側の話でここはメモリのみ) */
  readonly pushes: FakePush[];
}

// ローカル/E2E 用フェイク(LINE_FAKE / AUTH_FAKE)。実チャネル(#9)なしで送信導線を貫通させる。
// createFakeIdTokenVerifier と同じく Vercel 上では起動時に拒否する
export function createFakeLineMessagingClient(
  options: { memberCount?: number; failNext?: boolean } = {},
): FakeLineMessagingClient {
  if (process.env.VERCEL_ENV) {
    throw new Error("フェイクの LINE 送信は Vercel 環境では使用できません");
  }
  const pushes: FakePush[] = [];
  let failNext = options.failNext ?? false;
  return {
    pushes,
    async pushToGroup(groupId, messages) {
      if (messages.length === 0 || messages.length > MAX_MESSAGES_PER_PUSH) {
        return { ok: false, reason: "メッセージ数が不正です" };
      }
      if (failNext) {
        failNext = false;
        return { ok: false, reason: "フェイク: 送信失敗" };
      }
      pushes.push({ groupId, messages });
      return { ok: true };
    },
    async getGroupMemberCount() {
      return {
        ok: true,
        count: options.memberCount ?? FAKE_GROUP_MEMBER_COUNT,
      };
    },
  };
}

// LINE_CHANNEL_ACCESS_TOKEN が未設定の環境(実チャネル #9 取得前の stg など)向け。
// 送信・人数取得は常に失敗として返し、管理画面自体は動かす(設定漏れで全画面が落ちないように)
export function createUnconfiguredLineMessagingClient(): LineMessagingClient {
  const reason =
    "LINE_CHANNEL_ACCESS_TOKEN が未設定です(Messaging API チャネルの設定後に有効になります)";
  return {
    async pushToGroup() {
      return { ok: false, reason };
    },
    async getGroupMemberCount() {
      return { ok: false, reason };
    },
  };
}
