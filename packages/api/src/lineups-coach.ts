import { children, lineups, practices, withTeam } from "@hoopo/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { type LineupInput, POSITIONS, type Position } from "./lineups-shared";
import { getPractice, type Practice } from "./practices";

// 管理側の出場メンバー編成ロジック(lineups/plan.md 7b-1)。契約は plan.md の「API 契約」。
// 保存は全置換(delete → insert。設計判断2)。スターターは5人未満でも保存できる(編成途中)

/** 編成に出す部員の最小情報(個人情報は最小保持。氏名・呼び名・学年のみ) */
export interface LineupChild {
  id: string;
  name: string;
  nicknameKana: string | null;
  grade: number;
}

export interface LineupStarter {
  child: LineupChild;
  position: Position;
}

export interface LineupBenchEntry {
  child: LineupChild;
}

export interface CoachLineup {
  practice: Practice;
  /** POSITIONS(PG→C)の順。埋まっていないポジションは要素ごと落ちる */
  starters: LineupStarter[];
  bench: LineupBenchEntry[];
  /** 編成に使える有効な部員(学年降順→名前) */
  members: LineupChild[];
}

export type SaveLineupResult =
  | { ok: true; starters: LineupStarter[]; bench: LineupBenchEntry[] }
  | { ok: false; reason: "not_found" | "invalid_member" };

const childColumns = {
  id: children.id,
  name: children.name,
  nicknameKana: children.nicknameKana,
  grade: children.grade,
};

type Tx = Parameters<Parameters<typeof withTeam>[1]>[0];

/**
 * 有効な部員(active・非アーカイブ)を学年降順→名前で返す。
 * 並びは部員管理(listMembers)・出欠管理と揃え、画面をまたいでも順序が変わらないようにする
 */
function selectActiveChildren(tx: Tx): Promise<LineupChild[]> {
  return tx
    .select(childColumns)
    .from(children)
    .where(and(eq(children.archived, false), eq(children.status, "active")))
    .orderBy(desc(children.grade), asc(children.name));
}

/** ベンチは名簿と同じ並び(学年降順→名前)で返す(DB に順序列は持たない) */
function benchInMemberOrder(
  members: LineupChild[],
  ids: Set<string>,
): LineupBenchEntry[] {
  return members.filter((m) => ids.has(m.id)).map((child) => ({ child }));
}

/**
 * 練習1コマの編成(§5.2 チーム編成)。
 * 練習が無い/他チームのものなら null(存在を漏らさない)。
 * 編成後に無効化・アーカイブされた部員は members に無いので表示から落とす
 */
export async function getLineupForCoach(
  teamId: string,
  practiceId: string,
): Promise<CoachLineup | null> {
  const practice = await getPractice(teamId, practiceId);
  if (!practice) return null;
  return withTeam(teamId, async (tx) => {
    const members = await selectActiveChildren(tx);
    const rows = await tx
      .select({
        childId: lineups.childId,
        role: lineups.role,
        position: lineups.position,
      })
      .from(lineups)
      .where(eq(lineups.practiceId, practice.id));
    const byId = new Map(members.map((m) => [m.id, m]));

    const starters: LineupStarter[] = [];
    for (const position of POSITIONS) {
      const row = rows.find(
        (r) => r.role === "starter" && r.position === position,
      );
      const child = row ? byId.get(row.childId) : undefined;
      if (child) starters.push({ child, position });
    }
    const benchIds = new Set(
      rows.filter((r) => r.role === "bench").map((r) => r.childId),
    );
    return {
      practice,
      starters,
      bench: benchInMemberOrder(members, benchIds),
      members,
    };
  });
}

/**
 * 編成の保存(全置換)。1つのトランザクションで
 * 練習の存在確認 → 部員の有効性確認 → 既存行の削除 → 挿入 を行う。
 * 部員がこのチームの有効な部員でなければ invalid_member(ルートは 400)
 */
export async function saveLineup(
  teamId: string,
  practiceId: string,
  input: LineupInput,
): Promise<SaveLineupResult> {
  return withTeam(teamId, async (tx): Promise<SaveLineupResult> => {
    // RLS 配下なので、他チームの練習はここで見つからない(存在を漏らさず 404)
    const [practice] = await tx
      .select({ id: practices.id })
      .from(practices)
      .where(eq(practices.id, practiceId));
    if (!practice) return { ok: false, reason: "not_found" };

    const ids = [...input.starters.map((s) => s.childId), ...input.bench];
    const members = await selectActiveChildren(tx);
    const byId = new Map(members.map((m) => [m.id, m]));
    // 他チーム・無効化・アーカイブ済みはここで弾く。重複指定も unique 制約に触れる前に弾く
    if (!ids.every((id) => byId.has(id)) || new Set(ids).size !== ids.length) {
      return { ok: false, reason: "invalid_member" };
    }

    await tx.delete(lineups).where(eq(lineups.practiceId, practice.id));
    const values = [
      ...input.starters.map((s) => ({
        teamId,
        practiceId: practice.id,
        childId: s.childId,
        role: "starter" as const,
        position: s.position,
      })),
      ...input.bench.map((childId) => ({
        teamId,
        practiceId: practice.id,
        childId,
        role: "bench" as const,
        position: null,
      })),
    ];
    if (values.length > 0) await tx.insert(lineups).values(values);

    // 応答は GET と同じ並び(スターターは POSITIONS 順、ベンチは学年降順→名前)
    const starters: LineupStarter[] = [];
    for (const position of POSITIONS) {
      const found = input.starters.find((s) => s.position === position);
      const child = found ? byId.get(found.childId) : undefined;
      if (child) starters.push({ child, position });
    }
    return {
      ok: true,
      starters,
      bench: benchInMemberOrder(members, new Set(input.bench)),
    };
  });
}
