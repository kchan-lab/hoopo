"use client";

import type { Practice } from "@hoopo/api";
import { addMonths, formatDateLabel } from "@hoopo/api/tokyo-date";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

// 月の練習一覧と行編集。API 契約は packages/api/admin-app.ts の /practices(CRUD)。
// - 行は「表示」と「編集」を切り替え、保存は行単位(POST / PUT)
// - 練習メニューは編集フォームに同梱し、保存時に全置換(plan.md 設計判断2)
// - 削除は行内の二段階確認(破壊的操作。#67 と同じ流儀)

interface MenuDraft {
  key: number;
  durationMin: string;
  content: string;
}

interface Draft {
  heldOn: string;
  startTime: string;
  endTime: string;
  location: string;
  note: string;
  menus: MenuDraft[];
}

let keySeq = 1;
const nextKey = () => keySeq++;

function toDraft(p: Practice | null, month: string): Draft {
  return {
    heldOn: p?.heldOn ?? `${month}-01`,
    startTime: p?.startTime ?? "09:00",
    endTime: p?.endTime ?? "12:00",
    location: p?.location ?? "",
    note: p?.note ?? "",
    menus: (p?.menus ?? []).map((m) => ({
      key: nextKey(),
      durationMin: m.durationMin === null ? "" : String(m.durationMin),
      content: m.content,
    })),
  };
}

