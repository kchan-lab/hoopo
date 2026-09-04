"use client";

import { type Gender, type Relation, WEEKDAY_LABELS } from "@hoopo/api/shared";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { RelationSelect } from "../relation-select";

// 2ステップの初回登録。①子ども情報(兄弟追加可)→ ②参加情報(全員に同一適用)→ POST /api/children。
// 入力は REQUIREMENTS §3 の項目のみ(絶対原則4)。バリデーションの正はサーバー(parseRegistration)

interface ChildDraft {
  key: number;
  name: string;
  nicknameKana: string;
  grade: number;
  gender: Gender | null;
}

const newChild = (key: number): ChildDraft => ({
  key,
  name: "",
  nicknameKana: "",
  grade: 1,
  gender: null,
});

export function RegisterForm() {
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
      if (!k.name.trim())
        return setError(`${i + 1}人目のお名前を入力してください`);
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
            name: k.name,
            nicknameKana: k.nicknameKana,
            grade: k.grade,
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
                <label htmlFor={`name-${k.key}`}>お名前</label>
                <input
                  id={`name-${k.key}`}
                  className="inbox"
                  value={k.name}
                  onChange={(e) => update(k.key, { name: e.target.value })}
                  placeholder="山田 太郎"
                  autoComplete="off"
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
                <label htmlFor={`grade-${k.key}`}>学年</label>
                <select
                  id={`grade-${k.key}`}
                  className="inbox"
                  value={k.grade}
                  onChange={(e) =>
                    update(k.key, { grade: Number(e.target.value) })
                  }
                >
                  {[1, 2, 3, 4, 5, 6].map((g) => (
                    <option key={g} value={g}>
                      {g}年生
                    </option>
                  ))}
                </select>
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
