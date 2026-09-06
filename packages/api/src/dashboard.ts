import { getAbsentees, getAttendanceMatrix } from "./attendances-coach";
import { getFeeGrid } from "./fees-coach";
import { getNextPractice, type Practice } from "./practices";
import { monthOf } from "./tokyo-date";

// 管理ダッシュボード(REQUIREMENTS §5.2。ワイヤー PC-2 / SP-3)。
// 既存のドメイン関数(出欠マトリクス・欠席者・月謝グリッド・次回練習)の合成だけで作り、
// 新しいクエリ・テーブルは増やさない(plan.md 設計判断1)。
// LINE 通数は送信ログテーブルが未設計なのでここでは持たない(6c で追加。設計判断2)

/** 今月の提出率。total は「今月の練習 × 有効な部員」のセル数 */
export interface DashboardSubmission {
  answered: number;
  total: number;
  /** 0〜100 の整数。total が 0 なら 0 */
  rate: number;
}

/** 次回練習(Tokyo の今日以降で最初の1件)の回答内訳。合計は有効な部員数 */
export interface DashboardNextPractice {
  practice: Practice;
  full: number;
  partial: number;
  absent: number;
  unanswered: number;
}

/** 今月の月謝。unpaidCount は「未」の部員数(「済」「未来」は含めない) */
export interface DashboardFees {
  unpaidCount: number;
  total: number;
}

/** 今月に未回答の練習が1件以上ある部員(学年降順→名前) */
export interface DashboardUnansweredMember {
  id: string;
  name: string;
  grade: number;
  /** 未回答の練習の件数 */
  unanswered: number;
}

export interface Dashboard {
  /** 集計対象の年月("YYYY-MM") */
  month: string;
  /** Tokyo の今月。月謝の「未来」判定に使う */
  currentMonth: string;
  submission: DashboardSubmission;
  nextPractice: DashboardNextPractice | null;
  fees: DashboardFees;
  unansweredMembers: DashboardUnansweredMember[];
}

/**
 * ダッシュボードの数字一式。today は Tokyo の "YYYY-MM-DD"(呼び出し側が todayInTokyo() を渡す)。
 * 集計月は today の月で固定する(月の切替は各画面側で行う)
 */
export async function getDashboard(
  teamId: string,
  today: string,
): Promise<Dashboard> {
  const month = monthOf(today);
  const year = Number(today.slice(0, 4));
  const [matrix, grid, practice] = await Promise.all([
    getAttendanceMatrix(teamId, month),
    getFeeGrid(teamId, year, month),
    getNextPractice(teamId, today),
  ]);

  // 提出率: 未回答は行を持たないので、null でないセルを数える(attendances-coach と同じ規約)
  const memberCount = matrix.rows.length;
  const total = memberCount * matrix.practices.length;
  let answered = 0;
  const unansweredMembers: DashboardUnansweredMember[] = [];
  for (const row of matrix.rows) {
    let missing = 0;
    for (const p of matrix.practices) {
      if (row.cells[p.id]) answered++;
      else missing++;
    }
    if (missing > 0) {
      unansweredMembers.push({
        id: row.child.id,
        name: row.child.name,
        grade: row.child.grade,
        unanswered: missing,
      });
    }
  }
  const rate = total === 0 ? 0 : Math.round((answered / total) * 100);

  // 次回参加人数: 欠席者管理と同じ内訳を使い、参加(full)は差分で求める
  // (次回練習が翌月でも部員数は月に依存しないので matrix の行数をそのまま使える)
  let nextPractice: DashboardNextPractice | null = null;
  if (practice) {
    const detail = await getAbsentees(teamId, practice.id);
    if (detail) {
      const absent = detail.absent.length;
      const partial = detail.partial.length;
      const unanswered = detail.unanswered.length;
      nextPractice = {
        practice: detail.practice,
        full: Math.max(0, memberCount - absent - partial - unanswered),
        partial,
        absent,
        unanswered,
      };
    }
  }

  // 月謝: 今月のセルが「未」の部員数。「未来」は今月には出ない(fees-shared の feeState)
  const monthNumber = Number(month.slice(5));
  const unpaidCount = grid.rows.filter(
    (r) => r.months.find((m) => m.month === monthNumber)?.state === "unpaid",
  ).length;

  return {
    month,
    currentMonth: month,
    submission: { answered, total, rate },
    nextPractice,
    fees: { unpaidCount, total: grid.rows.length },
    unansweredMembers,
  };
}
