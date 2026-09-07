"use client";

import type { ArchivedMemberRow } from "@hoopo/api";
import { TOKYO_TZ } from "@hoopo/api/tokyo-date";
import { useRouter } from "next/navigation";
import { useState } from "react";

// 卒団した部員のデータ削除(member-deletion/plan.md。REQUIREMENTS §5.2)。
// 破壊的操作なので行内の二段階確認にする(CLAUDE.md 開発ルール。ネイティブ confirm() は使わない)。
// 削除できるのは卒団済みだけ(設計判断1)、物理削除で元に戻せない(判断4)、
// 紐づきが無くなった保護者も一緒に消える(判断2)ことを確認文で明示する

/** "2026/3/31"(Asia/Tokyo 固定。CLAUDE.md 開発ルール) */
function formatDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TOKYO_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")}`;
}

export function ArchivedMembers({ members }: { members: ArchivedMemberRow[] }) {
  const router = useRouter();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  async function remove(childId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/members/${childId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "削除できませんでした");
        setBusy(false);
        return;
      }
      setConfirmId(null);
      setBusy(false);
      setDeleted(true);
      // 一覧と実行ログはサーバーコンポーネントが持つので、再取得で反映する
      router.refresh();
    } catch {
      setError("削除できませんでした");
      setBusy(false);
    }
  }

  return (
    <>
      {deleted && <p className="anotice">削除しました</p>}
      {members.length === 0 ? (
        <p className="anote">卒団した部員はいません</p>
      ) : (
        members.map((m) => (
          <div className="arow gone" key={m.id}>
            <b>{m.name}</b>
            <span>
              {m.grade}年 / 卒団{" "}
              {m.archivedAt === null ? "−" : formatDate(m.archivedAt)}
            </span>
            {confirmId === m.id ? (
              <fieldset className="confirm">
                <legend className="sr-only">{`${m.name}のデータを削除する確認`}</legend>
                <span className="q">
                  {`${m.name}のデータを削除します。削除すると元に戻せません。紐づく保護者の登録も、他にお子さんがいなければ削除されます。削除しますか?`}
                </span>
                <button
                  type="button"
                  className="abtn"
                  onClick={() => setConfirmId(null)}
                  disabled={busy}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  className="abtn fill"
                  onClick={() => remove(m.id)}
                  disabled={busy}
                >
                  {busy ? "削除しています…" : "削除する"}
                </button>
              </fieldset>
            ) : (
              <button
                type="button"
                className="abtn"
                onClick={() => {
                  setConfirmId(m.id);
                  setError(null);
                }}
              >
                データを削除
              </button>
            )}
          </div>
        ))
      )}
      {error !== null && (
        <p className="lgerr" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
