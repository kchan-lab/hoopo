import { describe, expect, it } from "vitest";
// DB に触れない部分(レイアウト計算)だけを Unit で押さえる。
// getScheduleImageData 本体は packages/api/test/schedule-image.int.test.ts
import {
  SCHEDULE_FONT_ENTRY,
  SCHEDULE_FOOTER_HEIGHT,
  SCHEDULE_HEADER_HEIGHT,
  SCHEDULE_IMAGE_WIDTH,
  SCHEDULE_MAX_ASPECT,
  SCHEDULE_ROW_HEIGHT,
  scheduleEntryFontSize,
  scheduleEntryLineHeight,
  scheduleImageHeight,
} from "./schedule-layout";
import { buildScheduleRows } from "./schedule-shared";

/** 練習の無い月の行(日数ぶん) */
function emptyRows(month: string) {
  return buildScheduleRows(month, []);
}

describe("予定表画像の寸法", () => {
  it("幅は固定、高さはヘッダー+日数×行+フッターで決まる(縦1列)", () => {
    expect(SCHEDULE_IMAGE_WIDTH).toBe(1080);
    for (const [month, days] of [
      ["2026-02", 28],
      ["2028-02", 29],
      ["2026-09", 30],
      ["2026-10", 31],
    ] as const) {
      const rows = emptyRows(month);
      expect(rows).toHaveLength(days);
      expect(scheduleImageHeight(rows)).toBe(
        SCHEDULE_HEADER_HEIGHT +
          days * SCHEDULE_ROW_HEIGHT +
          SCHEDULE_FOOTER_HEIGHT,
      );
    }
  });

  it("31日の月でもスマホの全画面表示に収まる縦横比(1:2.0 以内)", () => {
    expect(SCHEDULE_MAX_ASPECT).toBe(2.0);
    for (const month of ["2026-01", "2026-02", "2026-09", "2026-10"]) {
      expect(
        scheduleImageHeight(emptyRows(month)) / SCHEDULE_IMAGE_WIDTH,
      ).toBeLessThanOrEqual(SCHEDULE_MAX_ASPECT);
    }
  });

  it("行が無くてもヘッダーとフッターだけの高さで落ちない", () => {
    expect(scheduleImageHeight([])).toBe(
      SCHEDULE_HEADER_HEIGHT + SCHEDULE_FOOTER_HEIGHT,
    );
  });
});

describe("同じ日に複数コマある場合", () => {
  const rows = buildScheduleRows("2026-10", [
    {
      heldOn: "2026-10-04",
      startTime: "09:00",
      endTime: "12:00",
      location: "粉浜小",
    },
    {
      heldOn: "2026-10-04",
      startTime: "13:00",
      endTime: "17:00",
      location: "北粉浜小",
    },
    {
      heldOn: "2026-10-04",
      startTime: "18:00",
      endTime: "20:00",
      location: "住吉中",
    },
  ]);

  it("行は伸ばさず、画像の高さは練習の無い月と同じ", () => {
    expect(rows.find((r) => r.day === 4)?.entries).toHaveLength(3);
    expect(scheduleImageHeight(rows)).toBe(
      scheduleImageHeight(emptyRows("2026-10")),
    );
  });

  it("1件の高さは行の高さを件数で割った値(0件と1件は行の高さのまま)", () => {
    expect(scheduleEntryLineHeight(0)).toBe(SCHEDULE_ROW_HEIGHT);
    expect(scheduleEntryLineHeight(1)).toBe(SCHEDULE_ROW_HEIGHT);
    expect(scheduleEntryLineHeight(2)).toBe(SCHEDULE_ROW_HEIGHT / 2);
    expect(scheduleEntryLineHeight(3) * 3).toBeCloseTo(SCHEDULE_ROW_HEIGHT);
  });

  it("文字は1件なら基準のまま、複数コマの日だけ1件の高さに収まるよう小さくなる", () => {
    expect(scheduleEntryFontSize(1)).toBe(SCHEDULE_FONT_ENTRY);
    expect(scheduleEntryFontSize(2)).toBeLessThan(SCHEDULE_FONT_ENTRY);
    expect(scheduleEntryFontSize(3)).toBeLessThan(scheduleEntryFontSize(2));
    for (const n of [1, 2, 3, 4]) {
      expect(scheduleEntryFontSize(n)).toBeLessThanOrEqual(
        scheduleEntryLineHeight(n),
      );
    }
  });
});
