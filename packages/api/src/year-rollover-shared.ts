// 年度更新(year-rollover/plan.md。REQUIREMENTS §5.2・§7)の純ロジック。
// DB・Hono に依存しないので Unit テスト(docs/DEVELOPMENT.md テスト戦略)と
// クライアント(admin の年度更新 UI)の両方から使える。
// DB を触る手続きは year-rollover.ts 側に置く

/** 取り消し猶予(24時間・1回。設計判断2) */
export const UNDO_GRACE_MS = 24 * 60 * 60 * 1000;

/** 卒団する学年。学年は据え置きで archived=true にする(§7) */
export const GRADUATION_GRADE = 6;

/**
 * 実行前の学年・アーカイブ状態(`{ childId: { grade, archived } }`)。
 * @hoopo/db の YearRolloverSnapshot と同じ形。ここを DB 非依存に保つため型だけ再定義する
 */
export interface RolloverSnapshot {
  [childId: string]: { grade: number; archived: boolean };
}

/** 取り消せる期限(実行時刻 + 猶予) */
export function undoDeadline(executedAt: string | Date): Date {
  const at = executedAt instanceof Date ? executedAt : new Date(executedAt);
  return new Date(at.getTime() + UNDO_GRACE_MS);
}

/** 取り消せるか(未取り消し かつ 期限内。ちょうど期限のときは取り消せない) */
export function isUndoable(
  executedAt: string | Date,
  undoneAt: string | Date | null,
  now: string | Date,
): boolean {
  if (undoneAt !== null) return false;
  const at = now instanceof Date ? now : new Date(now);
  return undoDeadline(executedAt).getTime() > at.getTime();
}

/** 年度更新で「学年+1」する部員と「卒団アーカイブ」する部員の振り分け(§7) */
export function partitionMembers(members: { id: string; grade: number }[]): {
  promoting: string[];
  graduating: string[];
} {
  const promoting: string[] = [];
  const graduating: string[] = [];
  for (const m of members) {
    if (m.grade === GRADUATION_GRADE) graduating.push(m.id);
    else promoting.push(m.id);
  }
  return { promoting, graduating };
}

/** 実行前の状態を丸ごと snapshot にする(取り消しはここからの復元だけで完結。設計判断1) */
export function buildSnapshot(
  members: { id: string; grade: number; archived: boolean }[],
): RolloverSnapshot {
  const snapshot: RolloverSnapshot = {};
  for (const m of members) {
    snapshot[m.id] = { grade: m.grade, archived: m.archived };
  }
  return snapshot;
}

/** 取り消しの UPDATE 単位 */
export interface RestoreGroup {
  grade: number;
  /** 実行前のアーカイブ状態。実行対象は archived=false のみなので実際は常に false */
  archived: boolean;
  childIds: string[];
}

/**
 * 同じ(学年, アーカイブ状態)ごとにまとめて戻す(1件ずつの UPDATE を避ける)。
 * 実行は archived=false の部員しか対象にしないため archived は常に false になるが、
 * グループ化キーとしては一般形のまま持っておく
 */
export function buildRestoreGroups(snapshot: RolloverSnapshot): RestoreGroup[] {
  const groups = new Map<string, RestoreGroup>();
  for (const [childId, before] of Object.entries(snapshot)) {
    const key = `${before.grade}:${before.archived}`;
    const group = groups.get(key);
    if (group) group.childIds.push(childId);
    else
      groups.set(key, {
        grade: before.grade,
        archived: before.archived,
        childIds: [childId],
      });
  }
  return [...groups.values()];
}

/** snapshot は実行前の状態なので、卒団した人数 = 実行前に 6 年生だった人数 */
export function countGraduating(snapshot: RolloverSnapshot): number {
  return Object.values(snapshot).filter((s) => s.grade === GRADUATION_GRADE)
    .length;
}
