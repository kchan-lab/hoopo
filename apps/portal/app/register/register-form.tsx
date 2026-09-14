"use client";

import {
  HEIGHT_MAX,
  HEIGHT_MIN,
  parseBirthDate,
  parseHeightCm,
  todayTokyo,
} from "@hoopo/api/grade-shared";
import {
  type Gender,
  NAME_PART_MAX,
  parseNameKana,
  parseNamePart,
  type Relation,
  WEEKDAY_LABELS,
} from "@hoopo/api/shared";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { GradeHint } from "../grade-hint";
import { RelationSelect } from "../relation-select";

// 2ステップの初回登録。①子ども情報(兄弟追加可)→ ②参加情報(全員に同一適用)→ POST /api/children。
// 入力は REQUIREMENTS §3 の項目のみ(絶対原則4)。バリデーションの正はサーバー(parseRegistration)。
// 学年は選ばせず、生年月日から判定して表示する(child-birthdate-height/plan.md 設計判断2・4)

interface ChildDraft {
  key: number;
  // 姓・名とそれぞれの読み(child-name-split/plan.md 設計判断1・2)。
  // 入力欄の並びは 姓 → 姓のよみ → 名 → 名のよみ → 呼び名(設計判断6)
  familyName: string;
  familyNameKana: string;
  givenName: string;
  givenNameKana: string;
  nicknameKana: string;
  /** "YYYY-MM-DD"(input[type=date] の値)。未入力は "" */
  birthDate: string;
  /** input[type=number] の値なので文字列で持つ。検証は parseHeightCm に任せる */
  heightCm: string;
  gender: Gender | null;
}

const newChild = (key: number): ChildDraft => ({
  key,
  familyName: "",
  familyNameKana: "",
  givenName: "",
  givenNameKana: "",
  nicknameKana: "",
  birthDate: "",
  heightCm: "",
  gender: null,
});

