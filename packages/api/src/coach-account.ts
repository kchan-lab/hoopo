import { coaches, withTeam } from "@hoopo/db";
import { eq } from "drizzle-orm";

// アカウント画面(/account)の表示データ(admin-line-login/plan.md)。
// SSR から直接呼ぶため API ルートは設けない(他の管理画面と同じ読み取り経路)。
// LINE userId そのものは返さない(暗号文を UI に出す意味がなく、絶対原則4 にも沿う)

export interface CoachAccount {
  email: string;
  authType: string;
  /** LINE 連携済みか(line_user_id_lookup の有無で判定) */
  lineLinked: boolean;
}

export async function getCoachAccount(
  teamId: string,
  coachId: string,
): Promise<CoachAccount | null> {
  const row = await withTeam(teamId, (tx) =>
    tx.query.coaches.findFirst({
      where: eq(coaches.id, coachId),
      columns: { email: true, authType: true, lineUserIdLookup: true },
    }),
  );
  if (!row) return null;
  return {
    email: row.email,
    authType: row.authType,
    lineLinked: row.lineUserIdLookup !== null,
  };
}
