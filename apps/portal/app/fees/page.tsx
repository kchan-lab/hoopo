import {
  FEE_STATE_LABELS,
  type FeeState,
  getFeeSheet,
  monthOf,
  parseYear,
  todayInTokyo,
  YEAR_MAX,
  YEAR_MIN,
} from "@hoopo/api";
import Link from "next/link";
import { getGuardianSession } from "../../lib/session";
import { AutoLogin } from "../auto-login";
import { Icon } from "../icons";
import { TabBar } from "../tab-bar";

export const dynamic = "force-dynamic";

// 月謝確認(REQUIREMENTS §4.2-8。ワイヤー13)。封筒の「済」ハンコ運用をそのまま再現する。
// 済/未/未来 の3状態はサーバーで導出済み(fees/plan.md 設計判断1)。決済はしない(絶対原則7)

type Search = { year?: string; child?: string };

/** 状態 → ワイヤーのクラス(paid=済枠 / due=未の破線 / later=淡色) */
const STATE_CLASS: Record<FeeState, string> = {
  paid: "paid",
  unpaid: "due",
  future: "later",
};

/** 記号だけに頼らないための読み(title・凡例。DESIGN §3) */
const STATE_TEXT: Record<FeeState, string> = {
  paid: "受け取り済み",
  unpaid: "未提出",
  future: "これからの月",
};

const DEFAULT_NOTE =
  "月謝は練習日に封筒でコーチへお渡しください。受け取り後に「済」になります";

/** 金額(任意)と運用注記は当面 env(fees/plan.md 設計判断4)。未設定なら金額を出さない */
function feeNote(): string {
  const note = process.env.FEE_NOTE?.trim() || DEFAULT_NOTE;
  const yen = Number(process.env.FEE_AMOUNT_YEN);
  return Number.isFinite(yen) && yen > 0
    ? `月謝 ${yen.toLocaleString("ja-JP")}円。${note}`
    : note;
}

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await getGuardianSession();
  if (!session) {
    return (
      <main className="sc-body">
        <AutoLogin />
      </main>
    );
  }
  const sp = await searchParams;
  const today = todayInTokyo();
  const year = parseYear(sp.year) ?? Number(today.slice(0, 4));
  const sheet = await getFeeSheet(
    session.teamId,
    session.sub,
    year,
    monthOf(today),
  );

  const first = sheet.children[0];
  if (!first) {
    // 子ども未連携のときは提出画面と同じくホームの分岐画面へ誘導する
    return (
      <>
        <header className="sc-head">
          <h1 className="sc-title">月謝確認</h1>
        </header>
        <main className="sc-body">
          <p className="help">
            お子さんの登録が済むと、月謝の状況を確認できます
          </p>
          <Link href="/" className="card choice">
            はじめての方
            <small>お子さんの登録・招待コードの入力へ</small>
          </Link>
        </main>
        <TabBar active="yen" />
      </>
    );
  }
  const row = sheet.children.find((r) => r.child.id === sp.child) ?? first;
  const hrefFor = (target: number, child = row.child.id) =>
    `/fees?year=${target}&child=${child}`;

  return (
    <>
      <header className="sc-head">
        <h1 className="sc-title">
          月謝確認
          <nav className="year-nav" aria-label="表示する年">
            {year > YEAR_MIN ? (
              <Link href={hrefFor(year - 1)} aria-label="前の年">
                <Icon name="chevl" />
              </Link>
            ) : (
              <span className="off" aria-hidden="true">
                <Icon name="chevl" />
              </span>
            )}
            <b>{year}年</b>
            {year < YEAR_MAX ? (
              <Link href={hrefFor(year + 1)} aria-label="次の年">
                <Icon name="chevr" />
              </Link>
            ) : (
              <span className="off" aria-hidden="true">
                <Icon name="chevr" />
              </span>
            )}
          </nav>
        </h1>
      </header>
      <main className="sc-body">
        {sheet.children.length > 1 && (
          <nav className="seg2 links" aria-label="お子さんの切替">
            {sheet.children.map((r) => (
              <Link
                key={r.child.id}
                href={hrefFor(year, r.child.id)}
                aria-current={r.child.id === row.child.id ? "true" : undefined}
              >
                {r.child.name}
              </Link>
            ))}
          </nav>
        )}

        <ul className="fee-grid" aria-label={`${row.child.name}の月謝`}>
          {row.months.map((m) => (
            <li
              key={m.month}
              className={`fee ${STATE_CLASS[m.state]}`}
              data-state={m.state}
              title={`${m.month}月 ${STATE_TEXT[m.state]}`}
            >
              <span className="m">{m.month}月</span>
              <span className="st">{FEE_STATE_LABELS[m.state]}</span>
            </li>
          ))}
        </ul>

        <div className="legend">
          <em>
            <span className="fee-sw paid">{FEE_STATE_LABELS.paid}</span>
            {STATE_TEXT.paid}
          </em>
          <em>
            <span className="fee-sw due">{FEE_STATE_LABELS.unpaid}</span>
            {STATE_TEXT.unpaid}
          </em>
          <em>
            <span className="fee-sw later">{FEE_STATE_LABELS.future}</span>
            {STATE_TEXT.future}
          </em>
        </div>

        <p className="card fee-note">{feeNote()}</p>
      </main>
      <TabBar active="yen" />
    </>
  );
}
