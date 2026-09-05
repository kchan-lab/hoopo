import { practiceMenus, practices, withTeam } from "@hoopo/db";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { PracticeInput } from "./practices-shared";
import { monthRange, toHHMM } from "./tokyo-date";

// 練習(practice)のドメインロジック(practice-schedule/plan.md)。
// 管理(CRUD)と保護者(参照)の両方から使う。定数・検証は practices-shared.ts
export * from "./practices-shared";

export interface PracticeMenu {
  id: string;
  durationMin: number | null;
  content: string;
  sort: number;
}

export interface Practice {
  id: string;
  heldOn: string;
  /** 0=日 … 6=土(DB の生成列) */
  weekday: number;
  startTime: string;
  endTime: string;
  location: string | null;
  note: string | null;
  publishedAt: string | null;
  menus: PracticeMenu[];
}

type Row = {
  id: string;
  heldOn: string;
  weekday: number | null;
  startTime: string;
  endTime: string;
  location: string | null;
  note: string | null;
  publishedAt: Date | null;
};

function toPractice(r: Row, menus: PracticeMenu[]): Practice {
  return {
    id: r.id,
    heldOn: r.heldOn,
    weekday: r.weekday ?? 0,
    startTime: toHHMM(r.startTime),
    endTime: toHHMM(r.endTime),
    location: r.location,
    note: r.note,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    menus,
  };
}

const rowColumns = {
  id: practices.id,
  heldOn: practices.heldOn,
  weekday: practices.weekday,
  startTime: practices.startTime,
  endTime: practices.endTime,
  location: practices.location,
  note: practices.note,
  publishedAt: practices.publishedAt,
};

async function loadMenus(
  tx: Parameters<Parameters<typeof withTeam>[1]>[0],
  practiceIds: string[],
): Promise<Map<string, PracticeMenu[]>> {
  const map = new Map<string, PracticeMenu[]>();
  if (practiceIds.length === 0) return map;
  const rows = await tx
    .select({
      id: practiceMenus.id,
      practiceId: practiceMenus.practiceId,
      durationMin: practiceMenus.durationMin,
      content: practiceMenus.content,
      sort: practiceMenus.sort,
    })
    .from(practiceMenus)
    .where(inArray(practiceMenus.practiceId, practiceIds))
    .orderBy(asc(practiceMenus.sort), asc(practiceMenus.createdAt));
  for (const m of rows) {
    const list = map.get(m.practiceId) ?? [];
    list.push({
      id: m.id,
      durationMin: m.durationMin,
      content: m.content,
      sort: m.sort,
    });
    map.set(m.practiceId, list);
  }
  return map;
}

/** 月の練習一覧(日付→開始時刻順、メニュー同梱) */
export async function listPracticesByMonth(
  teamId: string,
  month: string,
): Promise<Practice[]> {
  const { from, to } = monthRange(month);
  return withTeam(teamId, async (tx) => {
    const rows = await tx
      .select(rowColumns)
      .from(practices)
      .where(and(gte(practices.heldOn, from), lte(practices.heldOn, to)))
      .orderBy(asc(practices.heldOn), asc(practices.startTime));
    const menus = await loadMenus(
      tx,
      rows.map((r) => r.id),
    );
    return rows.map((r) => toPractice(r, menus.get(r.id) ?? []));
  });
}

export async function getPractice(
  teamId: string,
  practiceId: string,
): Promise<Practice | null> {
  return withTeam(teamId, async (tx) => {
    const [row] = await tx
      .select(rowColumns)
      .from(practices)
      .where(eq(practices.id, practiceId));
    if (!row) return null;
    const menus = await loadMenus(tx, [row.id]);
    return toPractice(row, menus.get(row.id) ?? []);
  });
}

/** 今日以降で最初の練習(ホームの「次回の練習」) */
export async function getNextPractice(
  teamId: string,
  today: string,
): Promise<Practice | null> {
  return withTeam(teamId, async (tx) => {
    const [row] = await tx
      .select(rowColumns)
      .from(practices)
      .where(gte(practices.heldOn, today))
      .orderBy(asc(practices.heldOn), asc(practices.startTime))
      .limit(1);
    if (!row) return null;
    const menus = await loadMenus(tx, [row.id]);
    return toPractice(row, menus.get(row.id) ?? []);
  });
}

async function replaceMenus(
  tx: Parameters<Parameters<typeof withTeam>[1]>[0],
  teamId: string,
  practiceId: string,
  menus: PracticeInput["menus"],
): Promise<void> {
  // メニューは練習の更新に同梱して全置換する(plan.md 設計判断2)。sort は配列順
  await tx
    .delete(practiceMenus)
    .where(eq(practiceMenus.practiceId, practiceId));
  if (menus.length === 0) return;
  await tx.insert(practiceMenus).values(
    menus.map((m, i) => ({
      teamId,
      practiceId,
      durationMin: m.durationMin,
      content: m.content,
      sort: i,
    })),
  );
}

export async function createPractice(
  teamId: string,
  input: PracticeInput,
): Promise<Practice> {
  return withTeam(teamId, async (tx) => {
    const [row] = await tx
      .insert(practices)
      .values({
        teamId,
        heldOn: input.heldOn,
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location,
        note: input.note,
      })
      .returning(rowColumns);
    if (!row) throw new Error("練習の作成に失敗しました");
    await replaceMenus(tx, teamId, row.id, input.menus);
    const menus = await loadMenus(tx, [row.id]);
    return toPractice(row, menus.get(row.id) ?? []);
  });
}

export async function updatePractice(
  teamId: string,
  practiceId: string,
  input: PracticeInput,
): Promise<Practice | null> {
  return withTeam(teamId, async (tx) => {
    const [row] = await tx
      .update(practices)
      .set({
        heldOn: input.heldOn,
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location,
        note: input.note,
        updatedAt: new Date(),
      })
      .where(eq(practices.id, practiceId))
      .returning(rowColumns);
    if (!row) return null;
    await replaceMenus(tx, teamId, row.id, input.menus);
    const menus = await loadMenus(tx, [row.id]);
    return toPractice(row, menus.get(row.id) ?? []);
  });
}

/** 物理削除(plan.md 設計判断7)。出欠・メニューは複合 FK の CASCADE で消える */
export async function deletePractice(
  teamId: string,
  practiceId: string,
): Promise<boolean> {
  return withTeam(teamId, async (tx) => {
    const rows = await tx
      .delete(practices)
      .where(eq(practices.id, practiceId))
      .returning({ id: practices.id });
    return rows.length > 0;
  });
}
