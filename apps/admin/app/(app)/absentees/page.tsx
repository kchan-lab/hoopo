import {
  type AbsenteeEntry,
  addMonths,
  formatMonthLabel,
  getAbsentees,
  listPracticesByMonth,
  monthOf,
  parseMonth,
  todayInTokyo,
  weekdayLabel,
} from "@hoopo/api";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCoachSession } from "../../../lib/session";
import { Shell } from "../shell";

export const dynamic = "force-dynamic";

// 欠席者管理(REQUIREMENTS §5.2。ワイヤー PC-4 / SP-5)。
// 練習日を日付ピルで選び、その日の 不参加 / 途中参加・早退 / 未回答 だけを見る。
// 未回答の「リマインド対象に含める」は送信手段(LINE グループ1通)が入る #27 まで無効表示
// (attendance/plan.md 設計判断7)

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
  remindable = false,
}: {
  title: string;
  entries: AbsenteeEntry[];
  remindable?: boolean;
}) {
  return (
    <div className="acard">
      {/* 見出しの区切りはワイヤーどおり em ダッシュ */}
      <div className="k">
        {title} — {entries.length}人
      </div>
      {entries.map((e) => (
        <div key={e.child.id} className="arow">
          <b>
            {e.child.name}({e.child.grade}年)
          </b>
          {remindable ? (
            <button
              type="button"
              className="abtn"
              disabled
              title="LINE リマインドは #27 で実装"
            >
              リマインド対象に含める
            </button>
          ) : (
            <span>{e.comment ?? "(コメントなし)"}</span>
          )}
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
  const data = selectedId
    ? await getAbsentees(session.teamId, selectedId)
    : null;
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
                <Group title="未回答" entries={data.unanswered} remindable />
                {data.absent.length === 0 &&
                  data.partial.length === 0 &&
                  data.unanswered.length === 0 && (
                    <p className="anote">
                      この日の不参加・途中参加・未回答の部員はいません
                    </p>
                  )}
              </>
            )}
          </>
        )}
      </main>
    </Shell>
  );
}
