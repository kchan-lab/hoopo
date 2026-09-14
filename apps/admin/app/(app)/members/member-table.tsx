"use client";

import type { MemberRow } from "@hoopo/api";
import {
  gradeFromBirthDate,
  HEIGHT_MAX,
  HEIGHT_MIN,
  todayTokyo,
} from "@hoopo/api/grade-shared";
import type { ChildDetail, Gender } from "@hoopo/api/shared";
import { fullName, NAME_PART_MAX, WEEKDAY_LABELS } from "@hoopo/api/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

// 部員一覧。PC はテーブル(8列)、モバイルはフルネーム+呼び名+学年・性別の行(CSS で切替)。
// 行タップで詳細(伝達事項全文・参加可能曜日/時間・招待コード)と編集フォームを直下に展開する。
// 生年月日・身長は PC では列、モバイルでは行が詰まるので詳細の編集フォーム側で見せる
// (child-birthdate-height/plan.md 設計判断3: 0010 より前の部員は値が無いので「−」)

const GENDER = { male: "男", female: "女" } as const;

/** 値が無いときの表示(admin はモノトーン+文字で状態を出す。DESIGN_GUIDELINES §2.1) */
const DASH = "−";

/**
 * "2014-06-15" → "2014/6/15"。列幅に収めるための表示整形で、
 * Date を経由しないのでブラウザのタイムゾーンに影響されない(CLAUDE.md 開発ルール)
 */
function formatBirthDate(value: string | null): string {
  if (!value) return DASH;
  const [y, m, d] = value.split("-");
  return `${y}/${Number(m)}/${Number(d)}`;
}

