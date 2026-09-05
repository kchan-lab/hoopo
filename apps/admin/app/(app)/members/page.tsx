import { listMembers } from "@hoopo/api";
import { redirect } from "next/navigation";
import { getCoachSession } from "../../../lib/session";
import { Shell } from "../shell";
import { MemberTable } from "./member-table";

export const dynamic = "force-dynamic";

// 部員管理(REQUIREMENTS §5.2。ワイヤー PC-8 / SP-9)。
// 年度更新は別 Issue(ボタンは置くが無効)

export default async function MembersPage() {
  const session = await getCoachSession();
  if (!session) redirect("/login");
  const members = await listMembers(session.teamId);

  return (
    <Shell title="部員管理">
      <main>
        <div className="ah">
          <b>
            部員管理 <span className="cnt">{members.length}人</span>
          </b>
          <button
            type="button"
            className="abtn"
            disabled
            title="年度更新は別 Issue で実装"
          >
            年度更新を実行
          </button>
        </div>
        <div className="acard">
          <MemberTable members={members} />
          <p className="anote">
            行をタップで詳細(伝達事項全文・参加可能曜日/時間・招待コード)。年度更新は学年+1と6年生の卒団アーカイブを確認ダイアログ+取り消し猶予つきで実行(準備中)
          </p>
        </div>
      </main>
    </Shell>
  );
}
