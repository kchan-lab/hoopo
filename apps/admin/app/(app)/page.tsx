import { ADMIN_SESSION_COOKIE_NAME, verifySessionToken } from "@hoopo/api";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LogoutButton } from "./logout-button";

// 管理ホーム。coach ロールのセッションだけを通す(expectedRole で保護者セッションを
// 確実に拒否する。絶対原則6「保護者UIと管理UIは別世界」)

async function hasSession(): Promise<boolean> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  return (
    (await verifySessionToken(token, secret, {
      expectedRole: "coach",
    })) !== null
  );
}

export default async function Home() {
  if (!(await hasSession())) {
    redirect("/login");
  }
  return (
    <main className="amain-wrap">
      <p>ログインしました。管理機能は次のリリースから使えます。</p>
      <LogoutButton />
    </main>
  );
}
