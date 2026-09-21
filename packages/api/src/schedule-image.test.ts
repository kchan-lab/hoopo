import { describe, expect, it } from "vitest";
// DB に触れない部分(レイアウト計算)だけを Unit で押さえる。
// getScheduleImageData 本体は packages/api/test/schedule-image.int.test.ts
import {
  SCHEDULE_ENTRY_LINE_HEIGHT,
  SCHEDULE_FOOTER_HEIGHT,
  SCHEDULE_HEADER_HEIGHT,
  SCHEDULE_IMAGE_WIDTH,
  SCHEDULE_ROW_HEIGHT,
  scheduleColumnHeight,
  scheduleImageHeight,
  scheduleRowHeight,
  splitScheduleColumns,
} from "./schedule-layout";
import { buildScheduleRows } from "./schedule-shared";

/** 練習の無い月の行(日数ぶん) */
function emptyRows(month: string) {
  return buildScheduleRows(month, []);
}

describe("予定表画像のカラム分割", () => {
  it("ceil(日数/2) で前半・後半に割り、左右の行数差は最大1行", () => {
    for (const [month, days] of [
      ["2026-02", 28],
      ["2028-02", 29],
      ["2026-09", 30],
      ["2026-10", 31],
    ] as const) {
      const rows = emptyRows(month);
      expect(rows).toHaveLength(days);
      const [left, right] = splitScheduleColumns(rows);
      expect(left).toHaveLength(Math.ceil(days / 2));
      expect(right).toHaveLength(days - Math.ceil(days / 2));
      expect(left.length - right.length).toBeLessThanOrEqual(1);
      expect(left.length + right.length).toBe(days);
      // 左は1日から、右は左の続きから月末まで
      expect(left[0]?.day).toBe(1);
      expect(right[0]?.day).toBe(left.length + 1);
      expect(right.at(-1)?.day).toBe(days);
    }
  });

  it("31日の月は左16行・右15行になる(固定の15日区切りだと右が16行で不均衡)", () => {
    const [left, right] = splitScheduleColumns(emptyRows("2026-10"));
    expect([left.length, right.length]).toEqual([16, 15]);
    expect(left.at(-1)?.day).toBe(16);
    expect(right[0]?.day).toBe(17);
  });

  it("行が無くても落ちない", () => {
    expect(splitScheduleColumns([])).toEqual([[], []]);
    expect(scheduleColumnHeight([])).toBe(0);
  });
});

describe("予定表画像の寸法", () => {
  it("幅は固定、高さはヘッダー+カラムの行数+フッターで決まる", () => {
    expect(SCHEDULE_IMAGE_WIDTH).toBe(1152);
    // 30日 → 左15行: 140 + 15*64 + 52 = 1152
    expect(scheduleImageHeight(emptyRows("2026-09"))).toBe(
      SCHEDULE_HEADER_HEIGHT +
        15 * SCHEDULE_ROW_HEIGHT +
        SCHEDULE_FOOTER_HEIGHT,
    );
    // 31日 → 左16行
    expect(scheduleImageHeight(emptyRows("2026-10"))).toBe(
      SCHEDULE_HEADER_HEIGHT +
        16 * SCHEDULE_ROW_HEIGHT +
        SCHEDULE_FOOTER_HEIGHT,
    );
    // 2月(28日 → 14行)は1月(31日 → 16行)より短い
    expect(scheduleImageHeight(emptyRows("2026-02"))).toBeLessThan(
      scheduleImageHeight(emptyRows("2026-01")),
    );
  });

  it("どの月でも縦横比が 1:1.2 に収まる(1画面で見渡せる)", () => {
    for (const month of [
      "2026-02",
      "2028-02",
      "2026-04",
      "2026-09",
      "2026-10",
      "2027-01",
    ]) {
      const ratio =
        scheduleImageHeight(emptyRows(month)) / SCHEDULE_IMAGE_WIDTH;
      expect(ratio).toBeLessThanOrEqual(1.2);
    }
  });

  it("2カラムにしたことで縦一列より短い", () => {
    const rows = emptyRows("2026-10");
    expect(scheduleImageHeight(rows)).toBeLessThan(
      SCHEDULE_HEADER_HEIGHT +
        rows.length * SCHEDULE_ROW_HEIGHT +
        SCHEDULE_FOOTER_HEIGHT,
    );
  });
});

