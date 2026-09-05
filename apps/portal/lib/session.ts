import {
  principalExists,
  SESSION_COOKIE_NAME,
  type SessionPayload,
  verifySessionToken,
} from "@hoopo/api";
import { cookies } from "next/headers";

// サーバーコンポーネント用のセッション取得。guardian ロールのみ通す(絶対原則6)。
// teamId は env の単一チームと一致するものだけを有効とする(API の requireGuardian と同じ規則)
export async function getGuardianSession(): Promise<SessionPayload | null> {
  const secret = process.env.SESSION_SECRET;
  const teamId = process.env.TEAM_ID;
  if (!secret || !teamId) return null;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token, secret, {
    expectedRole: "guardian",
  });
  // API の requireGuardian / requireCoach と同じく、DB 上の行の存在まで確認する
  // (削除・失効した主体のセッションで SSR ページを読めないようにする)
  if (!session || session.teamId !== teamId) return null;
  return (await principalExists(session)) ? session : null;
}
