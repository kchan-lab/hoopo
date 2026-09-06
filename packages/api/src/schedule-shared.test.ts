import { describe, expect, it } from "vitest";
import { buildScheduleRows, collectScheduleText } from "./schedule-shared";

describe("buildScheduleRows", () => {
  it("月の全日を1行ずつ並べ、練習日に時間+場所を載せる(場所なしは場所未定)", () => {
    const rows = buildScheduleRows("2026-09", [
      {
        heldOn: "2026-09-06",
        startTime: "13:00",
        endTime: "17:00",
        location: "北粉浜小学校 体育館",
      },
      {
        heldOn: "2026-09-06",
        startTime: "09:00",
        endTime: "12:00",
        location: null,
      },
      {
        heldOn: "2026-09-12",
        startTime: "09:00",
        endTime: "12:00",
        location: "粉浜小学校 体育館",
      },
    ]);
    expect(rows).toHaveLength(30);
    expect(rows[0]).toMatchObject({
      date: "2026-09-01",
      day: 1,
      weekdayLabel: "火",
      entries: [],
    });
    expect(rows[5]?.entries).toEqual([
      { time: "9:00–12:00", location: "場所未定" },
      { time: "13:00–17:00", location: "北粉浜小学校 体育館" },
    ]);
    expect(rows[11]?.entries[0]?.time).toBe("9:00–12:00");
    expect(rows.filter((r) => r.entries.length > 0)).toHaveLength(2);
  });

  it("画像に載せる文字を重複なく集める", () => {
    const text = collectScheduleText(
      buildScheduleRows("2026-02", [
        {
          heldOn: "2026-02-01",
          startTime: "09:00",
          endTime: "12:00",
          location: "粉浜小",
        },
      ]),
      ["2026年2月"],
    );
    for (const c of "2026年2月粉浜小9:00–1日月火水木金土")
      expect(text).toContain(c);
    expect(new Set(text).size).toBe(text.length);
  });
});