describe("同じ日に複数コマある場合の伸縮", () => {
  const twoOnTheLeft = buildScheduleRows("2026-09", [
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

  it("行の高さは2件目以降の分だけ伸びる(0件と1件は同じ高さ)", () => {
    expect(scheduleRowHeight(0)).toBe(SCHEDULE_ROW_HEIGHT);
    expect(scheduleRowHeight(1)).toBe(SCHEDULE_ROW_HEIGHT);
    expect(scheduleRowHeight(2)).toBe(
      SCHEDULE_ROW_HEIGHT + SCHEDULE_ENTRY_LINE_HEIGHT,
    );
    expect(scheduleRowHeight(3)).toBe(
      SCHEDULE_ROW_HEIGHT + 2 * SCHEDULE_ENTRY_LINE_HEIGHT,
    );
  });

  it("左カラムが伸びると画像全体が伸びる", () => {
    // 9/6 は左カラム(1〜15日)。2コマあるので左だけ SCHEDULE_ENTRY_LINE_HEIGHT ぶん伸びる
    const [left, right] = splitScheduleColumns(twoOnTheLeft);
    expect(scheduleColumnHeight(left)).toBe(
      15 * SCHEDULE_ROW_HEIGHT + SCHEDULE_ENTRY_LINE_HEIGHT,
    );
    expect(scheduleColumnHeight(right)).toBe(15 * SCHEDULE_ROW_HEIGHT);
    expect(scheduleImageHeight(twoOnTheLeft)).toBe(
      scheduleImageHeight(emptyRows("2026-09")) + SCHEDULE_ENTRY_LINE_HEIGHT,
    );
  });

  it("短いほうのカラムが伸びても画像は伸びない(高さは左右の max)", () => {
    // 31日の月は左16行・右15行。右カラム(17〜31日)だけ1日2コマにしても
    // 15*64+34 = 994 で左の 16*64 = 1024 に届かないので全体の高さは変わらない
    const twoOnTheRight = buildScheduleRows("2026-10", [
      {
        heldOn: "2026-10-20",
        startTime: "09:00",
        endTime: "12:00",
        location: "粉浜小",
      },
      {
        heldOn: "2026-10-20",
        startTime: "13:00",
        endTime: "17:00",
        location: "北粉浜小",
      },
    ]);
    expect(scheduleImageHeight(twoOnTheRight)).toBe(
      scheduleImageHeight(emptyRows("2026-10")),
    );
    // 右がさらに伸びて左を追い越すと、全体も右に合わせて伸びる
    const fourOnTheRight = buildScheduleRows("2026-10", [
      ...[
        ["2026-10-20", "09:00", "12:00"],
        ["2026-10-20", "13:00", "15:00"],
        ["2026-10-21", "09:00", "12:00"],
        ["2026-10-21", "13:00", "17:00"],
      ].map(([heldOn, startTime, endTime]) => ({
        heldOn: heldOn as string,
        startTime: startTime as string,
        endTime: endTime as string,
        location: "粉浜小",
      })),
    ]);
    const [, right] = splitScheduleColumns(fourOnTheRight);
    expect(scheduleColumnHeight(right)).toBe(
      15 * SCHEDULE_ROW_HEIGHT + 2 * SCHEDULE_ENTRY_LINE_HEIGHT,
    );
    expect(scheduleImageHeight(fourOnTheRight)).toBe(
      SCHEDULE_HEADER_HEIGHT +
        scheduleColumnHeight(right) +
        SCHEDULE_FOOTER_HEIGHT,
    );
    expect(scheduleImageHeight(fourOnTheRight)).toBeGreaterThan(
      scheduleImageHeight(emptyRows("2026-10")),
    );
  });

  it("計算した高さと各行の高さの合計が一致する(下端に余白が出ない)", () => {
    const [left, right] = splitScheduleColumns(twoOnTheLeft);
    const sum = (rows: typeof left) =>
      rows.reduce((n, r) => n + scheduleRowHeight(r.entries.length), 0);
    expect(scheduleImageHeight(twoOnTheLeft)).toBe(
      SCHEDULE_HEADER_HEIGHT +
        Math.max(sum(left), sum(right)) +
        SCHEDULE_FOOTER_HEIGHT,
    );
  });
});
