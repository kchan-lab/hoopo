import { listChildrenForGuardian } from "@hoopo/api";
import Link from "next/link";
import { getGuardianSession } from "../lib/session";
import { AutoLogin } from "./auto-login";
import { InviteForm } from "./invite-form";

// LIFF 起動 → 自動ログインが基本導線(CLAUDE.md 絶対原則2)。
// セッションがあれば、子ども未連携なら分岐画面(ワイヤー15)、連携済みならホーム(ワイヤー4)

const TEAM_NAME = ["SKC粉浜・北粉浜", "ミニバスケットボール"];

export default async function Home() {
  const session = await getGuardianSession();
  if (!session) {
    return (
      <>
        <header className="sc-head">
          <h1 className="sc-title">hoopo − ミニバスれんらくポータル</h1>
        </header>
        <main className="sc-body">
          <AutoLogin />
        </main>
      </>
    );
  }

  const children = await listChildrenForGuardian(session.teamId, session.sub);
  if (children.length === 0) {
    return (
      <>
        <header className="sc-head">
          <h1 className="sc-title">はじめての方</h1>
        </header>
        <main className="sc-body">
          <p className="help">
            LINEログインが完了しました。登録方法を選んでください
          </p>
          <section className="card">
            <h2 className="card-title">
              <span className="dot" aria-hidden="true" />
              家族から招待を受けた方
            </h2>
            <InviteForm />
          </section>
          <div className="divider">または</div>
          <Link href="/register" className="card choice">
            お子さんを新しく登録する
            <small>登録画面(1/2)へ進みます</small>
          </Link>
        </main>
      </>
    );
  }

  const first = children[0];
  return (
    <>
      <header className="sc-head">
        <div className="team-head">
          <div className="logo" aria-hidden="true">
            SKC
          </div>
          <h1 className="name">
            {TEAM_NAME[0]}
            <br />
            {TEAM_NAME[1]}
          </h1>
          <span className="avatar" aria-hidden="true">
            {first?.name.charAt(0)}
          </span>
        </div>
      </header>
      <main className="sc-body">
        <div className="label">お子さん</div>
        <ul
          className="news"
          style={{ listStyle: "none", margin: 0, padding: 0 }}
        >
          {children.map((c) => (
            <li key={c.id} className="row">
              <span>
                {c.name}
                {c.nicknameKana && (
                  <span className="meta" style={{ marginLeft: 6 }}>
                    {c.nicknameKana}
                  </span>
                )}
              </span>
              <span className="pill">{c.grade}年</span>
            </li>
          ))}
        </ul>
        <Link href="/family" className="card choice">
          家族の設定
          <small>招待コードの共有・連携済みの家族</small>
        </Link>
        <p className="sync">
          練習日程・出欠・月謝は順次利用できるようになります
        </p>
        <div className="powered">
          powered by <b>hoopo</b>
        </div>
      </main>
    </>
  );
}
