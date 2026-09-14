"use client";

import type { Practice, PracticePreset } from "@hoopo/api";
import { BULK_MAX } from "@hoopo/api/practices-shared";
import {
  type CalendarCell,
  formatDateLabel,
  formatTimeShort,
  monthGrid,
  WEEKDAY_SHORT,
} from "@hoopo/api/tokyo-date";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

// カレンダーからのまとめ登録(schedule-bulk-entry/plan.md)。
// - 既存の行入力は置き換えず、その上に並べて足す(設計判断1)。1 コマの修正・メニュー入力は従来どおり行編集
// - 曜日見出しをタップするとその月の同じ曜日をまとめて選ぶ(設計判断6)。「毎週土日」の運用に効く
// - すでに練習がある日も選べる(午前・午後の 2 コマがあり得るため。設計判断4)。
//   ただし ● で区別し、選ぶと「うち N 日はすでに練習があります」と注意を出す(ブロックはしない)
// - 入力は 開始・終了・場所・備考 の 4 つだけ。メニューは練習ごとに違うので後から行編集で足す(設計判断5)
// - 日付・曜日は Asia/Tokyo 固定の monthGrid / formatDateLabel を使う(設計判断7。保護者アプリと同じ純関数)

interface BulkForm {
  startTime: string;
  endTime: string;
  location: string;
  note: string;
}

/** 実績(プリセット)が無いチームの初期値 */
const DEFAULT_FORM: BulkForm = {
  startTime: "09:00",
  endTime: "12:00",
  location: "",
  note: "",
};

function presetToForm(p: PracticePreset): BulkForm {
  return {
    startTime: p.startTime,
    endTime: p.endTime,
    location: p.location ?? "",
    note: "",
  };
}

const presetKey = (p: PracticePreset) =>
  `${p.startTime}-${p.endTime}-${p.location ?? ""}`;

