import { children, withTeam } from "@hoopo/db";
import { and, asc, desc, eq } from "drizzle-orm";

// 保護者のチーム名簿(team-roster/plan.md 7a。REQUIREMENTS §4.2-7)。
// 表示は氏名・呼び名・学年のみ(設計判断1)。伝達事項・招待コード・保護者数は管理側だけの情報

export interface TeamMember {
  id: string;
  name: string;
  nicknameKana: string | null;
  grade: number;
}

// 全メンバー一覧: 有効(active)かつ非アーカイブの部員を学年降順→名前で返す
// (部員管理・出欠と同じ並び規則)
export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  return withTeam(teamId, async (tx) =>
    tx
      .select({
        id: children.id,
        name: children.name,
        nicknameKana: children.nicknameKana,
        grade: children.grade,
      })
      .from(children)
      .where(and(eq(children.archived, false), eq(children.status, "active")))
      .orderBy(desc(children.grade), asc(children.name)),
  );
}
