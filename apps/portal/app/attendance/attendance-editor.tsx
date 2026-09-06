"use client";

import {
  ATTENDANCE_LABELS,
  ATTENDANCE_STATUSES,
  type AttendanceAnswer,
  type AttendanceStatus,
  COMMENT_MAX,
  nextAnswer,
  UNANSWERED_LABEL,
} from "@hoopo/api/attendances-shared";
import {
  addMonths,
  formatDateLabel,
  formatMonthLabel,
  formatTimeShort,
  monthGrid,
  WEEKDAY_SHORT,
} from "@hoopo/api/tokyo-date";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "../icons";
import {
  ATTENDANCE_VIEW_COOKIE_NAME,
  type ScheduleView,
  ViewToggle,
} from "../schedule/view-toggle";

// 提出画面の編集(ワイヤー10・11)。リストとカレンダーは同じローカル状態を見るので完全に同期し、
// CTA を押したときだけ PUT /api/attendance でお子さん単位に一括保存する(plan.md 設計判断2)。
// 表示形式の切替は遷移せずローカルで行い、編集中の内容を失わない(Cookie には次回のために書く)

/** SSR から渡す練習(@hoopo/api の Practice のうち、この画面で使う項目) */
interface PracticeItem {
  id: string;
  heldOn: string;
  startTime: string;
  endTime: string;
  location: string | null;
}

interface ChildItem {
  id: string;
  name: string;
}

interface Answer {
  status: AttendanceStatus;
  comment: string | null;
}

/** 未回答は "none"(DB では行を持たない)。<select> の値としても使う */
const NONE = "none";
const CELL_CLASS: Record<AttendanceStatus | typeof NONE, string> = {
  none: "s-none",
  full: "s-full",
  partial: "s-part",
  absent: "s-abs",
};

type Draft = Record<string, { status: AttendanceAnswer; comment: string }>;

function toDraft(practices: PracticeItem[], answers: Record<string, Answer>) {
  const draft: Draft = {};
  for (const p of practices) {
    const a = answers[p.id];
    draft[p.id] = { status: a?.status ?? null, comment: a?.comment ?? "" };
  }
  return draft;
}

const labelOf = (status: AttendanceAnswer) =>
  status === null ? UNANSWERED_LABEL : ATTENDANCE_LABELS[status];

