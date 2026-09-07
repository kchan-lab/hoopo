// 実行ログ(audit_logs。member-deletion/plan.md)の純ロジック。DB・React に依存しないので
// Unit テストと admin の画面の両方から使う。DB を触る手続きは members.ts 側
import { TOKYO_TZ } from "./tokyo-date";

/** 実行ログの既定・上限件数(画面から渡る limit はこの範囲に丸める) */
export const AUDIT_LOG_DEFAULT_LIMIT = 20;
export const AUDIT_LOG_MAX_LIMIT = 50;

/** 1〜50 に丸める。数値でない(NaN・undefined)場合は既定の 20 */
export function clampAuditLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return AUDIT_LOG_DEFAULT_LIMIT;
  }
  return Math.min(AUDIT_LOG_MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

export interface AuditLogLike {
  action: string;
  detail: Record<string, unknown>;
}

/** ログに名前は残さない(設計判断3)ので、内容は人数だけで組み立てる */
export function describeAuditLog(log: AuditLogLike): string {
  if (log.action === "child_deleted") {
    const removed =
      typeof log.detail.removedGuardians === "number"
        ? log.detail.removedGuardians
        : 0;
    return `部員データを削除(保護者 ${removed} 人分も削除)`;
  }
  return log.action;
}

/** "2026/3/31"(Asia/Tokyo 固定。CLAUDE.md 開発ルール) */
export function formatDateTokyo(iso: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TOKYO_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(iso instanceof Date ? iso : new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // en-GB は 0 埋め("04")になるので数値化して "2026/4/1" にそろえる
  return `${get("year")}/${Number(get("month"))}/${Number(get("day"))}`;
}
