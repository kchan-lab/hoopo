// LINE グループ送信の手続き(line-send/plan.md 6c-1。REQUIREMENTS §6・§7)。
// 純ロジック(通数計算・本文組み立て)は line-shared.ts、HTTP は packages/line。
// ここは「DB を読む → 送る → 送信ログに残す」の手順だけを持つ。
// 宛先は常に teams.line_group_id の1グループで、userId 宛て push・multicast・broadcast は
// 経路として存在させない(CLAUDE.md 絶対原則3。plan.md 設計判断1)

import {
  announcements,
  lineMessages,
  type TeamTx,
  teams,
  withTeam,
} from "@hoopo/db";
import type { LineMessagingClient } from "@hoopo/line";
import { desc, eq, gte } from "drizzle-orm";
import {
  buildAnnouncementMessages,
  buildScheduleMessages,
  canSend,
  computeLineUsage,
  type LineMessageKind,
  type LineMessageLogEntry,
  type LineUsage,
  type OutgoingMessage,
} from "./line-shared";
import { getPublishStatus } from "./schedule-publish";
import { formatMonthLabel, monthOf, todayInTokyo } from "./tokyo-date";

/** 通数メーター(GET /line/usage)の応答。memberCount は groupLinked のときだけ取りに行く */
export interface LineUsageSummary extends LineUsage {
  groupLinked: boolean;
  /** グループ参加人数(= 1 送信で消費する通数)。取得に失敗したら null */
  memberCount: number | null;
}

export interface LineSendDeps {
  client: LineMessagingClient;
  /** 予定表画像のホスト(保護者アプリ)。末尾スラッシュは有っても無くてもよい */
  portalUrl: string;
  /** LIFF の入口(https://liff.line.me/<id>)。未設定なら portalUrl と同じ */
  liffUrl: string;
  /** 通数の集計基準時刻(テスト用。既定は現在時刻) */
  now?: Date;
}

export type LineSendFailureReason =
  /** 予定表がその月に未発行 */
  | "not_published"
  /** お知らせが下書き、または通知なし */
  | "not_sendable"
  /** お知らせが見つからない */
  | "not_found"
  /** teams.line_group_id が未設定(Bot がグループに未招待) */
  | "no_group"
  /** 今月の残り通数が足りない(送信前に止める。plan.md 設計判断3) */
  | "quota"
  /** グループ参加人数を取得できず、消費通数が確定できない */
  | "member_count"
  /** push が失敗した(ログには failed で残す) */
  | "push_failed";

export type LineSendResult =
  | { ok: true; message: LineMessageLogEntry; usage: LineUsageSummary }
  | {
      ok: false;
      reason: LineSendFailureReason;
      error: string;
      /** push_failed のときだけ failed の実行ログが入る */
      message: LineMessageLogEntry | null;
    };

const logColumns = {
  id: lineMessages.id,
  kind: lineMessages.kind,
  ref: lineMessages.ref,
  recipientCount: lineMessages.recipientCount,
  status: lineMessages.status,
  error: lineMessages.error,
  sentAt: lineMessages.sentAt,
};

type LogRow = {
  id: string;
  kind: LineMessageKind;
  ref: string;
  recipientCount: number;
  status: "sent" | "failed";
  error: string | null;
  sentAt: Date;
};

function toLogEntry(row: LogRow): LineMessageLogEntry {
  return { ...row, sentAt: row.sentAt.toISOString() };
}

/**
 * Tokyo の月初(YYYY-MM-01 00:00 JST)の瞬間。
 * 当月分だけを読み出して computeLineUsage に渡す(月の判定そのものは line-shared 側が行う)
 */
function monthStartInstant(month: string): Date {
  return new Date(`${month}-01T00:00:00+09:00`);
}

async function loadUsageRows(tx: TeamTx, month: string) {
  return tx
    .select({
      recipientCount: lineMessages.recipientCount,
      status: lineMessages.status,
      sentAt: lineMessages.sentAt,
    })
    .from(lineMessages)
    .where(gte(lineMessages.sentAt, monthStartInstant(month)));
}

/**
 * 通数とグループ連携の状態。groupId は送信手続きだけが使う(応答には出さない)。
 * LINE API 呼び出しは withTeam の外で行う
 * (client.ts の注記: トランザクション内で DB 以外の I/O をしない)
 */
async function loadContext(
  teamId: string,
  client: LineMessagingClient,
  now: Date,
): Promise<{ groupId: string | null; usage: LineUsageSummary }> {
  const month = monthOf(todayInTokyo(now));
  const { groupId, rows } = await withTeam(teamId, async (tx) => {
    // RLS 配下なので teams は自チームの1行しか見えない
    const [team] = await tx.select({ groupId: teams.lineGroupId }).from(teams);
    return {
      groupId: team?.groupId ?? null,
      rows: await loadUsageRows(tx, month),
    };
  });
  const usage = computeLineUsage(rows, now);
  let memberCount: number | null = null;
  if (groupId !== null) {
    const result = await client.getGroupMemberCount(groupId);
    memberCount = result.ok ? result.count : null;
  }
  return {
    groupId,
    usage: { ...usage, groupLinked: groupId !== null, memberCount },
  };
}

