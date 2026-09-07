// Messaging API の Webhook 受信(line-send/plan.md 6c-2、CLAUDE.md 開発ルール「Webhook は署名検証を必ず通す」)。
// 用途は groupId の取得だけ(設計判断4): Bot をグループへ招待した join でグループを覚え、
// 退出(leave)で忘れる。メッセージ本文・userId は取り出しも返却もしない(絶対原則4)。
// Web 標準 API(Web Crypto)のみ使用 — 将来 Workers 等へ切り出すため Node 固有 API は使わない

/** join/leave 以外はすべて other にまとめる(応答メッセージは実装しない=通数原則) */
export type WebhookEventType = "join" | "leave" | "other";

export interface WebhookEvent {
  type: WebhookEventType;
  /** source.type === "group" のときだけ入る。ユーザー・ルーム発のイベントでは undefined */
  groupId?: string;
}

function base64ToBytes(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(text);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  } catch {
    // base64 として壊れているヘッダは検証失敗として扱う(例外を外へ出さない)
    return null;
  }
}

/**
 * x-line-signature(チャネルシークレットを鍵にした生ボディの HMAC-SHA256 → base64)を検証する。
 * 比較は subtle.verify に任せる(タイミング攻撃を避けるため自前の文字列比較はしない)。
 * rawBody は必ず「受信したままのバイト列」を渡すこと(JSON を再シリアライズすると一致しない)
 */
export async function verifyLineSignature(
  rawBody: string,
  signature: string | null | undefined,
  channelSecret: string,
): Promise<boolean> {
  if (!signature || !channelSecret) return false;
  const expected = base64ToBytes(signature);
  if (!expected) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    expected,
    new TextEncoder().encode(rawBody),
  );
}

/**
 * Webhook ボディから「種別 + グループ ID」だけを取り出す。
 * 壊れた JSON・events が配列でない場合は空配列(LINE には常に 200 を返すため例外にしない)
 */
export function parseWebhookEvents(rawBody: string): WebhookEvent[] {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return [];
  }
  const events = (payload as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return [];
  return events.map((raw) => {
    const event = raw as { type?: unknown; source?: unknown } | null;
    const type: WebhookEventType =
      event?.type === "join" || event?.type === "leave" ? event.type : "other";
    const source = event?.source as
      | { type?: unknown; groupId?: unknown }
      | undefined;
    // グループ以外(user / room)は groupId を持たせない。userId は読み取りもしない
    return source?.type === "group" && typeof source.groupId === "string"
      ? { type, groupId: source.groupId }
      : { type };
  });
}
