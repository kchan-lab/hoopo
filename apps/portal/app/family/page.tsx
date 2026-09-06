import { getFamily, RELATION_LABELS } from "@hoopo/api";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getGuardianSession } from "../../lib/session";
import { CopyButton } from "./copy-button";
import { UnlinkButton } from "./unlink-button";

// 家族の設定(REQUIREMENTS §4.2-9。ワイヤー14): 子どもごとの招待コードと連携済みの家族(続柄のみ)。
// 自分の行からは連携を解除できる(family-links/plan.md。最後の保護者は API が断る)

export const dynamic = "force-dynamic";

export default async function FamilyPage() {
  const session = await getGuardianSession();
  if (!session) redirect("/");
  const family = await getFamily(session.teamId, session.sub);
  if (family.length === 0) redirect("/");

  return (
    <>
      <header className="sc-head">
        <h1 className="sc-title">
          <Link href="/" className="back" aria-label="戻る">
            ‹
          </Link>
          家族の設定
        </h1>
      </header>
      <main className="sc-body">
        {family.map((child) => (
          <section key={child.id} className="child-block">
            <div className="card">
              <div className="label">{child.name}さんの招待コード</div>
              <div className="invite-code">{child.inviteCode}</div>
              <CopyButton text={child.inviteCode} />
            </div>
            <div className="label">連携済みの家族</div>
            <ul
              className="news"
              style={{ listStyle: "none", margin: 0, padding: 0 }}
            >
              {child.guardians.map((g) => (
                <li
                  key={g.guardianId}
                  className={g.isMe ? "row unlink" : "row"}
                >
                  <span>
                    {g.isMe
                      ? `あなた(${RELATION_LABELS[g.relation]})`
                      : RELATION_LABELS[g.relation]}
                  </span>
                  {g.isMe ? (
                    <UnlinkButton childId={child.id} childName={child.name} />
                  ) : (
                    <span className="linked">連携済み</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="help">
          このコードをご家族に共有すると、同じお子さんの日程・出欠・月謝を確認できます(連携するとコーチにも通知されます)
        </p>
      </main>
    </>
  );
}
