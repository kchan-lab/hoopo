"use client";

import type { Relation } from "@hoopo/api/shared";
import { type FormEvent, useState } from "react";
import { RelationSelect } from "./relation-select";

// 招待コードで既存の子どもと連携する(第二保護者)。API 契約は POST /api/family-links

export function InviteForm() {
  const [relation, setRelation] = useState<Relation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get("code");
    if (!relation) {
      setError("続柄を選んでください");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/family-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, relation }),
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error ?? "連携できませんでした。もう一度お試しください");
      setSubmitting(false);
    } catch {
      setError("連携できませんでした。もう一度お試しください");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="child-block"
      style={{ marginTop: 8 }}
    >
      {error !== null && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      <div className="fld2">
        <label htmlFor="invite-code">招待コード</label>
        <input
          id="invite-code"
          name="code"
          className="inbox code"
          placeholder="MH7K4-2QD9X"
          autoComplete="off"
          autoCapitalize="characters"
          required
        />
      </div>
      <RelationSelect value={relation} onChange={setRelation} />
      <button type="submit" className="cta inline" disabled={submitting}>
        {submitting ? "連携しています…" : "コードで連携する"}
      </button>
    </form>
  );
}
