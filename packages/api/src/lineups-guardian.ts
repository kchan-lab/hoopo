import { children, lineups, withTeam } from "@hoopo/db";
import { asc, desc, eq } from "drizzle-orm";
import { POSITIONS, type Position } from "./lineups-shared";
import { getPractice, type Practice } from "./practices";

// 保護者側の出場メンバー参照ロジック(lineups/plan.md 7b-2)。契約は plan.md「7b-2 保護者 API」。
// 閲覧のみ・写真なし(設計判断4)。返すのは名簿と同じ氏名・呼び名・学年だけ

/** チップに出す部員(チーム名簿と同じ最小項目) */
export interface GuardianLineupChild {
  id: string;
  name: string;
  nicknameKana: string | null;
  grade: number;
}

export interface GuardianLineupStarter {
  child: GuardianLineupChild;
  position: Position;
}

export interface GuardianLineupBenchMember {
  child: GuardianLineupChild;
}

export interface GuardianLineup {
  practice: Practice;
  /** POSITIONS(PG→SG→SF→PF→C)の順。空きポジションは要素を持たない */
  starters: GuardianLineupStarter[];
  /** 学年降順→名前(名簿と同じ並び) */
  bench: GuardianLineupBenchMember[];
}

/**
 * 練習1件の出場メンバー。練習が無ければ(他チームの練習を含め)null。
 * 編成が無い練習は starters/bench とも空配列で返す(呼び出し側は 200)
 */
export async function getLineup(
  teamId: string,
  practiceId: string,
): Promise<GuardianLineup | null> {
  const practice = await getPractice(teamId, practiceId);
  if (!practice) return null;
  // 学年降順→名前で取り、ベンチはこの順のまま使う(スターターはポジション順に並べ替える)
  const rows = await withTeam(teamId, (tx) =>
    tx
      .select({
        id: children.id,
        name: children.name,
        nicknameKana: children.nicknameKana,
        grade: children.grade,
        role: lineups.role,
        position: lineups.position,
      })
      .from(lineups)
      .innerJoin(children, eq(children.id, lineups.childId))
      .where(eq(lineups.practiceId, practiceId))
      .orderBy(desc(children.grade), asc(children.name)),
  );
  const toChild = (r: (typeof rows)[number]): GuardianLineupChild => ({
    id: r.id,
    name: r.name,
    nicknameKana: r.nicknameKana,
    grade: r.grade,
  });
  const byPosition = new Map<string, (typeof rows)[number]>();
  const bench: GuardianLineupBenchMember[] = [];
  for (const r of rows) {
    if (r.role === "bench") {
      bench.push({ child: toChild(r) });
    } else if (r.position !== null && !byPosition.has(r.position)) {
      // position は DB の CHECK で 5種類に限定されているが、値の正当性はここでも確かめる
      byPosition.set(r.position, r);
    }
  }
  const starters = POSITIONS.flatMap((position) => {
    const row = byPosition.get(position);
    return row ? [{ child: toChild(row), position }] : [];
  });
  return { practice, starters, bench };
}

/** 編成が1人でもあるか(練習詳細の「出場メンバーはこちら →」の出し分け) */
export async function hasLineup(
  teamId: string,
  practiceId: string,
): Promise<boolean> {
  const rows = await withTeam(teamId, (tx) =>
    tx
      .select({ id: lineups.id })
      .from(lineups)
      .where(eq(lineups.practiceId, practiceId))
      .limit(1),
  );
  return rows.length > 0;
}
