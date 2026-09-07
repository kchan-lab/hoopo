// LINE グループ連携(line-send/plan.md 6c-2)。Webhook が受け取った groupId を teams に保存する。
// 保持するのは groupId 1 件だけ(送信の宛先。絶対原則3・4)。イベント本文・userId は扱わない。
// teams は id 自身がテナント境界なので、RLS(id = app.team_id)+ 明示の id 条件で二重に絞る

import { teams, withTeam } from "@hoopo/db";
import { and, eq, isNull } from "drizzle-orm";

export interface LineGroupUpdate {
  updated: boolean;
}

/**
 * join イベントのグループを記録する。既に別のグループが入っていれば上書きしない(=最初のグループを守る)。
 * 誤って別グループへ Bot を招待しても送信先が奪われないようにするための「最初勝ち」(設計判断4)。
 * 同じ groupId の再招待も既に入っているので updated: false になる
 */
export async function setLineGroupId(
  teamId: string,
  groupId: string,
): Promise<LineGroupUpdate> {
  return withTeam(teamId, async (tx) => {
    const rows = await tx
      .update(teams)
      .set({ lineGroupId: groupId, updatedAt: new Date() })
      .where(and(eq(teams.id, teamId), isNull(teams.lineGroupId)))
      .returning({ id: teams.id });
    return { updated: rows.length > 0 };
  });
}

/**
 * leave イベントで連携を解除する。今つながっているグループと一致するときだけ消す
 * (別グループの leave で本命の連携が外れないようにする)
 */
export async function clearLineGroupId(
  teamId: string,
  groupId: string,
): Promise<LineGroupUpdate> {
  return withTeam(teamId, async (tx) => {
    const rows = await tx
      .update(teams)
      .set({ lineGroupId: null, updatedAt: new Date() })
      .where(and(eq(teams.id, teamId), eq(teams.lineGroupId, groupId)))
      .returning({ id: teams.id });
    return { updated: rows.length > 0 };
  });
}

/** 送信先のグループ ID(未連携なら null)。送信 API の groupLinked 判定に使う */
export async function getLineGroupId(teamId: string): Promise<string | null> {
  return withTeam(teamId, async (tx) => {
    const row = await tx.query.teams.findFirst({
      where: eq(teams.id, teamId),
      columns: { lineGroupId: true },
    });
    return row?.lineGroupId ?? null;
  });
}
