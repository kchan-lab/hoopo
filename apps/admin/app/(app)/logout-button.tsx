"use client";

import { useState } from "react";

// 共有 PC での利用を想定した明示的なログアウト(packages/api/admin-app.ts の導線と対)

export function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      // 失敗時はボタンを戻して再試行できるようにする
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="abtn"
      onClick={handleClick}
      disabled={busy}
    >
      ログアウト
    </button>
  );
}
