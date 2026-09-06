"use client";

import { useState } from "react";

// 自分の連携を解除する(family-links/plan.md)。破壊的操作なので、ネイティブの confirm() ではなく
// 行内の二段階確認にする(CLAUDE.md 開発ルール)。最後の保護者は API 側が 409 で断る

export function UnlinkButton({
  childId,
  childName,
}: {
  childId: string;
  childName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlink() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/family-links/${childId}`, {
        method: "DELETE",
      });
      if (res.status === 204) {
        // 解除した子が最後の1人なら分岐画面に戻るので、ホームから読み直す
        window.location.href = "/";
        return;
      }
      setError(
        res.status === 409
          ? "最後の保護者は解除できません(卒団・退団の削除はコーチへ)"
          : "解除できませんでした。もう一度お試しください",
      );
      setBusy(false);
    } catch {
      setError("解除できませんでした。もう一度お試しください");
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="addlink boxed"
        onClick={() => setConfirming(true)}
      >
        連携を解除
      </button>
    );
  }
  return (
    <div className="unlink-confirm">
      <span className="q">{childName}さんとの連携を解除しますか?</span>
      <div className="btns">
        <button
          type="button"
          className="cta inline sec2"
          onClick={() => setConfirming(false)}
          disabled={busy}
        >
          キャンセル
        </button>
        <button
          type="button"
          className="cta inline"
          onClick={unlink}
          disabled={busy}
        >
          {busy ? "解除しています…" : "解除する"}
        </button>
      </div>
      {error !== null && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
