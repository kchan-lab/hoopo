import {
  collectScheduleText,
  countExtraEntryLines,
  getScheduleImageData,
  isMonthString,
  SCHEDULE_IMAGE_WIDTH,
  scheduleImageHeight,
} from "@hoopo/api";
import { ImageResponse } from "next/og";
import { ScheduleImage } from "./schedule-image";

// 予定表画像(REQUIREMENTS §6)。固定パス /api/schedule/YYYY-MM.png で公開し、
// LINE の originalContentUrl と CDN キャッシュに渡せる形にする(plan.md 6b-2)。
// - 認証なし(LINE が取得しに来るため)。載せるのは日付・時間・場所だけで個人情報は含まない(設計判断2)
// - チームは env の TEAM_ID。発行前でも生成できる(発行=確定の記録。設計判断1)
// - 依存は増やさず Next 同梱の next/og(satori)を使う(設計判断3)

export const dynamic = "force-dynamic";

const MONTH_PNG_PATTERN = /^(\d{4}-\d{2})\.png$/;

const CACHE_CONTROL = "public, s-maxage=600, stale-while-revalidate=86400";

const FONT_FAMILY = "Noto Sans JP";
/** 画像に必ず出る固定文言(サブセットに含める) */
const STATIC_TEXT = "powered by hoopo 練習予定 場所未定";
// satori が読めるのは TTF / OTF / WOFF で woff2 は不可。woff2 を知らない古い UA で要求すると
// Google Fonts が WOFF を返す(設計判断3: フォントはリポジトリに同梱せず実行時にサブセット取得)
const LEGACY_USER_AGENT =
  "Mozilla/5.0 (Windows NT 6.1; rv:11.0) Gecko/20100101 Firefox/11.0";

interface LoadedFont {
  weight: 400 | 700;
  data: ArrayBuffer;
}

/** サブセットは文字の集合で決まるので、その文字列をキーにモジュール内へキャッシュする */
const fontCache = new Map<string, LoadedFont[]>();

/** css2 のレスポンスから @font-face ごとの weight とフォント本体の URL を取り出す */
function parseFontFaces(css: string): { weight: 400 | 700; url: string }[] {
  const faces: { weight: 400 | 700; url: string }[] = [];
  for (const block of css.split("@font-face").slice(1)) {
    const url = /src:\s*url\((https:\/\/[^)]+)\)/.exec(block)?.[1];
    if (!url) continue;
    const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1] ?? "400");
    faces.push({ weight: weight >= 700 ? 700 : 400, url });
  }
  return faces;
}

async function loadFonts(text: string): Promise<LoadedFont[]> {
  const cached = fontCache.get(text);
  if (cached) return cached;
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    FONT_FAMILY,
  ).replace(/%20/g, "+")}:wght@400;700&text=${encodeURIComponent(text)}`;
  const cssRes = await fetch(cssUrl, {
    headers: { "User-Agent": LEGACY_USER_AGENT },
  });
  if (!cssRes.ok) {
    throw new Error(`Google Fonts の CSS 取得に失敗しました: ${cssRes.status}`);
  }
  const faces = parseFontFaces(await cssRes.text());
  if (faces.length === 0) {
    throw new Error("Google Fonts の CSS に @font-face が見つかりません");
  }
  const fonts = await Promise.all(
    faces.map(async (face) => {
      const res = await fetch(face.url, {
        headers: { "User-Agent": LEGACY_USER_AGENT },
      });
      if (!res.ok) {
        throw new Error(`フォントの取得に失敗しました: ${res.status}`);
      }
      return { weight: face.weight, data: await res.arrayBuffer() };
    }),
  );
  fontCache.set(text, fonts);
  return fonts;
}

function notFound(): Response {
  return Response.json({ error: "予定表が見つかりません" }, { status: 404 });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ month: string }> },
): Promise<Response> {
  const { month: segment } = await params;
  const month = MONTH_PNG_PATTERN.exec(segment)?.[1];
  if (!month || !isMonthString(month)) return notFound();

  const teamId = process.env.TEAM_ID;
  if (!teamId) {
    return Response.json(
      { error: "環境変数 TEAM_ID が設定されていません(.env を確認)" },
      { status: 500 },
    );
  }

  const data = await getScheduleImageData(teamId, month);
  let fonts: LoadedFont[];
  try {
    fonts = await loadFonts(
      collectScheduleText(data.rows, [
        data.teamName,
        data.monthLabel,
        STATIC_TEXT,
      ]),
    );
  } catch {
    // フォント無しで描くと日本語が豆腐になるだけなので、原因が分かる形で返す(plan.md 6b-2)
    return Response.json(
      { error: "フォントの取得に失敗しました" },
      { status: 503 },
    );
  }

  const height = scheduleImageHeight(
    data.rows.length,
    countExtraEntryLines(data.rows),
  );
  // Content-Type: image/png は ImageResponse が付ける
  return new ImageResponse(
    ScheduleImage({
      teamName: data.teamName,
      monthLabel: data.monthLabel,
      rows: data.rows,
      height,
    }),
    {
      width: SCHEDULE_IMAGE_WIDTH,
      height,
      fonts: fonts.map((f) => ({
        name: FONT_FAMILY,
        data: f.data,
        weight: f.weight,
        style: "normal" as const,
      })),
      headers: { "Cache-Control": CACHE_CONTROL },
    },
  );
}
