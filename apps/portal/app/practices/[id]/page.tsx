import {
  formatDateLabel,
  formatTimeShort,
  getPractice,
  isUuid,
  monthOf,
} from "@hoopo/api";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getGuardianSession } from "../../../lib/session";
import { Icon } from "../../icons";
import { TabBar } from "../../tab-bar";

export const dynamic = "force-dynamic";

// 練習の詳細(REQUIREMENTS §4.2-5。ワイヤー7)。フル画面、左上シェブロンで日程へ戻る。
// 「出場メンバーはこちら」(#29)は無効表示。「参加予定を変更する」はその月の提出画面(リスト)へ

export default async function PracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getGuardianSession();
  if (!session) redirect("/");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const practice = await getPractice(session.teamId, id);
  if (!practice) notFound();
  // 戻り先は保存済みの表示形式を明示する(クライアントのルーターキャッシュに
  // 古い一覧が残っていても、URL が違えば再取得される)
  const view =
    (await cookies()).get("portal_schedule_view")?.value === "calendar"
      ? "calendar"
      : "list";

  return (
    <>
      <header className="sc-head">
        <h1 className="sc-title">
          <Link
            href={`/schedule?month=${monthOf(practice.heldOn)}&view=${view}`}
            className="back"
            aria-label="日程へ戻る"
          >
            <Icon name="chevl" />
          </Link>
          練習の詳細
        </h1>
      </header>
      <main className="sc-body">
        <section className="card">
          <div className="kicker">{formatDateLabel(practice.heldOn)}</div>
          <div className="big">
            {formatTimeShort(practice.startTime)}–
            {formatTimeShort(practice.endTime)}
          </div>
          <div className="kv" style={{ marginTop: 6 }}>
            <Icon name="pin" />
            {practice.location ?? "場所未定"}
          </div>
          {practice.note && (
            <div className="kv">
              <Icon name="note" />
              {practice.note}
            </div>
          )}
        </section>
        <section className="card">
          <div className="label" style={{ marginBottom: 5 }}>
            練習メニュー
          </div>
          {practice.menus.length === 0 ? (
            <p className="help">練習メニューはまだ登録されていません</p>
          ) : (
            <ul className="menu-list">
              {practice.menus.map((m) => (
                <li key={m.id} className="menu-row">
                  <b>{m.durationMin === null ? "−" : `${m.durationMin}分`}</b>
                  {m.content}
                </li>
              ))}
            </ul>
          )}
        </section>
        <button
          type="button"
          className="cta sec2"
          disabled
          title="出場メンバーは準備中"
        >
          出場メンバーはこちら →(準備中)
        </button>
        <Link
          href={`/attendance?month=${monthOf(practice.heldOn)}&view=list`}
          className="cta"
          style={{ marginTop: 0 }}
        >
          この日の参加予定を変更する
        </Link>
      </main>
      <TabBar active="cal" />
    </>
  );
}
