import {
  formatDateLabel,
  formatShortDate,
  formatTimeShort,
  getNextPractice,
  getUnansweredSummary,
  HOME_ANNOUNCEMENT_LIMIT,
  listChildrenForGuardian,
  listPublishedAnnouncements,
  monthOf,
  todayInTokyo,
} from "@hoopo/api";
import Link from "next/link";
import { getGuardianSession } from "../lib/session";
import { AutoLogin } from "./auto-login";
import { Icon } from "./icons";
import { InviteForm } from "./invite-form";
import { TabBar } from "./tab-bar";

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
            <p className="help">
              すでにご家族がお子さんを登録している場合は、新しく登録せず招待コードで連携してください(二重登録を防ぐため)
            </p>
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
  const today = todayInTokyo();
  const month = monthOf(today);
  // 次回の練習・今月の未回答件数・お知らせは独立したクエリなので並列に取る
  // (未回答があれば提出へ誘導する。ワイヤー4。件数は練習 × お子さん)
  const [next, summary, announcements] = await Promise.all([
    getNextPractice(session.teamId, today),
    getUnansweredSummary(session.teamId, session.sub, month),
    listPublishedAnnouncements(session.teamId, HOME_ANNOUNCEMENT_LIMIT),
  ]);
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
        {next ? (
          <Link href={`/practices/${next.id}`} className="card hero">
            <span className="kicker">次回の練習</span>
            <span className="big">
              {formatDateLabel(next.heldOn)} {formatTimeShort(next.startTime)}–
              {formatTimeShort(next.endTime)}
            </span>
            <span className="kv" style={{ marginTop: 5 }}>
              <Icon name="pin" />
              {next.location ?? "場所未定"}
            </span>
          </Link>
        ) : (
          <div className="card hero">
            <span className="kicker">次回の練習</span>
            <span className="help">予定はまだ登録されていません</span>
          </div>
        )}
        {summary.unanswered > 0 && (
          <Link href="/attendance" className="notice">
            <Icon name="bell" />
            {Number(month.slice(5))}月分の参加予定が未提出です
            <span className="go">提出へ →</span>
          </Link>
        )}
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
        <div className="label">お知らせ</div>
        {announcements.length === 0 ? (
          <p className="help">お知らせはまだありません</p>
        ) : (
          <>
            <div className="news">
              {announcements.map((a) => (
                <Link
                  key={a.id}
                  href={`/announcements/${a.id}`}
                  className="row"
                >
                  <span className="t">{a.title}</span>
                  <time dateTime={a.publishedAt}>
                    {formatShortDate(a.publishedAt)}
                  </time>
                </Link>
              ))}
            </div>
            <Link href="/announcements" className="more">
              すべて見る →
            </Link>
          </>
        )}
        <p className="sync">チームは順次利用できるようになります</p>
        <div className="powered">
          powered by <b>hoopo</b>
        </div>
      </main>
      <TabBar active="home" />
    </>
  );
}
