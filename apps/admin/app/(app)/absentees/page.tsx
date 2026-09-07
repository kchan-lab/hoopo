import {
  type AbsenteeEntry,
  addMonths,
  formatMonthLabel,
  getAbsentees,
  getLineUsage,
  listLineMessages,
  listPracticesByMonth,
  monthOf,
  parseMonth,
  todayInTokyo,
  weekdayLabel,
} from "@hoopo/api";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { lineClient } from "../../../lib/line";
import { getCoachSession } from "../../../lib/session";
import { LineMessageLog, LineMeter } from "../line-meter";
import { Shell } from "../shell";
import { ReminderSender } from "./reminder-sender";

export const dynamic = "force-dynamic";

// 欠席者管理(REQUIREMENTS §5.2。ワイヤー PC-4 / SP-5)。
// 練習日を日付ピルで選び、その日の 不参加 / 途中参加・早退 / 未回答 だけを見る。
// 未回答には「リマインドを送る」(#20。グループ宛て1通。個人宛て push は作らない=絶対原則3)。
// 通数メーターと送信ログは日程管理と同じ LineMeter を再利用する
// (attendance-reminder/plan.md「画面(admin 欠席者管理)」)

function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** 選択中のピルだけ曜日まで出す(ワイヤー PC-4 の "8/2(日)") */
function pillLabel(date: string, selected: boolean): string {
  return selected
    ? `${shortDate(date)}(${weekdayLabel(date)})`
    : shortDate(date);
}

function Group({
  title,
  entries,
  action,
}: {
  title: string;
  entries: AbsenteeEntry[];
  /** 見出しの右に置く操作(未回答の「リマインドを送る」) */
  action?: ReactNode;
}) {
  return (
    <div className="acard">
      {/* 見出しの区切りはワイヤーどおり em ダッシュ */}
      <div className="ghead">
        <div className="k">
          {title} — {entries.length}人
        </div>
        {action}
      </div>
      {entries.map((e) => (
        <div key={e.child.id} className="arow">
          <b>
            {e.child.name}({e.child.grade}年)
          </b>
          {/* グループ宛て 1 通なので個人名は送らない。ここは画面上の確認だけ */}
          {action === undefined && <span>{e.comment ?? "(コメントなし)"}</span>}
        </div>
      ))}
    </div>
  );
}

export default async function AbsenteesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; practiceId?: string }>;
}) {
  const session = await getCoachSession();
  if (!session) redirect("/login");
  const { month: rawMonth, practiceId: rawId } = await searchParams;
  const month = parseMonth(rawMonth) ?? monthOf(todayInTokyo());
  const practices = await listPracticesByMonth(session.teamId, month);

  // 既定は「今日以降で最初の練習」。過ぎた月を見ているときはその月の先頭
  const today = todayInTokyo();
  const fallback = practices.find((p) => p.heldOn >= today) ?? practices[0];
  const selectedId =
    rawId && practices.some((p) => p.id === rawId) ? rawId : fallback?.id;
  const [data, lineUsage, lineMessages] = await Promise.all([
    selectedId ? getAbsentees(session.teamId, selectedId) : null,
    getLineUsage(session.teamId, lineClient()),
    listLineMessages(session.teamId, 5),
  ]);
  const monthNumber = Number(month.slice(5));

  return (
    <Shell title="欠席者管理">
      <main>
        <div className="ah">
          <b>欠席者管理</b>
          <nav className="month-nav" aria-label="表示する月">
            <Link
              href={`/absentees?month=${addMonths(month, -1)}`}
              className="abtn"
              aria-label="前の月"
            >
              ‹
            </Link>
            <span className="pill">{formatMonthLabel(month)}</span>
            <Link
              href={`/absentees?month=${addMonths(month, 1)}`}
              className="abtn"
              aria-label="次の月"
            >
              ›
            </Link>
          </nav>
        </div>

        {practices.length === 0 ? (
          <p className="anote" style={{ marginTop: 0 }}>
            {monthNumber}月の練習はまだ登録されていません
          </p>
        ) : (
          <>
            <nav className="pills" aria-label="練習日">
              {practices.map((p) => {
                const on = p.id === data?.practice.id;
                return (
                  <Link
                    key={p.id}
                    href={`/absentees?month=${month}&practiceId=${p.id}`}
                    className={`pill${on ? " fill" : ""}`}
                    aria-current={on ? "page" : undefined}
                  >
                    {pillLabel(p.heldOn, on)}
                  </Link>
                );
              })}
            </nav>
            {data && (
              <>
                <Group title="不参加" entries={data.absent} />
                <Group title="途中参加・早退" entries={data.partial} />
                <Group
                  title="未回答"
                  entries={data.unanswered}
                  action={
                    <ReminderSender
                      practiceId={data.practice.id}
                      heldOn={data.practice.heldOn}
                      today={today}
                      unanswered={data.unanswered.length}
                      usage={lineUsage}
                    />
                  }
                />
                {data.absent.length === 0 &&
                  data.partial.length === 0 &&
                  data.unanswered.length === 0 && (
                    <p className="anote">
                      この日の不参加・途中参加・未回答の部員はいません
                    </p>
                  )}
              </>
            )}
            {/* 通数メーター(n/200)+ 送信ログ。実行ログの可視化(CLAUDE.md 開発ルール) */}
            <LineMeter usage={lineUsage}>
              <div className="k" style={{ marginTop: "0.8em" }}>
                送信ログ
              </div>
              <LineMessageLog messages={lineMessages} />
            </LineMeter>
          </>
        )}
      </main>
    </Shell>
  );
}
