import { listTeamMembers } from "@hoopo/api";
import { getGuardianSession } from "../../lib/session";
import { AutoLogin } from "../auto-login";
import { TabBar } from "../tab-bar";

export const dynamic = "force-dynamic";

// チーム(REQUIREMENTS §4.2-7。ワイヤー12)。初期表示は全メンバー一覧で、
// 表示は氏名・呼び名(ひらがな)・学年のみ(team-roster/plan.md 設計判断1・2)。
// 出場メンバーのコート配置は日程の詳細から遷移する(7b)

/** 頭文字アバター。顔写真は未対応なので氏名の先頭1文字で代替する(設計判断2) */
function initial(name: string): string {
  return Array.from(name)[0] ?? "?";
}

export default async function TeamPage() {
  const session = await getGuardianSession();
  if (!session) {
    return (
      <main className="sc-body">
        <AutoLogin />
      </main>
    );
  }
  const members = await listTeamMembers(session.teamId);

  return (
    <>
      <header className="sc-head">
        <h1 className="sc-title">
          チーム
          <span className="count">{members.length}人</span>
        </h1>
      </header>
      <main className="sc-body">
        {members.length === 0 ? (
          <p className="sync">部員はまだ登録されていません</p>
        ) : (
          <ul className="roster">
            {members.map((m) => (
              <li key={m.id} className="rrow">
                <span className="ini" aria-hidden="true">
                  {initial(m.name)}
                </span>
                <span className="nm">{m.name}</span>
                {m.nicknameKana && (
                  <span className="kana">{m.nicknameKana}</span>
                )}
                <span className="pill">{m.grade}年</span>
              </li>
            ))}
          </ul>
        )}
      </main>
      <TabBar active="team" />
    </>
  );
}
