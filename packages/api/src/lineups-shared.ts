// 出場メンバー(lineup)の定数・型・入力検証。DB 非依存(クライアントからも import 可)。
// スターター5人(PG/SG/SF/PF/C)+ベンチ。コートはリングを下にした向き(REQUIREMENTS §4.2-7、DESIGN §1.3)

export const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABELS: Record<Position, string> = {
  PG: "ポイントガード",
  SG: "シューティングガード",
  SF: "スモールフォワード",
  PF: "パワーフォワード",
  C: "センター",
};

/** コート上の配置(left/top %。DESIGN §1.3: PG 26/27・SG 74/27・SF 12/52・PF 88/52・C 64/70) */
export const COURT_SPOTS: Record<Position, { left: number; top: number }> = {
  PG: { left: 26, top: 27 },
  SG: { left: 74, top: 27 },
  SF: { left: 12, top: 52 },
  PF: { left: 88, top: 52 },
  C: { left: 64, top: 70 },
};

export interface LineupInput {
  /** スターター。ポジションは5種類それぞれ高々1人。同じ子を複数回入れない */
  starters: { childId: string; position: Position }[];
  /** ベンチ(順序は表示順) */
  bench: string[];
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const BENCH_MAX = 15;

export function parseLineupInput(body: unknown): ParseResult<LineupInput> {
  const r =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  if (!r) return { ok: false, error: "入力内容が不正です" };
  if (!Array.isArray(r.starters) || !Array.isArray(r.bench)) {
    return { ok: false, error: "starters と bench を指定してください" };
  }
  const seenChild = new Set<string>();
  const seenPos = new Set<string>();
  const starters: LineupInput["starters"] = [];
  for (const [i, s] of r.starters.entries()) {
    const sr =
      typeof s === "object" && s !== null
        ? (s as Record<string, unknown>)
        : null;
    const childId = typeof sr?.childId === "string" ? sr.childId : "";
    const position = sr?.position;
    if (!UUID_PATTERN.test(childId)) {
      return { ok: false, error: `スターター${i + 1}人目の部員が不正です` };
    }
    if (!POSITIONS.includes(position as Position)) {
      return {
        ok: false,
        error: `スターター${i + 1}人目のポジションが不正です`,
      };
    }
    if (seenChild.has(childId)) {
      return { ok: false, error: "同じ部員を複数回入れることはできません" };
    }
    if (seenPos.has(position as string)) {
      return { ok: false, error: `${position} が重複しています` };
    }
    seenChild.add(childId);
    seenPos.add(position as string);
    starters.push({ childId, position: position as Position });
  }
  const bench: string[] = [];
  for (const b of r.bench) {
    if (typeof b !== "string" || !UUID_PATTERN.test(b)) {
      return { ok: false, error: "ベンチの部員が不正です" };
    }
    if (seenChild.has(b)) {
      return { ok: false, error: "同じ部員を複数回入れることはできません" };
    }
    seenChild.add(b);
    bench.push(b);
  }
  if (bench.length > BENCH_MAX) {
    return { ok: false, error: `ベンチは${BENCH_MAX}人までです` };
  }
  return { ok: true, value: { starters, bench } };
}