export function MemberTable({ members }: { members: MemberRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (members.length === 0)
    return <p className="anote">部員はまだ登録されていません</p>;

  return (
    <table className="atable">
      <thead>
        <tr className="hd">
          <td className="c-name">名前</td>
          <td className="c-kana">呼び名</td>
          <td>学年</td>
          <td className="pc c-birth">生年月日</td>
          <td className="pc c-height">身長</td>
          <td className="pc">性別</td>
          <td className="pc">保護者</td>
          <td className="pc c-note">伝達事項</td>
        </tr>
      </thead>
      <tbody>
        {members.map((m) => {
          const open = openId === m.id;
          return (
            <MemberRows
              key={m.id}
              m={m}
              open={open}
              onToggle={() => setOpenId(open ? null : m.id)}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function MemberRows({
  m,
  open,
  onToggle,
}: {
  m: MemberRow;
  open: boolean;
  onToggle: () => void;
}) {
  const detailId = `member-detail-${m.id}`;
  return (
    <>
      <tr
        className="row"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
        aria-expanded={open}
        aria-controls={detailId}
      >
        <td className="c-name">{fullName(m)}</td>
        <td className="c-kana sub">{m.nicknameKana ?? DASH}</td>
        <td>
          {m.grade}年<span className="sp">・{GENDER[m.gender]}</span>
        </td>
        <td className={`pc c-birth${m.birthDate ? "" : " sub"}`}>
          {formatBirthDate(m.birthDate)}
        </td>
        <td className={`pc c-height${m.heightCm === null ? " sub" : ""}`}>
          {m.heightCm === null ? DASH : `${m.heightCm}cm`}
        </td>
        <td className="pc">{GENDER[m.gender]}</td>
        <td className="pc">{m.guardianCount}人</td>
        <td className={`pc c-note${m.coachNote ? " has" : " sub"}`}>
          {m.coachNote ? "あり" : DASH}
        </td>
      </tr>
      {open && (
        <tr className="detail" id={detailId}>
          <td colSpan={8}>
            <dl>
              <dt>伝達事項</dt>
              <dd>{m.coachNote ?? DASH}</dd>
              <dt>参加可能曜日/時間</dt>
              <dd>
                {m.availabilities.length === 0
                  ? DASH
                  : m.availabilities
                      .map(
                        (a) =>
                          `${WEEKDAY_LABELS[a.weekday]} ${a.startTime}〜${a.endTime}`,
                      )
                      .join(" / ")}
              </dd>
              <dt>招待コード</dt>
              <dd className="code">{m.inviteCode}</dd>
            </dl>
            <MemberEditForm member={m} />
          </td>
        </tr>
      )}
    </>
  );
}

// ---- 行詳細からの編集(child-birthdate-height/plan.md 設計判断5) ----
// 破壊的操作ではないので確認ダイアログは置かず、保存の成否だけを画面に出す。
// 既存部員の空の生年月日・身長をコーチが後から埋める導線でもあるため、
// 行を開いたらフォームが最初から見えている状態にしてタップ数を増やさない

interface Draft {
  // 姓・名とそれぞれの読み(child-name-split/plan.md 設計判断1・2)。
  // 編集欄は 姓 → 姓のよみ → 名 → 名のよみ → 呼び名 の順(設計判断6)
  familyName: string;
  familyNameKana: string;
  givenName: string;
  givenNameKana: string;
  nicknameKana: string;
  /** "YYYY-MM-DD"。0010 より前の部員は空文字から始まる */
  birthDate: string;
  /** input[type=number] の値なので文字列で持ち、検証はサーバー(parseHeightCm)に任せる */
  heightCm: string;
  gender: Gender;
}

/** 一覧の行(MemberRow)と PATCH の応答(ChildDetail)のどちらからも初期値を作れる */
function toDraft(m: Omit<ChildDetail, "id" | "grade">): Draft {
  return {
    familyName: m.familyName,
    familyNameKana: m.familyNameKana,
    givenName: m.givenName,
    givenNameKana: m.givenNameKana,
    nicknameKana: m.nicknameKana ?? "",
    birthDate: m.birthDate ?? "",
    heightCm: m.heightCm === null ? "" : String(m.heightCm),
    gender: m.gender,
  };
}

function MemberEditForm({ member }: { member: MemberRow }) {
  const router = useRouter();
  const initial = toDraft(member);
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
    setError(null);
  };

  // 変更があった項目だけを送る。全項目を常に送ると、生年月日が空のままの既存部員で
  // 姓名だけ直したいときに「生年月日を入力してください」で弾かれてしまう
  const changed: Record<string, unknown> = {};
  if (draft.familyName !== initial.familyName)
    changed.familyName = draft.familyName;
  if (draft.givenName !== initial.givenName)
    changed.givenName = draft.givenName;
  if (draft.familyNameKana !== initial.familyNameKana)
    changed.familyNameKana = draft.familyNameKana;
  if (draft.givenNameKana !== initial.givenNameKana)
    changed.givenNameKana = draft.givenNameKana;
  if (draft.nicknameKana !== initial.nicknameKana) {
    changed.nicknameKana =
      draft.nicknameKana.trim() === "" ? null : draft.nicknameKana;
  }
  if (draft.birthDate !== initial.birthDate)
    changed.birthDate = draft.birthDate;
  if (draft.heightCm !== initial.heightCm) changed.heightCm = draft.heightCm;
  if (draft.gender !== initial.gender) changed.gender = draft.gender;
  const dirty = Object.keys(changed).length > 0;

  // 入力中の生年月日から決まる学年を先に見せる(設計判断4: 表示は目安、正はサーバー)
  const preview = draft.birthDate
    ? gradeFromBirthDate(draft.birthDate, todayTokyo())
    : null;
  const gradeHint = !draft.birthDate
    ? "生年月日を入れると学年が決まります"
    : preview === null
      ? "この生年月日は小学生の学年になりません"
      : `この生年月日なら ${preview}年 になります`;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/members/${member.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(changed),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "保存できませんでした");
        setBusy(false);
        return;
      }
      const body = (await res.json()) as { member: ChildDetail };
      // 学年はサーバーが生年月日から再計算した値なので、一覧はサーバーから取り直す
      setDraft(toDraft(body.member));
      setBusy(false);
      setSaved(true);
      router.refresh();
    } catch {
      setError("保存できませんでした");
      setBusy(false);
    }
  }

  return (
    <div className="pform medit">
      <div className="k">部員情報を編集</div>
      <div className="pgrid">
        <label>
          姓
          <input
            className="afld"
            value={draft.familyName}
            onChange={(e) => update({ familyName: e.target.value })}
            maxLength={NAME_PART_MAX}
          />
        </label>
        <label>
          姓のよみ
          <input
            className="afld"
            value={draft.familyNameKana}
            onChange={(e) => update({ familyNameKana: e.target.value })}
            placeholder="こはま"
            maxLength={NAME_PART_MAX}
          />
        </label>
        <label>
          名
          <input
            className="afld"
            value={draft.givenName}
            onChange={(e) => update({ givenName: e.target.value })}
            maxLength={NAME_PART_MAX}
          />
        </label>
        <label>
          名のよみ
          <input
            className="afld"
            value={draft.givenNameKana}
            onChange={(e) => update({ givenNameKana: e.target.value })}
            placeholder="たろう"
            maxLength={NAME_PART_MAX}
          />
        </label>
        <label>
          呼び名
          <input
            className="afld"
            value={draft.nicknameKana}
            onChange={(e) => update({ nicknameKana: e.target.value })}
            placeholder="たろう"
            maxLength={50}
          />
        </label>
        <label>
          生年月日
          <input
            type="date"
            className="afld"
            value={draft.birthDate}
            onChange={(e) => update({ birthDate: e.target.value })}
          />
        </label>
        <label>
          身長(cm)
          <input
            type="number"
            className="afld"
            value={draft.heightCm}
            onChange={(e) => update({ heightCm: e.target.value })}
            min={HEIGHT_MIN}
            max={HEIGHT_MAX}
            step={1}
            inputMode="numeric"
          />
        </label>
        <label>
          性別
          <select
            className="afld"
            value={draft.gender}
            onChange={(e) => update({ gender: e.target.value as Gender })}
          >
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
        </label>
      </div>
      <p className="anote">{gradeHint}</p>
      {error !== null && (
        <p className="lgerr" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="anotice" role="status">
          保存しました
        </p>
      )}
      <div className="pfoot">
        <button
          type="button"
          className="abtn"
          onClick={() => update(initial)}
          disabled={busy || !dirty}
        >
          元に戻す
        </button>
        <button
          type="button"
          className="abtn fill"
          onClick={save}
          disabled={busy || !dirty}
        >
          {busy ? "保存しています…" : "保存"}
        </button>
      </div>
    </div>
  );
}
