"use client";

import type { MemberRow } from "@hoopo/api";
import { WEEKDAY_LABELS } from "@hoopo/api/shared";
import { useState } from "react";

// 部員一覧。PC はテーブル(6列)、モバイルは名前+呼び名+学年・性別の行(CSS で切替)。
// 行タップで詳細(伝達事項全文・参加可能曜日/時間・招待コード)を直下に展開する

const GENDER = { male: "男", female: "女" } as const;

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
        <td className="c-name">{m.name}</td>
        <td className="c-kana sub">{m.nicknameKana ?? "−"}</td>
        <td>
          {m.grade}年<span className="sp">・{GENDER[m.gender]}</span>
        </td>
        <td className="pc">{GENDER[m.gender]}</td>
        <td className="pc">{m.guardianCount}人</td>
        <td className={`pc c-note${m.coachNote ? " has" : " sub"}`}>
          {m.coachNote ? "あり" : "−"}
        </td>
      </tr>
      {open && (
        <tr className="detail" id={detailId}>
          <td colSpan={6}>
            <dl>
              <dt>伝達事項</dt>
              <dd>{m.coachNote ?? "−"}</dd>
              <dt>参加可能曜日/時間</dt>
              <dd>
                {m.availabilities.length === 0
                  ? "−"
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
          </td>
        </tr>
      )}
    </>
  );
}
