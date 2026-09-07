"use client";

import type { LineupBenchEntry, LineupChild, LineupStarter } from "@hoopo/api";
import {
  POSITION_LABELS,
  POSITIONS,
  type Position,
} from "@hoopo/api/lineups-shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

// 練習1コマの編成。API 契約は packages/api/admin-app.ts の /lineups/:practiceId。
// - スターターは5枠のセレクト(「−」=未選択)。他の枠で選ばれている部員はその枠では選べない
// - ベンチはスターターに選ばれていない部員のチェック
// - 保存は全置換(PUT 1回)。スターターが5人未満でも保存できる(編成途中)

/** セレクト・チェックの表示名(名簿と同じ「名前(n年)」) */
function memberLabel(m: LineupChild): string {
  return `${m.name}(${m.grade}年)`;
}

type StarterMap = Record<Position, string>;

const EMPTY: StarterMap = { PG: "", SG: "", SF: "", PF: "", C: "" };

function toStarterMap(starters: LineupStarter[]): StarterMap {
  const map = { ...EMPTY };
  for (const s of starters) map[s.position] = s.child.id;
  return map;
}

export function LineupEditor({
  practiceId,
  members,
  initialStarters,
  initialBench,
}: {
  practiceId: string;
  members: LineupChild[];
  initialStarters: LineupStarter[];
  initialBench: LineupBenchEntry[];
}) {
  const router = useRouter();
  const [starters, setStarters] = useState<StarterMap>(
    toStarterMap(initialStarters),
  );
  const [bench, setBench] = useState<string[]>(
    initialBench.map((b) => b.child.id),
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const starterIds = new Set(Object.values(starters).filter((v) => v !== ""));
  const benchCandidates = members.filter((m) => !starterIds.has(m.id));

  function selectStarter(position: Position, childId: string) {
    setStarters((s) => ({ ...s, [position]: childId }));
    // スターターに選んだ部員はベンチから外す(同じ子を二重に入れられない)
    if (childId !== "") setBench((b) => b.filter((id) => id !== childId));
    setSaved(false);
    setError(null);
  }

  function toggleBench(childId: string) {
    setBench((b) =>
      b.includes(childId) ? b.filter((id) => id !== childId) : [...b, childId],
    );
    setSaved(false);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const body = {
      starters: POSITIONS.filter((p) => starters[p] !== "").map((p) => ({
        childId: starters[p],
        position: p,
      })),
      bench,
    };
    try {
      const res = await fetch(`/api/lineups/${practiceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(b?.error ?? "保存できませんでした");
        setBusy(false);
        return;
      }
      setSaved(true);
      setBusy(false);
      router.refresh();
    } catch {
      setError("保存できませんでした");
      setBusy(false);
    }
  }

  if (members.length === 0) {
    return (
      <div className="acard">
        <p className="anote" style={{ marginTop: 0 }}>
          編成できる部員がいません(部員管理で登録してください)
        </p>
      </div>
    );
  }

  return (
    <>
      {error !== null && (
        <p className="lgerr" role="alert">
          {error}
        </p>
      )}
      <div className="acard">
        <div className="k">スターター</div>
        <div className="pgrid">
          {POSITIONS.map((p) => (
            <label key={p}>
              {`${p}(${POSITION_LABELS[p]})`}
              <select
                className="afld"
                value={starters[p]}
                onChange={(e) => selectStarter(p, e.target.value)}
              >
                <option value="">−</option>
                {members.map((m) => (
                  <option
                    key={m.id}
                    value={m.id}
                    // 他の枠で選ばれている部員はこの枠では選べない(同じ子の重複を防ぐ)
                    disabled={starterIds.has(m.id) && starters[p] !== m.id}
                  >
                    {memberLabel(m)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div className="acard">
        <div className="k">ベンチ</div>
        {benchCandidates.length === 0 ? (
          <p className="anote">スターター以外の部員がいません</p>
        ) : (
          <div className="lineup-bench">
            {benchCandidates.map((m) => (
              <label key={m.id} className="achk">
                <input
                  type="checkbox"
                  checked={bench.includes(m.id)}
                  onChange={() => toggleBench(m.id)}
                />
                {memberLabel(m)}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="pacts lineup-acts">
        {saved && <span className="lineup-saved">保存しました</span>}
        <button
          type="button"
          className="abtn fill"
          onClick={save}
          disabled={busy}
        >
          {busy ? "保存しています…" : "保存"}
        </button>
      </div>
      <p className="anote">
        保護者の練習詳細「出場メンバーはこちら」に反映されます(3D 表示は後日)
      </p>
    </>
  );
}
