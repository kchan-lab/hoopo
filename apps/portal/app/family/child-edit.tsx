"use client";

import { HEIGHT_MAX, HEIGHT_MIN, todayTokyo } from "@hoopo/api/grade-shared";
import type { ChildDetail, Gender } from "@hoopo/api/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { GradeHint } from "../grade-hint";

// お子さんの情報の修正(REQUIREMENTS §4.2-9。child-birthdate-height/plan.md 設計判断5)。
// 登録は初回の1回だけという原則(絶対原則2)の裏返しで、あとから直す手段が無いと
// 打ち間違い・身長の伸びを保護者が自分で直せない。画面遷移を増やさず、行内で
// 「編集」→ 入力 →「保存」だけで完結させる。学年は生年月日から再計算され、
// 保存後の値は PATCH の応答(サーバーの算出結果)をそのまま表示する

const GENDER_LABELS: Record<Gender, string> = { male: "男子", female: "女子" };

/** 0010 より前に登録された部員は生年月日・身長が無い(plan.md 設計判断3) */
const NOT_SET = "未入力";

export function ChildEdit({ child }: { child: ChildDetail }) {
  const router = useRouter();
  // 学年判定の基準日(Asia/Tokyo の今日)。入力中の表示は目安で、正はサーバー
  const [today] = useState(todayTokyo);
  // 表示の正は「最後にサーバーが返した値」。props は再描画のたびに上書きされうるので、
  // 保存直後は PATCH の応答を持っておく(router.refresh() 後も同じ値に落ち着く)
  const [detail, setDetail] = useState(child);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(child.name);
  const [nicknameKana, setNicknameKana] = useState(child.nicknameKana ?? "");
  const [birthDate, setBirthDate] = useState(child.birthDate ?? "");
  const [heightCm, setHeightCm] = useState(
    child.heightCm === null ? "" : String(child.heightCm),
  );
  const [gender, setGender] = useState<Gender>(child.gender);

  function startEditing() {
    // 途中でやめた入力が残らないよう、開くたびに現在の値へ戻す
    setName(detail.name);
    setNicknameKana(detail.nicknameKana ?? "");
    setBirthDate(detail.birthDate ?? "");
    setHeightCm(detail.heightCm === null ? "" : String(detail.heightCm));
    setGender(detail.gender);
    setError(null);
    setEditing(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/children/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          nicknameKana,
          birthDate,
          heightCm: Number(heightCm),
          gender,
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as { child: ChildDetail };
        setDetail(body.child);
        setEditing(false);
        setBusy(false);
        // ホームやチーム画面にも新しい名前・学年を反映させる
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
            <span>{detail.name}</span>
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
        <div className="fld2">
          <label htmlFor={`edit-name-${detail.id}`}>お名前</label>
          <input
            id={`edit-name-${detail.id}`}
            className="inbox"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            required
          />
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
