import { describe, expect, it } from "vitest";
import {
  addMonths,
  formatDateLabel,
  formatMonthLabel,
  formatTimeShort,
  isDateString,
  isMonthString,
  monthGrid,
  monthRange,
  todayInTokyo,
  weekdayOf,
} from "./tokyo-date";

describe("Asia/Tokyo の日付処理", () => {
  it("今日は Tokyo で決まる(UTC 15:00 以降は翌日)", () => {
    expect(todayInTokyo(new Date("2026-09-05T14:59:00Z"))).toBe("2026-09-05");
    expect(todayInTokyo(new Date("2026-09-05T15:00:00Z"))).toBe("2026-09-06");
  });

  it("曜日は 0=日 … 6=土(DB の生成列と同一規約)", () => {
    expect(weekdayOf("2026-09-06")).toBe(0);
    expect(weekdayOf("2026-09-05")).toBe(6);
    expect(formatDateLabel("2026-09-06")).toBe("9/6 (日)");
  });

  it("日付・年月の形式検証(うるう年・存在しない日)", () => {
    expect(isDateString("2028-02-29")).toBe(true);
    expect(isDateString("2026-02-29")).toBe(false);
    expect(isDateString("2026-13-01")).toBe(false);
    expect(isDateString("2026-9-6")).toBe(false);
    expect(isMonthString("2026-09")).toBe(true);
    expect(isMonthString("2026-00")).toBe(false);
  });

  it("月の範囲・前後の月・表示", () => {
    expect(monthRange("2026-02")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(formatMonthLabel("2026-09")).toBe("2026年9月");
    expect(formatTimeShort("09:00")).toBe("9:00");
  });

  it("カレンダー格子は日曜始まりで、必要な週数だけ返す", () => {
    const grid = monthGrid("2026-09"); // 9/1 は火曜、9/30 は水曜 → 5週
    expect(grid).toHaveLength(5);
    expect(grid[0]?.map((c) => c.day)).toEqual([30, 31, 1, 2, 3, 4, 5]);
    expect(grid[0]?.[0]).toEqual({
      date: "2026-08-30",
      day: 30,
      inMonth: false,
    });
    expect(grid[4]?.map((c) => c.day)).toEqual([27, 28, 29, 30, 1, 2, 3]);
    expect(grid[4]?.[4]?.date).toBe("2026-10-01");
    // 2026-02 は日曜始まり・28日 → ちょうど4週
    expect(monthGrid("2026-02")).toHaveLength(4);
    expect(
      monthGrid("2026-02")
        .flat()
        .every((c) => c.inMonth),
    ).toBe(true);
  });
});
