"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// LINE 連携の解除(破壊的操作: CLAUDE.md 開発ルール「確認ダイアログ」)。
// ネイティブの confirm() ではなく行内の二段階確認にする(認定管理の RevokeButton と同じ規範。
// モノトーンで表現でき、キーボード操作もできる)。
// パスワード未設定のコーチは締め出しになるため API が 409 で止める(plan.md 設計判断6)

export function UnlinkLineButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlink() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/line/link", { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "連携を解除できませんでした");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("連携を解除できませんでした");
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="abtn"
        onClick={() => setConfirming(true)}
      >
        連携を解除
      </button>
    );
  }
  return (
    <fieldset className="confirm">
      <legend className="sr-only">LINE 連携を解除する確認</legend>
      <span className="q">
        LINE 連携を解除しますか?(以後はメールとパスワードでログインします)
      </span>
      <button
        type="button"
        className="abtn"
        onClick={() => setConfirming(false)}
        disabled={busy}
      >
        キャンセル
      </button>
      <button
        type="button"
        className="abtn fill"
        onClick={unlink}
        disabled={busy}
      >
        {busy ? "解除しています…" : "解除する"}
      </button>
      {error !== null && (
        <p className="lgerr" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
