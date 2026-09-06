import { describe, expect, it } from "vitest";
// DB に触れない部分(レイアウト計算)だけを Unit で押さえる。
// getScheduleImageData 本体は packages/api/test/schedule-image.int.test.ts
import {
  countExtraEntryLines,
  SCHEDULE_IMAGE_WIDTH,
  scheduleImageHeight,
  scheduleRowHeight,
} from "./schedule-layout";
import { buildScheduleRows } from "./schedule-shared";

describe("予定表画像のレイアウト", () => {
  it("幅は固定、高さはヘッダー+行数+フッターで決まる", () => {
    expect(SCHEDULE_IMAGE_WIDTH).toBe(720);
    // 30日 = 120 + 30*44 + 40
    expect(scheduleImageHeight(30)).toBe(1480);
    expect(scheduleImageHeight(31)).toBe(1524);
    // 2月(28日)は1月より短い
    expect(scheduleImageHeight(28)).toBeLessThan(scheduleImageHeight(31));
  });

  it("同じ日に複数の練習がある分だけ高さが伸びる", () => {
    const rows = buildScheduleRows("2026-09", [
      {
        heldOn: "2026-09-06",
        startTime: "09:00",
        endTime: "12:00",
        location: "粉浜小",
      },
      {
        heldOn: "2026-09-06",
        startTime: "13:00",
        endTime: "17:00",
        location: "北粉浜小",
      },
      {
        heldOn: "2026-09-12",
        startTime: "09:00",
        endTime: "12:00",
        location: "粉浜小",
      },
    ]);
    expect(countExtraEntryLines(rows)).toBe(1);
    expect(scheduleImageHeight(rows.length, countExtraEntryLines(rows))).toBe(
      scheduleImageHeight(30) + 22,
    );
    // 行の高さも同じ規約で伸びる(0件と1件は同じ高さ)
    expect(scheduleRowHeight(0)).toBe(44);
    expect(scheduleRowHeight(1)).toBe(44);
    expect(scheduleRowHeight(2)).toBe(66);
    const total = rows.reduce(
      (n, r) => n + scheduleRowHeight(r.entries.length),
      0,
    );
    expect(scheduleImageHeight(rows.length, countExtraEntryLines(rows))).toBe(
      120 + total + 40,
    );
  });
});
