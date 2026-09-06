import {
  getFeeGrid,
  monthOf,
  parseYear,
  todayInTokyo,
  YEAR_MAX,
  YEAR_MIN,
} from "@hoopo/api";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCoachSession } from "../../../lib/session";
import { Shell } from "../shell";
import { FeeGrid } from "./fee-grid";

export const dynamic = "force-dynamic";

// 月謝管理(REQUIREMENTS §5.2。ワイヤー PC-7 / SP-8)。
// 現金運用(封筒+済ハンコ)の可視化のみで決済はしない(CLAUDE.md 絶対原則7)。
// 表示は暦年(1〜12月)で、年の切替は前後リンク(plan.md 設計判断2)

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await getCoachSession();
  if (!session) redirect("/login");
  const { year: raw } = await searchParams;
  const today = todayInTokyo();
  const year = parseYear(raw) ?? Number(today.slice(0, 4));
  const { rows } = await getFeeGrid(session.teamId, year, monthOf(today));
  // 表示範囲は 2020〜2100(設計判断2)。端では同じ年に留まるリンクにする
  const prev = Math.max(YEAR_MIN, year - 1);
  const next = Math.min(YEAR_MAX, year + 1);

  return (
    <Shell title="月謝管理">
      <main>
        <div className="ah">
          <b>月謝管理</b>
          <nav className="month-nav" aria-label="表示する年">
            <Link
              href={`/fees?year=${prev}`}
              className="abtn"
              aria-label="前の年"
            >
              ‹
            </Link>
            <span className="pill">{year}年</span>
            <Link
              href={`/fees?year=${next}`}
              className="abtn"
              aria-label="次の年"
            >
              ›
            </Link>
          </nav>
        </div>

        <div className="acard">
          <FeeGrid year={year} initialRows={rows} />
        </div>
      </main>
    </Shell>
  );
}
