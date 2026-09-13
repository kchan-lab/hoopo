import { listRegistrations, RELATION_LABELS } from "@hoopo/api";
import { redirect } from "next/navigation";
import { getCoachSession } from "../../../lib/session";
import { Shell } from "../shell";
import { RevokeButton } from "./revoke-button";

export const dynamic = "force-dynamic";

// 認定管理(REQUIREMENTS §5.2。ワイヤー PC-5 / SP-6)。
// 自動認定+事後確認: 新規登録・家族連携の履歴を新着順に並べ、無効化だけを提供する
// (承認/却下ボタンは置かない。DESIGN_GUIDELINES §2.3)

const fmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function RegistrationsPage() {
  const session = await getCoachSession();
  if (!session) redirect("/login");
  const entries = await listRegistrations(session.teamId);

  return (
    <Shell title="認定管理">
      <main>
        <div className="ah">
          <b>認定管理</b>
          <span className="cap">
            登録は即時有効。心当たりのない登録のみ無効化してください
          </span>
        </div>
        {entries.length === 0 && <p className="anote">まだ登録はありません</p>}
        {entries.map((e) => (
          <article key={e.key} className="acard" data-kind={e.kind}>
            <div className="ttl">
              {e.kind === "child"
                ? `${e.childName}(${e.grade}年)`
                : `${e.childName}(${e.grade}年)への家族連携`}
            </div>
            <div className="meta">
              {e.kind === "child"
                ? "新規登録 / 登録用URL経由"
                : "招待コード経由"}
              {e.relation && ` / 続柄: ${RELATION_LABELS[e.relation]}`}
              {` / ${fmt.format(new Date(e.createdAt))} に自動認定`}
            </div>
            <div className="acts">
              {e.status === "active" ? (
                <>
                  <span className="pill">認定済(自動)</span>
                  <RevokeButton
                    kind={e.kind}
                    childId={e.childId}
                    guardianId={e.guardianId}
                    label={
                      e.kind === "child"
                        ? `${e.childName}の登録`
                        : `${e.childName}への家族連携`
                    }
                  />
                </>
              ) : (
                <span className="pill">無効化済み</span>
              )}
            </div>
          </article>
        ))}
      </main>
    </Shell>
  );
}
