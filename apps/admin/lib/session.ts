import {
  ADMIN_SESSION_COOKIE_NAME,
  type SessionPayload,
  verifySessionToken,
} from "@hoopo/api";
import { cookies } from "next/headers";

// サーバーコンポーネント用のセッション取得。coach ロールのみ通す(絶対原則6)。
// teamId は env の単一チームと一致するものだけ有効(API の requireCoach と同じ規則)
export async function getCoachSession(): Promise<SessionPayload | null> {
  const secret = process.env.SESSION_SECRET;
  const teamId = process.env.TEAM_ID;
  if (!secret || !teamId) return null;
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token, secret, {
    expectedRole: "coach",
  });
  return session && session.teamId === teamId ? session : null;
}
