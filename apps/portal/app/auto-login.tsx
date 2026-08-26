"use client";

import { useEffect, useState } from "react";

// LIFF の初期化と自動ログイン(REQUIREMENTS.md §2・§3)。
// - LIFF 内: 起動済みセッションから ID トークンを取得してサーバー検証へ
// - 外部ブラウザ: liff.login() で LINE ログインへフォールバック(plan.md 設計判断7)
// - フェイクモード(NEXT_PUBLIC_AUTH_FAKE=1)はローカル/E2E 専用。LIFF SDK を介さず
//   fake トークンを送る(サーバー側の受理も AUTH_FAKE=1 のときのみ)

async function getIdToken(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_AUTH_FAKE === "1") {
    return `fake:U${"0".repeat(32)}`;
  }
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) {
    throw new Error("NEXT_PUBLIC_LIFF_ID が設定されていません");
  }
  const liff = (await import("@line/liff")).default;
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) {
    liff.login(); // LINE ログインへ遷移するため、ここでは何も返さない
    return null;
  }
  return liff.getIDToken();
}

export function AutoLogin() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const idToken = await getIdToken();
      if (cancelled || idToken === null) return;
      const res = await fetch("/api/auth/line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) throw new Error(`ログイン失敗 (${res.status})`);
      if (!cancelled) window.location.reload();
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return failed ? (
    <p>ログインできませんでした。LINEのリンクから開き直してください。</p>
  ) : (
    <p>ログインしています…</p>
  );
}