export function BulkCalendar({
  month,
  today,
  practices,
  presets,
}: {
  month: string;
  /** Asia/Tokyo の今日。クライアントで求めると SSR と食い違うのでサーバーから渡す */
  today: string;
  practices: Practice[];
  presets: PracticePreset[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  // 一番よく使う時間帯を初期値にしておくと「曜日タップ → まとめて追加」の 2 操作で済む
  const [form, setForm] = useState<BulkForm>(() =>
    presets[0] ? presetToForm(presets[0]) : DEFAULT_FORM,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const weeks = useMemo(() => monthGrid(month), [month]);
  // 日付 → その日に登録済みの練習件数(● の表示と注意文言に使う)
  const countByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of practices) m.set(p.heldOn, (m.get(p.heldOn) ?? 0) + 1);
    return m;
  }, [practices]);

  /** その月の同じ曜日(前後の月の埋め草は除く)。monthGrid は日曜始まりなので列番号 = 曜日 */
  const datesOfWeekday = (weekday: number): string[] =>
    weeks.flatMap((week) => {
      const c = week[weekday];
      return c?.inMonth ? [c.date] : [];
    });

  const toggleDay = (date: string) => {
    // 前回の「N 件を追加しました」は次の選択を始めた時点で消す(古い結果を残さない)
    setDone(null);
    setSelected((prev) =>
      prev.includes(date)
        ? prev.filter((d) => d !== date)
        : [...prev, date].sort(),
    );
  };

  // 全部選ばれていれば解除、そうでなければ全部選ぶ(トグル。設計判断6)
  const toggleWeekday = (weekday: number) => {
    const dates = datesOfWeekday(weekday);
    setDone(null);
    setSelected((prev) =>
      dates.every((d) => prev.includes(d))
        ? prev.filter((d) => !dates.includes(d))
        : [...new Set([...prev, ...dates])].sort(),
    );
  };

  const update = (patch: Partial<BulkForm>) =>
    setForm((f) => ({ ...f, ...patch }));

  async function submit() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/practices/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dates: selected,
          startTime: form.startTime,
          endTime: form.endTime,
          location: form.location,
          note: form.note,
        }),
      });
      const b = (await res.json().catch(() => null)) as {
        error?: string;
        practices?: Practice[];
      } | null;
      if (!res.ok) {
        // 検証エラーはサーバーの日本語文言をそのまま見せる(行入力と同じ流儀)
        setError(b?.error ?? "追加できませんでした");
        setBusy(false);
        return;
      }
      const added = b?.practices?.length ?? selected.length;
      setSelected([]);
      setDone(`${added} 件を追加しました`);
      setBusy(false);
      router.refresh();
    } catch {
      setError("追加できませんでした");
      setBusy(false);
    }
  }

  // すでに練習がある日を何日選んでいるか(注意を出すだけで登録は止めない。設計判断4)
  const overlapping = selected.filter((d) => countByDay.has(d)).length;
  const blockedReason =
    selected.length > BULK_MAX
      ? `一度に登録できるのは${BULK_MAX}日までです`
      : null;

  function renderCell(c: CalendarCell) {
    // 前後の月の埋め草は選べない(まとめ登録は同じ月だけ。API も月またぎを弾く)
    if (!c.inMonth) {
      return (
        <span key={c.date} className="calday mute" aria-hidden="true">
          {c.day}
        </span>
      );
    }
    const n = countByDay.get(c.date) ?? 0;
    return (
      <button
        key={c.date}
        type="button"
        className={`calday${c.date === today ? " today" : ""}`}
        aria-pressed={selected.includes(c.date)}
        aria-label={`${formatDateLabel(c.date)}${n > 0 ? ` 練習${n}件` : ""}`}
        onClick={() => toggleDay(c.date)}
        disabled={busy}
      >
        <span className="dnum">{c.day}</span>
        {n > 0 && (
          <span className="dmark" aria-hidden="true">
            {n > 1 ? `●${n}` : "●"}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="acard calcard">
      <div className="k">カレンダーからまとめて追加</div>
      <p className="anote" style={{ margin: "0.15em 0 0" }}>
        日付をタップして選び、曜日をタップするとその曜日をまとめて選べます(●
        は練習が登録済みの日)
      </p>
      {done !== null && (
        <p className="anotice calmsg" role="status">
          {done}
        </p>
      )}
      <div className="cal2">
        {WEEKDAY_SHORT.map((w, i) => (
          <button
            key={w}
            type="button"
            className="calwk"
            aria-pressed={datesOfWeekday(i).every((d) => selected.includes(d))}
            aria-label={`${w}曜をまとめて選ぶ`}
            onClick={() => toggleWeekday(i)}
            disabled={busy}
          >
            {w}
          </button>
        ))}
        {weeks.flat().map((c) => renderCell(c))}
      </div>

      {selected.length > 0 && (
        <div className="calbar">
          <div className="calhead">
            <b className="calcount">{`${selected.length} 日を選択中`}</b>
            <button
              type="button"
              className="abtn"
              onClick={() => setSelected([])}
              disabled={busy}
            >
              選択を解除
            </button>
          </div>
          {overlapping > 0 && (
            <p className="anotice calmsg">
              {`うち ${overlapping} 日はすでに練習があります`}
            </p>
          )}
          {error !== null && (
            <p className="lgerr" role="alert">
              {error}
            </p>
          )}
          {presets.length > 0 && (
            <div className="calpre">
              <span className="k">よく使う時間帯</span>
              {presets.map((p) => (
                <button
                  key={presetKey(p)}
                  type="button"
                  className="abtn"
                  onClick={() => setForm(presetToForm(p))}
                  disabled={busy}
                >
                  {`${formatTimeShort(p.startTime)}–${formatTimeShort(p.endTime)} ${p.location ?? "場所未定"}`}
                </button>
              ))}
            </div>
          )}
          <div className="pgrid">
            <label>
              開始
              <input
                type="time"
                className="afld"
                value={form.startTime}
                onChange={(e) => update({ startTime: e.target.value })}
                required
              />
            </label>
            <label>
              終了
              <input
                type="time"
                className="afld"
                value={form.endTime}
                onChange={(e) => update({ endTime: e.target.value })}
                required
              />
            </label>
            <label>
              場所
              <input
                className="afld"
                value={form.location}
                onChange={(e) => update({ location: e.target.value })}
                placeholder="粉浜小学校 体育館"
                maxLength={100}
              />
            </label>
            <label className="wide">
              備考
              <input
                className="afld"
                value={form.note}
                onChange={(e) => update({ note: e.target.value })}
                placeholder="水筒持参・練習試合 など"
                maxLength={500}
              />
            </label>
          </div>
          <div className="pfoot calfoot">
            <button
              type="button"
              className="abtn fill"
              onClick={submit}
              disabled={busy || blockedReason !== null}
              title={blockedReason ?? undefined}
            >
              {busy ? "追加しています…" : "まとめて追加"}
            </button>
            {blockedReason !== null && (
              <span className="anote" style={{ margin: 0 }}>
                {blockedReason}
              </span>
            )}
            <span className="anote" style={{ margin: 0 }}>
              練習メニューは追加したあと行編集から登録します
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
