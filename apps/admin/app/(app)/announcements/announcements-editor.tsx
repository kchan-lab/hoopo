"use client";

import type {
  Announcement,
  LineMessageLogEntry,
  LineUsageSummary,
} from "@hoopo/api";
import { BODY_MAX, TITLE_MAX } from "@hoopo/api/announcements-shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

// お知らせの一覧と作成・編集フォーム。API 契約は packages/api/src/admin-app.ts の /announcements。
// - 公開の意味は published_at の有無(plan.md 設計判断1)。公開済みを編集しても公開日時は動かない
// - LINE 通知は「通知あり かつ 公開済み」の行から明示的に送る(line-send/plan.md 6c-1)。
//   自動送信にはしない: 公開の操作と通数の消費を切り離す(CLAUDE.md 絶対原則3)
// - 削除・LINE 送信はカード内の二段階確認(破壊的操作。日程管理と同じ流儀)

const PREVIEW_MAX = 60;

const fmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** 送信済みの表示は日付まで("9/7")。時刻はメーター下の送信ログで見る */
const dateFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
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
  lineUsage,
  lineMessages,
}: {
  initialAnnouncements: Announcement[];
  lineUsage: LineUsageSummary;
  lineMessages: LineMessageLogEntry[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmSendId, setConfirmSendId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const memberCount = lineUsage.memberCount;
  // 押せない理由(未連携・人数不明・枠不足)。日程管理の「LINE へ送信」と同じ規則
  const sendBlockedReason = !lineUsage.groupLinked
    ? "LINE グループが未連携です(Bot をグループに招待してください)"
    : memberCount === null
      ? "グループの参加人数を取得できませんでした"
      : lineUsage.remaining < memberCount
        ? `今月の LINE 通数が足りません(残り ${lineUsage.remaining} 通、必要 ${memberCount} 通)`
        : null;

  /** そのお知らせを送信済みなら、最後に送った日時(ISO)。未送信なら null */
  function sentAtOf(id: string): string | null {
    return (
      lineMessages.find(
        (m) => m.kind === "announcement" && m.ref === id && m.status === "sent",
      )?.sentAt ?? null
    );
  }

  // LINE へ送信(二段階確認の後段)。成否ともサーバーに実行ログが残るので終わったら取り直す
  async function sendToLine(id: string) {
    setBusy(true);
    setSendError(null);
    try {
      const res = await fetch("/api/line/send/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setSendError(b?.error ?? "送信できませんでした");
        setBusy(false);
        router.refresh();
        return;
      }
      setConfirmSendId(null);
      setBusy(false);
      router.refresh();
    } catch {
      setSendError("送信できませんでした");
      setBusy(false);
    }
  }

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
        LINE へ通知する(公開後に「LINE へ送信」を押します)
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

      {sendError !== null && (
        <p className="lgerr" role="alert">
          {sendError}
        </p>
      )}

      {initialAnnouncements.map((a) => {
        const sentAt = sentAtOf(a.id);
        // 送信できるのは「公開済み かつ 通知あり」だけ(API 側も同じ条件で 400 を返す)
        const sendable = a.publishedAt !== null && a.notifyLine;
        return (
          <article key={a.id} className="acard" data-announcement-id={a.id}>
            {editingId === a.id ? (
              form
            ) : (
              <>
                <div className="ttl">{a.title}</div>
                <div className="meta">
                  {a.publishedAt
                    ? fmt.format(new Date(a.publishedAt))
                    : "下書き"}
                </div>
                <p className="pbody">{preview(a.body)}</p>
                <div className="acts">
                  <span className="pill">
                    {a.publishedAt ? "公開" : "下書き"}
                  </span>
                  {a.notifyLine && <span className="pill">LINE 通知あり</span>}
                  {sentAt !== null && (
                    <span className="pill">{`送信済み ${dateFmt.format(new Date(sentAt))}`}</span>
                  )}
                  {confirmDeleteId === a.id && (
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
                  )}
                  {confirmSendId === a.id && (
                    <fieldset className="confirm">
                      <legend className="sr-only">LINE 送信の確認</legend>
                      {/* 通数 = 送信回数 × グループ人数。消費と残りを必ず見せる(絶対原則3) */}
                      <span className="q">
                        {`グループ ${memberCount ?? "?"} 人に送信します(${memberCount ?? "?"} 通消費・残り ${Math.max(0, lineUsage.remaining - (memberCount ?? 0))} 通)`}
                        {sentAt !== null && "。このお知らせは送信済みです"}
                      </span>
                      <button
                        type="button"
                        className="abtn"
                        onClick={() => setConfirmSendId(null)}
                        disabled={busy}
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        className="abtn fill"
                        onClick={() => sendToLine(a.id)}
                        disabled={busy}
                      >
                        送信する
                      </button>
                    </fieldset>
                  )}
                  {confirmDeleteId !== a.id && confirmSendId !== a.id && (
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
                      {sendable && (
                        <button
                          type="button"
                          className="abtn"
                          onClick={() => {
                            setSendError(null);
                            setConfirmSendId(a.id);
                          }}
                          disabled={busy || sendBlockedReason !== null}
                          title={sendBlockedReason ?? undefined}
                        >
                          LINE へ送信
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </article>
        );
      })}

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
