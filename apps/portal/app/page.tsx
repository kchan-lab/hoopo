import { SESSION_COOKIE_NAME, verifySessionToken } from "@hoopo/api";
import { cookies } from "next/headers";
import { AutoLogin } from "./auto-login";

// LIFF 起動 → 自動ログインが基本導線(CLAUDE.md 絶対原則2)。
// セッションがあればそのままホーム、なければ AutoLogin が LIFF 経由でセッションを張る

async function hasSession(): Promise<boolean> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  return (
    (await verifySessionToken(token, secret, {
      expectedRole: "guardian",
    })) !== null
  );
}

export default async function Home() {
  const loggedIn = await hasSession();
  return (
    <main>
      <h1>hoopo − ミニバスれんらくポータル</h1>
      {loggedIn ? (
        <p>ログインしました。初回登録は次のリリースで利用できます。</p>
      ) : (
        <AutoLogin />
      )}
    </main>
  );
}
