"use client";

import {
  ATTENDANCE_LABELS,
  ATTENDANCE_STATUSES,
  type AttendanceAnswer,
  type AttendanceStatus,
  COMMENT_MAX,
  countUnansweredDays,
  nextAnswer,
  submissionState,
  UNANSWERED_LABEL,
  UNANSWERED_MARK,
  unansweredNotice,
} from "@hoopo/api/attendances-shared";
import { fullName } from "@hoopo/api/shared";
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
import { useEffect, useState } from "react";
import { Icon } from "../icons";
import {
  ATTENDANCE_VIEW_COOKIE_NAME,
  type ScheduleView,
  ViewToggle,
} from "../schedule/view-toggle";

// 提出画面の編集(ワイヤー10・11)。リストとカレンダーは同じローカル状態を見るので完全に同期し、
// CTA を押したときだけ PUT /api/attendance でお子さん単位に一括保存する(plan.md 設計判断2)。
// 表示形式の切替は遷移せずローカルで行い、編集中の内容を失わない(Cookie には次回のために書く)。
//
// 提出は「編集 → 確認」の2段(Issue #176)。編集の CTA は確定させず確認へ切り替えるだけで、
// 実際に PUT するのは確認の CTA。state は持ったまま表示だけ切り替えるので、「修正する」で
// 戻っても回答は消えない(attendance-confirm/plan.md 設計判断1・6。登録③と同じ作り)

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
  familyName: string;
  givenName: string;
}

interface Answer {
  status: AttendanceStatus;
  comment: string | null;
}

