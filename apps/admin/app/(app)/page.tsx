import {
  ATTENDANCE_MARKS,
  formatDateLabel,
  formatMonthLabel,
  getDashboard,
  monthOf,
  todayInTokyo,
} from "@hoopo/api";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCoachSession } from "../../lib/session";
import { LogoutButton } from "./logout-button";
import { Shell } from "./shell";

export const dynamic = "force-dynamic";

// 管理ダッシュボード(REQUIREMENTS §5.2。ワイヤー PC-2 / SP-3)。
// 提出率・次回参加人数・月謝未提出の3カード + 未提出の部員一覧 + LINE通数メーター。
// 数字は packages/api の getDashboard(Tokyo の今日基準)だけから作り、カードから各画面へ渡す。
// LINE通数は送信ログが未設計なのでプレースホルダのまま(admin-dashboard/plan.md 設計判断2)

export default async function DashboardPage() {
  const session = await getCoachSession();
  if (!session) redirect("/login");
  const today = todayInTokyo();
  const { month, submission, nextPractice, fees, unansweredMembers } =
    await getDashboard(session.teamId, today);
  const monthNumber = Number(month.slice(5));

  return (
    <Shell title="ダッシュボード">
      <main>
        <div className="ah">
          <b>ダッシュボード</b>
          <span className="pill">{formatMonthLabel(month)}</span>
        </div>

        <div className="agrid">
          <div className="acard">
            <div className="k">提出率({monthNumber}月)</div>
            <div className="v">
              {submission.rate}%{" "}
              <small>
                ({submission.answered} / {submission.total})
              </small>
            </div>
            {/* バーは aink 単色(DESIGN §2.3) */}
            <div className="bar">
              <i style={{ width: `${submission.rate}%` }} />
            </div>
            <Link className="go" href="/attendance">
              出欠管理へ
            </Link>
          </div>

          <div className="acard">
            <div className="k">次回参加人数</div>
            {nextPractice ? (
              <>
                {/* 途中参加・早退も「参加する人数」に数え、内訳は4値で併記する */}
                <div className="v">
                  {nextPractice.full + nextPractice.partial}人{" "}
                  <small>{formatDateLabel(nextPractice.practice.heldOn)}</small>
                </div>
                <div className="brk">
                  {ATTENDANCE_MARKS.full}
                  {nextPractice.full} {ATTENDANCE_MARKS.partial}
                  {nextPractice.partial} {ATTENDANCE_MARKS.absent}
                  {nextPractice.absent} {ATTENDANCE_MARKS.none}
                  {nextPractice.unanswered}
                </div>
                <Link
                  className="go"
                  href={`/absentees?month=${monthOf(nextPractice.practice.heldOn)}&practiceId=${nextPractice.practice.id}`}
                >
                  欠席者管理へ
                </Link>
              </>
            ) : (
              <>
                <div className="v">−</div>
                <p className="anote">次回の練習はありません</p>
                <Link className="go" href="/schedule">
                  日程管理へ
                </Link>
              </>
            )}
          </div>

          <div className="acard">
            <div className="k">月謝 未提出({monthNumber}月)</div>
            <div className="v">
              {fees.unpaidCount}人 <small>/ {fees.total}人</small>
            </div>
            <Link className="go" href="/fees">
              月謝管理へ
            </Link>
          </div>
        </div>

        <div className="acard">
          <div className="k">未提出の保護者({monthNumber}月)</div>
          {unansweredMembers.length === 0 ? (
            <p className="anote">全員提出済みです</p>
          ) : (
            unansweredMembers.map((m) => (
              <div key={m.id} className="arow">
                <b>
                  {m.name}({m.grade}年)
                </b>
                <span>未回答 {m.unanswered}件</span>
              </div>
            ))
          )}
        </div>

        <div className="acard">
          <div className="k">今月のLINE通数</div>
          <div className="v">
            − <small>/ 200通(無料枠)</small>
          </div>
          <div className="bar">
            <i style={{ width: "0%" }} />
          </div>
          <p className="anote">
            1回の送信でグループ人数分を消費します(カウンターは 6c で有効化)
          </p>
        </div>

        {/* 共有 PC を想定した明示的なログアウト(数字を邪魔しないよう最下部に置く) */}
        <div className="dfoot">
          <LogoutButton />
        </div>
      </main>
    </Shell>
  );
}
