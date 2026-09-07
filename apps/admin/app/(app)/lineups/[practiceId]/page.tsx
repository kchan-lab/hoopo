import {
  formatDateLabel,
  getLineupForCoach,
  isUuid,
  monthOf,
} from "@hoopo/api";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCoachSession } from "../../../../lib/session";
import { Shell } from "../../shell";
import { LineupEditor } from "./lineup-editor";

export const dynamic = "force-dynamic";

// チーム編成(REQUIREMENTS §5.2。ワイヤーは無く、管理の語彙で組み立てる)。
// 日程管理の各練習の「編成」から来る。スターター5枠+ベンチを選んで保存(全置換)。
// 保護者側の 2D コート表示は 7b-2(#102)

export default async function LineupPage({
  params,
}: {
  params: Promise<{ practiceId: string }>;
}) {
  const session = await getCoachSession();
  if (!session) redirect("/login");
  const { practiceId } = await params;
  // 不正な id で DB に問い合わせない。他チームの練習も getLineupForCoach が null を返す
  const lineup = isUuid(practiceId)
    ? await getLineupForCoach(session.teamId, practiceId)
    : null;
  if (!lineup) notFound();
  const { practice } = lineup;

  return (
    <Shell title="チーム編成">
      <main>
        <div className="ah">
          <div>
            <b>チーム編成</b>
            <div className="cap">
              {`${formatDateLabel(practice.heldOn)} ${practice.startTime}–${practice.endTime}`}
              {practice.location !== null && ` ${practice.location}`}
            </div>
          </div>
          <Link
            className="abtn"
            href={`/schedule?month=${monthOf(practice.heldOn)}`}
          >
            日程管理へ
          </Link>
        </div>
        <LineupEditor
          practiceId={practice.id}
          members={lineup.members}
          initialStarters={lineup.starters}
          initialBench={lineup.bench}
        />
      </main>
    </Shell>
  );
}
