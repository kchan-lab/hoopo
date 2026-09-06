import {
  getAttendanceSheet,
  monthOf,
  parseMonth,
  todayInTokyo,
} from "@hoopo/api";
import { cookies } from "next/headers";
import Link from "next/link";
import { getGuardianSession } from "../../lib/session";
import { AutoLogin } from "../auto-login";
import {
  ATTENDANCE_VIEW_COOKIE_NAME,
  type ScheduleView,
} from "../schedule/view-toggle";
import { TabBar } from "../tab-bar";
import { AttendanceEditor } from "./attendance-editor";

export const dynamic = "force-dynamic";

// 参加予定の提出(REQUIREMENTS §4.2-6。ワイヤー10・11)。
// 月・お子さん・表示形式を URL / Cookie で表し、初期データを SSR で読んで編集はクライアントに渡す
// (リストとカレンダーを完全同期させ、CTA で一括保存する。attendance/plan.md 設計判断2・5)

type Search = { month?: string; view?: string; child?: string };

export default async function AttendancePage({
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
  const month = parseMonth(sp.month) ?? monthOf(todayInTokyo());
  const cookieView = (await cookies()).get(ATTENDANCE_VIEW_COOKIE_NAME)?.value;
  const raw = sp.view ?? cookieView;
  const view: ScheduleView = raw === "calendar" ? "calendar" : "list";
  const sheet = await getAttendanceSheet(session.teamId, session.sub, month);

  // 子ども未連携のときは日程と同じくホームの分岐画面へ誘導する
  const first = sheet.children[0];
  if (!first) {
    return (
      <>
        <header className="sc-head">
          <h1 className="sc-title">参加予定の提出</h1>
        </header>
        <main className="sc-body">
          <p className="help">お子さんの登録が済むと、参加予定を提出できます</p>
          <Link href="/" className="card choice">
            はじめての方
            <small>お子さんの登録・招待コードの入力へ</small>
          </Link>
        </main>
        <TabBar active="send" />
      </>
    );
  }
  const child = sheet.children.find((c) => c.id === sp.child) ?? first;

  return (
    <>
      {/* お子さんを切り替えたら編集中の内容ごと作り直す(回答は子ごとに別) */}
      <AttendanceEditor
        key={`${child.id}:${month}`}
        month={month}
        initialView={view}
        childList={sheet.children}
        childId={child.id}
        practices={sheet.practices}
        answers={sheet.answers[child.id] ?? {}}
      />
      <TabBar active="send" />
    </>
  );
}
