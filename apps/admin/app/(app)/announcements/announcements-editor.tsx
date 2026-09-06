"use client";

import type { Announcement } from "@hoopo/api";
import { BODY_MAX, TITLE_MAX } from "@hoopo/api/announcements-shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

// お知らせの一覧と作成・編集フォーム。API 契約は packages/api/src/admin-app.ts の /announcements。
// - 公開の意味は published_at の有無(plan.md 設計判断1)。公開済みを編集しても公開日時は動かない
// - LINE 通知はフラグを保存するだけ(実送信と通数の計上は 6c #27。設計判断2)
// - 削除はカード内の二段階確認(破壊的操作。日程管理と同じ流儀)

const PREVIEW_MAX = 60;

const fmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** 本文の書き出しだけを1行で見せる(改行は空白に畳む) */
function preview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_MAX ? `${flat.slice(0, PREVIEW_MAX)}…` : flat;
}

interface Draft {
  title: string;
  body: string;
  notifyLine: boolean;
}

function toDraft(a: Announcement | null): Draft {
  return {
    title: a?.title ?? "",
    body: a?.body ?? "",
    notifyLine: a?.notifyLine ?? false,
  };
}

export function AnnouncementsEditor({
  initialAnnouncements,
}: {
  initialAnnouncements: Announcement[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(a: Announcement | null) {
    setEditingId(a?.id ?? "new");
    setDraft(toDraft(a));
    setConfirmDeleteId(null);
    setError(null);
  }

  function cancel() {
    setEditingId(null);
    setDraft(null);
    setError(null);
  }

  async function save(publish: boolean) {
    if (!draft || !editingId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        editingId === "new"
          ? "/api/announcements"
          : `/api/announcements/${editingId}`,
        {
          method: editingId === "new" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...draft, publish }),
        },
      );
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(b?.error ?? "保存できませんでした");
        setBusy(false);
        return;
      }
      cancel();
      setBusy(false);
      router.refresh();
    } catch {
      setError("保存できませんでした");
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("削除できませんでした");
        setBusy(false);
        return;
      }
      setConfirmDeleteId(null);
      setBusy(false);
      router.refresh();
    } catch {
      setError("削除できませんでした");
      setBusy(false);
    }
  }

  const update = (patch: Partial<Draft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  // 公開済みを編集しているときだけ「下書きに戻す」を出し、主ボタンは「更新して公開」にする
  const editingPublished =
    editingId !== null &&
    editingId !== "new" &&
    initialAnnouncements.some((a) => a.id === editingId && a.publishedAt);

  const form = draft && (
    <div className="pform">
      {error !== null && (
        <p className="lgerr" role="alert">
          {error}
        </p>
      )}
      <div className="pgrid">
        <label className="wide">
          タイトル
          <input
            className="afld"
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="9月の予定表を発行しました"
            maxLength={TITLE_MAX}
            required
          />
        </label>
        <label className="wide">
          本文
          <textarea
            className="afld"
            value={draft.body}
            onChange={(e) => update({ body: e.target.value })}
            placeholder="練習の予定を掲載しました。参加予定の提出をお願いします。"
            maxLength={BODY_MAX}
            rows={6}
            required
          />
        </label>
      </div>
      <label className="achk">
        <input
          type="checkbox"
          checked={draft.notifyLine}
          onChange={(e) => update({ notifyLine: e.target.checked })}
        />
        公開時に LINE へ通知する(6c で有効化・現在は保存のみ)
      </label>
      <div className="pacts">
        <button type="button" className="abtn" onClick={cancel} disabled={busy}>
          キャンセル
        </button>
        <button
          type="button"
          className="abtn"
          onClick={() => save(false)}
          disabled={busy}
        >
          {editingPublished ? "下書きに戻す" : "下書き保存"}
        </button>
        <button
          type="button"
          className="abtn fill"
          onClick={() => save(true)}
          disabled={busy}
        >
          {editingPublished ? "更新して公開" : "公開する"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="ah">
        <b>お知らせ</b>
        <span className="cap">
          公開したものだけが保護者のホームに新しい順で出ます
        </span>
      </div>

      {editingId === "new" && <article className="acard">{form}</article>}

      {initialAnnouncements.length === 0 && editingId !== "new" && (
        <p className="anote">お知らせはまだありません</p>
      )}

      {initialAnnouncements.map((a) => (
        <article key={a.id} className="acard" data-announcement-id={a.id}>
          {editingId === a.id ? (
            form
          ) : (
            <>
              <div className="ttl">{a.title}</div>
              <div className="meta">
                {a.publishedAt ? fmt.format(new Date(a.publishedAt)) : "下書き"}
              </div>
              <p className="pbody">{preview(a.body)}</p>
              <div className="acts">
                <span className="pill">
                  {a.publishedAt ? "公開" : "下書き"}
                </span>
                {a.notifyLine && <span className="pill">LINE 通知あり</span>}
                {confirmDeleteId === a.id ? (
                  <fieldset className="confirm">
                    <legend className="sr-only">削除の確認</legend>
                    <span className="q">
                      このお知らせを削除しますか?(元に戻せません)
                    </span>
                    <button
                      type="button"
                      className="abtn"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={busy}
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      className="abtn fill"
                      onClick={() => remove(a.id)}
                      disabled={busy}
                    >
                      削除する
                    </button>
                  </fieldset>
                ) : (
                  <>
                    <button
                      type="button"
                      className="abtn"
                      onClick={() => startEdit(a)}
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      className="abtn"
                      onClick={() => setConfirmDeleteId(a.id)}
                    >
                      削除
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </article>
      ))}

      {editingId === null && (
        <button
          type="button"
          className="abtn"
          style={{ marginTop: "0.7em" }}
          onClick={() => startEdit(null)}
        >
          ＋ お知らせを作成
        </button>
      )}
    </>
  );
}