export function ScheduleEditor({
  month,
  monthLabel,
  initialPractices,
}: {
  month: string;
  monthLabel: string;
  initialPractices: Practice[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(p: Practice | null) {
    setEditingId(p?.id ?? "new");
    setDraft(toDraft(p, month));
    setConfirmDeleteId(null);
    setError(null);
  }

  function cancel() {
    setEditingId(null);
    setDraft(null);
    setError(null);
  }

  async function save() {
    if (!draft || !editingId) return;
    setBusy(true);
    setError(null);
    const body = {
      heldOn: draft.heldOn,
      startTime: draft.startTime,
      endTime: draft.endTime,
      location: draft.location,
      note: draft.note,
      menus: draft.menus.map((m) => ({
        durationMin: m.durationMin === "" ? null : Number(m.durationMin),
        content: m.content,
      })),
    };
    try {
      const res = await fetch(
        editingId === "new" ? "/api/practices" : `/api/practices/${editingId}`,
        {
          method: editingId === "new" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
      const res = await fetch(`/api/practices/${id}`, { method: "DELETE" });
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
  const updateMenu = (key: number, patch: Partial<MenuDraft>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            menus: d.menus.map((m) => (m.key === key ? { ...m, ...patch } : m)),
          }
        : d,
    );

  const form = draft && (
    <div className="pform">
      {error !== null && (
        <p className="lgerr" role="alert">
          {error}
        </p>
      )}
      <div className="pgrid">
        <label>
          日付
          <input
            type="date"
            className="afld"
            value={draft.heldOn}
            onChange={(e) => update({ heldOn: e.target.value })}
            required
          />
        </label>
        <label>
          開始
          <input
            type="time"
            className="afld"
            value={draft.startTime}
            onChange={(e) => update({ startTime: e.target.value })}
            required
          />
        </label>
        <label>
          終了
          <input
            type="time"
            className="afld"
            value={draft.endTime}
            onChange={(e) => update({ endTime: e.target.value })}
            required
          />
        </label>
        <label className="wide">
          場所
          <input
            className="afld"
            value={draft.location}
            onChange={(e) => update({ location: e.target.value })}
            placeholder="粉浜小学校 体育館"
            maxLength={100}
          />
        </label>
        <label className="wide">
          備考
          <input
            className="afld"
            value={draft.note}
            onChange={(e) => update({ note: e.target.value })}
            placeholder="水筒持参・練習試合 など"
            maxLength={500}
          />
        </label>
      </div>
      <fieldset className="pmenus">
        <legend className="k">練習メニュー(保護者アプリに表示)</legend>
        {draft.menus.map((m, i) => (
          <div key={m.key} className="pmenu">
            <input
              type="number"
              className="afld min"
              value={m.durationMin}
              onChange={(e) =>
                updateMenu(m.key, { durationMin: e.target.value })
              }
              placeholder="分"
              min={1}
              max={600}
              aria-label={`メニュー${i + 1}の所要時間(分)`}
            />
            <input
              className="afld"
              value={m.content}
              onChange={(e) => updateMenu(m.key, { content: e.target.value })}
              placeholder="アップ・体幹トレーニング"
              maxLength={200}
              aria-label={`メニュー${i + 1}の内容`}
            />
            <button
              type="button"
              className="abtn"
              onClick={() =>
                setDraft((d) =>
                  d
                    ? { ...d, menus: d.menus.filter((x) => x.key !== m.key) }
                    : d,
                )
              }
              aria-label={`メニュー${i + 1}を削除`}
            >
              ×
            </button>
          </div>
        ))}
        {draft.menus.length < 20 && (
          <button
            type="button"
            className="abtn"
            onClick={() =>
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      menus: [
                        ...d.menus,
                        { key: nextKey(), durationMin: "", content: "" },
                      ],
                    }
                  : d,
              )
            }
          >
            ＋ メニューを追加
          </button>
        )}
      </fieldset>
      <div className="pacts">
        <button type="button" className="abtn" onClick={cancel} disabled={busy}>
          キャンセル
        </button>
        <button
          type="button"
          className="abtn fill"
          onClick={save}
          disabled={busy}
        >
          {busy ? "保存しています…" : "保存"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="ah">
        <b>日程管理</b>
        <nav className="month-nav" aria-label="表示する月">
          <Link
            href={`/schedule?month=${addMonths(month, -1)}`}
            className="abtn"
            aria-label="前の月"
          >
            ‹
          </Link>
          <span className="pill">{monthLabel}</span>
          <Link
            href={`/schedule?month=${addMonths(month, 1)}`}
            className="abtn"
            aria-label="次の月"
          >
            ›
          </Link>
        </nav>
      </div>

      <div className="acard">
        {initialPractices.length === 0 && editingId !== "new" && (
          <p className="anote" style={{ marginTop: 0 }}>
            {monthLabel}の練習はまだありません
          </p>
        )}
        <ul className="plist">
          {initialPractices.map((p) => (
            <li key={p.id} className="prow" data-practice-id={p.id}>
              {editingId === p.id ? (
                form
              ) : (
                <>
                  <div className="pmain">
                    <b>
                      {formatDateLabel(p.heldOn)} {p.startTime}–{p.endTime}
                    </b>
                    <span className="sub">
                      {p.location ?? "場所未定"}
                      {p.note && ` / 備考: ${p.note}`}
                      {p.menus.length > 0 && ` / メニュー ${p.menus.length}件`}
                    </span>
                  </div>
                  <div className="pacts">
                    {confirmDeleteId === p.id ? (
                      <fieldset className="confirm">
                        <legend className="sr-only">削除の確認</legend>
                        <span className="q">
                          この練習を削除しますか?(出欠の回答も消えます)
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
                          onClick={() => remove(p.id)}
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
                          onClick={() => startEdit(p)}
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          className="abtn"
                          onClick={() => setConfirmDeleteId(p.id)}
                        >
                          削除
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
          {editingId === "new" && <li className="prow">{form}</li>}
        </ul>
        {editingId === null && (
          <button
            type="button"
            className="abtn"
            style={{ marginTop: "0.6em" }}
            onClick={() => startEdit(null)}
          >
            ＋ 行を追加
          </button>
        )}
      </div>

      <div className="pfoot">
        <button
          type="button"
          className="abtn fill"
          disabled
          title="予定表の発行は #26 / #27 で実装"
        >
          予定表を発行してLINEへ送信(準備中)
        </button>
      </div>
      <div className="acard">
        <div className="k">今月のLINE通数</div>
        <div className="v">
          − <small>/ 200通(無料枠)</small>
        </div>
        <div className="bar">
          <i style={{ width: "0%" }} />
        </div>
        <p className="anote">
          1回の送信でグループ人数分を消費します(カウンターは #27 で有効化)
        </p>
      </div>
    </>
  );
}