export function RegisterForm() {
  // 学年判定の基準日は Asia/Tokyo の「今日」。入力中の表示は目安で、保存する学年の正は
  // サーバー(registerChildren)が同じ純関数で算出する(plan.md 設計判断4)
  const [today] = useState(todayTokyo);
  const [step, setStep] = useState<1 | 2>(1);
  const [kids, setKids] = useState<ChildDraft[]>([newChild(0)]);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [coachNote, setCoachNote] = useState("");
  const [relation, setRelation] = useState<Relation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (key: number, patch: Partial<ChildDraft>) =>
    setKids((prev) =>
      prev.map((k) => (k.key === key ? { ...k, ...patch } : k)),
    );

  function goStep2(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    for (const [i, k] of kids.entries()) {
      // サーバーと同じ純関数で先に弾く(文言もそろう)。正はあくまでサーバー
      for (const check of [
        parseNamePart(k.familyName, "姓"),
        parseNameKana(k.familyNameKana, "姓"),
        parseNamePart(k.givenName, "名"),
        parseNameKana(k.givenNameKana, "名"),
      ]) {
        if (!check.ok) return setError(`${i + 1}人目の${check.error}`);
      }
      const birthDate = parseBirthDate(k.birthDate, today);
      if (!birthDate.ok) return setError(`${i + 1}人目の${birthDate.error}`);
      const heightCm = parseHeightCm(k.heightCm);
      if (!heightCm.ok) return setError(`${i + 1}人目の${heightCm.error}`);
      if (!k.gender) return setError(`${i + 1}人目の性別を選んでください`);
    }
    setError(null);
    setStep(2);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (weekdays.length === 0)
      return setError("参加できる曜日を1つ以上選んでください");
    if (!relation) return setError("続柄を選んでください");
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/children", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          children: kids.map((k) => ({
            familyName: k.familyName,
            givenName: k.givenName,
            familyNameKana: k.familyNameKana,
            givenNameKana: k.givenNameKana,
            nicknameKana: k.nicknameKana,
            birthDate: k.birthDate,
            heightCm: Number(k.heightCm),
            gender: k.gender,
          })),
          relation,
          weekdays,
          startTime,
          endTime,
          coachNote,
        }),
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? "登録できませんでした。もう一度お試しください");
      setSubmitting(false);
    } catch {
      setError("登録できませんでした。もう一度お試しください");
      setSubmitting(false);
    }
  }

  if (step === 1) {
    return (
      <>
        <header className="sc-head">
          <h1 className="sc-title">
            <Link href="/" className="back" aria-label="戻る">
              ‹
            </Link>
            お子さんの登録 <span className="step">1/2</span>
          </h1>
        </header>
        <form className="sc-body tight" onSubmit={goStep2}>
          {error !== null && (
            <p className="err" role="alert">
              {error}
            </p>
          )}
          {kids.map((k, i) => (
            <fieldset key={k.key} className="child-block">
              {kids.length > 1 && (
                <div className="head">
                  <span>{i + 1}人目</span>
                  <button
                    type="button"
                    className="addlink"
                    onClick={() =>
                      setKids((prev) => prev.filter((x) => x.key !== k.key))
                    }
                  >
                    削除
                  </button>
                </div>
              )}
              <div className="fld2">
                <label htmlFor={`family-name-${k.key}`}>姓</label>
                <input
                  id={`family-name-${k.key}`}
                  className="inbox"
                  value={k.familyName}
                  onChange={(e) =>
                    update(k.key, { familyName: e.target.value })
                  }
                  placeholder="粉浜"
                  autoComplete="off"
                  maxLength={NAME_PART_MAX}
                  required
                />
              </div>
              <div className="fld2">
                <label htmlFor={`family-name-kana-${k.key}`}>姓のよみ</label>
                <input
                  id={`family-name-kana-${k.key}`}
                  className="inbox"
                  value={k.familyNameKana}
                  onChange={(e) =>
                    update(k.key, { familyNameKana: e.target.value })
                  }
                  placeholder="こはま"
                  autoComplete="off"
                  maxLength={NAME_PART_MAX}
                  required
                />
              </div>
              <div className="fld2">
                <label htmlFor={`given-name-${k.key}`}>名</label>
                <input
                  id={`given-name-${k.key}`}
                  className="inbox"
                  value={k.givenName}
                  onChange={(e) => update(k.key, { givenName: e.target.value })}
                  placeholder="太郎"
                  autoComplete="off"
                  maxLength={NAME_PART_MAX}
                  required
                />
              </div>
              <div className="fld2">
                <label htmlFor={`given-name-kana-${k.key}`}>名のよみ</label>
                <input
                  id={`given-name-kana-${k.key}`}
                  className="inbox"
                  value={k.givenNameKana}
                  onChange={(e) =>
                    update(k.key, { givenNameKana: e.target.value })
                  }
                  placeholder="たろう"
                  autoComplete="off"
                  maxLength={NAME_PART_MAX}
                  required
                />
              </div>
              <div className="fld2">
                <label htmlFor={`kana-${k.key}`}>呼び名(ひらがな)</label>
                <input
                  id={`kana-${k.key}`}
                  className="inbox"
                  value={k.nicknameKana}
                  onChange={(e) =>
                    update(k.key, { nicknameKana: e.target.value })
                  }
                  placeholder="たろう"
                  autoComplete="off"
                />
              </div>
              <div className="fld2">
                <label htmlFor={`birth-${k.key}`}>生年月日</label>
                <input
                  id={`birth-${k.key}`}
                  className="inbox"
                  type="date"
                  value={k.birthDate}
                  onChange={(e) => update(k.key, { birthDate: e.target.value })}
                  required
                />
                <p className="help" aria-live="polite">
                  <GradeHint birthDate={k.birthDate} today={today} />
                </p>
              </div>
              <div className="fld2">
                <label htmlFor={`height-${k.key}`}>身長</label>
                <div className="with-unit">
                  <input
                    id={`height-${k.key}`}
                    className="inbox"
                    type="number"
                    inputMode="numeric"
                    min={HEIGHT_MIN}
                    max={HEIGHT_MAX}
                    step={1}
                    value={k.heightCm}
                    onChange={(e) =>
                      update(k.key, { heightCm: e.target.value })
                    }
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
                    aria-pressed={k.gender === "male"}
                    onClick={() => update(k.key, { gender: "male" })}
                  >
                    男子
                  </button>
                  <button
                    type="button"
                    aria-pressed={k.gender === "female"}
                    onClick={() => update(k.key, { gender: "female" })}
                  >
                    女子
                  </button>
                </div>
              </fieldset>
            </fieldset>
          ))}
          {kids.length < 10 && (
            <button
              type="button"
              className="addlink"
              onClick={() => setKids((prev) => [...prev, newChild(Date.now())])}
            >
              ＋ 兄弟・姉妹を追加
            </button>
          )}
          <p className="legal-link">
            入力した情報の扱いは
            <Link href="/privacy">プライバシーポリシー</Link>をご覧ください
          </p>
          <button type="submit" className="cta">
            次へ
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <header className="sc-head">
        <h1 className="sc-title">
          <button
            type="button"
            className="back addlink"
            aria-label="戻る"
            onClick={() => setStep(1)}
          >
            ‹
          </button>
          参加について <span className="step">2/2</span>
        </h1>
      </header>
      <form className="sc-body tight" onSubmit={submit}>
        {error !== null && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <fieldset className="fld2">
          <legend className="lbl">参加可能な曜日(複数選択)</legend>
          <div className="days7">
            {WEEKDAY_LABELS.map((label, d) => (
              <button
                key={label}
                type="button"
                aria-pressed={weekdays.includes(d)}
                onClick={() =>
                  setWeekdays((prev) =>
                    prev.includes(d)
                      ? prev.filter((x) => x !== d)
                      : [...prev, d].sort(),
                  )
                }
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="fld2">
          <label htmlFor="start-time">参加可能な時間帯</label>
          <div className="time-range">
            <input
              id="start-time"
              type="time"
              className="inbox"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
            <span>〜</span>
            <input
              id="end-time"
              type="time"
              className="inbox"
              aria-label="終了時刻"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </div>
        </div>
        <RelationSelect value={relation} onChange={setRelation} />
        <div className="fld2">
          <label htmlFor="coach-note">コーチへの伝達事項(任意)</label>
          <textarea
            id="coach-note"
            className="inbox"
            value={coachNote}
            onChange={(e) => setCoachNote(e.target.value)}
            placeholder="例: ぜん息があるため、長時間の連続走は配慮をお願いします"
            maxLength={500}
          />
        </div>
        <button type="submit" className="cta" disabled={submitting}>
          {submitting ? "登録しています…" : "登録を完了する"}
        </button>
        <p className="sync">
          登録後すぐに利用を開始できます(コーチにも通知されます)
        </p>
      </form>
    </>
  );
}
