import { pgEnum } from "drizzle-orm/pg-core";

// Postgres enum は値の削除・改名が実質不可(型の再作成が必要)のため、
// UI 仕様で確定している「変わりにくい」列挙のみ enum にする(plan.md 設計判断3)。
// 変わり得る position / relation は text + CHECK 制約で持つ。

// 出欠の提出3値(docs/REQUIREMENTS.md §4.2-6 で UI 仕様として確定)
export const attendanceStatus = pgEnum("attendance_status", [
  "full",
  "partial",
  "absent",
]);

// 自動認定の状態(children / guardian_children 共通。§5.2 認定管理)
export const approvalStatus = pgEnum("approval_status", ["active", "revoked"]);

// 月謝の済/未。「未来」はレコードではなく year/month からアプリが導出する(§4.2-8)
export const feeStatus = pgEnum("fee_status", ["paid", "unpaid"]);

// 出場メンバーの区分(§4.2-7)
export const lineupRole = pgEnum("lineup_role", ["starter", "bench"]);
