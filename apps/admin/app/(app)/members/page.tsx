import { getYearRolloverStatus, listMembers } from "@hoopo/api";
import { redirect } from "next/navigation";
import { getCoachSession } from "../../../lib/session";
import { Shell } from "../shell";
import { MemberTable } from "./member-table";
import { YearRollover } from "./year-rollover";

export const dynamic = "force-dynamic";

// 部員管理(REQUIREMENTS §5.2。ワイヤー PC-8 / SP-9)。
// 年度更新(学年+1・6年生の卒団アーカイブ)は二段階確認+24時間の取り消し猶予つき
// (year-rollover/plan.md。破壊的操作は確認ダイアログ+実行ログ)

export default async function MembersPage() {
  const session = await getCoachSession();
  if (!session) redirect("/login");
  const [members, rollover] = await Promise.all([
    listMembers(session.teamId),
    getYearRolloverStatus(session.teamId),
  ]);

  return (
    <Shell title="部員管理">
      <main>
        <div className="ah">
          <b>
            部員管理 <span className="cnt">{members.length}人</span>
          </b>
          <YearRollover status={rollover} />
        </div>
        <div className="acard">
          <MemberTable members={members} />
          <p className="anote">
            行をタップで詳細(伝達事項全文・参加可能曜日/時間・招待コード)。年度更新は全部員の学年+1と6年生の卒団アーカイブを行い、24時間以内なら1回だけ取り消せます
          </p>
        </div>
      </main>
    </Shell>
  );
}
