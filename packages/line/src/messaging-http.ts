// Messaging API の実クライアント(line-send/plan.md 6c-2)。型と契約は messaging.ts、
// ローカル/E2E は createFakeLineMessagingClient を使う。
// 提供するのは「グループ 1 件への push」と「参加人数の取得」だけ(絶対原則3。設計判断1)。
// fetch を注入できるようにして、実チャネル(#9)なしでもユニットテストできるようにする

import {
  type LineMessage,
  type LineMessagingClient,
  MAX_MESSAGES_PER_PUSH,
  type MemberCountResult,
  type PushResult,
} from "./messaging";

const PUSH_URL = "https://api.line.me/v2/bot/message/push";
const GROUP_BASE_URL = "https://api.line.me/v2/bot/group";

export interface LineMessagingClientOptions {
  /** Messaging API チャネルのチャネルアクセストークン(サーバー側のみ) */
  channelAccessToken: string;
  fetchFn?: typeof fetch;
}

/** 非 2xx の理由。応答本文は含めない(LINE 側のメッセージをそのまま画面や送信ログに出さない) */
function statusReason(status: number): string {
  return `LINE API が ${status} を返しました`;
}

export function createLineMessagingClient({
  channelAccessToken,
  fetchFn = fetch,
}: LineMessagingClientOptions): LineMessagingClient {
  const authHeaders = { Authorization: `Bearer ${channelAccessToken}` };

  return {
    async pushToGroup(
      groupId: string,
      messages: LineMessage[],
    ): Promise<PushResult> {
      // 上限超過は API を叩く前に落とす(無駄な通数・エラーを避ける。フェイクと同じ判定)
      if (messages.length === 0 || messages.length > MAX_MESSAGES_PER_PUSH) {
        return { ok: false, reason: "メッセージ数が不正です" };
      }
      const res = await fetchFn(PUSH_URL, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        // 宛先は常にグループ 1 件。userId 宛て・multicast・broadcast は組み立てない
        body: JSON.stringify({ to: groupId, messages }),
      });
      return res.ok
        ? { ok: true }
        : { ok: false, reason: statusReason(res.status) };
    },

    async getGroupMemberCount(groupId: string): Promise<MemberCountResult> {
      const res = await fetchFn(
        `${GROUP_BASE_URL}/${encodeURIComponent(groupId)}/members/count`,
        { headers: authHeaders },
      );
      if (!res.ok) {
        return { ok: false, reason: statusReason(res.status) };
      }
      const payload = (await res.json().catch(() => null)) as {
        count?: unknown;
      } | null;
      if (typeof payload?.count !== "number") {
        return { ok: false, reason: "参加人数の応答が不正です" };
      }
      return { ok: true, count: payload.count };
    },
  };
}
