import {
  ATTENDANCE_MARKS,
  addMonths,
  formatMonthLabel,
  getAttendanceMatrix,
  monthOf,
  parseMonth,
  todayInTokyo,
} from "@hoopo/api";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCoachSession } from "../../../lib/session";
import { Shell } from "../shell";

export const dynamic = "force-dynamic";

// 出欠管理(REQUIREMENTS §5.2。ワイヤー PC-3 / SP-4)。
// 部員(行)×練習日(列)のマトリクス。△は保護者コメントを持つので、
// JS を使わないネイティブの <details> で開閉する(attendance/plan.md 設計判断8)

/** 列見出しの "9/6" */
function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getCoachSession();
  if (!session) redirect("/login");
  const { month: raw } = await searchParams;
  const month = parseMonth(raw) ?? monthOf(todayInTokyo());
  const { practices, rows } = await getAttendanceMatrix(session.teamId, month);
  const monthNumber = Number(month.slice(5));

  return (
    <Shell title="出欠管理">
      <main>
        <div className="ah">
          <b>出欠管理</b>
          <nav className="month-nav" aria-label="表示する月">
            <Link
              href={`/attendance?month=${addMonths(month, -1)}`}
              className="abtn"
              aria-label="前の月"
            >
              ‹
            </Link>
            <span className="pill">{formatMonthLabel(month)}</span>
            <Link
              href={`/attendance?month=${addMonths(month, 1)}`}
              className="abtn"
              aria-label="次の月"
            >
              ›
            </Link>
          </nav>
        </div>

        <div className="acard">
          {practices.length === 0 ? (
            <p className="anote" style={{ marginTop: 0 }}>
              {monthNumber}月の練習はまだ登録されていません
            </p>
          ) : rows.length === 0 ? (
            <p className="anote" style={{ marginTop: 0 }}>
              部員はまだ登録されていません
            </p>
          ) : (
            <>
              {/* モバイルでは列が入りきらないので横スクロールを許可する(DESIGN §2.3) */}
              <div className="ascroll">
                <table className="atable amatrix">
                  <thead>
                    <tr className="hd">
                      <td className="c-member">部員</td>
                      {practices.map((p) => (
                        <td key={p.id}>{shortDate(p.heldOn)}</td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      // 一度も回答していない部員は行ごと薄くする(ワイヤー PC-3)
                      const silent = practices.every(
                        (p) => r.cells[p.id] == null,
                      );
                      return (
                        <tr key={r.child.id} className={silent ? "muted" : ""}>
                          <td className="c-member">
                            {r.child.name}
                            <span className="pc">({r.child.grade}年)</span>
                          </td>
                          {practices.map((p) => {
                            const cell = r.cells[p.id] ?? null;
                            const mark =
                              ATTENDANCE_MARKS[cell?.status ?? "none"];
                            // ○△は濃く、×−は薄く(未回答と不参加は視線を奪わない)
                            const tone =
                              cell?.status === "full" ||
                              cell?.status === "partial"
                                ? "mark"
                                : "none";
                            if (cell?.status === "partial" && cell.comment) {
                              return (
                                <td key={p.id} className={tone}>
                                  <details>
                                    <summary
                                      aria-label={`${r.child.name} ${shortDate(p.heldOn)} 途中参加・早退のコメント`}
                                    >
                                      {mark}
                                    </summary>
                                    <span className="cmt">{cell.comment}</span>
                                  </details>
                                </td>
                              );
                            }
                            return (
                              <td key={p.id} className={tone}>
                                {mark}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="anote">
                {ATTENDANCE_MARKS.full} 全参加 / {ATTENDANCE_MARKS.partial}{" "}
                途中参加・早退(タップでコメント) / {ATTENDANCE_MARKS.absent}{" "}
                不参加 / {ATTENDANCE_MARKS.none}{" "}
                未回答。列=当日一覧、行=個人詳細
              </p>
            </>
          )}
        </div>
      </main>
    </Shell>
  );
}
