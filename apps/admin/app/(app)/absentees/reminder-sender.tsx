"use client";

import type { LineUsageSummary } from "@hoopo/api";
import { TOKYO_TZ } from "@hoopo/api/tokyo-date";
import { useRouter } from "next/navigation";
import { useState } from "react";

// 出欠リマインドの手動送信(#20。attendance-reminder/plan.md「画面(admin 欠席者管理)」)。
// API 契約は packages/api/admin-app.ts の POST /line/send/reminder。
// 送信は破壊的操作なので二段階確認にし、消費通数と残りを必ず見せる(CLAUDE.md 絶対原則3)。
// 押せない理由は title に出す(未回答 0 人・終了した練習・未連携・枠不足)

/** ISO → "10:00"(Asia/Tokyo 固定。CLAUDE.md 開発ルール) */
function formatTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TOKYO_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("hour")}:${get("minute")}`;
}

export function ReminderSender({
  practiceId,
  heldOn,
  today,
  unanswered,
  usage,
  sentTodayAt,
}: {
  practiceId: string;
  heldOn: string;
  /** Asia/Tokyo の今日(サーバーで決めた値を渡す。端末時計に依存させない) */
  today: string;
  unanswered: number;
  usage: LineUsageSummary;
  /** 本日すでに同じ練習日へ送っていればその時刻(ISO)。自動ジョブとの二重送信に気づかせる */
  sentTodayAt: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);

  const memberCount = usage.memberCount;
  const blockedReason =
    unanswered === 0
      ? "未回答の部員はいません"
      : heldOn < today
        ? "終了した練習には送れません"
        : !usage.groupLinked
          ? "LINE グループが未連携です(Bot をグループに招待してください)"
          : memberCount === null
            ? "グループの参加人数を取得できませんでした"
            : usage.remaining < memberCount
              ? `今月の LINE 通数が足りません(残り ${usage.remaining} 通、必要 ${memberCount} 通)`
              : null;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/line/send/reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practiceId }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        message?: { sentAt: string };
      } | null;
      if (!res.ok) {
        setError(body?.error ?? "送信できませんでした");
        setBusy(false);
        // 失敗でも failed のログが残ることがあるのでメーターを取り直す
        router.refresh();
        return;
      }
      setSentAt(body?.message?.sentAt ?? new Date().toISOString());
      setConfirming(false);
      setBusy(false);
      router.refresh();
    } catch {
      setError("送信できませんでした");
      setBusy(false);
    }
  }

  return (
    <div className="remind">
      {error !== null && (
        <p className="lgerr" role="alert">
          {error}
        </p>
      )}
      {sentAt !== null && error === null && (
        <p className="anote">{`送信しました ${formatTime(sentAt)}`}</p>
      )}
      {confirming ? (
        <fieldset className="confirm">
          <legend className="sr-only">出欠リマインド送信の確認</legend>
          {/* 通数 = 送信回数 × グループ人数。必ず消費と残りを見せる(絶対原則3) */}
          <span className="q">
            {`グループ ${memberCount ?? "?"} 人に送信します(${memberCount ?? "?"} 通消費・残り ${Math.max(0, usage.remaining - (memberCount ?? 0))} 通)`}
            {sentTodayAt !== null && (
              <b>
                {` 本日 ${new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(sentTodayAt))} にこの練習日へ送信済みです。もう一度送りますか?`}
              </b>
            )}
          </span>
          <button
            type="button"
            className="abtn"
            onClick={() => setConfirming(false)}
            disabled={busy}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="abtn fill"
            onClick={send}
            disabled={busy}
          >
            送信する
          </button>
        </fieldset>
      ) : (
        <button
          type="button"
          className="abtn"
          onClick={() => {
            setError(null);
            setSentAt(null);
            setConfirming(true);
          }}
          disabled={busy || blockedReason !== null}
          title={blockedReason ?? undefined}
        >
          リマインドを送る
        </button>
      )}
    </div>
  );
}
