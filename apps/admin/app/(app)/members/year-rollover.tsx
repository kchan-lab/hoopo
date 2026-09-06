"use client";

import type { YearRolloverStatus } from "@hoopo/api";
import { TOKYO_TZ } from "@hoopo/api/tokyo-date";
import { useRouter } from "next/navigation";
import { useState } from "react";

// 年度更新(year-rollover/plan.md。REQUIREMENTS §5.2)。
// 破壊的操作なので行内の二段階確認にする(CLAUDE.md 開発ルール。ネイティブ confirm() は使わない)。
// 実行後は猶予(24時間)内だけ「取り消す」を出し、猶予中は再実行させない(設計判断2・3)。
// 猶予の期限は API の latest.undoDeadline をそのまま表示する(猶予をクライアントで再計算しない)

/** "9/6 15:04"(Asia/Tokyo 固定。CLAUDE.md 開発ルール) */
function formatAt(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TOKYO_TZ,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

type Mode = "idle" | "execute" | "undo";

export function YearRollover({ status }: { status: YearRolloverStatus }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { latest, preview } = status;
  const undoable = latest?.undoable === true;
  const deadline = latest?.undoDeadline ?? null;

  async function run(path: string, failure: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? failure);
        setBusy(false);
        return;
      }
      setMode("idle");
      setBusy(false);
      router.refresh();
    } catch {
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <>
      {mode === "execute" ? (
        <fieldset className="confirm">
          <legend className="sr-only">年度更新の確認</legend>
          <span className="q">
            {`全部員の学年を +1 し、6年生 ${preview.willArchive} 人を卒団アーカイブします(対象 ${preview.total} 人)。24 時間以内なら1回だけ取り消せます。実行しますか?`}
          </span>
          <button
            type="button"
            className="abtn"
            onClick={() => setMode("idle")}
            disabled={busy}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="abtn fill"
            onClick={() =>
              run(
                "/api/members/year-rollover",
                "年度更新を実行できませんでした",
              )
            }
            disabled={busy}
          >
            {busy ? "実行しています…" : "実行する"}
          </button>
        </fieldset>
      ) : (
        <button
          type="button"
          className="abtn"
          onClick={() => setMode("execute")}
          disabled={preview.total === 0 || undoable}
          title={
            undoable
              ? "取り消し猶予中は再実行できません"
              : preview.total === 0
                ? "対象の部員がいません"
                : undefined
          }
        >
          年度更新を実行
        </button>
      )}

      {latest !== null && undoable && (
        <div className="acard yrcard">
          <span className="yrmsg">
            {`年度更新を実行しました(${formatAt(latest.executedAt)})。${
              deadline === null
                ? "取り消せます"
                : `取り消せるのは ${formatAt(deadline)} まで`
            }(猶予中に手で直した学年・卒団は取り消しで上書きされます)`}
          </span>
          {mode === "undo" ? (
            <fieldset className="confirm">
              <legend className="sr-only">年度更新の取り消しの確認</legend>
              <span className="q">
                {`${latest.affected} 人を年度更新の前(卒団 ${latest.archived} 人を含む)に戻します。取り消せるのは1回だけです。取り消しますか?`}
              </span>
              <button
                type="button"
                className="abtn"
                onClick={() => setMode("idle")}
                disabled={busy}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="abtn fill"
                onClick={() =>
                  run(
                    "/api/members/year-rollover/undo",
                    "年度更新を取り消せませんでした",
                  )
                }
                disabled={busy}
              >
                {busy ? "取り消しています…" : "取り消しを実行する"}
              </button>
            </fieldset>
          ) : (
            <button
              type="button"
              className="abtn"
              onClick={() => setMode("undo")}
            >
              取り消す
            </button>
          )}
        </div>
      )}

      {error !== null && (
        <p className="lgerr" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
