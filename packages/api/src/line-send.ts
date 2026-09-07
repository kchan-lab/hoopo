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
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getAbsentees } from "./attendances-coach";
import {
  buildAnnouncementMessages,
  buildReminderMessages,
  buildScheduleMessages,
  canSend,
  computeLineUsage,
  type LineMessageKind,
  type LineMessageLogEntry,
  type LineUsage,
  type OutgoingMessage,
  trimTrailingSlash,
} from "./line-shared";
import { listPracticesByMonth } from "./practices";
import { getPublishStatus } from "./schedule-publish";
import {
  addDays,
  formatDateLabel,
  formatMonthLabel,
  monthOf,
  todayInTokyo,
} from "./tokyo-date";

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
  /** お知らせ・練習が見つからない */
  | "not_found"
  /** 終了した練習にはリマインドを送れない(attendance-reminder/plan.md「API 契約」) */
  | "past_practice"
  /** 未回答の部員が 0 人(通数の無駄打ちをしない。同 plan.md 設計判断3) */
  | "no_target"
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

/** グループ参加人数の短期キャッシュ(画面表示用)。表示のたびに LINE API を叩かない */
const MEMBER_COUNT_TTL_MS = 5 * 60 * 1000;
const memberCountCache = new Map<
  string,
  { count: number; expiresAt: number }
>();

async function fetchMemberCount(
  client: LineMessagingClient,
  groupId: string,
  now: Date,
  options: { fresh: boolean },
): Promise<number | null> {
  const cached = memberCountCache.get(groupId);
  if (!options.fresh && cached && cached.expiresAt > now.getTime()) {
    return cached.count;
  }
  const result = await client.getGroupMemberCount(groupId);
  if (!result.ok) return null;
  memberCountCache.set(groupId, {
    count: result.count,
    expiresAt: now.getTime() + MEMBER_COUNT_TTL_MS,
  });
  return result.count;
}

/**
 * 通数とグループ連携の状態。groupId は送信手続きだけが使う(応答には出さない)。
 * LINE API 呼び出しは withTeam の外で行う
 * (client.ts の注記: トランザクション内で DB 以外の I/O をしない)。
 * 表示用(fresh=false)は参加人数を数分キャッシュし、送信時(fresh=true)は必ず取り直す
 */
