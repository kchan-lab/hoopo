import { describe, expect, it } from "vitest";
import { COURT_SPOTS, POSITIONS, parseLineupInput } from "./lineups-shared";

const id = (n: number) =>
  `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

describe("parseLineupInput", () => {
  it("スターター5人とベンチを受け付ける", () => {
    const r = parseLineupInput({
      starters: POSITIONS.map((position, i) => ({
        childId: id(i + 1),
        position,
      })),
      bench: [id(6), id(7)],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.starters).toHaveLength(5);
  });

  it("スターターは5人未満でもよい(編成途中の保存)", () => {
    expect(
      parseLineupInput({
        starters: [{ childId: id(1), position: "PG" }],
        bench: [],
      }).ok,
    ).toBe(true);
    expect(parseLineupInput({ starters: [], bench: [] }).ok).toBe(true);
  });

  it.each([
    [
      "同じ部員が二重",
      { starters: [{ childId: id(1), position: "PG" }], bench: [id(1)] },
      "複数回",
    ],
    [
      "ポジション重複",
      {
        starters: [
          { childId: id(1), position: "PG" },
          { childId: id(2), position: "PG" },
        ],
        bench: [],
      },
      "重複",
    ],
    [
      "ポジション不正",
      { starters: [{ childId: id(1), position: "GK" }], bench: [] },
      "ポジション",
    ],
    ["UUID 不正", { starters: [], bench: ["x"] }, "ベンチ"],
    ["body 不正", null, "不正"],
  ])("%s は拒否する", (_l, body, expected) => {
    const r = parseLineupInput(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(expected);
  });
});

describe("COURT_SPOTS", () => {
  it("5ポジションの座標を持つ(DESIGN §1.3)", () => {
    expect(COURT_SPOTS.C).toEqual({ left: 64, top: 70 });
    expect(Object.keys(COURT_SPOTS)).toEqual([...POSITIONS]);
  });
});
