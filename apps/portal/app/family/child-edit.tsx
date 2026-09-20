"use client";

import {
  gradeLabel,
  HEIGHT_MAX,
  HEIGHT_MIN,
  todayTokyo,
} from "@hoopo/api/grade-shared";
import {
  AVAILABILITY_HINT,
  type AvailabilitySlot,
  buildAvailabilities,
  type ChildDetail,
  DEFAULT_END_TIME,
  DEFAULT_START_TIME,
  fullName,
  GENDER_LABELS,
  type Gender,
  NAME_PART_MAX,
  NOT_SET,
  parseAvailabilities,
  sameTimeNote,
  type TimeRange,
  WEEKDAY_LABELS,
} from "@hoopo/api/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { GradeHint } from "../grade-hint";

// お子さんの情報の修正(REQUIREMENTS §4.2-9。child-birthdate-height/plan.md 設計判断5)。
// 名前は姓・名とそれぞれの読みの4欄(child-name-split/plan.md 設計判断1・2・6。
// 並びは 1段目=姓・名、2段目=姓のよみ・名のよみ、続けて呼び名)。
// 登録は初回の1回だけという原則(絶対原則2)の裏返しで、あとから直す手段が無いと
// 打ち間違い・身長の伸びを保護者が自分で直せない。画面遷移を増やさず、行内で
// 「編集」→ 入力 →「保存」だけで完結させる。学年は生年月日から再計算され、
// 保存後の値は PATCH の応答(サーバーの算出結果)をそのまま表示する

/** 画面が扱う子ども情報。参加できる時間帯は別テーブルなので ChildDetail に足して受け取る */
export interface EditableChild extends ChildDetail {
  availabilities: AvailabilitySlot[];
}

/** 曜日ごとの時間がすべて同じかどうか(「すべての曜日に同じ時間を使う」の初期値) */
function allSameTime(slots: AvailabilitySlot[]): boolean {
  const first = slots[0];
  if (!first) return true;
  return slots.every(
    (s) => s.startTime === first.startTime && s.endTime === first.endTime,
  );
}

/**
 * 既存の枠から、画面が持つ3つの状態(選んだ曜日 / 共通の時間 / 曜日ごとの時間)と
 * チェックの初期値を作る(availability-common-time/plan.md 設計判断4・7)。
 * 共通の時間は先頭の曜日の時間。枠が無ければ既定値(登録②で何も触らないときと同じ)
 */
function initialAvailability(slots: AvailabilitySlot[]): {
  weekdays: number[];
  commonTime: TimeRange;
  perWeekdayTimes: Record<number, TimeRange>;
  sameTime: boolean;
} {
  const sorted = [...slots].sort((a, b) => a.weekday - b.weekday);
  const perWeekdayTimes: Record<number, TimeRange> = {};
  for (const s of sorted) {
    perWeekdayTimes[s.weekday] = {
      startTime: s.startTime,
      endTime: s.endTime,
    };
  }
  const first = sorted[0];
  return {
    weekdays: sorted.map((s) => s.weekday),
    commonTime: first
      ? { startTime: first.startTime, endTime: first.endTime }
      : { startTime: DEFAULT_START_TIME, endTime: DEFAULT_END_TIME },
    perWeekdayTimes,
    // 全曜日の時間が同じならチェックを入れた状態で始める(判定は従来どおり allSameTime)
    sameTime: allSameTime(sorted),
  };
}