async function loadContext(
  teamId: string,
  client: LineMessagingClient,
  now: Date,
  options: { fresh: boolean } = { fresh: false },
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
  const memberCount =
    groupId === null
      ? null
      : await fetchMemberCount(client, groupId, now, options);
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
  const { groupId, usage: preview } = await loadContext(
    teamId,
    deps.client,
    now,
    { fresh: true },
  );
  if (groupId === null) {
    return {
      ok: false,
      reason: "no_group",
      error: "LINE グループが未連携です",
      message: null,
    };
  }
  if (preview.memberCount === null) {
    return {
      ok: false,
      reason: "member_count",
      error: "グループの参加人数を取得できませんでした",
      message: null,
    };
  }
  const recipientCount = preview.memberCount;

  // 通数チェックとログの記録は同じトランザクションで行い、チーム単位のアドバイザリロックで
  // 同時送信(二重クリック・複数タブ)を直列化する。push はトランザクションの外に出したいので、
  // 先に sent 行を「予約」してから送り、失敗したら failed に更新する
  // (途中で落ちても sent が残る=枠を多めに数える安全側。§6 の 200 通超過を起こさない)
  const month = monthOf(todayInTokyo(now));
  const reserved = await withTeam(teamId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${teamId}))`);
    const usage = computeLineUsage(await loadUsageRows(tx, month), now);
    const allowed = canSend(usage, recipientCount);
    if (!allowed.ok) {
      return { ok: false as const, error: allowed.reason, usage };
    }
    const [row] = await tx
      .insert(lineMessages)
      .values({
        teamId,
        kind: input.kind,
        ref: input.ref,
        recipientCount,
        status: "sent",
        sentAt: now,
      })
      .returning(logColumns);
    if (!row) throw new Error("LINE 送信ログの記録に失敗しました");
    return { ok: true as const, row, usage };
  });
  if (!reserved.ok) {
    return { ok: false, reason: "quota", error: reserved.error, message: null };
  }

  const push = await deps.client.pushToGroup(groupId, input.messages);
  if (!push.ok) {
    const [row] = await withTeam(teamId, (tx) =>
      tx
        .update(lineMessages)
        // 失敗理由はクライアントが要約した文言だけ(応答本文は持ち込まない)
        .set({ status: "failed", error: push.reason })
        .where(eq(lineMessages.id, reserved.row.id))
        .returning(logColumns),
    );
    return {
      ok: false,
      reason: "push_failed",
      error: "LINE への送信に失敗しました",
      message: toLogEntry(row ?? reserved.row),
    };
  }
  // 送信直後のメーターを返す(画面が取り直さなくても最新の n/200 を出せる)
  const used = reserved.usage.used + recipientCount;
  return {
    ok: true,
    message: toLogEntry(reserved.row),
    usage: {
      ...reserved.usage,
      groupLinked: true,
      memberCount: recipientCount,
      used,
      remaining: Math.max(0, reserved.usage.quota - used),
    },
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
  const base = trimTrailingSlash(deps.portalUrl);
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

// ---- 出欠リマインド(#20。attendance-reminder/plan.md) ----

/** Tokyo のその日の 00:00 の瞬間。「当日(JST)に送ったか」の判定に使う */
function dayStartInstant(date: string): Date {
  return new Date(`${date}T00:00:00+09:00`);
}

/** 未回答の部員がいる日付の材料を1つに束ねる(1 日 = 1 行 = ref 1 件) */
interface ReminderTarget {
  heldOn: string;
  /** その日のいずれかの練習に未回答の部員の実数(同じ子を二重に数えない) */
  unanswered: number;
}

/**
 * 出欠リマインドの手動送信(§6 必須通知2)。
 * 未来(今日以降)の練習で、未回答が 1 人以上のときだけ送る。
 * 個人名は載せない(グループ宛て 1 通。絶対原則3・4)
 */
export async function sendAttendanceReminderToLine(
  teamId: string,
  practiceId: string,
  deps: LineSendDeps,
): Promise<LineSendResult> {
  const now = deps.now ?? new Date();
  const data = await getAbsentees(teamId, practiceId);
  if (!data) {
    return {
      ok: false,
      reason: "not_found",
      error: "対象が見つかりません",
      message: null,
    };
  }
  // 当日はまだ送れる(朝の練習前に押せる)。終了した練習だけを弾く
  if (data.practice.heldOn < todayInTokyo(now)) {
    return {
      ok: false,
      reason: "past_practice",
      error: "終了した練習には送れません",
      message: null,
    };
  }
  if (data.unanswered.length === 0) {
    return {
      ok: false,
      reason: "no_target",
      error: "未回答の部員はいません",
      message: null,
    };
  }
  return sendToGroup(
    teamId,
    {
      kind: "reminder",
      // ref は held_on(YYYY-MM-DD)。同じ日への再送・ジョブとの重複判定に使う
      ref: data.practice.heldOn,
      messages: buildReminderMessages({
        dates: [
          {
            label: formatDateLabel(data.practice.heldOn),
            unanswered: data.unanswered.length,
          },
        ],
        liffUrl: deps.liffUrl,
      }),
    },
    deps,
  );
}

/** 定期ジョブの結果(plan.md「API 契約」)。skipped が付くときは push もログも起きていない */
export interface AttendanceReminderJobResult {
  sent: boolean;
  /** 送信対象になった開催日(YYYY-MM-DD) */
  dates: string[];
  /** 未提出の部員の実数(dates 全体の合計) */
  unanswered: number;
  skipped?: "already_sent" | "no_target" | "quota";
}

/** その日の練習のうち未回答がいるものを束ねる。同じ子を複数の練習で二重に数えない */
async function collectReminderTarget(
  teamId: string,
  heldOn: string,
): Promise<ReminderTarget | null> {
  // 日付指定の一覧は無いので、その月ぶんを引いて当日だけに絞る(1 日 1 回のジョブなので十分)
  const practices = await listPracticesByMonth(teamId, monthOf(heldOn));
  const onDay = practices.filter((p) => p.heldOn === heldOn);
  if (onDay.length === 0) return null;
  const childIds = new Set<string>();
  for (const p of onDay) {
    const data = await getAbsentees(teamId, p.id);
    if (!data) continue;
    for (const e of data.unanswered) childIds.add(e.child.id);
  }
  return childIds.size === 0 ? null : { heldOn, unanswered: childIds.size };
}

/** 当日(JST)に同じ ref の reminder を送信済みか(二重送信の防止。plan.md 設計判断1) */
async function alreadyRemindedToday(
  teamId: string,
  ref: string,
  today: string,
): Promise<boolean> {
  const rows = await withTeam(teamId, (tx) =>
    tx
      .select({ id: lineMessages.id })
      .from(lineMessages)
      .where(
        and(
          eq(lineMessages.kind, "reminder"),
          eq(lineMessages.ref, ref),
          eq(lineMessages.status, "sent"),
          gte(lineMessages.sentAt, dayStartInstant(today)),
        ),
      )
      .limit(1),
  );
  return rows.length > 0;
}

/**
 * 定期ジョブ本体(plan.md 設計判断1: 2 日前・1 日 1 通まで)。
 * 対象は「今日(Asia/Tokyo)+2 日」に開催で未回答が 1 人以上ある練習。
 * 同じ日に複数の練習があってもまとめて 1 通(ref = held_on)。
 * 枠不足は送らず・ログも残さずスキップする(絶対原則3)。
 * 未連携・push 失敗などの異常は例外にして Actions 側で ::error にする(黙って握りつぶさない)
 */
export async function runAttendanceReminderJob(
  teamId: string,
  deps: LineSendDeps,
  // 既定は deps.now(テスト用の固定時刻)→ 現在時刻。ジョブの「今日」と通数の集計基準をそろえる
  now: Date = deps.now ?? new Date(),
): Promise<AttendanceReminderJobResult> {
  const today = todayInTokyo(now);
  const heldOn = addDays(today, 2);
  const target = await collectReminderTarget(teamId, heldOn);
  if (!target) {
    return { sent: false, dates: [], unanswered: 0, skipped: "no_target" };
  }
  if (await alreadyRemindedToday(teamId, target.heldOn, today)) {
    return {
      sent: false,
      dates: [target.heldOn],
      unanswered: target.unanswered,
      skipped: "already_sent",
    };
  }
  const result = await sendToGroup(
    teamId,
    {
      kind: "reminder",
      ref: target.heldOn,
      messages: buildReminderMessages({
        dates: [
          {
            label: formatDateLabel(target.heldOn),
            unanswered: target.unanswered,
          },
        ],
        liffUrl: deps.liffUrl,
      }),
    },
    { ...deps, now },
  );
  if (result.ok) {
    return {
      sent: true,
      dates: [target.heldOn],
      unanswered: target.unanswered,
    };
  }
  if (result.reason === "quota") {
    return {
      sent: false,
      dates: [target.heldOn],
      unanswered: target.unanswered,
      skipped: "quota",
    };
  }
  throw new Error(result.error);
}
