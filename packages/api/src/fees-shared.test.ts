import { describe, expect, it } from "vitest";
import {
  buildFeeMonths,
  feeState,
  parseFeeToggle,
  parseYear,
} from "./fees-shared";

const CHILD = "11111111-1111-4111-8111-111111111111";

describe("feeState / buildFeeMonths", () => {
  it("済の行があれば常に済、行なし・未は今月以前なら未、来月以降は未来", () => {
    const now = "2026-09";
    expect(feeState({ status: "paid", receivedAt: null }, 2026, 12, now)).toBe(
      "paid",
    );
    expect(feeState(null, 2026, 9, now)).toBe("unpaid");
    expect(feeState({ status: "unpaid", receivedAt: null }, 2026, 8, now)).toBe(
      "unpaid",
    );
    expect(feeState(null, 2026, 10, now)).toBe("future");
    expect(feeState(null, 2027, 1, now)).toBe("future");
    expect(feeState(null, 2025, 12, now)).toBe("unpaid");
  });

  it("1年分のセルを組み立て、受領日時は済のときだけ残す", () => {
    const months = buildFeeMonths(
      new Map([
        [8, { status: "paid", receivedAt: "2026-08-02T00:00:00.000Z" }],
        [9, { status: "unpaid", receivedAt: null }],
      ]),
      2026,
      "2026-09",
    );
    expect(months).toHaveLength(12);
    expect(months[7]).toEqual({
      month: 8,
      state: "paid",
      receivedAt: "2026-08-02T00:00:00.000Z",
    });
    expect(months[8]).toEqual({ month: 9, state: "unpaid", receivedAt: null });
    expect(months[9]?.state).toBe("future");
    expect(months.filter((m) => m.state === "unpaid")).toHaveLength(8);
  });
});

describe("parseYear / parseFeeToggle", () => {
  it("年は 2020〜2100 の整数のみ", () => {
    expect(parseYear("2026")).toBe(2026);
    expect(parseYear("2019")).toBeNull();
    expect(parseYear("abc")).toBeNull();
    expect(parseYear(undefined)).toBeNull();
  });

  it("トグル入力を検証する", () => {
    expect(
      parseFeeToggle({ childId: CHILD, year: 2026, month: 9, status: "paid" }),
    ).toEqual({
      ok: true,
      value: { childId: CHILD, year: 2026, month: 9, status: "paid" },
    });
    for (const bad of [
      { childId: "x", year: 2026, month: 9, status: "paid" },
      { childId: CHILD, year: 1999, month: 9, status: "paid" },
      { childId: CHILD, year: 2026, month: 13, status: "paid" },
      { childId: CHILD, year: 2026, month: 9, status: "future" },
      { childId: CHILD, year: "2026", month: 9, status: "paid" },
      null,
    ]) {
      expect(parseFeeToggle(bad).ok).toBe(false);
    }
  });
});