export function ChildEdit({ child }: { child: EditableChild }) {
  const router = useRouter();
  // 学年判定の基準日(Asia/Tokyo の今日)。入力中の表示は目安で、正はサーバー
  const [today] = useState(todayTokyo);
  // 表示の正は「最後にサーバーが返した値」。props は再描画のたびに上書きされうるので、
  // 保存直後は PATCH の応答を持っておく(router.refresh() 後も同じ値に落ち着く)
  const [detail, setDetail] = useState(child);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [familyName, setFamilyName] = useState(child.familyName);
  const [familyNameKana, setFamilyNameKana] = useState(child.familyNameKana);
  const [givenName, setGivenName] = useState(child.givenName);
  const [givenNameKana, setGivenNameKana] = useState(child.givenNameKana);
  const [nicknameKana, setNicknameKana] = useState(child.nicknameKana ?? "");
  const [birthDate, setBirthDate] = useState(child.birthDate ?? "");
  const [heightCm, setHeightCm] = useState(
    child.heightCm === null ? "" : String(child.heightCm),
  );
  const [gender, setGender] = useState<Gender>(child.gender);
  // 参加できる曜日と時間(availability-slots/plan.md 設計判断1)。
  // 登録後に直す手段が無いと、打ち間違いや曜日の変更に保護者が対応できない。
  // 状態の持ち方と見せ方は登録②とそろえる(availability-common-time/plan.md 設計判断4・7)
  const initial = initialAvailability(child.availabilities);
  const [weekdays, setWeekdays] = useState<number[]>(initial.weekdays);
  const [commonTime, setCommonTime] = useState<TimeRange>(initial.commonTime);
  const [perWeekdayTimes, setPerWeekdayTimes] = useState<
    Record<number, TimeRange>
  >(initial.perWeekdayTimes);
  const [sameTime, setSameTime] = useState(initial.sameTime);
  // 保存する値はいつも3つの状態から組み立てる(設計判断4・6。値の形は変えない)
  const slots = buildAvailabilities({
    weekdays,
    commonTime,
    sameTime,
    perWeekdayTimes,
  });

  /** 曜日の選択を入れ替える。時間は曜日と別に持つので、外しても入れた時間は消えない */
  function toggleWeekday(weekday: number) {
    const next = weekdays.includes(weekday)
      ? weekdays.filter((d) => d !== weekday)
      : [...weekdays, weekday].sort((a, b) => a - b);
    setWeekdays(next);
    // 曜日が0件になったらチェックを既定(入)へ戻す(登録②と同じ。設計判断2)
    if (next.length === 0) setSameTime(true);
  }

  /** 曜日ごとの時間の変更(チェックを外しているときだけ使う。設計判断3) */
  function setWeekdayTime(weekday: number, patch: Partial<TimeRange>) {
    setPerWeekdayTimes((prev) => ({
      ...prev,
      [weekday]: { ...(prev[weekday] ?? commonTime), ...patch },
    }));
  }

  /** チェックの入れ替え。外した直後の各行は、そのときの共通の時間から始める(設計判断5) */
  function changeSameTime(on: boolean) {
    setSameTime(on);
    if (on) {
      // 入れ直したときは、直前に曜日ごとで編集していた時間のうち先頭の曜日のものを
      // 共通の時間に引き継ぐ。ここで引き継がないと、外して直した内容が
      // チェックを入れた瞬間に何も言わずに消える(#180 のレビュー指摘)
      const first = weekdays[0];
      const kept = first === undefined ? undefined : perWeekdayTimes[first];
      if (kept) setCommonTime(kept);
      return;
    }
    const seeded: Record<number, TimeRange> = {};
    for (const d of weekdays) seeded[d] = commonTime;
    setPerWeekdayTimes(seeded);
  }

  function startEditing() {
    // 途中でやめた入力が残らないよう、開くたびに現在の値へ戻す
    setFamilyName(detail.familyName);
    setFamilyNameKana(detail.familyNameKana);
    setGivenName(detail.givenName);
    setGivenNameKana(detail.givenNameKana);
    setNicknameKana(detail.nicknameKana ?? "");
    setBirthDate(detail.birthDate ?? "");
    setHeightCm(detail.heightCm === null ? "" : String(detail.heightCm));
    setGender(detail.gender);
    const availability = initialAvailability(detail.availabilities);
    setWeekdays(availability.weekdays);
    setCommonTime(availability.commonTime);
    setPerWeekdayTimes(availability.perWeekdayTimes);
    setSameTime(availability.sameTime);
    setError(null);
    setEditing(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // サーバーと同じ純関数で先に弾く(文言もそろう)
    const checked = parseAvailabilities(slots);
    if (!checked.ok) return setError(checked.error);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/children/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyName,
          givenName,
          familyNameKana,
          givenNameKana,
          nicknameKana,
          birthDate,
          heightCm: Number(heightCm),
          gender,
          availabilities: checked.value,
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as { child: EditableChild };
        setDetail(body.child);
        setEditing(false);
        setBusy(false);
        // ホームやチーム画面にも新しい姓名・学年を反映させる
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(
        // 400 はサーバーの文言をそのまま出す(検証の正はサーバー。plan.md 設計判断4)
        body?.error ??
          (res.status === 404
            ? "お子さんが見つかりません"
            : "保存できませんでした。もう一度お試しください"),
      );
      setBusy(false);
    } catch {
      setError("保存できませんでした。もう一度お試しください");
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <>
        <div className="label">お子さんの情報</div>
        <ul className="news">
          <li className="row">
            <span>お名前</span>
            <span>{fullName(detail)}</span>
          </li>
          <li className="row">
            <span>よみ</span>
            <span>{`${detail.familyNameKana} ${detail.givenNameKana}`}</span>
          </li>
          <li className="row">
            <span>呼び名(ひらがな)</span>
            <span>{detail.nicknameKana ?? NOT_SET}</span>
          </li>
          <li className="row">
            <span>学年</span>
            <span>{gradeLabel(detail.grade)}</span>
          </li>
          <li className="row">
            <span>生年月日</span>
            <span>{detail.birthDate ?? NOT_SET}</span>
          </li>
          <li className="row">
            <span>身長</span>
            <span>
              {detail.heightCm === null ? NOT_SET : `${detail.heightCm} cm`}
            </span>
          </li>
          <li className="row">
            <span>性別</span>
            <span>{GENDER_LABELS[detail.gender]}</span>
          </li>
          <li className="row">
            <span>参加できる時間帯</span>
            {/* 曜日ごとに1行。曜日も時間もここで読める */}
            <span className="val slots">
              {detail.availabilities.length === 0 ? (
                <span>{NOT_SET}</span>
              ) : (
                detail.availabilities.map((s) => (
                  <span key={s.weekday}>
                    {`${WEEKDAY_LABELS[s.weekday]} ${s.startTime} 〜 ${s.endTime}`}
                  </span>
                ))
              )}
            </span>
          </li>
        </ul>
        <button type="button" className="addlink boxed" onClick={startEditing}>
          編集
        </button>
      </>
    );
  }

  return (
    <>
      <div className="label">お子さんの情報</div>
      <form className="child-edit" onSubmit={save}>
        {error !== null && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        {/* 漢字の2欄 → よみの2欄 の順に横並び(登録フォームと同じ。2026-09-16) */}
        <div className="name-row">
          <div className="fld2">
            <label htmlFor={`edit-family-name-${detail.id}`}>姓</label>
            <input
              id={`edit-family-name-${detail.id}`}
              className="inbox"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              autoComplete="off"
              maxLength={NAME_PART_MAX}
              required
            />
          </div>
          <div className="fld2">
            <label htmlFor={`edit-given-name-${detail.id}`}>名</label>
            <input
              id={`edit-given-name-${detail.id}`}
              className="inbox"
              value={givenName}
              onChange={(e) => setGivenName(e.target.value)}
              autoComplete="off"
              maxLength={NAME_PART_MAX}
              required
            />
          </div>
        </div>
        <div className="name-row">
          <div className="fld2">
            <label htmlFor={`edit-family-name-kana-${detail.id}`}>
              姓のよみ
            </label>
            <input
              id={`edit-family-name-kana-${detail.id}`}
              className="inbox"
              value={familyNameKana}
              onChange={(e) => setFamilyNameKana(e.target.value)}
              placeholder="こはま"
              autoComplete="off"
              maxLength={NAME_PART_MAX}
              required
            />
          </div>
          <div className="fld2">
            <label htmlFor={`edit-given-name-kana-${detail.id}`}>
              名のよみ
            </label>
            <input
              id={`edit-given-name-kana-${detail.id}`}
              className="inbox"
              value={givenNameKana}
              onChange={(e) => setGivenNameKana(e.target.value)}
              placeholder="たろう"
              autoComplete="off"
              maxLength={NAME_PART_MAX}
              required
            />
          </div>
        </div>
        <div className="fld2">
          <label htmlFor={`edit-kana-${detail.id}`}>呼び名(ひらがな)</label>
          <input
            id={`edit-kana-${detail.id}`}
            className="inbox"
            value={nicknameKana}
            onChange={(e) => setNicknameKana(e.target.value)}
            placeholder="たろう"
            autoComplete="off"
          />
        </div>
        <div className="fld2">
          <label htmlFor={`edit-birth-${detail.id}`}>生年月日</label>
          <input
            id={`edit-birth-${detail.id}`}
            className="inbox"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            required
          />
          <p className="help" aria-live="polite">
            <GradeHint birthDate={birthDate} today={today} />
          </p>
        </div>
        <div className="fld2">
          <label htmlFor={`edit-height-${detail.id}`}>身長</label>
          <div className="with-unit">
            <input
              id={`edit-height-${detail.id}`}
              className="inbox"
              type="number"
              inputMode="numeric"
              min={HEIGHT_MIN}
              max={HEIGHT_MAX}
              step={1}
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              placeholder="130"
              required
            />
            <span className="unit">cm</span>
          </div>
        </div>
        <fieldset className="fld2">
          <legend className="lbl">性別</legend>
          <div className="seg2">
            <button
              type="button"
              aria-pressed={gender === "male"}
              onClick={() => setGender("male")}
            >
              男子
            </button>
            <button
              type="button"
              aria-pressed={gender === "female"}
              onClick={() => setGender("female")}
            >
              女子
            </button>
          </div>
        </fieldset>
        <fieldset className="fld2">
          <legend className="lbl">参加できる曜日(複数選択)</legend>
          <div className="days7">
            {WEEKDAY_LABELS.map((label, d) => (
              <button
                key={label}
                type="button"
                aria-pressed={weekdays.includes(d)}
                onClick={() => toggleWeekday(d)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        {/* 見せ方は登録②と同じ。時間の欄は常に出し、チェックが入っているあいだは
            共通の1組だけを出す(availability-common-time/plan.md 設計判断1・3・7) */}
        <fieldset className="fld2">
          <legend className="lbl">参加できる時間帯</legend>
          {sameTime ? (
            <div className="time-range">
              <input
                type="time"
                className="inbox"
                aria-label="開始時刻"
                value={commonTime.startTime}
                onChange={(e) =>
                  setCommonTime((prev) => ({
                    ...prev,
                    startTime: e.target.value,
                  }))
                }
                required
              />
              <span>〜</span>
              <input
                type="time"
                className="inbox"
                aria-label="終了時刻"
                value={commonTime.endTime}
                onChange={(e) =>
                  setCommonTime((prev) => ({
                    ...prev,
                    endTime: e.target.value,
                  }))
                }
                required
              />
            </div>
          ) : (
            <div className="slot-rows">
              {weekdays.map((d) => {
                const label = WEEKDAY_LABELS[d];
                const time = perWeekdayTimes[d] ?? commonTime;
                return (
                  <div className="slot-row" key={d}>
                    <span className="day">{label}</span>
                    <input
                      type="time"
                      className="inbox"
                      aria-label={`${label}曜日の開始時刻`}
                      value={time.startTime}
                      onChange={(e) =>
                        setWeekdayTime(d, { startTime: e.target.value })
                      }
                      required
                    />
                    <span>〜</span>
                    <input
                      type="time"
                      className="inbox"
                      aria-label={`${label}曜日の終了時刻`}
                      value={time.endTime}
                      onChange={(e) =>
                        setWeekdayTime(d, { endTime: e.target.value })
                      }
                      required
                    />
                  </div>
                );
              })}
            </div>
          )}
          {/* 曜日を1つも選んでいないと「すべての曜日」が指すものが無いので出さない(設計判断2) */}
          {weekdays.length > 0 && (
            <>
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={sameTime}
                  onChange={(e) => changeSameTime(e.target.checked)}
                />
                すべての曜日に同じ時間を使う
              </label>
              {sameTime && <p className="help">{sameTimeNote(weekdays)}</p>}
            </>
          )}
          <p className="help">{AVAILABILITY_HINT}</p>
        </fieldset>
        <div className="form-btns">
          <button
            type="button"
            className="cta inline sec2"
            onClick={() => setEditing(false)}
            disabled={busy}
          >
            キャンセル
          </button>
          <button type="submit" className="cta inline" disabled={busy}>
            {busy ? "保存しています…" : "保存"}
          </button>
        </div>
      </form>
    </>
  );
}