/** 通数メーター(n/200)の値。当月(Asia/Tokyo)の sent 行の合計(plan.md 設計判断2) */
export async function getLineUsage(
  teamId: string,
  client: LineMessagingClient,
  now: Date = new Date(),
): Promise<LineUsageSummary> {
  return (await loadContext(teamId, client, now)).usage;
}

/** 送信ログ(新しい順)。破壊的操作の実行ログ兼、再送の回数表示に使う */
export async function listLineMessages(
  teamId: string,
  limit = 10,
): Promise<LineMessageLogEntry[]> {
  // 画面の一覧用なので上限を設ける(不正な limit でも全件を引かない)
  const take = Math.min(Math.max(1, Math.floor(limit) || 10), 50);
  return withTeam(teamId, async (tx) => {
    const rows = await tx
      .select(logColumns)
      .from(lineMessages)
      .orderBy(desc(lineMessages.sentAt))
      .limit(take);
    return rows.map(toLogEntry);
  });
}

/**
 * グループ宛て 1 push の共通手続き(plan.md 設計判断6: リマインド #20 もこれを再利用する)。
 * 事前チェック(未連携・枠超過)で止め、push の成否を line_messages に 1 行だけ残す。
 * 消費通数は送信時点の参加人数で固定する(後から人数が変わっても過去の通数は動かさない)
 */
async function sendToGroup(
  teamId: string,
  input: { kind: LineMessageKind; ref: string; messages: OutgoingMessage[] },
  deps: LineSendDeps,
): Promise<LineSendResult> {
  const now = deps.now ?? new Date();
  const { groupId, usage } = await loadContext(teamId, deps.client, now);
  if (groupId === null) {
    return {
      ok: false,
      reason: "no_group",
      error: "LINE グループが未連携です",
      message: null,
    };
  }
  if (usage.memberCount === null) {
    return {
      ok: false,
      reason: "member_count",
      error: "グループの参加人数を取得できませんでした",
      message: null,
    };
  }
  const recipientCount = usage.memberCount;
  const allowed = canSend(usage, recipientCount);
  if (!allowed.ok) {
    return { ok: false, reason: "quota", error: allowed.reason, message: null };
  }

  const push = await deps.client.pushToGroup(groupId, input.messages);
  const [row] = await withTeam(teamId, (tx) =>
    tx
      .insert(lineMessages)
      .values({
        teamId,
        kind: input.kind,
        ref: input.ref,
        recipientCount,
        status: push.ok ? "sent" : "failed",
        // 失敗理由はクライアントが要約した文言だけ(応答本文は持ち込まない)
        error: push.ok ? null : push.reason,
        sentAt: now,
      })
      .returning(logColumns),
  );
  if (!row) throw new Error("LINE 送信ログの記録に失敗しました");
  const message = toLogEntry(row);
  if (!push.ok) {
    return {
      ok: false,
      reason: "push_failed",
      error: "LINE への送信に失敗しました",
      message,
    };
  }
  // 送信直後のメーターを返す(画面が取り直さなくても最新の n/200 を出せる)
  const used = usage.used + recipientCount;
  return {
    ok: true,
    message,
    usage: { ...usage, used, remaining: Math.max(0, usage.quota - used) },
  };
}

/**
 * 予定表の送信(§6 必須通知1)。発行済みの月だけ送れる。
 * 画像 URL に発行日時を付けるのは、再発行後に送り直したとき LINE 側の画像キャッシュで
 * 古い予定表が出るのを避けるため(schedule-publish/plan.md 設計判断4 と同じ理由)
 */
export async function sendScheduleToLine(
  teamId: string,
  month: string,
  deps: LineSendDeps,
): Promise<LineSendResult> {
  const status = await getPublishStatus(teamId, month);
  if (status.published === 0 || status.publishedAt === null) {
    return {
      ok: false,
      reason: "not_published",
      error: "先に発行してください",
      message: null,
    };
  }
  const base = deps.portalUrl.replace(/\/+$/, "");
  const imageUrl = `${base}/api/schedule/${month}.png?v=${encodeURIComponent(status.publishedAt)}`;
  return sendToGroup(
    teamId,
    {
      kind: "schedule",
      ref: month,
      messages: buildScheduleMessages({
        month,
        monthLabel: formatMonthLabel(month),
        imageUrl,
        liffUrl: deps.liffUrl,
      }),
    },
    deps,
  );
}

/** お知らせの送信。公開済み かつ 通知あり のものだけ(本文は送らずタイトル+リンク) */
export async function sendAnnouncementToLine(
  teamId: string,
  id: string,
  deps: LineSendDeps,
): Promise<LineSendResult> {
  const row = await withTeam(teamId, (tx) =>
    tx.query.announcements.findFirst({
      where: eq(announcements.id, id),
      columns: { id: true, title: true, notifyLine: true, publishedAt: true },
    }),
  );
  if (!row) {
    return {
      ok: false,
      reason: "not_found",
      error: "対象が見つかりません",
      message: null,
    };
  }
  if (row.publishedAt === null || !row.notifyLine) {
    return {
      ok: false,
      reason: "not_sendable",
      error: "公開済みで「LINE へ通知する」のお知らせだけ送信できます",
      message: null,
    };
  }
  return sendToGroup(
    teamId,
    {
      kind: "announcement",
      ref: row.id,
      messages: buildAnnouncementMessages({
        id: row.id,
        title: row.title,
        liffUrl: deps.liffUrl,
      }),
    },
    deps,
  );
}
