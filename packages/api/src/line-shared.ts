// LINE 送信・通数(line-send/plan.md。REQUIREMENTS §6・§7)の純ロジック。
// DB・Hono・LINE API に依存しないので Unit テストと admin の UI(通数メーター・確認文言)の
// 両方から使える。送信の手続き(ログの書き込み・API 呼び出し)は line-send.ts 側
import { monthOf, todayInTokyo } from "./tokyo-date";

/** 無料枠の月間通数(§6)。超過月は LINE 側で送信不可になるため、こちらで事前に止める */
export const LINE_MONTHLY_QUOTA = 200;

export type LineMessageKind = "schedule" | "announcement" | "reminder";

export interface LineUsage {
  /** YYYY-MM(Asia/Tokyo) */
  month: string;
  used: number;
  quota: number;
  remaining: number;
}

export interface LineUsageRowLike {
  recipientCount: number;
  status: "sent" | "failed";
  sentAt: string | Date;
}

/** 当月(Asia/Tokyo)の sent 行の recipient_count 合計 = 使用済み通数(§7 line_messages) */
export function computeLineUsage(
  rows: LineUsageRowLike[],
  now: Date = new Date(),
  quota = LINE_MONTHLY_QUOTA,
): LineUsage {
  const month = monthOf(todayInTokyo(now));
  let used = 0;
  for (const r of rows) {
    if (r.status !== "sent") continue;
    const at = r.sentAt instanceof Date ? r.sentAt : new Date(r.sentAt);
    if (monthOf(todayInTokyo(at)) !== month) continue;
    used += r.recipientCount;
  }
  return { month, used, quota, remaining: Math.max(0, quota - used) };
}

/**
 * 送れるか(使用済み + 今回の人数 が枠内か)。人数 0 のグループ(Bot だけ)にも送らない。
 * §6「超過する場合は送信しない」
 */
export function canSend(
  usage: Pick<LineUsage, "used" | "quota">,
  recipientCount: number,
): { ok: true } | { ok: false; reason: string } {
  if (recipientCount <= 0) {
    return { ok: false, reason: "グループに参加者がいません" };
  }
  if (usage.used + recipientCount > usage.quota) {
    return {
      ok: false,
      reason: `今月の LINE 通数が足りません(残り ${Math.max(0, usage.quota - usage.used)} 通、必要 ${recipientCount} 通)`,
    };
  }
  return { ok: true };
}

// ---- メッセージ本文(§6: 詳細は載せず短文+LIFF リンク) ----
// packages/line の LineMessage と同じ形。DB 非依存に保つためここで再定義する

export type OutgoingMessage =
  | { type: "text"; text: string }
  | { type: "image"; originalContentUrl: string; previewImageUrl: string };

/** 末尾のスラッシュを落として結合する(liffUrl は https://liff.line.me/<id> または portal の URL) */
export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

/** 予定表発行の通知(§6 必須通知1): 画像+短文の 1 push */
export function buildScheduleMessages(input: {
  month: string;
  monthLabel: string;
  imageUrl: string;
  liffUrl: string;
}): OutgoingMessage[] {
  return [
    {
      type: "image",
      originalContentUrl: input.imageUrl,
      previewImageUrl: input.imageUrl,
    },
    {
      type: "text",
      text: `${input.monthLabel}の練習予定を発行しました。\n出欠の提出はこちらから\n${joinUrl(input.liffUrl, `/schedule?month=${input.month}`)}`,
    },
  ];
}

/** お知らせの通知: タイトル+リンクのみ(本文は送らない) */
export function buildAnnouncementMessages(input: {
  id: string;
  title: string;
  liffUrl: string;
}): OutgoingMessage[] {
  return [
    {
      type: "text",
      text: `お知らせ「${input.title}」を公開しました。\n${joinUrl(input.liffUrl, `/announcements/${input.id}`)}`,
    },
  ];
}

/** 送信ログ 1 行の表示用(実行ログ。§5.2 破壊的操作は確認+実行ログ) */
export interface LineMessageLogEntry {
  id: string;
  kind: LineMessageKind;
  ref: string;
  recipientCount: number;
  status: "sent" | "failed";
  error: string | null;
  sentAt: string;
}

export function describeLineMessage(
  entry: Pick<LineMessageLogEntry, "kind" | "ref">,
): string {
  switch (entry.kind) {
    case "schedule":
      return `予定表(${entry.ref})`;
    case "announcement":
      return "お知らせ";
    case "reminder":
      return "出欠リマインド";
  }
}
