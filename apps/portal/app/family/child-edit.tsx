"use client";

import { HEIGHT_MAX, HEIGHT_MIN, todayTokyo } from "@hoopo/api/grade-shared";
import {
  AVAILABILITY_HINT,
  type AvailabilitySlot,
  type ChildDetail,
  DEFAULT_END_TIME,
  DEFAULT_START_TIME,
  fullName,
  GENDER_LABELS,
  type Gender,
  NAME_PART_MAX,
  NOT_SET,
  parseAvailabilities,
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
  // 登録後に直す手段が無いと、打ち間違いや曜日の変更に保護者が対応できない
  const [slots, setSlots] = useState<AvailabilitySlot[]>(child.availabilities);
  const [sameTime, setSameTime] = useState(() =>
    allSameTime(child.availabilities),
  );

  function toggleWeekday(weekday: number) {
    setSlots((prev) => {
      if (prev.some((s) => s.weekday === weekday))
        return prev.filter((s) => s.weekday !== weekday);
      const base = prev[0] ?? {
        startTime: DEFAULT_START_TIME,
        endTime: DEFAULT_END_TIME,
      };
      return [
        ...prev,
        { weekday, startTime: base.startTime, endTime: base.endTime },
      ].sort((a, b) => a.weekday - b.weekday);
    });
  }

  function setSlotTime(
    weekday: number,
    patch: { startTime?: string; endTime?: string },
  ) {
    setSlots((prev) =>
      prev.map((s) =>
        sameTime || s.weekday === weekday ? { ...s, ...patch } : s,
      ),
    );
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
    setSlots(detail.availabilities);
    setSameTime(allSameTime(detail.availabilities));
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
            <span>小学{detail.grade}年生</span>
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
                aria-pressed={slots.some((s) => s.weekday === d)}
                onClick={() => toggleWeekday(d)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="fld2">
          <legend className="lbl">参加できる時間帯</legend>
          {slots.length === 0 ? (
            <p className="help">
              上で曜日を選ぶと、曜日ごとに時間を入れられます
            </p>
          ) : (
            <div className="slot-rows">
              {slots.map((s) => {
                const label = WEEKDAY_LABELS[s.weekday];
                return (
                  <div className="slot-row" key={s.weekday}>
                    <span className="day">{label}</span>
                    <input
                      type="time"
                      className="inbox"
                      aria-label={`${label}曜日の開始時刻`}
                      value={s.startTime}
                      onChange={(e) =>
                        setSlotTime(s.weekday, { startTime: e.target.value })
                      }
                      required
                    />
                    <span>〜</span>
                    <input
                      type="time"
                      className="inbox"
                      aria-label={`${label}曜日の終了時刻`}
                      value={s.endTime}
                      onChange={(e) =>
                        setSlotTime(s.weekday, { endTime: e.target.value })
                      }
                      required
                    />
                  </div>
                );
              })}
            </div>
          )}
          <label className="checkline">
            <input
              type="checkbox"
              checked={sameTime}
              onChange={(e) => {
                const on = e.target.checked;
                setSameTime(on);
                if (on)
                  setSlots((prev) =>
                    prev.length === 0
                      ? prev
                      : prev.map((x) => ({
                          ...x,
                          startTime: prev[0]?.startTime ?? x.startTime,
                          endTime: prev[0]?.endTime ?? x.endTime,
                        })),
                  );
              }}
            />
            すべての曜日に同じ時間を使う
          </label>
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
