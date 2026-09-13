import { describe, expect, it } from "vitest";
import { parseLink, parseRegistration } from "./registration-shared";

// 入力境界の検証(REQUIREMENTS §3 の項目だけを受け付け、それ以外は 400 に落とす)

const valid = {
  children: [
    { name: " 山田 太郎 ", nicknameKana: "たろう", grade: 4, gender: "male" },
    { name: "山田 花子", nicknameKana: "", grade: 2, gender: "female" },
  ],
  relation: "father",
  weekdays: [6, 0, 3, 3],
  startTime: "09:00",
  endTime: "17:00",
  coachNote: "  ",
};

describe("parseRegistration", () => {
  it("正常入力を正規化する(trim・空文字→null・曜日の重複除去と昇順)", () => {
    const r = parseRegistration(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.children[0]?.name).toBe("山田 太郎");
    expect(r.value.children[1]?.nicknameKana).toBeNull();
    expect(r.value.weekdays).toEqual([0, 3, 6]);
    expect(r.value.coachNote).toBeNull();
  });

  it.each([
    ["子ども0人", { ...valid, children: [] }, "1人以上"],
    [
      "名前なし",
      { ...valid, children: [{ ...valid.children[0], name: "" }] },
      "お名前",
    ],
    [
      "学年範囲外",
      { ...valid, children: [{ ...valid.children[0], grade: 7 }] },
      "学年",
    ],
    [
      "性別不正",
      { ...valid, children: [{ ...valid.children[0], gender: "x" }] },
      "性別",
    ],
    ["続柄不正", { ...valid, relation: "uncle" }, "続柄"],
    ["曜日なし", { ...valid, weekdays: [] }, "曜日"],
    ["曜日範囲外", { ...valid, weekdays: [7] }, "曜日"],
    ["時刻形式", { ...valid, startTime: "9:00" }, "HH:MM"],
    ["開始≧終了", { ...valid, startTime: "17:00", endTime: "09:00" }, "後に"],
    ["伝達事項が長い", { ...valid, coachNote: "あ".repeat(501) }, "500文字"],
    ["余計な項目は無視される", { ...valid, phone: "090" }, null],
  ])("%s", (_label, body, expectedError) => {
    const r = parseRegistration(body);
    if (expectedError === null) {
      expect(r.ok).toBe(true);
    } else {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(expectedError);
    }
  });
});

describe("parseLink", () => {
  it("招待コードを正規化して受け付ける", () => {
    const r = parseLink({ code: " mh7k4-2qd9x ", relation: "mother" });
    expect(r).toEqual({
      ok: true,
      value: { code: "MH7K42QD9X", relation: "mother" },
    });
  });

  it("形式不正・続柄不正は拒否する", () => {
    expect(parseLink({ code: "MH7K", relation: "mother" }).ok).toBe(false);
    expect(parseLink({ code: "MH7K42QD9X", relation: "" }).ok).toBe(false);
  });
});
