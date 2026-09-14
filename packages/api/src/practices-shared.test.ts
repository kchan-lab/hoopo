import { describe, expect, it } from "vitest";
import {
  BULK_MAX,
  parseBulkPracticeInput,
  parseMonth,
  parsePracticeInput,
} from "./practices-shared";

const valid = {
  heldOn: "2026-09-06",
  startTime: "09:00",
  endTime: "12:00",
  location: " 粉浜小学校 体育館 ",
  note: "",
  menus: [
    { durationMin: 30, content: "アップ" },
    { durationMin: "", content: " ゲーム " },
  ],
};

describe("parsePracticeInput", () => {
  it("正常入力を正規化する(trim・空→null・所要時間の空は null)", () => {
    const r = parsePracticeInput(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.location).toBe("粉浜小学校 体育館");
    expect(r.value.note).toBeNull();
    expect(r.value.menus).toEqual([
      { durationMin: 30, content: "アップ" },
      { durationMin: null, content: "ゲーム" },
    ]);
  });

  it("menus 省略は空配列", () => {
    const { menus: _m, ...rest } = valid;
    const r = parsePracticeInput(rest);
    expect(r.ok && r.value.menus).toEqual([]);
  });

  it.each([
    ["日付不正", { ...valid, heldOn: "2026-02-30" }, "日付"],
    ["時刻形式", { ...valid, startTime: "9:00" }, "HH:MM"],
    ["開始≧終了", { ...valid, startTime: "12:00", endTime: "09:00" }, "後に"],
    ["場所が長い", { ...valid, location: "あ".repeat(101) }, "場所"],
    [
      "メニュー内容なし",
      { ...valid, menus: [{ content: "" }] },
      "メニュー1件目",
    ],
    [
      "所要時間範囲外",
      { ...valid, menus: [{ durationMin: 0, content: "x" }] },
      "1〜600",
    ],
    ["body 不正", null, "不正"],
  ])("%s", (_label, body, expected) => {
    const r = parsePracticeInput(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(expected);
  });
});

describe("parseMonth", () => {
  it("YYYY-MM のみ受け付ける", () => {
    expect(parseMonth("2026-09")).toBe("2026-09");
    expect(parseMonth("2026-9")).toBeNull();
    expect(parseMonth(undefined)).toBeNull();
  });
});

const bulk = {
  dates: ["2026-09-13", "2026-09-06", "2026-09-13"],
  startTime: "09:00",
  endTime: "12:00",
  location: " 粉浜小学校 体育館 ",
  note: "",
};

describe("parseBulkPracticeInput", () => {
  it("重複を除いて日付昇順に整え、場所・備考は parsePracticeInput と同じ正規化", () => {
    const r = parseBulkPracticeInput(bulk);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.dates).toEqual(["2026-09-06", "2026-09-13"]);
    expect(r.value.location).toBe("粉浜小学校 体育館");
    expect(r.value.note).toBeNull();
    expect(r.value.startTime).toBe("09:00");
  });

  it("重複を除いた結果が上限以内なら通る", () => {
    const dates = Array.from(
      { length: BULK_MAX },
      (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`,
    );
    const r = parseBulkPracticeInput({ ...bulk, dates: [...dates, ...dates] });
    expect(r.ok && r.value.dates.length).toBe(BULK_MAX);
  });

  it.each([
    ["日付ゼロ件", { ...bulk, dates: [] }, "1日以上"],
    ["dates が配列でない", { ...bulk, dates: "2026-09-06" }, "1日以上"],
    [
      // 1 か月は最長 31 日なので、32 件は必ず月をまたぐ。件数の上限を先に伝える
      "上限超過(32日)",
      {
        ...bulk,
        dates: [
          ...Array.from(
            { length: 31 },
            (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`,
          ),
          "2026-02-01",
        ],
      },
      `${BULK_MAX}日まで`,
    ],
    ["月またぎ", { ...bulk, dates: ["2026-09-30", "2026-10-01"] }, "同じ月"],
    ["日付形式", { ...bulk, dates: ["2026-9-6"] }, "YYYY-MM-DD"],
    ["存在しない日", { ...bulk, dates: ["2026-02-30"] }, "YYYY-MM-DD"],
    ["日付が文字列でない", { ...bulk, dates: [20260906] }, "YYYY-MM-DD"],
    ["時刻形式", { ...bulk, startTime: "9:00" }, "HH:MM"],
    ["開始≧終了", { ...bulk, startTime: "12:00", endTime: "09:00" }, "後に"],
    ["場所が長い", { ...bulk, location: "あ".repeat(101) }, "場所"],
    ["備考が長い", { ...bulk, note: "あ".repeat(501) }, "備考"],
    ["body 不正", null, "不正"],
  ])("%s", (_label, body, expected) => {
    const r = parseBulkPracticeInput(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(expected);
  });
});
