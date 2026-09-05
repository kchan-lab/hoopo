import { describe, expect, it } from "vitest";
import { parseMonth, parsePracticeInput } from "./practices-shared";

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
