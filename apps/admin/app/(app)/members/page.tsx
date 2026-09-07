import {
  type AuditLogRow,
  getYearRolloverStatus,
  listArchivedMembers,
  listAuditLogs,
  listMembers,
} from "@hoopo/api";
import { redirect } from "next/navigation";
import { getCoachSession } from "../../../lib/session";
import { Shell } from "../shell";
import { ArchivedMembers } from "./archived-members";
import { MemberTable } from "./member-table";
import { YearRollover } from "./year-rollover";

export const dynamic = "force-dynamic";

// 部員管理(REQUIREMENTS §5.2。ワイヤー PC-8 / SP-9)。
// 年度更新(学年+1・6年生の卒団アーカイブ)は二段階確認+24時間の取り消し猶予つき
// (year-rollover/plan.md。破壊的操作は確認ダイアログ+実行ログ)。
// その下に「卒団した部員」(データ削除)と「実行ログ」を置く(member-deletion/plan.md)

/** 実行ログの表示件数(plan.md 画面: 直近 10 件) */
const AUDIT_LOG_LIMIT = 10;

const logFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// ログに名前は残さない(設計判断3)ので、内容は学年・人数だけで組み立てる
function logText(log: AuditLogRow): string {
  if (log.action === "child_deleted") {
    const removed =
      typeof log.detail.removedGuardians === "number"
        ? log.detail.removedGuardians
        : 0;
    return `部員データを削除(保護者 ${removed} 人分も削除)`;
  }
  return log.action;
}

export default async function MembersPage() {
  const session = await getCoachSession();
  if (!session) redirect("/login");
  const [members, rollover, archived, logs] = await Promise.all([
    listMembers(session.teamId),
    getYearRolloverStatus(session.teamId),
    listArchivedMembers(session.teamId),
    listAuditLogs(session.teamId, AUDIT_LOG_LIMIT),
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

        <section className="acard">
          <div className="ttl">
            卒団した部員 <span className="cnt">{archived.length}人</span>
          </div>
          <ArchivedMembers members={archived} />
          <p className="anote">
            削除すると本人の出欠・月謝・チーム編成の記録も消え、元に戻せません。紐づく保護者は、他にお子さんがいなければ一緒に削除されます
          </p>
        </section>

        <section className="acard">
          <div className="ttl">実行ログ</div>
          {logs.length === 0 ? (
            <p className="anote">実行ログはまだありません</p>
          ) : (
            logs.map((log) => (
              <div className="arow" key={log.id}>
                <b>{logFmt.format(new Date(log.createdAt))}</b>
                <span>{logText(log)}</span>
              </div>
            ))
          )}
        </section>
      </main>
    </Shell>
  );
}