export function AttendanceEditor({
  month,
  initialView,
  childList,
  childId,
  practices,
  answers,
}: {
  month: string;
  initialView: ScheduleView;
  childList: ChildItem[];
  childId: string;
  practices: PracticeItem[];
  answers: Record<string, Answer>;
}) {
  const router = useRouter();
  const [view, setView] = useState<ScheduleView>(initialView);
  const [draft, setDraft] = useState<Draft>(() => toDraft(practices, answers));
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answered = practices.filter(
    (p) => (draft[p.id]?.status ?? null) !== null,
  ).length;

  function edit(practiceId: string, patch: Partial<Draft[string]>) {
    setSaved(false);
    setDraft((prev) => ({
      ...prev,
      [practiceId]: {
        status: prev[practiceId]?.status ?? null,
        comment: prev[practiceId]?.comment ?? "",
        ...patch,
      },
    }));
  }

  // 一括チップ(すべて「参加」にする / 未回答に戻す)
  function bulk(status: AttendanceAnswer) {
    setSaved(false);
    setDraft((prev) => {
      const next: Draft = {};
      for (const p of practices) {
        next[p.id] = { status, comment: prev[p.id]?.comment ?? "" };
      }
      return next;
    });
  }

  async function submit() {
    setSubmitting(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId,
          answers: practices.map((p) => {
            const status = draft[p.id]?.status ?? null;
            return {
              practiceId: p.id,
              status,
              // コメントは「途中参加・早退」のときだけ送る(サーバー側でも同じ規則)
              comment:
                status === "partial" ? (draft[p.id]?.comment ?? "") : null,
            };
          }),
        }),
      });
      if (res.ok) {
        setSaved(true);
        setSubmitting(false);
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? "提出できませんでした。もう一度お試しください");
    } catch {
      setError("提出できませんでした。もう一度お試しください");
    }
    setSubmitting(false);
  }

  const hrefFor = (target: string, child = childId) =>
    `/attendance?month=${target}&view=${view}&child=${child}`;

  // カレンダーは日付単位。同じ日に複数の練習があるときは1件目の状態を表示し、
  // タップはその日の全件に同じ回答を適用する(細かい指定はリストで行う)
  const byDay = new Map<string, PracticeItem[]>();
  for (const p of practices) {
    byDay.set(p.heldOn, [...(byDay.get(p.heldOn) ?? []), p]);
  }

  function cycleDay(date: string) {
    const list = byDay.get(date);
    const head = list?.[0];
    if (!head) return;
    const next = nextAnswer(draft[head.id]?.status ?? null);
    setSaved(false);
    setDraft((prev) => {
      const updated = { ...prev };
      for (const p of list) {
        updated[p.id] = { status: next, comment: prev[p.id]?.comment ?? "" };
      }
      return updated;
    });
  }

  return (
    <>
      <header className="sc-head">
        <h1 className="sc-title">
          参加予定の提出
          <ViewToggle
            view={view}
            month={month}
            cookieName={ATTENDANCE_VIEW_COOKIE_NAME}
            onSelect={setView}
          />
        </h1>
      </header>
      <main className="sc-body">
        {childList.length > 1 && (
          <nav className="seg2 links" aria-label="お子さんの切替">
            {childList.map((c) => (
              <Link
                key={c.id}
                href={hrefFor(month, c.id)}
                aria-current={c.id === childId ? "true" : undefined}
              >
                {c.name}
              </Link>
            ))}
          </nav>
        )}

        <nav className="month-nav" aria-label="表示する月">
          <Link href={hrefFor(addMonths(month, -1))} aria-label="前の月">
            <Icon name="chevl" />
          </Link>
          <span>{formatMonthLabel(month)}</span>
          <Link href={hrefFor(addMonths(month, 1))} aria-label="次の月">
            <Icon name="chevr" />
          </Link>
        </nav>

        {error !== null && (
          <p className="err" role="alert">
            {error}
          </p>
        )}

        {practices.length === 0 ? (
          <p className="sync">
            {formatMonthLabel(month)}の練習はまだ登録されていません
          </p>
        ) : view === "list" ? (
          <>
            <div className="chip-row">
              <button
                type="button"
                className="chip"
                onClick={() => bulk("full")}
              >
                すべて「参加」にする
              </button>
              <button
                type="button"
                className="chip ghost"
                onClick={() => bulk(null)}
              >
                未回答に戻す
              </button>
            </div>
            <div className="sub-list">
              {practices.map((p) => {
                const row = draft[p.id];
                const date = formatDateLabel(p.heldOn);
                return (
                  <div className="sbr" key={p.id}>
                    <div className="top">
                      <div>
                        <div className="d">{date}</div>
                        <div className="p">
                          {formatTimeShort(p.startTime)}–
                          {formatTimeShort(p.endTime)}{" "}
                          {p.location ?? "場所未定"}
                        </div>
                      </div>
                      <select
                        aria-label={`${date}の参加予定`}
                        value={row?.status ?? NONE}
                        onChange={(e) =>
                          edit(p.id, {
                            status:
                              e.target.value === NONE
                                ? null
                                : (e.target.value as AttendanceStatus),
                          })
                        }
                      >
                        <option value={NONE}>{UNANSWERED_LABEL}</option>
                        {ATTENDANCE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {ATTENDANCE_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {row?.status === "partial" && (
                      <input
                        aria-label={`${date}のコメント`}
                        placeholder="例: 11:00ごろ早退します"
                        maxLength={COMMENT_MAX}
                        value={row.comment}
                        onChange={(e) =>
                          edit(p.id, { comment: e.target.value })
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <p className="sync">カレンダー表示とも選択状態が同期します</p>
          </>
        ) : (
          <div className="cal">
            <div className="wk" aria-hidden="true">
              {WEEKDAY_SHORT.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            {monthGrid(month).map((week) => (
              <div className="days" key={week[0]?.date}>
                {week.map((c) => {
                  const list = c.inMonth ? byDay.get(c.date) : undefined;
                  const head = list?.[0];
                  if (!head) {
                    return (
                      <div
                        key={c.date}
                        className={`cell${c.inMonth ? " off" : " mute"}`}
                      >
                        <i>{c.day}</i>
                      </div>
                    );
                  }
                  const status = draft[head.id]?.status ?? null;
                  return (
                    <div
                      key={c.date}
                      className={`cell pr ${CELL_CLASS[status ?? NONE]}`}
                    >
                      <button
                        type="button"
                        onClick={() => cycleDay(c.date)}
                        aria-label={`${formatDateLabel(c.date)} ${labelOf(status)}(タップで切り替え)`}
                      >
                        <i>{c.day}</i>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="legend">
              <em>
                <span className="sw full" /> {ATTENDANCE_LABELS.full}
              </em>
              <em>
                <span className="sw part" /> {ATTENDANCE_LABELS.partial}
              </em>
              <em>
                <span className="sw abs" /> {ATTENDANCE_LABELS.absent}
              </em>
              <em>
                <span className="sw none" /> {UNANSWERED_LABEL}
              </em>
            </div>
          </div>
        )}

        {practices.length > 0 && (
          <>
            {saved && (
              <p className="sync" role="status">
                提出しました
              </p>
            )}
            <button
              type="button"
              className="cta"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? "提出しています…" : "この内容で提出する"}
              <small>
                ( 回答 {answered} / {practices.length} 件 )
              </small>
            </button>
          </>
        )}
      </main>
    </>
  );
}
