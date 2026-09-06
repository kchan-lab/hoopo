"use client";

import type { FeeGridRow } from "@hoopo/api";
import {
  FEE_STATE_LABELS,
  type FeeMonth,
  MONTHS,
} from "@hoopo/api/fees-shared";
import { useState } from "react";

// 月謝管理(REQUIREMENTS §5.2。ワイヤー PC-7 / SP-8)。
// 封筒に済ハンコを押す操作の再現なので、セルを押すと即保存し確認は挟まない(plan.md 設計判断3)。
// PC は部員×1〜12月の表、モバイル(<640px)は部員を選んで4列の封筒グリッド(設計判断7)。
// 同じ state・同じ API(PUT /api/fee-records)を両方のレイアウトで使い、CSS で切り替える

// 未来セルの「−」は出欠マトリクスの未回答と同じ U+2212(ワイヤーの表記に合わせる)
const FUTURE_MARK = "−";

function markOf(state: FeeMonth["state"]): string {
  return state === "future" ? FUTURE_MARK : FEE_STATE_LABELS[state];
}

const STATE_TEXT: Record<FeeMonth["state"], string> = {
  paid: "済",
  unpaid: "未",
  future: "未来",
};

export function FeeGrid({
  year,
  initialRows,
}: {
  year: number;
  initialRows: FeeGridRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [childId, setChildId] = useState(initialRows[0]?.child.id ?? "");

  if (rows.length === 0)
    return <p className="anote">部員はまだ登録されていません</p>;

  // 済 ⇄ それ以外(未・未来)。未来への「済」は前払いの記録(設計判断6)
  async function toggle(id: string, cell: FeeMonth) {
    const key = `${id}:${cell.month}`;
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/fee-records", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId: id,
          year,
          month: cell.month,
          status: cell.state === "paid" ? "unpaid" : "paid",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "保存できませんでした");
        return;
      }
      // 保存後の状態はサーバーの返り値をそのまま採用する(未来の「未」は future のまま)
      const body = (await res.json()) as { month: FeeMonth };
      setRows((prev) =>
        prev.map((r) =>
          r.child.id === id
            ? {
                ...r,
                months: r.months.map((m) =>
                  m.month === body.month.month ? body.month : m,
                ),
              }
            : r,
        ),
      );
    } catch {
      setError("保存できませんでした");
    } finally {
      setBusy(null);
    }
  }

  const cellLabel = (name: string, cell: FeeMonth) =>
    `${name} ${cell.month}月 ${STATE_TEXT[cell.state]}`;
  const selected = rows.find((r) => r.child.id === childId) ?? rows[0];

  return (
    <>
      {error !== null && (
        <p className="lgerr" role="alert">
          {error}
        </p>
      )}

      {/* PC: 部員(行)×1〜12月(列)の一覧 */}
      <div className="fee-pc">
        <div className="ascroll">
          <table className="atable afee">
            <thead>
              <tr className="hd">
                <td className="c-member">部員</td>
                {MONTHS.map((m) => (
                  <td key={m}>{m}</td>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.child.id}>
                  <td className="c-member">{r.child.name}</td>
                  {r.months.map((cell) => (
                    <td key={cell.month}>
                      <button
                        type="button"
                        className={cell.state === "paid" ? "on" : ""}
                        aria-label={cellLabel(r.child.name, cell)}
                        disabled={busy !== null}
                        onClick={() => toggle(r.child.id, cell)}
                      >
                        {markOf(cell.state)}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="anote">
          現金の受領時にセルをクリックして「済」を付けます(保護者側の月謝画面に即反映)
        </p>
      </div>

      {/* モバイル: 部員を選んで封筒グリッド(12列の表はタップしにくい) */}
      <div className="fee-sp">
        <div className="feesel">
          <label className="sr-only" htmlFor="fee-child">
            部員
          </label>
          <select
            id="fee-child"
            className="afld"
            value={selected?.child.id ?? ""}
            onChange={(e) => setChildId(e.target.value)}
          >
            {rows.map((r) => (
              <option key={r.child.id} value={r.child.id}>
                {r.child.name}({r.child.grade}年)
              </option>
            ))}
          </select>
        </div>
        <div className="mfee">
          {selected?.months.map((cell) => (
            <button
              key={cell.month}
              type="button"
              className={cell.state === "paid" ? "on" : ""}
              aria-label={cellLabel(selected.child.name, cell)}
              disabled={busy !== null}
              onClick={() => toggle(selected.child.id, cell)}
            >
              {cell.month}月<b>{markOf(cell.state)}</b>
            </button>
          ))}
        </div>
        <p className="anote">
          セルをタップして済⇄未を切替(保護者側に即反映)。全部員の一覧表示はPC版を推奨
        </p>
      </div>
    </>
  );
}
