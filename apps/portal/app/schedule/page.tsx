import {
  addMonths,
  formatDateLabel,
  formatMonthLabel,
  formatTimeShort,
  listPracticesByMonth,
  monthGrid,
  monthOf,
  type Practice,
  parseMonth,
  todayInTokyo,
  WEEKDAY_SHORT,
  weekdayLabel,
} from "@hoopo/api";
import { cookies } from "next/headers";
import Link from "next/link";
import { getGuardianSession } from "../../lib/session";
import { AutoLogin } from "../auto-login";
import { Icon } from "../icons";
import { TabBar } from "../tab-bar";
import { type ScheduleView, VIEW_COOKIE_NAME, ViewToggle } from "./view-toggle";

export const dynamic = "force-dynamic";

// 練習日程(REQUIREMENTS §4.2-4。ワイヤー5・6)。リスト/カレンダーの2形式、日曜始まり、
// 練習日のみタップ可。カレンダーの日付タップは ?day= で選択して下のカードに出し、
// 「詳細ページへ」でフル画面の詳細(§4.2-5)へ遷移する

type Search = { month?: string; view?: string; day?: string };

function pickView(
  query: string | undefined,
  cookie: string | undefined,
): ScheduleView {
  const v = query ?? cookie;
  return v === "calendar" ? "calendar" : "list";
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await getGuardianSession();
  if (!session) {
    return (
      <main className="sc-body">
        <AutoLogin />
      </main>
    );
  }
  const sp = await searchParams;
  const today = todayInTokyo();
  const month = parseMonth(sp.month) ?? monthOf(today);
  const view = pickView(
    sp.view,
    (await cookies()).get(VIEW_COOKIE_NAME)?.value,
  );
  const practices = await listPracticesByMonth(session.teamId, month);
  const byDay = new Map<string, Practice[]>();
  for (const p of practices)
    byDay.set(p.heldOn, [...(byDay.get(p.heldOn) ?? []), p]);
  const selectedDay =
    sp.day && byDay.has(sp.day)
      ? sp.day
      : (practices.find((p) => p.heldOn >= today)?.heldOn ??
        practices[0]?.heldOn ??
        null);

  return (
    <>
      <header className="sc-head">
        <h1 className="sc-title">
          練習日程
          <ViewToggle view={view} month={month} />
        </h1>
      </header>
      <main className="sc-body">
        <nav className="month-nav" aria-label="表示する月">
          <Link
            href={`/schedule?month=${addMonths(month, -1)}&view=${view}`}
            aria-label="前の月"
          >
            <Icon name="chevl" />
          </Link>
          <span>{formatMonthLabel(month)}</span>
          <Link
            href={`/schedule?month=${addMonths(month, 1)}&view=${view}`}
            aria-label="次の月"
          >
            <Icon name="chevr" />
          </Link>
        </nav>

        {view === "list" ? (
          practices.length === 0 ? (
            <p className="sync">
              {formatMonthLabel(month)}の練習はまだ登録されていません
            </p>
          ) : (
            <>
              <ul className="sched">
                {practices.map((p) => (
                  <li key={p.id}>
                    <Link href={`/practices/${p.id}`} className="sr">
                      <span className="d">
                        <b>{Number(p.heldOn.slice(8))}</b>
                        <span>{weekdayLabel(p.heldOn)}</span>
                      </span>
                      <span className="body">
                        <span className="t">
                          {formatTimeShort(p.startTime)}–
                          {formatTimeShort(p.endTime)}
                        </span>
                        <span className="p">{p.location ?? "場所未定"}</span>
                      </span>
                      {p.note && <span className="badge">{p.note}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="sync">日付をタップすると詳細ページを開きます</p>
            </>
          )
        ) : (
          <>
            <div className="cal">
              <div className="wk" aria-hidden="true">
                {WEEKDAY_SHORT.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
              {monthGrid(month).map((week) => (
                <div className="days" key={week[0]?.date}>
                  {week.map((c) => {
                    const has = c.inMonth && byDay.has(c.date);
                    const cls = `cell${!c.inMonth ? " mute" : has ? " pr prac" : " off"}${
                      c.date === selectedDay ? " sel" : ""
                    }${c.date === today ? " today" : ""}`;
                    return (
                      <div key={c.date} className={cls}>
                        {has ? (
                          <Link
                            href={`/schedule?month=${month}&view=calendar&day=${c.date}`}
                            aria-label={`${formatDateLabel(c.date)}の練習`}
                            aria-current={
                              c.date === selectedDay ? "date" : undefined
                            }
                          >
                            <i>{c.day}</i>
                          </Link>
                        ) : (
                          <i>{c.day}</i>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="legend">
                <em>
                  <span className="sw prac" /> 練習日
                </em>
                <em>
                  <span className="sw sel" /> 選択中
                </em>
              </div>
            </div>
            {selectedDay ? (
              (byDay.get(selectedDay) ?? []).map((p) => (
                <Link
                  key={p.id}
                  href={`/practices/${p.id}`}
                  className="card day-detail"
                >
                  <span className="ttl">
                    {formatDateLabel(p.heldOn)} {formatTimeShort(p.startTime)}–
                    {formatTimeShort(p.endTime)}
                  </span>
                  <span className="kv">
                    <Icon name="pin" />
                    {p.location ?? "場所未定"}
                    <span className="go">詳細ページへ →</span>
                  </span>
                </Link>
              ))
            ) : (
              <p className="sync">
                {formatMonthLabel(month)}の練習はまだ登録されていません
              </p>
            )}
          </>
        )}
      </main>
      <TabBar active="cal" />
    </>
  );
}
