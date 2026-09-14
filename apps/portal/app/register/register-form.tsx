"use client";

import {
  HEIGHT_MAX,
  HEIGHT_MIN,
  parseBirthDate,
  parseHeightCm,
  todayTokyo,
} from "@hoopo/api/grade-shared";
import {
  fullName,
  GENDER_LABELS,
  type Gender,
  NAME_PART_MAX,
  NOT_SET,
  parseNameKana,
  parseNamePart,
  RELATION_LABELS,
  type Relation,
  WEEKDAY_LABELS,
} from "@hoopo/api/shared";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { GradeHint } from "../grade-hint";
import { RelationSelect } from "../relation-select";

// 3ステップの初回登録。①子ども情報(兄弟追加可)→ ②参加情報(全員に同一適用)
// → ③入力内容の確認 → POST /api/children。
// 入力は REQUIREMENTS §3 の項目のみ(絶対原則4)。バリデーションの正はサーバー(parseRegistration)。
// 学年は選ばせず、生年月日から判定して表示する(child-birthdate-height/plan.md 設計判断2・4)。
// ③を挟むのは、登録が一度きりで、間違えたまま確定したときの修正コストのほうが
// 1タップの手間より大きいため(registration-confirm/plan.md 設計判断1。絶対原則2とのトレードオフ)

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

/** ③の表示用。①の選択ボタンと同じ文言(家族の設定の表示ともそろえる) */

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
  // ①②③は同じコンポーネントの表示切替。state はそのまま残るので、戻っても入力は消えない
  // (plan.md 設計判断3。localStorage は使わない)
  const [step, setStep] = useState<1 | 2 | 3>(1);
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

  // ②→③。参加情報の検証はここで行い、③は表示と送信だけを担う(plan.md 設計判断4)
  function goStep3(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (weekdays.length === 0)
      return setError("参加できる曜日を1つ以上選んでください");
    if (!relation) return setError("続柄を選んでください");
    setError(null);
    setStep(3);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // ②で検証済みだが、relation の型を絞るためと保険で見る。欠けていたら直せる②へ戻す
    if (weekdays.length === 0 || !relation) {
      setStep(2);
      return setError(
        weekdays.length === 0
          ? "参加できる曜日を1つ以上選んでください"
          : "続柄を選んでください",
      );
    }
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
            お子さんの登録 <span className="step">1/3</span>
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

  if (step === 2) {
    return (
      <>
        <header className="sc-head">
          <h1 className="sc-title">
            <button
              type="button"
              className="back addlink"
              aria-label="戻る"
              onClick={() => {
                setError(null);
                setStep(1);
              }}
            >
              ‹
            </button>
            参加について <span className="step">2/3</span>
          </h1>
        </header>
        <form className="sc-body tight" onSubmit={goStep3}>
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
          {/* 送信は③からだけ。②は確認へ渡すだけにする(plan.md 設計判断1) */}
          <button type="submit" className="cta">
            確認へ進む
          </button>
        </form>
      </>
    );
  }

  // ③入力内容の確認。項目名を左・値を右に並べる形は家族の設定の「お子さんの情報」と同じで、
  // 保護者がすでに見ている見た目をそのまま使う(plan.md 設計判断5)
  return (
    <>
      <header className="sc-head">
        <h1 className="sc-title">
          {/* 見出しの戻る矢印は1つ前の画面(②)へ。①へは各お子さんの「①を修正」から(設計判断2) */}
          <button
            type="button"
            className="back addlink"
            aria-label="戻る"
            onClick={() => {
              setError(null);
              setStep(2);
            }}
          >
            ‹
          </button>
          入力内容の確認 <span className="step">3/3</span>
        </h1>
      </header>
      <form className="sc-body tight" onSubmit={submit}>
        {error !== null && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <p className="help">
          この内容で登録します。間違いがあれば修正してください
        </p>
        {kids.map((k, i) => (
          <section key={k.key} className="child-block">
            <div className="head">
              <span>{kids.length > 1 ? `${i + 1}人目` : "お子さんの情報"}</span>
              <button
                type="button"
                className="addlink"
                onClick={() => {
                  setError(null);
                  setStep(1);
                }}
              >
                ①を修正
              </button>
            </div>
            <ul className="news">
              <li className="row">
                <span>お名前</span>
                <span className="val">{fullName(k)}</span>
              </li>
              <li className="row">
                <span>よみ</span>
                <span className="val">
                  {`${k.familyNameKana} ${k.givenNameKana}`}
                </span>
              </li>
              <li className="row">
                <span>呼び名(ひらがな)</span>
                <span className="val">
                  {k.nicknameKana.trim() === ""
                    ? NOT_SET
                    : k.nicknameKana.trim()}
                </span>
              </li>
              <li className="row">
                <span>生年月日</span>
                <span className="val">{k.birthDate}</span>
              </li>
              <li className="row">
                {/* 学年は①の入力欄の下に出るのと同じ表示(GradeHint = gradeFromBirthDate) */}
                <span>学年</span>
                <span className="val">
                  <GradeHint birthDate={k.birthDate} today={today} />
                </span>
              </li>
              <li className="row">
                <span>身長</span>
                <span className="val">{`${k.heightCm} cm`}</span>
              </li>
              <li className="row">
                <span>性別</span>
                {/* ①の検証で必須なので null は通らないが、型を絞るために分岐する */}
                <span className="val">
                  {k.gender === null ? NOT_SET : GENDER_LABELS[k.gender]}
                </span>
              </li>
            </ul>
          </section>
        ))}
        <div className="label">参加について</div>
        <ul className="news">
          <li className="row">
            <span>参加できる曜日</span>
            <span className="val">
              {weekdays.map((d) => WEEKDAY_LABELS[d]).join("・")}
            </span>
          </li>
          <li className="row">
            <span>参加できる時間帯</span>
            <span className="val">{`${startTime} 〜 ${endTime}`}</span>
          </li>
          <li className="row">
            <span>お子さんとの続柄</span>
            {/* ②の検証で必須なので null は通らないが、型を絞るために分岐する */}
            <span className="val">
              {relation === null ? NOT_SET : RELATION_LABELS[relation]}
            </span>
          </li>
          <li className="row">
            <span>コーチへの伝達事項</span>
            <span className="val">
              {coachNote.trim() === "" ? NOT_SET : coachNote}
            </span>
          </li>
        </ul>
        {kids.length > 1 && (
          <p className="help">参加情報はお子さん全員に同じ内容で登録されます</p>
        )}
        <button type="submit" className="cta" disabled={submitting}>
          {submitting ? "登録しています…" : "この内容で登録する"}
        </button>
        <button
          type="button"
          className="cta inline sec2"
          disabled={submitting}
          onClick={() => {
            setError(null);
            setStep(2);
          }}
        >
          修正する
        </button>
        <p className="sync">
          登録後すぐに利用を開始できます(コーチにも通知されます)
        </p>
      </form>
    </>
  );
}
