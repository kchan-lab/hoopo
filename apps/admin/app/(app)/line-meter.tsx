import type { LineMessageLogEntry, LineUsageSummary } from "@hoopo/api";
import { describeLineMessage } from "@hoopo/api/line-shared";
import type { ReactNode } from "react";

// LINE 通数メーター(n/200)と送信ログ。ダッシュボードと日程管理に常設する
// (DESIGN_GUIDELINES §2.3。バーは aink 単色)。
// 状態を持たない表示だけの部品なので、サーバーコンポーネント(ダッシュボード)からも
// クライアントコンポーネント(日程管理の ScheduleEditor)からも使える。
// DB を引くモジュールは import しない(型は import type で消える)

/** ISO → "9/6 10:00"(Asia/Tokyo 固定。CLAUDE.md 開発ルール) */
const dateTimeFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatSentAt(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}

export function LineMeter({
  usage,
  children,
}: {
  usage: LineUsageSummary;
  children?: ReactNode;
}) {
  // 0 除算を避けつつ 100% で頭打ちにする(枠超過は canSend が事前に止める)
  const percent =
    usage.quota === 0 ? 0 : Math.min(100, (usage.used / usage.quota) * 100);
  return (
    <div className="acard">
      <div className="k">今月のLINE通数</div>
      <div className="v">
        {usage.used} <small>/ {usage.quota}通(無料枠)</small>
      </div>
      <div className="bar">
        <i style={{ width: `${percent}%` }} />
      </div>
      <p className="anote">
        {usage.groupLinked
          ? `1回の送信でグループ人数分(${usage.memberCount ?? "?"}通)を消費します。残り ${usage.remaining}通(目安)`
          : "LINE グループが未連携です(Bot をグループに招待してください)"}
      </p>
      {children}
    </div>
  );
}

/** 送信ログの最新数件(種別・日時・通数・結果)。実行ログの可視化 */
export function LineMessageLog({
  messages,
  limit = 5,
}: {
  messages: LineMessageLogEntry[];
  limit?: number;
}) {
  const shown = messages.slice(0, limit);
  if (shown.length === 0) {
    return <p className="anote">送信履歴はまだありません</p>;
  }
  return (
    <div className="linelog">
      {shown.map((m) => (
        <div key={m.id} className="arow">
          <b>{describeLineMessage(m)}</b>
          <span>
            {formatSentAt(m.sentAt)} / {m.recipientCount}通 /{" "}
            {m.status === "sent" ? "送信済み" : "失敗"}
          </span>
        </div>
      ))}
    </div>
  );
}
