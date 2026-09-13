import { COURT_SPOTS, formatDateLabel, getLineup, isUuid } from "@hoopo/api";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getGuardianSession } from "../../../../lib/session";
import { Icon } from "../../../icons";
import { TabBar } from "../../../tab-bar";

export const dynamic = "force-dynamic";

// 出場メンバー(2D)(REQUIREMENTS §4.2-5・§4.2-7。ワイヤー8)。
// コートは「リングを下」にした向き = 基準 SVG(viewBox 300×316)を180度回転する(DESIGN §1.3)。
// チップは回転させないので、配置は COURT_SPOTS(left/top %)で絶対配置する。
// 顔写真は未対応(§9 の合意待ち)なので名簿と同じ頭文字アバターで代替する。
// 3D(§4.2-7)は後追いなのでタブは無効表示のみ

/** 頭文字アバター。氏名の先頭1文字 */
function initial(name: string): string {
  return Array.from(name)[0] ?? "?";
}

/** 「8/16 (日) 練習試合 — スターティングメンバー」。備考があれば場所より優先する */
function caption(
  heldOn: string,
  location: string | null,
  note: string | null,
): string {
  const where = note ?? location;
  const head = where
    ? `${formatDateLabel(heldOn)} ${where}`
    : formatDateLabel(heldOn);
  return `${head} — スターティングメンバー`;
}

export default async function LineupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getGuardianSession();
  if (!session) redirect("/");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const lineup = await getLineup(session.teamId, id);
  if (!lineup) notFound();
  const { practice, starters, bench } = lineup;
  const empty = starters.length === 0 && bench.length === 0;

  return (
    <>
      <header className="sc-head">
        <h1 className="sc-title">
          <Link
            href={`/practices/${practice.id}`}
            className="back"
            aria-label="練習の詳細へ戻る"
          >
            <Icon name="chevl" />
          </Link>
          出場メンバー
          <span className="seg" role="tablist" aria-label="表示形式">
            <button type="button" role="tab" aria-selected={true}>
              2D
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={false}
              disabled
              title="3D は後日"
            >
              3D
            </button>
          </span>
        </h1>
      </header>
      <main className="sc-body">
        <div className="court-cap">
          {caption(practice.heldOn, practice.location, practice.note)}
        </div>
        <div className="court-wrap">
          {/* リングを下にするため180度回転。チップは回転させない(向きが逆さになるため) */}
          <svg
            viewBox="0 0 300 316"
            style={{ transform: "rotate(180deg)" }}
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect
              x="6"
              y="0"
              width="288"
              height="310"
              fill="none"
              stroke="#DCA878"
              strokeWidth="2"
            />
            <path
              d="M32 0 V46 Q32 176 150 176 Q268 176 268 46 V0"
              fill="none"
              stroke="#DCA878"
              strokeWidth="2"
            />
            <rect
              x="108"
              y="0"
              width="84"
              height="106"
              fill="#F4E0C8"
              stroke="#DCA878"
              strokeWidth="2"
            />
            <circle
              cx="150"
              cy="106"
              r="32"
              fill="none"
              stroke="#DCA878"
              strokeWidth="2"
            />
            <path d="M124 10 h52" stroke="#C98F5C" strokeWidth="3" />
            <circle
              cx="150"
              cy="22"
              r="7"
              fill="none"
              stroke="#C98F5C"
              strokeWidth="2.5"
            />
            <path
              d="M108 310 a42 42 0 0 1 84 0"
              fill="none"
              stroke="#DCA878"
              strokeWidth="2"
            />
          </svg>
          {starters.map((s) => {
            const spot = COURT_SPOTS[s.position];
            return (
              <div
                key={s.child.id}
                className="pl"
                style={{ left: `${spot.left}%`, top: `${spot.top}%` }}
              >
                <div className="ini">
                  {initial(s.child.name)}
                  <span className="pos">{s.position}</span>
                </div>
                <div className="nm">{s.child.name}</div>
              </div>
            );
          })}
        </div>
        {empty && <p className="sync">出場メンバーはまだ登録されていません</p>}
        {bench.length > 0 && (
          <div className="bench">
            <div className="bh">ベンチメンバー</div>
            <div className="bl">
              {bench.map((b) => (
                <div key={b.child.id} className="bp">
                  <div className="ini" aria-hidden="true">
                    {initial(b.child.name)}
                  </div>
                  <div className="nm">{b.child.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <TabBar active="cal" />
    </>
  );
}
