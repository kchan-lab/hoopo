"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// 無効化(破壊的操作: CLAUDE.md 開発ルール「確認ダイアログ+実行ログ」)。
// ネイティブの confirm() ではなく行内の二段階確認にする(モノトーンで表現、キーボード操作可)。
// 実行ログは DB の status / updated_at に残る

export function RevokeButton({
  kind,
  childId,
  guardianId,
  label,
}: {
  kind: "child" | "link";
  childId: string;
  guardianId: string | null;
  label: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/registrations/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          childId,
          guardianId: guardianId ?? undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "無効化できませんでした");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("無効化できませんでした");
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
        無効化
      </button>
    );
  }
  return (
    <fieldset className="confirm">
      <legend className="sr-only">{`${label}を無効化する確認`}</legend>
      <span className="q">
        {label}を無効化しますか?(保護者から見えなくなります)
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
        onClick={revoke}
        disabled={busy}
      >
        {busy ? "無効化しています…" : "無効化する"}
      </button>
      {error !== null && (
        <p className="lgerr" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
