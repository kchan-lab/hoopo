"use client";

import { RELATION_LABELS, RELATIONS, type Relation } from "@hoopo/api/shared";

// 続柄の1タップ選択(REQUIREMENTS §3。child-registration/plan.md 設計判断4)
export function RelationSelect({
  value,
  onChange,
}: {
  value: Relation | null;
  onChange: (r: Relation) => void;
}) {
  return (
    <fieldset className="fld2">
      <legend className="lbl">お子さんとの続柄</legend>
      <div className="seg2">
        {RELATIONS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={value === r}
            onClick={() => onChange(r)}
          >
            {RELATION_LABELS[r]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