/** 提出直後の成功表示を出しておく時間。その後は上部の常時表示(submissionState)に委ねる */
const SUCCESS_FLASH_MS = 5000;

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
  initialSubmittedAt,
}: {
  month: string;
  initialView: ScheduleView;
  childList: ChildItem[];
  childId: string;
  practices: PracticeItem[];
  answers: Record<string, Answer>;
  /** この月・このお子さんの最終提出日時(ISO)。未提出は null */
  initialSubmittedAt: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<ScheduleView>(initialView);
  const [draft, setDraft] = useState<Draft>(() => toDraft(practices, answers));
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 月・お子さんの組み合わせごとの状態。親が key で作り直すので初期値のままで良い
  const [submittedAt, setSubmittedAt] = useState<string | null>(
    initialSubmittedAt,
  );
  // 回答を触ったら「未提出の変更があります」に変え、提出に成功したら戻す
  const [dirty, setDirty] = useState(false);
  // 提出の2段(Issue #176)。"confirm" のあいだは回答を変えられない(plan.md 設計判断6)
  const [mode, setMode] = useState<"edit" | "confirm">("edit");

  // 成功表示は数秒で消す(以降は上部の常時表示が現在の状態を伝える)
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), SUCCESS_FLASH_MS);
    return () => clearTimeout(timer);
  }, [saved]);

  const answered = practices.filter(
    (p) => (draft[p.id]?.status ?? null) !== null,
  ).length;
  // 提出後に練習日が増えると未回答が生まれるので、件数も見て状態を決める(Issue #154)
  const state = submissionState(
    month,
    submittedAt,
    dirty,
    practices.length - answered,
  );
  // 確認で出す「未回答が N 日あります」。件数ではなく日数で数える(plan.md 設計判断3)
  const unansweredDays = countUnansweredDays(
    practices.map((p) => ({
      heldOn: p.heldOn,
      status: draft[p.id]?.status ?? null,
    })),
  );
  const notice = unansweredNotice(unansweredDays);

  function edit(practiceId: string, patch: Partial<Draft[string]>) {
    setSaved(false);
    setDirty(true);
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
    setDirty(true);
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
        const body = (await res.json().catch(() => null)) as {
          submittedAt?: string | null;
        } | null;
        // サーバーが返した保存後の日時をそのまま使う(再取得を待たず即時に正しく出せる)。
        // 本文が読めなかったときだけ、直前の表示を保つ(誤って「未提出」に戻さない)
        if (body) setSubmittedAt(body.submittedAt ?? null);
        setDirty(false);
        setSaved(true);
        setSubmitting(false);
        // 成功したら編集へ戻す(「提出しました」と上部の状態表示は編集の画面に出る)。
        // 失敗したときは確認に留まり、そのまま出し直せるようにする
        setMode("edit");
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
    setDirty(true);
    setDraft((prev) => {
      const updated = { ...prev };
      for (const p of list) {
        updated[p.id] = { status: next, comment: prev[p.id]?.comment ?? "" };
      }
      return updated;
    });
  }

  // 提出前の確認(Issue #176)。その月の全練習を日付順に出し、未回答を件数と行の両方で強調する。
  // 回答はここでは変えられないので、直すときは「修正する」で編集へ戻る(plan.md 設計判断2・3・6)
  if (mode === "confirm" && practices.length > 0) {
    return (
      <>
        <header className="sc-head">
          <h1 className="sc-title">
            <button
              type="button"
              className="back addlink"
              aria-label="戻る"
              onClick={() => setMode("edit")}
            >
              ‹
            </button>
            参加予定の確認
          </h1>
        </header>
        <main className="sc-body">
          {error !== null && (
            <p className="err" role="alert">
              {error}
            </p>
          )}
          {/* 未回答の警告。上部の常時表示の「未回答あり」(.sub-state.partial)と
              同じ見た目・同じ記号を使い、新しい色を作らない(DESIGN_GUIDELINES §1) */}
          {notice !== null && (
            <p className="sub-state partial" role="alert">
              <span className="mk" aria-hidden="true">
                {UNANSWERED_MARK}
              </span>
              {notice}
            </p>
          )}
          <p className="help">
            {`${formatMonthLabel(month)}分をこの内容で提出します。直すときは「修正する」を押してください`}
          </p>
          <div className="sub-list">
            {practices.map((p) => {
              const status = draft[p.id]?.status ?? null;
              const comment = draft[p.id]?.comment ?? "";
              return (
                <div
                  className={`sbr${status === null ? " na" : ""}`}
                  key={p.id}
                >
                  <div className="top">
                    <div>
                      <div className="d">{formatDateLabel(p.heldOn)}</div>
                      <div className="p">
                        {formatTimeShort(p.startTime)}–
                        {formatTimeShort(p.endTime)} {p.location ?? "場所未定"}
                      </div>
                    </div>
                    <span className="a">{labelOf(status)}</span>
                  </div>
                  {/* コメントは「途中参加・早退」のときだけ送るので、確認もそのときだけ出す */}
                  {status === "partial" && comment.trim() !== "" && (
                    <p className="help">{comment}</p>
                  )}
                </div>
              );
            })}
          </div>
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
          <button
            type="button"
            className="cta inline sec2"
            onClick={() => setMode("edit")}
            disabled={submitting}
          >
            修正する
          </button>
          {/* 未回答があっても止めない(plan.md 設計判断4)。あとから出し直せることも伝える */}
          {notice !== null && (
            <p className="sync">
              未回答のままでも提出できます(あとから出し直せます)
            </p>
          )}
        </main>
      </>
    );
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
                {fullName(c)}
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

        {practices.length > 0 && (
          <p className={`sub-state ${state.kind}`}>
            <span className="mk" aria-hidden="true">
              {state.mark}
            </span>
            {state.text}
          </p>
        )}

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
                        // 同じ日に練習が複数あるときは、タップでその日の全件にまとめて適用される
                        // (個別に変えたい場合はリスト表示で。plan.md 設計判断6 の補足)
                        title={
                          (list?.length ?? 0) > 1
                            ? `この日の練習${list?.length}件にまとめて適用します(個別の変更はリストで)`
                            : undefined
                        }
                        aria-label={`${formatDateLabel(c.date)} ${labelOf(status)}(タップで切り替え${
                          (list?.length ?? 0) > 1
                            ? `。この日の練習${list?.length}件にまとめて適用`
                            : ""
                        })`}
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
              <p className="sub-ok" role="status">
                <span className="mk" aria-hidden="true">
                  ✓
                </span>
                提出しました
              </p>
            )}
            {/* ここでは確定せず確認へ進む。実際の提出は確認の CTA(Issue #176) */}
            <button
              type="button"
              className="cta"
              onClick={() => {
                setError(null);
                setMode("confirm");
              }}
            >
              内容を確認して提出する
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
